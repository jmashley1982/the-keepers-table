import { useRef, useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { AtSign, User, MapPin, BookOpen, Scroll, Shield, X, ExternalLink } from 'lucide-react'

type EntityType = 'pc' | 'npc' | 'location' | 'item' | 'faction'

interface MentionEntity {
  id: string
  name: string
  type: EntityType
  subtitle?: string
}

const TYPE_LABELS: Record<EntityType, string> = {
  pc: 'PC', npc: 'NPC', location: 'Loc', item: 'Item', faction: 'Faction',
}

const LABEL_TO_TYPE: Record<string, EntityType> = {
  PC: 'pc', NPC: 'npc', Loc: 'location', Item: 'item', Faction: 'faction',
}

const TYPE_COLORS: Record<EntityType, string> = {
  pc:       'bg-blue-500/15 text-blue-400',
  npc:      'bg-accent/15 text-accent',
  location: 'bg-emerald-500/15 text-emerald-400',
  item:     'bg-orange-500/15 text-orange-400',
  faction:  'bg-purple-500/15 text-purple-400',
}

const CHIP_COLORS: Record<EntityType, string> = {
  pc:       'bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/35',
  npc:      'bg-accent/20 text-accent border border-accent/30 hover:bg-accent/35',
  location: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/35',
  item:     'bg-orange-500/20 text-orange-300 border border-orange-500/30 hover:bg-orange-500/35',
  faction:  'bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/35',
}

const TYPE_ICONS: Record<EntityType, React.ReactNode> = {
  pc:       <Shield size={10} />,
  npc:      <User size={10} />,
  location: <MapPin size={10} />,
  item:     <BookOpen size={10} />,
  faction:  <Scroll size={10} />,
}

interface RawEntity {
  id: string
  name: string
  role?: string
  type?: string
  status?: string
  dispositionToParty?: string
  description?: string
  appearance?: string
  personality?: string
  motivations?: string
  class?: string
  level?: number
  race?: string
  playerName?: string
  background?: string
  alignment?: string
  abilityScores?: { str?: number; dex?: number; con?: number; int?: number; wis?: number; cha?: number }
  combatStats?: { hp?: number; maxHp?: number; ac?: number; initiative?: number }
  rarity?: string
  category?: string
  mechanicalEffect?: string
}

interface Props {
  value: string
  onChange: (v: string) => void
  campaignId: string
  className?: string
  placeholder?: string
}

// ── Mention parser ─────────────────────────────────────────────────────────────

type MentionSegment =
  | { kind: 'text'; value: string }
  | { kind: 'mention'; entityType: EntityType; name: string }

function parseMentions(text: string, allEntities: MentionEntity[]): MentionSegment[] {
  const result: MentionSegment[] = []
  const pattern = /@(PC|NPC|Loc|Item|Faction):/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    const label = match[1]
    const entityType = LABEL_TO_TYPE[label]
    const rest = text.slice(match.index + match[0].length)

    const candidates = allEntities
      .filter(e => e.type === entityType && rest.startsWith(e.name))
      .sort((a, b) => b.name.length - a.name.length)

    if (candidates.length > 0) {
      const entity = candidates[0]
      if (match.index > lastIndex) {
        result.push({ kind: 'text', value: text.slice(lastIndex, match.index) })
      }
      result.push({ kind: 'mention', entityType, name: entity.name })
      lastIndex = match.index + match[0].length + entity.name.length
      pattern.lastIndex = lastIndex
    }
  }

  if (lastIndex < text.length) {
    result.push({ kind: 'text', value: text.slice(lastIndex) })
  }

  return result
}

// ── Entity detail overlay ──────────────────────────────────────────────────────

interface OverlayTarget { entityType: EntityType; name: string }

function EntityMentionOverlay({ target, rawMap, campaignId, onClose }: {
  target: OverlayTarget
  rawMap: Map<string, RawEntity>
  campaignId: string
  onClose: () => void
}) {
  const navigate = useNavigate()
  const entity = rawMap.get(`${target.entityType}:${target.name}`)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const subtitle = entity
    ? [entity.role, entity.type, entity.class].filter(Boolean).join(' · ')
    : ''
  const levelRace = entity
    ? [entity.level ? `Lv${entity.level}` : '', entity.race].filter(Boolean).join(' · ')
    : ''

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-card border border-border w-full max-w-sm shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <span className={cn('p-1.5 rounded shrink-0', TYPE_COLORS[target.entityType])}>
            {TYPE_ICONS[target.entityType]}
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-ink text-sm truncate">{target.name}</h3>
            {(subtitle || levelRace) && (
              <p className="text-[11px] text-ink-muted truncate">
                {[subtitle, levelRace].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          <span className={cn(
            'text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider shrink-0',
            TYPE_COLORS[target.entityType],
          )}>
            {TYPE_LABELS[target.entityType]}
          </span>
          <button className="btn-ghost p-1 shrink-0" onClick={onClose}><X size={14} /></button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3 max-h-80 overflow-y-auto">
          {!entity ? (
            <p className="text-sm text-ink-muted text-center py-4">No details found</p>
          ) : (
            <>
              {/* ── PC ─── */}
              {target.entityType === 'pc' && (
                <>
                  {(entity.playerName || entity.background || entity.alignment) && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
                      {entity.playerName  && <span>Player: <span className="text-ink">{entity.playerName}</span></span>}
                      {entity.background  && <span>Background: <span className="text-ink">{entity.background}</span></span>}
                      {entity.alignment   && <span>Alignment: <span className="text-ink">{entity.alignment}</span></span>}
                    </div>
                  )}
                  {entity.combatStats && Object.values(entity.combatStats).some(v => v != null) && (
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          ['HP', entity.combatStats.hp != null
                            ? `${entity.combatStats.hp}/${entity.combatStats.maxHp ?? '?'}`
                            : null],
                          ['AC',   entity.combatStats.ac],
                          ['Init', entity.combatStats.initiative],
                        ] as [string, string | number | null | undefined][]
                      ).filter(([, v]) => v != null).map(([label, val]) => (
                        <div key={String(label)} className="bg-surface-2 rounded-md p-2 text-center">
                          <div className="text-[10px] text-ink-muted uppercase tracking-wide">{label}</div>
                          <div className="text-sm font-bold text-ink">{String(val)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {entity.abilityScores && (
                    <div className="grid grid-cols-6 gap-1">
                      {(['str','dex','con','int','wis','cha'] as const).map(attr => {
                        const val = entity.abilityScores?.[attr]
                        if (val == null) return null
                        const mod = Math.floor((val - 10) / 2)
                        return (
                          <div key={attr} className="bg-surface-2 rounded p-1.5 text-center">
                            <div className="text-[9px] text-ink-muted uppercase">{attr}</div>
                            <div className="text-xs font-bold text-ink">{val}</div>
                            <div className="text-[9px] text-ink-muted">{mod >= 0 ? `+${mod}` : mod}</div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )}

              {/* ── NPC ── */}
              {target.entityType === 'npc' && (
                (entity.status || entity.dispositionToParty) && (
                  <div className="flex flex-wrap gap-2 items-center">
                    {entity.status && (
                      <span className={cn(
                        'px-2 py-0.5 rounded-full text-[10px] font-medium',
                        entity.status === 'alive'   ? 'bg-green-500/15 text-green-400' :
                        entity.status === 'dead'    ? 'bg-red-500/15 text-red-400' :
                        entity.status === 'missing' ? 'bg-orange-500/15 text-orange-400' :
                        'bg-surface-2 text-ink-muted',
                      )}>
                        {entity.status}
                      </span>
                    )}
                    {entity.dispositionToParty && (
                      <span className="text-xs text-ink-muted">
                        Disposition: <span className="text-ink">{entity.dispositionToParty}</span>
                      </span>
                    )}
                  </div>
                )
              )}

              {/* ── Item ── */}
              {target.entityType === 'item' && (
                <>
                  {(entity.rarity || entity.category) && (
                    <div className="flex gap-4 text-xs text-ink-muted">
                      {entity.rarity   && <span>Rarity: <span className="text-ink capitalize">{entity.rarity}</span></span>}
                      {entity.category && <span>Category: <span className="text-ink">{entity.category}</span></span>}
                    </div>
                  )}
                  {entity.mechanicalEffect && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted mb-1">Effect</p>
                      <p className="text-xs text-ink leading-relaxed">{entity.mechanicalEffect}</p>
                    </div>
                  )}
                </>
              )}

              {/* ── Description (all types) ── */}
              {entity.description && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted mb-1">Description</p>
                  <p className="text-xs text-ink leading-relaxed line-clamp-5">{entity.description}</p>
                </div>
              )}

              {/* ── NPC personality/appearance ── */}
              {target.entityType === 'npc' && entity.personality && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted mb-1">Personality</p>
                  <p className="text-xs text-ink leading-relaxed line-clamp-3">{entity.personality}</p>
                </div>
              )}
              {target.entityType === 'npc' && entity.motivations && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted mb-1">Motivations</p>
                  <p className="text-xs text-ink leading-relaxed line-clamp-3">{entity.motivations}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer — navigate to full sheet for PCs */}
        {target.entityType === 'pc' && entity && (
          <div className="px-5 pb-4 pt-1">
            <button
              className="btn-ghost text-xs w-full justify-center text-accent border border-border flex items-center gap-1.5"
              onClick={() => {
                onClose()
                navigate(`/campaign/${campaignId}/players?pc=${entity.id}`)
              }}
            >
              <ExternalLink size={11} /> Open full character sheet
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── MentionTextarea ────────────────────────────────────────────────────────────

export default function MentionTextarea({ value, onChange, campaignId, className, placeholder }: Props) {
  const textareaRef   = useRef<HTMLTextAreaElement>(null)
  const navigatingRef = useRef(false)
  const [mentionState, setMentionState]   = useState<{ query: string; start: number } | null>(null)
  const [selectedIdx, setSelectedIdx]     = useState(0)
  const [focused, setFocused]             = useState(false)
  const [overlayTarget, setOverlayTarget] = useState<OverlayTarget | null>(null)

  const { data: npcData }     = useQuery({ queryKey: ['entities', campaignId, 'npcs'],      queryFn: () => api.get(`/api/entities/${campaignId}/npcs`).then(r => r.data),      enabled: !!campaignId })
  const { data: locData }     = useQuery({ queryKey: ['entities', campaignId, 'locations'], queryFn: () => api.get(`/api/entities/${campaignId}/locations`).then(r => r.data), enabled: !!campaignId })
  const { data: itemData }    = useQuery({ queryKey: ['entities', campaignId, 'items'],     queryFn: () => api.get(`/api/entities/${campaignId}/items`).then(r => r.data),     enabled: !!campaignId })
  const { data: factionData } = useQuery({ queryKey: ['entities', campaignId, 'factions'], queryFn: () => api.get(`/api/entities/${campaignId}/factions`).then(r => r.data), enabled: !!campaignId })
  const { data: pcData }      = useQuery({ queryKey: ['player-characters', campaignId],    queryFn: () => api.get(`/api/campaigns/${campaignId}/player-characters`).then(r => r.data), enabled: !!campaignId })

  const allEntities: MentionEntity[] = useMemo(() => [
    ...(pcData?.items      ?? []).map((e: RawEntity) => ({ id: e.id, name: e.name, type: 'pc'       as const, subtitle: [e.class, e.level ? `Lv${e.level}` : ''].filter(Boolean).join(' ') || undefined })),
    ...(npcData?.items     ?? []).map((e: RawEntity) => ({ id: e.id, name: e.name, type: 'npc'      as const, subtitle: e.role })),
    ...(locData?.items     ?? []).map((e: RawEntity) => ({ id: e.id, name: e.name, type: 'location' as const, subtitle: e.type })),
    ...(itemData?.items    ?? []).map((e: RawEntity) => ({ id: e.id, name: e.name, type: 'item'     as const })),
    ...(factionData?.items ?? []).map((e: RawEntity) => ({ id: e.id, name: e.name, type: 'faction'  as const })),
  ], [pcData, npcData, locData, itemData, factionData])

  // Full entity lookup map keyed by "type:name" for the overlay
  const rawMap = useMemo(() => {
    const map = new Map<string, RawEntity>()
    for (const e of pcData?.items      ?? []) map.set(`pc:${e.name}`,       e as RawEntity)
    for (const e of npcData?.items     ?? []) map.set(`npc:${e.name}`,      e as RawEntity)
    for (const e of locData?.items     ?? []) map.set(`location:${e.name}`, e as RawEntity)
    for (const e of itemData?.items    ?? []) map.set(`item:${e.name}`,     e as RawEntity)
    for (const e of factionData?.items ?? []) map.set(`faction:${e.name}`,  e as RawEntity)
    return map
  }, [pcData, npcData, locData, itemData, factionData])

  const filtered = useMemo(
    () => mentionState
      ? allEntities.filter(e => e.name.toLowerCase().includes(mentionState.query.toLowerCase())).slice(0, 8)
      : [],
    [mentionState, allEntities],
  )

  const segments = useMemo(
    () => parseMentions(value, allEntities),
    [value, allEntities],
  )

  function detectMention(text: string, cursor: number) {
    let i = cursor - 1
    while (i >= 0 && text[i] !== '\n' && text[i] !== ' ') {
      if (text[i] === '@') {
        const query = text.slice(i + 1, cursor)
        setMentionState({ query, start: i })
        setSelectedIdx(0)
        return
      }
      i--
    }
    setMentionState(null)
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    onChange(e.target.value)
    detectMention(e.target.value, e.target.selectionStart ?? e.target.value.length)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!mentionState || filtered.length === 0) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Tab' || e.key === 'Escape') {
      navigatingRef.current = true
      Promise.resolve().then(() => { navigatingRef.current = false })
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx(i => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      insertMention(filtered[selectedIdx])
    } else if (e.key === 'Escape') {
      setMentionState(null)
    }
  }

  function insertMention(entity: MentionEntity) {
    if (!mentionState) return
    const before = value.slice(0, mentionState.start)
    const after  = value.slice(mentionState.start + 1 + mentionState.query.length)
    const tag    = `@${TYPE_LABELS[entity.type]}:${entity.name}`
    const newVal = `${before}${tag}${after}`
    onChange(newVal)
    setMentionState(null)
    setTimeout(() => {
      if (!textareaRef.current) return
      const pos = before.length + tag.length
      textareaRef.current.selectionStart = pos
      textareaRef.current.selectionEnd   = pos
      textareaRef.current.focus()
    }, 0)
  }

  return (
    <div className="relative flex-1 flex flex-col min-h-0">

      {/* ── Textarea (always mounted to maintain layout; hidden when blurred) ─ */}
      <textarea
        ref={textareaRef}
        className={cn(className, !focused && 'invisible')}
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onSelect={e => {
          if (navigatingRef.current) return
          const ta = e.target as HTMLTextAreaElement
          detectMention(ta.value, ta.selectionStart)
        }}
      />

      {/* ── Rendered view with chips (shown when blurred) ────────────────────── */}
      {!focused && (
        <div
          className={cn(
            className,
            'absolute inset-0 overflow-y-auto cursor-text whitespace-pre-wrap',
          )}
          onClick={() => { if (!overlayTarget) textareaRef.current?.focus() }}
        >
          {value ? (
            segments.map((seg, i) =>
              seg.kind === 'text' ? (
                <span key={i}>{seg.value}</span>
              ) : (
                <button
                  key={i}
                  onMouseDown={e => { e.preventDefault(); e.stopPropagation() }}
                  onClick={e => {
                    e.stopPropagation()
                    setOverlayTarget({ entityType: seg.entityType, name: seg.name })
                  }}
                  className={cn(
                    'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium mx-0.5 cursor-pointer transition-colors',
                    CHIP_COLORS[seg.entityType],
                  )}
                >
                  {TYPE_ICONS[seg.entityType]}
                  {seg.name}
                </button>
              )
            )
          ) : (
            <span className="text-ink-muted/50 select-none">{placeholder}</span>
          )}
        </div>
      )}

      {/* ── @mention autocomplete dropdown ───────────────────────────────────── */}
      {mentionState && (
        <div className="absolute bottom-2 left-2 w-72 bg-surface border border-border rounded-card shadow-2xl z-20 overflow-hidden">
          <div className="px-3 py-1.5 border-b border-border bg-surface-2 flex items-center gap-1.5 text-[10px] text-ink-muted uppercase tracking-wide font-medium">
            <AtSign size={10} />
            Tag an entity
            {mentionState.query && <span className="ml-1 text-accent">"{mentionState.query}"</span>}
          </div>

          {filtered.length === 0 ? (
            <div className="px-3 py-3 text-xs text-ink-muted text-center">No matches</div>
          ) : (
            filtered.map((entity, i) => (
              <button
                key={entity.id}
                onMouseDown={e => { e.preventDefault(); insertMention(entity) }}
                onMouseEnter={() => setSelectedIdx(i)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors border-l-2',
                  i === selectedIdx
                    ? 'bg-accent/20 border-accent text-ink'
                    : 'border-transparent hover:bg-surface-2'
                )}
              >
                <span className="text-ink-muted shrink-0">{TYPE_ICONS[entity.type]}</span>
                <span className="flex-1 min-w-0">
                  <span className="text-xs font-medium text-ink truncate block">{entity.name}</span>
                  {entity.subtitle && <span className="text-[10px] text-ink-muted">{entity.subtitle}</span>}
                </span>
                <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider shrink-0', TYPE_COLORS[entity.type])}>
                  {TYPE_LABELS[entity.type]}
                </span>
              </button>
            ))
          )}

          <div className="px-3 py-1 border-t border-border bg-surface-2 text-[10px] text-ink-muted/70 flex gap-3">
            <span>↑↓ navigate</span>
            <span>↵ / Tab select</span>
            <span>Esc close</span>
          </div>
        </div>
      )}

      {/* ── Entity detail overlay ─────────────────────────────────────────────── */}
      {overlayTarget && (
        <EntityMentionOverlay
          target={overlayTarget}
          rawMap={rawMap}
          campaignId={campaignId}
          onClose={() => setOverlayTarget(null)}
        />
      )}
    </div>
  )
}
