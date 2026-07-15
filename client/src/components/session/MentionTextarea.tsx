import { useRef, useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { AtSign } from 'lucide-react'
import {
  EntityType,
  MentionEntity,
  RawEntity,
  TYPE_LABELS,
  LABEL_TO_TYPE,
  TYPE_COLORS,
  CHIP_COLORS,
  TYPE_ICONS,
  parseMentions,
  EntityMentionOverlay,
} from './MentionText'

interface OverlayTarget { entityType: EntityType; name: string; entityId?: string }

interface Props {
  value: string
  onChange: (v: string) => void
  campaignId: string
  className?: string
  placeholder?: string
}

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

  const rawMap = useMemo(() => {
    const map = new Map<string, RawEntity>()
    for (const e of pcData?.items      ?? []) { map.set(`pc:${e.name}`,          e as RawEntity); map.set(`pc-id:${e.id}`,          e as RawEntity) }
    for (const e of npcData?.items     ?? []) { map.set(`npc:${e.name}`,         e as RawEntity); map.set(`npc-id:${e.id}`,         e as RawEntity) }
    for (const e of locData?.items     ?? []) { map.set(`location:${e.name}`,    e as RawEntity); map.set(`location-id:${e.id}`,    e as RawEntity) }
    for (const e of itemData?.items    ?? []) { map.set(`item:${e.name}`,        e as RawEntity); map.set(`item-id:${e.id}`,        e as RawEntity) }
    for (const e of factionData?.items ?? []) { map.set(`faction:${e.name}`,     e as RawEntity); map.set(`faction-id:${e.id}`,     e as RawEntity) }
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
    // Self-contained token: id and name both inside brackets, nothing consumed from rest.
    // Format: @TYPE[id:StoredName]: — survives entity renames via ID lookup.
    const tag    = `@${TYPE_LABELS[entity.type]}[${entity.id}:${entity.name}]:`
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

      {/* ── Textarea (always in layout; invisible when blurred to hold space) ── */}
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

      {/* ── Rendered view with chips (overlaid when blurred) ─────────────────── */}
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
                    setOverlayTarget({ entityType: seg.entityType, name: seg.name, entityId: seg.entityId })
                  }}
                  className={cn(
                    'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium mx-0.5 cursor-pointer transition-colors',
                    seg.resolved
                      ? CHIP_COLORS[seg.entityType]
                      : 'bg-surface-2 text-ink-muted border border-border hover:bg-surface',
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
            <div className="px-3 py-2 text-xs text-ink-muted italic">No matches</div>
          ) : (
            filtered.map((e, i) => (
              <button
                key={e.id}
                className={cn(
                  'w-full text-left px-3 py-2 flex items-center gap-2 transition-colors text-sm',
                  i === selectedIdx ? 'bg-surface-2' : 'hover:bg-surface-2/50',
                )}
                onMouseDown={ev => { ev.preventDefault(); insertMention(e) }}
              >
                <span className={cn('p-1 rounded shrink-0', TYPE_COLORS[e.type])}>
                  {TYPE_ICONS[e.type]}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="text-ink font-medium truncate block">{e.name}</span>
                  {e.subtitle && <span className="text-[10px] text-ink-muted">{e.subtitle}</span>}
                </span>
                <span className={cn(
                  'text-[9px] px-1 py-0.5 rounded font-semibold uppercase tracking-wider shrink-0',
                  TYPE_COLORS[e.type],
                )}>
                  {TYPE_LABELS[e.type]}
                </span>
              </button>
            ))
          )}
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

// ── MentionText ────────────────────────────────────────────────────────────────
// Read-only renderer: parses @TYPE:Name tokens into clickable chips that open
// EntityMentionOverlay. Suitable for display-only contexts (e.g. wrap summary).

interface MentionTextProps {
  text: string
  campaignId: string
  className?: string
}

export function MentionText({ text, campaignId, className }: MentionTextProps) {
  const [overlayTarget, setOverlayTarget] = useState<OverlayTarget | null>(null)

  const { data: npcData }     = useQuery({ queryKey: ['entities', campaignId, 'npcs'],      queryFn: () => api.get(`/api/entities/${campaignId}/npcs`).then(r => r.data),      enabled: !!campaignId })
  const { data: locData }     = useQuery({ queryKey: ['entities', campaignId, 'locations'], queryFn: () => api.get(`/api/entities/${campaignId}/locations`).then(r => r.data), enabled: !!campaignId })
  const { data: itemData }    = useQuery({ queryKey: ['entities', campaignId, 'items'],     queryFn: () => api.get(`/api/entities/${campaignId}/items`).then(r => r.data),     enabled: !!campaignId })
  const { data: factionData } = useQuery({ queryKey: ['entities', campaignId, 'factions'], queryFn: () => api.get(`/api/entities/${campaignId}/factions`).then(r => r.data), enabled: !!campaignId })
  const { data: pcData }      = useQuery({ queryKey: ['player-characters', campaignId],    queryFn: () => api.get(`/api/campaigns/${campaignId}/player-characters`).then(r => r.data), enabled: !!campaignId })

  const allEntities: MentionEntity[] = useMemo(() => [
    ...(pcData?.items      ?? []).map((e: RawEntity) => ({ id: e.id, name: e.name, type: 'pc'       as const })),
    ...(npcData?.items     ?? []).map((e: RawEntity) => ({ id: e.id, name: e.name, type: 'npc'      as const })),
    ...(locData?.items     ?? []).map((e: RawEntity) => ({ id: e.id, name: e.name, type: 'location' as const })),
    ...(itemData?.items    ?? []).map((e: RawEntity) => ({ id: e.id, name: e.name, type: 'item'     as const })),
    ...(factionData?.items ?? []).map((e: RawEntity) => ({ id: e.id, name: e.name, type: 'faction'  as const })),
  ], [pcData, npcData, locData, itemData, factionData])

  const rawMap = useMemo(() => {
    const map = new Map<string, RawEntity>()
    for (const e of pcData?.items      ?? []) { map.set(`pc:${e.name}`,          e as RawEntity); map.set(`pc-id:${e.id}`,          e as RawEntity) }
    for (const e of npcData?.items     ?? []) { map.set(`npc:${e.name}`,         e as RawEntity); map.set(`npc-id:${e.id}`,         e as RawEntity) }
    for (const e of locData?.items     ?? []) { map.set(`location:${e.name}`,    e as RawEntity); map.set(`location-id:${e.id}`,    e as RawEntity) }
    for (const e of itemData?.items    ?? []) { map.set(`item:${e.name}`,        e as RawEntity); map.set(`item-id:${e.id}`,        e as RawEntity) }
    for (const e of factionData?.items ?? []) { map.set(`faction:${e.name}`,     e as RawEntity); map.set(`faction-id:${e.id}`,     e as RawEntity) }
    return map
  }, [pcData, npcData, locData, itemData, factionData])

  const segments = useMemo(() => parseMentions(text, allEntities), [text, allEntities])

  return (
    <>
      <span className={className}>
        {segments.map((seg, i) =>
          seg.kind === 'text' ? (
            <span key={i}>{seg.value}</span>
          ) : (
            <button
              key={i}
              onClick={e => { e.stopPropagation(); setOverlayTarget({ entityType: seg.entityType, name: seg.name, entityId: seg.entityId }) }}
              className={cn(
                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium mx-0.5 cursor-pointer transition-colors',
                seg.resolved
                  ? CHIP_COLORS[seg.entityType]
                  : 'bg-surface-2 text-ink-muted border border-border hover:bg-surface',
              )}
            >
              {TYPE_ICONS[seg.entityType]}
              {seg.name}
            </button>
          )
        )}
      </span>

      {overlayTarget && (
        <EntityMentionOverlay
          target={overlayTarget}
          rawMap={rawMap}
          campaignId={campaignId}
          onClose={() => setOverlayTarget(null)}
        />
      )}
    </>
  )
}
