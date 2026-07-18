import { useState } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import {
  RefreshCw, Edit2, Save, Trash2,
  ChevronDown, ChevronUp, Eye, EyeOff, Package,
} from 'lucide-react'
import GenerateArtButton, { EntityAvatarWithArt } from './GenerateArtButton'
import ItemLookupPanel from '../dnd5e/ItemLookupPanel'
import BestiaryPicker from './BestiaryPicker'

export interface EntityCardData {
  id: string
  name: string
  description?: string
  imageUrl?: string
  portraitUrl?: string
  portraitAssetId?: string
  imageAssetId?: string
  portraitAsset?: { id: string; altText?: string | null } | null
  imageAsset?: { id: string; altText?: string | null } | null
  tags?: string[]
  dmOnlyNotes?: string
  pinned?: boolean
  // NPC
  role?: string
  status?: string
  dispositionToParty?: string
  appearance?: string
  personality?: string
  motivations?: string
  secrets?: string
  voiceNotes?: string
  statBlock?: Record<string, unknown>
  bestiaryEntityId?: string | null
  bestiaryEntityName?: string | null
  // Item
  rarity?: string
  category?: string
  mechanicalEffect?: string
  // Faction / Location vitals
  goals?: string
  ambience?: string
  // Location / Encounter — attached battle map
  type?: string
  mapAsset?: { id: string; imageAsset?: { id: string } | null } | null
  // Encounter
  difficulty?: string
  setup?: string
  tactics?: string
  twist?: string
  // Plot thread
  title?: string
}

interface EntityCardProps {
  entity: EntityCardData
  entityType: 'npc' | 'item' | 'location' | 'faction' | 'encounter' | 'plot_thread'
  campaignId: string
  compact?: boolean
  onSaved?: () => void
  scratchMode?: boolean
  onSave?: (entity: EntityCardData) => void
  onRegenerate?: () => void
  locked?: boolean
  onToggleLock?: () => void
}

const DISPOSITION_COLOR: Record<string, string> = {
  hostile: 'text-red-500', wary: 'text-orange-400',
  neutral: 'text-ink-muted', friendly: 'text-green-500', complicated: 'text-purple-400',
}
const STATUS_COLOR: Record<string, string> = {
  alive: 'text-green-500', dead: 'text-red-400', missing: 'text-orange-400', unknown: 'text-ink-muted',
}
const RARITY_COLOR: Record<string, string> = {
  common: 'text-ink-muted', uncommon: 'text-green-500', rare: 'text-blue-400',
  'very rare': 'text-purple-400', legendary: 'text-orange-400', artifact: 'text-yellow-400',
}
const ENTITY_EMOJI: Record<string, string> = {
  npc: '🧙', item: '⚔️', location: '🗺️', faction: '⚜️', encounter: '💀', plot_thread: '📜',
}

const ABILITY_ABBR: Record<string, string> = {
  strength: 'STR', dexterity: 'DEX', constitution: 'CON',
  intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA',
  str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA',
}

function abilityMod(score: number): string {
  const mod = Math.floor((score - 10) / 2)
  return mod >= 0 ? `+${mod}` : String(mod)
}

function cap(str: string | undefined, n = 70): string {
  if (!str) return ''
  const s = str.trim()
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s
}

// Vital aspects surfaced as a compact bullet list when a card is minimized.
function vitalBullets(
  entityType: EntityCardProps['entityType'],
  entity: EntityCardData,
): { label: string; value: string }[] {
  const pairs: { label: string; value: string }[] = (() => {
    switch (entityType) {
      case 'npc':
        return [
          { label: 'Role', value: entity.role ?? '' },
          { label: 'Status', value: entity.status ?? '' },
          { label: 'Disposition', value: entity.dispositionToParty ?? '' },
          { label: 'Motivation', value: cap(entity.motivations) },
        ]
      case 'item':
        return [
          { label: 'Rarity', value: entity.rarity ?? '' },
          { label: 'Category', value: entity.category ?? '' },
          { label: 'Effect', value: cap(entity.mechanicalEffect) },
        ]
      case 'location':
        return [
          { label: 'Type', value: entity.type ?? '' },
          { label: 'Ambience', value: cap(entity.ambience) },
        ]
      case 'faction':
        return [
          { label: 'Disposition', value: entity.dispositionToParty ?? '' },
          { label: 'Goals', value: cap(entity.goals) },
        ]
      case 'encounter':
        return [
          { label: 'Type', value: entity.type ?? '' },
          { label: 'Difficulty', value: entity.difficulty ?? '' },
          { label: 'Setup', value: cap(entity.setup) },
        ]
      case 'plot_thread':
        return [
          { label: 'Status', value: entity.status ?? '' },
          { label: 'Summary', value: cap(entity.description) },
        ]
      default:
        return []
    }
  })()

  const bullets = pairs.filter(p => p.value.trim()).slice(0, 4)
  // Fallback so a minimized card is never empty.
  if (bullets.length === 0 && entity.description) {
    return [{ label: '', value: cap(entity.description) }]
  }
  return bullets
}

function StatBlock({ statBlock }: { statBlock: Record<string, unknown> }) {
  const keys = Object.keys(statBlock)
  const abilityKeys = keys.filter(k => ABILITY_ABBR[k.toLowerCase()])
  const otherKeys = keys.filter(k => !ABILITY_ABBR[k.toLowerCase()])

  return (
    <div className="space-y-3">
      {abilityKeys.length > 0 && (
        <div className="grid grid-cols-6 gap-1">
          {abilityKeys.map(k => {
            const val = statBlock[k]
            const score = typeof val === 'number' ? val : parseInt(String(val), 10)
            const abbr = ABILITY_ABBR[k.toLowerCase()] ?? k.toUpperCase().slice(0, 3)
            return (
              <div key={k} className="text-center p-1.5 rounded bg-surface-2 border border-border/50">
                <p className="text-[9px] font-bold text-ink-muted uppercase">{abbr}</p>
                <p className="text-sm font-bold text-ink">{isNaN(score) ? String(val) : score}</p>
                {!isNaN(score) && (
                  <p className="text-[10px] text-accent">{abilityMod(score)}</p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {otherKeys.length > 0 && (
        <div className="space-y-1">
          {otherKeys.map(k => {
            const val = statBlock[k]
            if (val === null || val === undefined || val === '') return null
            const displayVal = typeof val === 'object' ? JSON.stringify(val) : String(val)
            const label = k.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim()
            return (
              <div key={k} className="flex items-start gap-2 text-xs">
                <span className="font-semibold text-ink-muted capitalize min-w-[80px] shrink-0">{label}</span>
                <span className="text-ink leading-snug">{displayVal}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}


// ── Main EntityCard ───────────────────────────────────────────────────────────

export default function EntityCard({
  entity, entityType, campaignId, compact = false,
  onSaved, scratchMode, onSave, onRegenerate,
}: EntityCardProps) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(!compact)
  const [editing, setEditing] = useState(false)
  const [showSecrets, setShowSecrets] = useState(false)
  const [draft, setDraft] = useState(entity)
  const [tagInput, setTagInput] = useState((entity.tags ?? []).join(', '))
  const [itemLookupOpen, setItemLookupOpen] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const isNpc = entityType === 'npc'

  function handleBestiarySelect(creature: { id: string; name: string; statBlock: Record<string, unknown>; enemyType?: string; tags?: string[] }) {
    setDraft(d => ({
      ...d,
      bestiaryEntityId: creature.id,
      bestiaryEntityName: creature.name,
      statBlock: { ...(creature.statBlock ?? {}) },
      tags: d.tags && d.tags.length > 0 ? d.tags : (creature.tags ?? []),
    }))
    setExpanded(true)
  }

  function handleBestiaryClear() {
    setDraft(d => ({ ...d, bestiaryEntityId: null, bestiaryEntityName: null }))
  }

  function startEditing() {
    setDraft(entity)
    setTagInput((entity.tags ?? []).join(', '))
    setSaveError(null)
    setEditing(true)
    setExpanded(true)
  }

  function cancelEditing() {
    setEditing(false)
    setSaveError(null)
    setDraft(entity)
    setTagInput((entity.tags ?? []).join(', '))
  }

  function buildSavePayload(): Record<string, unknown> {
    const tags = tagInput.split(',').map(t => t.trim()).filter(Boolean)
    // Strip nested relation objects (not in server schema) and convert null→undefined
    // for non-nullable fields — server uses z.string().optional() which rejects null.
    // Explicitly nullable fields (portraitAssetId, bestiaryEntityId, bestiaryEntityName)
    // keep their null value so clearing them works correctly.
    const NULLABLE_KEYS = new Set(['portraitAssetId', 'imageAssetId', 'bestiaryEntityId', 'bestiaryEntityName'])
    const STRIP_KEYS = new Set(['id', 'pinned', 'portraitAsset', 'imageAsset', 'mapAsset'])
    const payload: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(draft)) {
      if (STRIP_KEYS.has(k)) continue
      if (v === null && !NULLABLE_KEYS.has(k)) continue  // skip null for non-nullable fields
      payload[k] = v
    }
    payload.tags = tags
    return payload
  }

  const { data: campaignData } = useQuery({
    queryKey: ['campaign', campaignId],
    queryFn: () => api.get(`/api/campaigns/${campaignId}`).then(r => r.data),
    enabled: !!campaignId && entityType === 'item',
    staleTime: 5 * 60 * 1000,
  })
  const isDnd5eItem = entityType === 'item' && campaignData?.campaign?.systemTemplateId === 'builtin-d-d-5e'

  const entityPath = entityType === 'plot_thread' ? 'plot-threads' : `${entityType}s`

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.patch(`/api/entities/${campaignId}/${entityPath}/${entity.id}`, data),
    onSuccess: () => {
      setSaveError(null)
      // entityPath is plural (e.g. 'npcs') — matches LibraryPage queryKey third element
      qc.invalidateQueries({ queryKey: ['entities', campaignId, entityPath], exact: false })
      setEditing(false)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? (err instanceof Error ? err.message : 'Save failed')
      setSaveError(msg)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/api/entities/${campaignId}/${entityPath}/${entity.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entities', campaignId, entityPath], exact: false })
      onSaved?.()
    },
  })

  const displayName = entityType === 'plot_thread' ? (entity.title ?? entity.name) : entity.name

  const supportsArt = ['npc', 'item', 'location'].includes(entityType)
  const artKind = entityType === 'npc' ? 'portrait_npc' as const
    : entityType === 'item' ? 'item_art' as const
    : entityType === 'location' ? 'location_art' as const
    : null
  const currentAssetId = entity.portraitAssetId ?? entity.imageAssetId ?? null

  return (
    <div className={cn('card group relative transition-all')}>
      {/* Header */}
      <div className="flex items-start gap-3">
        {supportsArt && !scratchMode && artKind ? (
          <div className="flex flex-col gap-1.5 flex-shrink-0 w-24">
            <EntityAvatarWithArt
              assetId={currentAssetId}
              portraitUrl={entity.portraitUrl}
              imageUrl={entity.imageUrl}
              entityType={entityType}
              altText={entity.portraitAsset?.altText ?? entity.imageAsset?.altText ?? displayName}
              size="lg"
            />
            <GenerateArtButton
              kind={artKind}
              entityId={entity.id}
              campaignId={campaignId}
              entityType={entityType as 'npc' | 'item' | 'location'}
              currentAssetId={currentAssetId}
              onGenerated={() => qc.invalidateQueries({ queryKey: ['entities', campaignId, entityPath], exact: false })}
            />
          </div>
        ) : entity.portraitUrl ?? entity.imageUrl ? (
          <img
            src={entity.portraitUrl ?? entity.imageUrl}
            alt={displayName}
            className="w-12 h-12 rounded-card object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-12 h-12 rounded-card bg-surface-2 flex items-center justify-center text-xl flex-shrink-0">
            {ENTITY_EMOJI[entityType] ?? '📄'}
          </div>
        )}

        <div className="flex-1 min-w-0">
          {/* Name */}
          {editing ? (
            <input
              className="input text-sm font-semibold py-0.5 w-full"
              value={draft.name}
              onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
            />
          ) : (
            <h3 className="display-font font-semibold text-ink text-base leading-tight truncate">{displayName}</h3>
          )}

          {/* Role */}
          {editing && isNpc ? (
            <input
              className="input text-xs mt-1 py-0.5 w-full"
              placeholder="Role / title…"
              value={draft.role ?? ''}
              onChange={e => setDraft(d => ({ ...d, role: e.target.value }))}
            />
          ) : entity.role ? (
            <p className="text-xs text-ink-muted mt-0.5">{entity.role}</p>
          ) : null}

          {/* Status + Disposition badges — always visible for NPCs */}
          {isNpc && !editing && (entity.status || entity.dispositionToParty) && (
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {entity.status && (
                <span className={cn('badge text-[10px] font-semibold', STATUS_COLOR[entity.status] ?? 'text-ink-muted')}>
                  {entity.status}
                </span>
              )}
              {entity.dispositionToParty && (
                <span className={cn('badge text-[10px]', DISPOSITION_COLOR[entity.dispositionToParty] ?? 'text-ink-muted')}>
                  {entity.dispositionToParty}
                </span>
              )}
            </div>
          )}

          {/* NPC status + disposition selects in edit mode */}
          {editing && isNpc && (
            <div className="flex gap-1.5 mt-1.5 flex-wrap">
              <select
                className="input text-xs py-0.5 flex-1 min-w-[90px]"
                value={draft.status ?? ''}
                onChange={e => setDraft(d => ({ ...d, status: e.target.value || undefined }))}
              >
                <option value="">Status…</option>
                {['alive', 'dead', 'missing', 'unknown'].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <select
                className="input text-xs py-0.5 flex-1 min-w-[110px]"
                value={draft.dispositionToParty ?? ''}
                onChange={e => setDraft(d => ({ ...d, dispositionToParty: e.target.value || undefined }))}
              >
                <option value="">Disposition…</option>
                {['hostile', 'wary', 'neutral', 'friendly', 'complicated'].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          )}

          {/* Non-NPC metadata */}
          {!isNpc && (entity.rarity || entity.difficulty || entity.type) && (
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {entity.rarity && (
                <span className={cn('text-xs font-medium', RARITY_COLOR[entity.rarity] ?? 'text-ink-muted')}>
                  {entity.rarity}
                </span>
              )}
              {entity.difficulty && <span className="text-xs text-orange-400">{entity.difficulty}</span>}
              {entity.type && <span className="text-xs text-ink-muted capitalize">{entity.type}</span>}
            </div>
          )}

          {/* Tags */}
          {!editing && entity.tags && entity.tags.length > 0 && (
            <div className="flex gap-1 mt-1 flex-wrap">
              {entity.tags.slice(0, 4).map(tag => (
                <span key={tag} className="badge bg-surface-2 text-ink-muted text-[10px]">{tag}</span>
              ))}
            </div>
          )}

          {/* Tags edit input */}
          {editing && (
            <div className="mt-1.5">
              <label className="label text-[10px]">Tags (comma-separated)</label>
              <input
                className="input text-xs py-0.5 w-full"
                placeholder="tag1, tag2, …"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
              />
            </div>
          )}

          {entityType === 'npc' && entity.bestiaryEntityName && !editing && (
            <div className="flex items-center gap-1 mt-1">
              <span className="badge bg-accent/10 text-accent text-[10px] flex items-center gap-0.5">
                <span>⚔</span> {entity.bestiaryEntityName}
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className={cn('flex items-center gap-1 transition-opacity shrink-0', scratchMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}>
          {isDnd5eItem && !scratchMode && (
            <button
              className="btn-ghost p-1"
              onClick={() => setItemLookupOpen(true)}
              title="Lookup SRD Item"
            >
              <Package size={13} />
            </button>
          )}
          {onRegenerate && (
            <button className="btn-ghost p-1" onClick={onRegenerate} title="Regenerate">
              <RefreshCw size={13} />
            </button>
          )}
          {!scratchMode && (
            <button className="btn-ghost p-1" onClick={startEditing} title="Edit">
              <Edit2 size={13} />
            </button>
          )}
          {scratchMode && onSave ? (
            <button className="btn-primary py-1 px-2 text-xs" onClick={() => onSave(entity)}>
              <Save size={12} /> Save
            </button>
          ) : !scratchMode && (
            <button
              className="btn-ghost p-1 text-danger"
              onClick={() => confirm(`Delete ${displayName}?`) && deleteMutation.mutate()}
            >
              <Trash2 size={13} />
            </button>
          )}
          <button className="btn-ghost p-1" onClick={() => setExpanded(v => !v)}>
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>

      {/* Description (expanded) / vital bullets (minimized) — always show in edit for NPCs */}
      {(editing || entity.description || (!expanded && vitalBullets(entityType, entity).length > 0)) && (
        <div className="mt-3">
          {editing ? (
            <textarea
              className="textarea text-sm"
              rows={3}
              placeholder="Description…"
              value={draft.description ?? ''}
              onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
            />
          ) : expanded ? (
            <p className={cn(
              'text-sm text-ink-muted prose-copy',
              (entityType === 'npc' || entityType === 'location') && 'drop-cap',
            )}>{entity.description}</p>
          ) : (
            <ul className="space-y-0.5">
              {vitalBullets(entityType, entity).map((b, i) => (
                <li key={i} className="text-xs text-ink-muted flex gap-1.5 truncate">
                  <span className="text-accent/60 shrink-0">•</span>
                  <span className="truncate">
                    {b.label && <span className="font-medium text-ink/80">{b.label}: </span>}
                    <span>{b.value}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Expanded details */}
      {expanded && (
        <div className="mt-3 space-y-3 border-t border-border pt-3 animate-fade-in">

          {/* NPC-specific fields: always shown in edit mode */}
          {isNpc && (editing || entity.appearance) && (
            <NpcField label="Appearance" fieldVal={editing ? (draft.appearance ?? '') : (entity.appearance ?? '')} editing={editing} onChange={v => setDraft(d => ({ ...d, appearance: v }))} />
          )}
          {isNpc && (editing || entity.personality) && (
            <NpcField label="Personality" fieldVal={editing ? (draft.personality ?? '') : (entity.personality ?? '')} editing={editing} onChange={v => setDraft(d => ({ ...d, personality: v }))} />
          )}
          {isNpc && (editing || entity.motivations) && (
            <NpcField label="Motivations" fieldVal={editing ? (draft.motivations ?? '') : (entity.motivations ?? '')} editing={editing} onChange={v => setDraft(d => ({ ...d, motivations: v }))} />
          )}
          {isNpc && (editing || entity.voiceNotes) && (
            <NpcField label="Voice Notes" fieldVal={editing ? (draft.voiceNotes ?? '') : (entity.voiceNotes ?? '')} editing={editing} onChange={v => setDraft(d => ({ ...d, voiceNotes: v }))} />
          )}

          {/* Non-NPC text fields — only show if populated */}
          {!isNpc && entity.appearance && (
            <Field label="Appearance" value={entity.appearance} editing={editing} onChange={v => setDraft(d => ({ ...d, appearance: v }))} draft={draft.appearance} />
          )}
          {!isNpc && entity.personality && (
            <Field label="Personality" value={entity.personality} editing={editing} onChange={v => setDraft(d => ({ ...d, personality: v }))} draft={draft.personality} />
          )}
          {!isNpc && entity.motivations && (
            <Field label="Motivations" value={entity.motivations} editing={editing} onChange={v => setDraft(d => ({ ...d, motivations: v }))} draft={draft.motivations} />
          )}
          {!isNpc && entity.voiceNotes && (
            <Field label="Voice" value={entity.voiceNotes} editing={editing} onChange={v => setDraft(d => ({ ...d, voiceNotes: v }))} draft={draft.voiceNotes} />
          )}
          {entity.mechanicalEffect && (
            <Field label="Mechanical Effect" value={entity.mechanicalEffect} editing={editing} onChange={v => setDraft(d => ({ ...d, mechanicalEffect: v }))} draft={draft.mechanicalEffect} />
          )}
          {entity.setup && (
            <Field label="Setup (read aloud)" value={entity.setup} editing={editing} onChange={v => setDraft(d => ({ ...d, setup: v }))} draft={draft.setup} />
          )}
          {entity.tactics && (
            <Field label="Tactics" value={entity.tactics} editing={editing} onChange={v => setDraft(d => ({ ...d, tactics: v }))} draft={draft.tactics} />
          )}
          {entity.twist && (
            <Field label="Twist" value={entity.twist} editing={editing} onChange={v => setDraft(d => ({ ...d, twist: v }))} draft={draft.twist} />
          )}

          {entityType === 'npc' && (editing || entity.bestiaryEntityId) && (
            <div>
              <span className="label">Bestiary Link</span>
              {editing ? (
                <BestiaryPicker
                  campaignId={campaignId}
                  linkedId={draft.bestiaryEntityId}
                  linkedName={draft.bestiaryEntityName}
                  onSelect={handleBestiarySelect}
                  onClear={handleBestiaryClear}
                />
              ) : (
                <p className="text-xs text-ink-muted">
                  Based on <span className="font-medium text-ink">{entity.bestiaryEntityName ?? entity.bestiaryEntityId}</span>
                </p>
              )}
            </div>
          )}

          {(editing ? (draft.statBlock && Object.keys(draft.statBlock).length > 0) : (entity.statBlock && Object.keys(entity.statBlock).length > 0)) && (
            <div>
              <span className="label">Stat Block {editing && draft.bestiaryEntityId && <span className="text-[10px] text-accent font-normal ml-1">(from {draft.bestiaryEntityName})</span>}</span>
              <StatBlock statBlock={editing ? (draft.statBlock ?? {}) : entity.statBlock!} />
            </div>
          )}

          {(entityType === 'encounter' || entityType === 'location') && entity.mapAsset?.imageAsset?.id && (
            <div>
              <span className="label">Battle Map</span>
              <img
                src={`/api/assets/${entity.mapAsset.imageAsset.id}?size=thumb`}
                alt="Attached battle map"
                className="w-full max-h-36 object-cover rounded-card border border-border mt-1"
              />
            </div>
          )}

          {/* Secrets — always editable for NPCs in edit mode */}
          {(editing && isNpc) || entity.secrets ? (
            <div className="gm-secret p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="label text-gm-secret mb-0">Secrets (DM only)</span>
                {!editing && entity.secrets && (
                  <button className="btn-ghost p-0.5" onClick={() => setShowSecrets(v => !v)}>
                    {showSecrets ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                )}
              </div>
              {editing ? (
                <textarea
                  className="textarea text-sm"
                  rows={2}
                  placeholder="Hidden info, true identity, plot hooks…"
                  value={draft.secrets ?? ''}
                  onChange={e => setDraft(d => ({ ...d, secrets: e.target.value }))}
                />
              ) : showSecrets ? (
                <p className="text-sm text-ink">{entity.secrets}</p>
              ) : (
                <p className="text-sm text-ink-muted italic">Hidden — click eye to reveal</p>
              )}
            </div>
          ) : null}

          {/* DM Notes — always editable for NPCs in edit mode */}
          {(editing && isNpc) || entity.dmOnlyNotes ? (
            <div className="gm-secret p-3">
              <span className="label text-gm-secret">DM Notes</span>
              {editing ? (
                <textarea
                  className="textarea text-sm"
                  rows={2}
                  placeholder="Private GM notes…"
                  value={draft.dmOnlyNotes ?? ''}
                  onChange={e => setDraft(d => ({ ...d, dmOnlyNotes: e.target.value }))}
                />
              ) : (
                <p className="text-sm text-ink">{entity.dmOnlyNotes}</p>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* Edit save/cancel bar */}
      {editing && (
        <div className="mt-3 pt-3 border-t border-border space-y-2">
          {saveError && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-1">
              {saveError}
            </p>
          )}
          <div className="flex gap-2">
            <button
              className="btn-primary text-xs py-1.5"
              onClick={() => updateMutation.mutate(buildSavePayload())}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? 'Saving…' : 'Save changes'}
            </button>
            <button className="btn-secondary text-xs py-1.5" onClick={cancelEditing}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {itemLookupOpen && <ItemLookupPanel onClose={() => setItemLookupOpen(false)} />}
    </div>
  )
}

function NpcField({
  label, fieldVal, editing, onChange,
}: {
  label: string
  fieldVal: string
  editing: boolean
  onChange: (v: string) => void
}) {
  return (
    <div>
      <span className="label">{label}</span>
      {editing ? (
        <textarea
          className="textarea text-sm"
          rows={2}
          placeholder={`${label}…`}
          value={fieldVal}
          onChange={e => onChange(e.target.value)}
        />
      ) : (
        <p className="text-sm text-ink prose-copy">{fieldVal}</p>
      )}
    </div>
  )
}

function Field({ label, value, editing, onChange, draft }: {
  label: string; value: string; editing: boolean;
  onChange: (v: string) => void; draft?: string;
}) {
  return (
    <div>
      <span className="label">{label}</span>
      {editing ? (
        <textarea className="textarea text-sm" rows={2} value={draft ?? value} onChange={e => onChange(e.target.value)} />
      ) : (
        <p className="text-sm text-ink prose-copy">{value}</p>
      )}
    </div>
  )
}
