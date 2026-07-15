import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { User, MapPin, BookOpen, Scroll, Shield, X, ExternalLink, Sword } from 'lucide-react'

export type EntityType = 'pc' | 'npc' | 'location' | 'item' | 'faction' | 'enemy'

export interface MentionEntity {
  id: string
  name: string
  type: EntityType
  subtitle?: string
}

export const TYPE_LABELS: Record<EntityType, string> = {
  pc: 'PC', npc: 'NPC', location: 'Loc', item: 'Item', faction: 'Faction', enemy: 'Enemy',
}

export const LABEL_TO_TYPE: Record<string, EntityType> = {
  PC: 'pc', NPC: 'npc', Loc: 'location', Item: 'item', Faction: 'faction', Enemy: 'enemy',
}

export const TYPE_COLORS: Record<EntityType, string> = {
  pc:       'bg-blue-500/15 text-blue-400',
  npc:      'bg-accent/15 text-accent',
  location: 'bg-emerald-500/15 text-emerald-400',
  item:     'bg-orange-500/15 text-orange-400',
  faction:  'bg-purple-500/15 text-purple-400',
  enemy:    'bg-red-500/15 text-red-400',
}

export const CHIP_COLORS: Record<EntityType, string> = {
  pc:       'bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/35',
  npc:      'bg-accent/20 text-accent border border-accent/30 hover:bg-accent/35',
  location: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/35',
  item:     'bg-orange-500/20 text-orange-300 border border-orange-500/30 hover:bg-orange-500/35',
  faction:  'bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/35',
  enemy:    'bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/35',
}

export const TYPE_ICONS: Record<EntityType, React.ReactNode> = {
  pc:       <Shield size={10} />,
  npc:      <User size={10} />,
  location: <MapPin size={10} />,
  item:     <BookOpen size={10} />,
  faction:  <Scroll size={10} />,
  enemy:    <Sword size={10} />,
}

export interface RawEntity {
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
  notes?: string
  dmOnlyNotes?: string
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
  portraitAsset?: { id: string } | null
  enemyType?: string
  cr?: string | number
}

export type MentionSegment =
  | { kind: 'text'; value: string }
  | { kind: 'mention'; entityType: EntityType; name: string; entityId?: string; resolved: boolean }

export function parseMentions(text: string, allEntities: MentionEntity[]): MentionSegment[] {
  const result: MentionSegment[] = []
  // Token formats supported (in order of preference):
  //   New:  @TYPE[id:StoredName]: — self-contained; consumeLength = 0 (name is inside brackets)
  //   Old:  @TYPE:Name            — legacy name-based; consumeLength = entity name length
  // The regex captures everything inside [...] as group 2 (undefined for legacy tokens).
  const pattern = /@(PC|NPC|Loc|Item|Faction|Enemy)(?:\[([^\]]*)\])?:/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    const label = match[1]
    const bracketContent = match[2]   // undefined for legacy @TYPE:Name tokens
    const entityType = LABEL_TO_TYPE[label]
    const rest = text.slice(match.index + match[0].length)

    let chipName: string
    let consumeLength: number
    let resolved: boolean
    let resolvedId: string | undefined

    if (bracketContent !== undefined) {
      const colonIdx = bracketContent.indexOf(':')

      if (colonIdx !== -1) {
        // New self-contained format: @TYPE[id:StoredName]:
        // The stored name is embedded inside the brackets — nothing to consume from rest.
        const storedId   = bracketContent.slice(0, colonIdx)
        const storedName = bracketContent.slice(colonIdx + 1)
        const byId = allEntities.find(e => e.type === entityType && e.id === storedId)
        if (byId) {
          chipName  = byId.name   // show current entity name (rename-transparent)
          resolvedId = byId.id
          resolved   = true
        } else {
          chipName = storedName   // entity deleted — display stored name
          resolved  = false
        }
        consumeLength = 0   // entire token is inside the regex match; rest is free text

      } else {
        // Intermediate bracket format without stored name: @TYPE[id]:Name
        // (may appear in notes created between the two implementations; handle gracefully)
        const storedId = bracketContent
        const byId = allEntities.find(e => e.type === entityType && e.id === storedId)
        if (byId && rest.startsWith(byId.name)) {
          // Entity name unchanged — exact boundary known
          chipName      = byId.name
          consumeLength = byId.name.length
          resolvedId    = byId.id
          resolved      = true
        } else if (byId) {
          // Entity renamed — consume up to next @ / newline as best-effort fallback
          const syntaxMatch = rest.match(/^([^@\n]+)/)
          if (!syntaxMatch) continue
          chipName      = byId.name
          consumeLength = syntaxMatch[1].trimEnd().length
          resolvedId    = byId.id
          resolved      = true
        } else {
          const syntaxMatch = rest.match(/^([^@\n]+)/)
          if (!syntaxMatch) continue
          chipName      = syntaxMatch[1].trimEnd()
          consumeLength = syntaxMatch[1].length
          resolved      = false
        }
      }

    } else {
      // Legacy name-based token: @TYPE:Name
      const candidates = allEntities
        .filter(e => e.type === entityType && rest.startsWith(e.name))
        .sort((a, b) => b.name.length - a.name.length)

      if (candidates.length > 0) {
        chipName      = candidates[0].name
        consumeLength = candidates[0].name.length
        resolvedId    = candidates[0].id
        resolved      = true
      } else {
        const syntaxMatch = rest.match(/^([^@\n]+)/)
        if (!syntaxMatch) continue
        chipName      = syntaxMatch[1].trimEnd()
        consumeLength = syntaxMatch[1].length
        resolved      = false
      }
    }

    if (match.index > lastIndex) {
      result.push({ kind: 'text', value: text.slice(lastIndex, match.index) })
    }
    result.push({ kind: 'mention', entityType, name: chipName, entityId: resolvedId, resolved })
    lastIndex = match.index + match[0].length + consumeLength
    pattern.lastIndex = lastIndex
  }

  if (lastIndex < text.length) {
    result.push({ kind: 'text', value: text.slice(lastIndex) })
  }

  return result
}

export interface OverlayTarget { entityType: EntityType; name: string; entityId?: string }

export function EntityMentionOverlay({ target, rawMap, campaignId, onClose }: {
  target: OverlayTarget
  rawMap: Map<string, RawEntity>
  campaignId: string
  onClose: () => void
}) {
  const navigate = useNavigate()
  // Prefer ID-based lookup (survives renames), fall back to name-based for legacy tokens
  const entity = target.entityId
    ? (rawMap.get(`${target.entityType}-id:${target.entityId}`) ?? rawMap.get(`${target.entityType}:${target.name}`))
    : rawMap.get(`${target.entityType}:${target.name}`)
  const displayName = entity?.name ?? target.name

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const subtitleParts = entity
    ? target.entityType === 'enemy'
      ? [entity.enemyType, entity.cr != null ? `CR ${entity.cr}` : ''].filter(Boolean)
      : [entity.role, entity.type, entity.class].filter(Boolean)
    : []
  const levelRaceParts = entity && target.entityType !== 'enemy'
    ? [entity.level ? `Lv${entity.level}` : '', entity.race].filter(Boolean)
    : []
  const allSubtitleParts = [...subtitleParts, ...levelRaceParts]

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-card border border-border w-full max-w-sm shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          {target.entityType === 'pc' && entity?.portraitAsset ? (
            <img
              src={`/api/assets/${entity.portraitAsset.id}/serve`}
              alt={entity.name}
              className="w-10 h-10 rounded-full object-cover shrink-0 border border-border"
            />
          ) : (
            <span className={cn('p-1.5 rounded shrink-0', TYPE_COLORS[target.entityType])}>
              {TYPE_ICONS[target.entityType]}
            </span>
          )}

          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-ink text-sm truncate">{displayName}</h3>
            {allSubtitleParts.length > 0 && (
              <p className="text-[11px] text-ink-muted truncate">
                {allSubtitleParts.join(' · ')}
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

        <div className="px-5 py-4 space-y-3 max-h-80 overflow-y-auto">
          {!entity ? (
            <p className="text-sm text-ink-muted text-center py-4">No details found</p>
          ) : (
            <>
              {target.entityType === 'pc' && (
                <>
                  {(entity.playerName || entity.background || entity.alignment) && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
                      {entity.playerName && <span>Player: <span className="text-ink">{entity.playerName}</span></span>}
                      {entity.background && <span>Background: <span className="text-ink">{entity.background}</span></span>}
                      {entity.alignment  && <span>Alignment: <span className="text-ink">{entity.alignment}</span></span>}
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
                  {entity.notes && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted mb-1">Notes</p>
                      <p className="text-xs text-ink leading-relaxed line-clamp-4">{entity.notes}</p>
                    </div>
                  )}
                </>
              )}

              {target.entityType === 'npc' && (
                <>
                  {(entity.status || entity.dispositionToParty) && (
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
                  )}
                  {entity.personality && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted mb-1">Personality</p>
                      <p className="text-xs text-ink leading-relaxed line-clamp-3">{entity.personality}</p>
                    </div>
                  )}
                  {entity.motivations && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted mb-1">Motivations</p>
                      <p className="text-xs text-ink leading-relaxed line-clamp-3">{entity.motivations}</p>
                    </div>
                  )}
                </>
              )}

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

              {entity.description && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted mb-1">Description</p>
                  <p className="text-xs text-ink leading-relaxed line-clamp-5">{entity.description}</p>
                </div>
              )}

              {target.entityType !== 'pc' && (entity.dmOnlyNotes || entity.notes) && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted mb-1">GM Notes</p>
                  <p className="text-xs text-ink leading-relaxed line-clamp-4">
                    {entity.dmOnlyNotes || entity.notes}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

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

// ── MentionText ────────────────────────────────────────────────────────────────
// Read-only renderer: parses @mention tokens in text and renders coloured chips.
// Chips open the EntityMentionOverlay on click.

interface MentionTextProps {
  text: string
  campaignId: string
  className?: string
}

export default function MentionText({ text, campaignId, className }: MentionTextProps) {
  const [overlayTarget, setOverlayTarget] = useState<OverlayTarget | null>(null)

  const { data: npcData }     = useQuery({ queryKey: ['entities', campaignId, 'npcs'],      queryFn: () => api.get(`/api/entities/${campaignId}/npcs`).then(r => r.data),      enabled: !!campaignId })
  const { data: locData }     = useQuery({ queryKey: ['entities', campaignId, 'locations'], queryFn: () => api.get(`/api/entities/${campaignId}/locations`).then(r => r.data), enabled: !!campaignId })
  const { data: itemData }    = useQuery({ queryKey: ['entities', campaignId, 'items'],     queryFn: () => api.get(`/api/entities/${campaignId}/items`).then(r => r.data),     enabled: !!campaignId })
  const { data: factionData } = useQuery({ queryKey: ['entities', campaignId, 'factions'], queryFn: () => api.get(`/api/entities/${campaignId}/factions`).then(r => r.data), enabled: !!campaignId })
  const { data: pcData }      = useQuery({ queryKey: ['player-characters', campaignId],    queryFn: () => api.get(`/api/campaigns/${campaignId}/player-characters`).then(r => r.data), enabled: !!campaignId })
  const { data: enemyData }   = useQuery({ queryKey: ['enemies', campaignId],              queryFn: () => api.get(`/api/campaigns/${campaignId}/enemies`).then(r => r.data),  enabled: !!campaignId })

  const allEnemies: RawEntity[] = useMemo(() => [
    ...(enemyData?.srdEnemies    ?? []).map((e: RawEntity) => e as RawEntity),
    ...(enemyData?.customEnemies ?? []).map((e: RawEntity) => e as RawEntity),
  ], [enemyData])

  const allEntities: MentionEntity[] = useMemo(() => [
    ...(pcData?.items      ?? []).map((e: RawEntity) => ({ id: e.id, name: e.name, type: 'pc'       as const, subtitle: [e.class, e.level ? `Lv${e.level}` : ''].filter(Boolean).join(' ') || undefined })),
    ...(npcData?.items     ?? []).map((e: RawEntity) => ({ id: e.id, name: e.name, type: 'npc'      as const, subtitle: e.role })),
    ...(locData?.items     ?? []).map((e: RawEntity) => ({ id: e.id, name: e.name, type: 'location' as const, subtitle: e.type })),
    ...(itemData?.items    ?? []).map((e: RawEntity) => ({ id: e.id, name: e.name, type: 'item'     as const })),
    ...(factionData?.items ?? []).map((e: RawEntity) => ({ id: e.id, name: e.name, type: 'faction'  as const })),
    ...allEnemies.map((e: RawEntity) => ({ id: e.id, name: e.name, type: 'enemy' as const, subtitle: e.enemyType })),
  ], [pcData, npcData, locData, itemData, factionData, allEnemies])

  const rawMap = useMemo(() => {
    const map = new Map<string, RawEntity>()
    for (const e of pcData?.items      ?? []) { map.set(`pc:${e.name}`,          e as RawEntity); map.set(`pc-id:${e.id}`,          e as RawEntity) }
    for (const e of npcData?.items     ?? []) { map.set(`npc:${e.name}`,         e as RawEntity); map.set(`npc-id:${e.id}`,         e as RawEntity) }
    for (const e of locData?.items     ?? []) { map.set(`location:${e.name}`,    e as RawEntity); map.set(`location-id:${e.id}`,    e as RawEntity) }
    for (const e of itemData?.items    ?? []) { map.set(`item:${e.name}`,        e as RawEntity); map.set(`item-id:${e.id}`,        e as RawEntity) }
    for (const e of factionData?.items ?? []) { map.set(`faction:${e.name}`,     e as RawEntity); map.set(`faction-id:${e.id}`,     e as RawEntity) }
    for (const e of allEnemies)               { map.set(`enemy:${e.name}`,       e as RawEntity); map.set(`enemy-id:${e.id}`,       e as RawEntity) }
    return map
  }, [pcData, npcData, locData, itemData, factionData, allEnemies])

  const segments = useMemo(() => parseMentions(text, allEntities), [text, allEntities])

  return (
    <>
      <span className={cn('whitespace-pre-wrap', className)}>
        {segments.map((seg, i) =>
          seg.kind === 'text' ? (
            <span key={i}>{seg.value}</span>
          ) : (
            <button
              key={i}
              onClick={() => setOverlayTarget({ entityType: seg.entityType, name: seg.name, entityId: seg.entityId })}
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
