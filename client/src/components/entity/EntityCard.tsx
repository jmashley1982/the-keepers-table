import { useCallback, useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { cn } from '../../lib/cn'
import { useJobStatus } from '../../lib/useJobStatus'
import {
  RefreshCw, Edit2, Save, Trash2,
  ChevronDown, ChevronUp, Eye, EyeOff,
  Sparkles, RotateCcw, AlertCircle,
} from 'lucide-react'

export interface EntityCardData {
  id: string
  name: string
  description?: string
  imageUrl?: string
  portraitUrl?: string
  portraitAssetId?: string
  imageAssetId?: string
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
  // Item
  rarity?: string
  category?: string
  mechanicalEffect?: string
  // Location
  type?: string
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

// ── Portrait component ────────────────────────────────────────────────────────

function EntityPortrait({
  entity,
  entityType,
  campaignId,
  onPortraitReady,
}: {
  entity: EntityCardData
  entityType: EntityCardProps['entityType']
  campaignId: string
  onPortraitReady?: () => void
}) {
  const qc = useQueryClient()
  const [jobId, setJobId] = useState<string | null>(null)
  const [genError, setGenError] = useState<string | null>(null)

  const kind = entityType === 'npc' ? 'portrait_npc'
    : entityType === 'location' ? 'location_art'
    : entityType === 'item' ? 'item_art'
    : null

  const generateMutation = useMutation({
    mutationFn: () => api.post<{ jobId: string }>('/api/generate/image', {
      kind,
      entityId: entity.id,
      campaignId,
    }),
    onSuccess: (res) => {
      setGenError(null)
      setJobId(res.data.jobId)
    },
    onError: (err) => {
      setGenError(apiError(err))
    },
  })

  const retryGenerate = useCallback(() => {
    setGenError(null)
    setJobId(null)
    generateMutation.mutate()
  }, [generateMutation])

  const jobStatus = useJobStatus(jobId, retryGenerate)

  useEffect(() => {
    if (jobStatus.status === 'succeeded') {
      qc.invalidateQueries({ queryKey: ['entities', campaignId, entityType] })
      onPortraitReady?.()
      setJobId(null)
    }
    if (jobStatus.status === 'failed') {
      setGenError(jobStatus.errorMessage ?? 'Generation failed')
      setJobId(null)
    }
  }, [jobStatus.status, jobStatus.errorMessage, campaignId, entityType, qc, onPortraitReady])

  const isGenerating = generateMutation.isPending ||
    (jobId !== null && (jobStatus.status === null || jobStatus.status === 'queued' || jobStatus.status === 'running'))

  // Resolve portrait image src
  const assetId = entity.portraitAssetId ?? entity.imageAssetId ?? null
  const portraitSrc = assetId
    ? `/api/assets/${assetId}?size=thumb`
    : entity.portraitUrl ?? entity.imageUrl ?? null

  const canGenerate = kind !== null && !isGenerating

  return (
    <div className="flex flex-col gap-1">
      <div className="relative w-12 h-12 flex-shrink-0">
        {portraitSrc ? (
          <img
            src={portraitSrc}
            alt="portrait"
            className="w-12 h-12 rounded-card object-cover"
          />
        ) : (
          <div className="w-12 h-12 rounded-card bg-surface-2 flex items-center justify-center text-xl">
            {ENTITY_EMOJI[entityType] ?? '📄'}
          </div>
        )}

        {/* Spinner overlay while generating */}
        {isGenerating && (
          <div className="absolute inset-0 rounded-card bg-black/50 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Generate hover button (only when not generating) */}
        {canGenerate && !isGenerating && (
          <button
            onClick={() => generateMutation.mutate()}
            className="absolute inset-0 rounded-card opacity-0 hover:opacity-100 bg-black/60 flex flex-col items-center justify-center gap-0.5 transition-opacity group/gen"
            title="Generate portrait"
          >
            <Sparkles size={12} className="text-white" />
            <span className="text-[9px] text-white/90 font-medium leading-none">Generate</span>
          </button>
        )}
      </div>

      {/* Error chip below avatar */}
      {genError && !isGenerating && (
        <div className="flex items-center gap-1 text-[10px] text-red-400 bg-red-500/10 rounded px-1.5 py-1 w-12">
          <AlertCircle size={10} className="shrink-0" />
          <button
            onClick={() => { setGenError(null); generateMutation.mutate() }}
            className="underline truncate"
            title={genError}
          >
            Retry
          </button>
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

  const entityPath = entityType === 'plot_thread' ? 'plot-threads' : `${entityType}s`

  const updateMutation = useMutation({
    mutationFn: (data: Partial<EntityCardData>) =>
      api.patch(`/api/entities/${campaignId}/${entityPath}/${entity.id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entities', campaignId, entityType] })
      setEditing(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/api/entities/${campaignId}/${entityPath}/${entity.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entities', campaignId, entityType] })
      onSaved?.()
    },
  })

  const displayName = entityType === 'plot_thread' ? (entity.title ?? entity.name) : entity.name

  const supportsPortrait = ['npc', 'item', 'location'].includes(entityType)

  return (
    <div className={cn('card group relative transition-all')}>
      {/* Header */}
      <div className="flex items-start gap-3">
        {supportsPortrait && !scratchMode ? (
          <EntityPortrait
            entity={entity}
            entityType={entityType}
            campaignId={campaignId}
            onPortraitReady={() => qc.invalidateQueries({ queryKey: ['entities', campaignId, entityType] })}
          />
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
          <div className="flex items-start justify-between">
            {editing ? (
              <input
                className="input text-sm font-semibold py-0.5"
                value={draft.name}
                onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
              />
            ) : (
              <h3 className="display-font font-semibold text-ink text-base leading-tight truncate">{displayName}</h3>
            )}
          </div>

          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {entity.role && <span className="text-xs text-ink-muted">{entity.role}</span>}
            {entity.status && (
              <span className={cn('text-xs font-medium', STATUS_COLOR[entity.status] ?? 'text-ink-muted')}>
                {entity.status}
              </span>
            )}
            {entity.dispositionToParty && (
              <span className={cn('text-xs', DISPOSITION_COLOR[entity.dispositionToParty] ?? 'text-ink-muted')}>
                {entity.dispositionToParty}
              </span>
            )}
            {entity.rarity && (
              <span className={cn('text-xs font-medium', RARITY_COLOR[entity.rarity] ?? 'text-ink-muted')}>
                {entity.rarity}
              </span>
            )}
            {entity.difficulty && <span className="text-xs text-orange-400">{entity.difficulty}</span>}
            {entity.type && <span className="text-xs text-ink-muted capitalize">{entity.type}</span>}
          </div>

          {entity.tags && entity.tags.length > 0 && (
            <div className="flex gap-1 mt-1 flex-wrap">
              {entity.tags.slice(0, 4).map(tag => (
                <span key={tag} className="badge bg-surface-2 text-ink-muted text-[10px]">{tag}</span>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {onRegenerate && (
            <button className="btn-ghost p-1" onClick={onRegenerate} title="Regenerate">
              <RefreshCw size={13} />
            </button>
          )}
          {!scratchMode && (
            <button className="btn-ghost p-1" onClick={() => setEditing(v => !v)} title="Edit">
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

      {/* Description */}
      {entity.description && (
        <div className="mt-3">
          {editing ? (
            <textarea
              className="textarea text-sm"
              rows={3}
              value={draft.description ?? ''}
              onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
            />
          ) : (
            <p className="text-sm text-ink-muted leading-relaxed">{entity.description}</p>
          )}
        </div>
      )}

      {/* Expanded details */}
      {expanded && (
        <div className="mt-3 space-y-3 border-t border-border pt-3 animate-fade-in">
          {entity.appearance && (
            <Field label="Appearance" value={entity.appearance} editing={editing} onChange={v => setDraft(d => ({ ...d, appearance: v }))} draft={draft.appearance} />
          )}
          {entity.personality && (
            <Field label="Personality" value={entity.personality} editing={editing} onChange={v => setDraft(d => ({ ...d, personality: v }))} draft={draft.personality} />
          )}
          {entity.motivations && (
            <Field label="Motivations" value={entity.motivations} editing={editing} onChange={v => setDraft(d => ({ ...d, motivations: v }))} draft={draft.motivations} />
          )}
          {entity.voiceNotes && (
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

          {entity.statBlock && Object.keys(entity.statBlock).length > 0 && (
            <div>
              <span className="label">Stat Block</span>
              <StatBlock statBlock={entity.statBlock} />
            </div>
          )}

          {entity.secrets && (
            <div className="gm-secret p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="label text-gm-secret mb-0">Secrets (DM only)</span>
                <button className="btn-ghost p-0.5" onClick={() => setShowSecrets(v => !v)}>
                  {showSecrets ? <EyeOff size={12} /> : <Eye size={12} />}
                </button>
              </div>
              {showSecrets ? (
                editing ? (
                  <textarea className="textarea text-sm" rows={2} value={draft.secrets ?? ''} onChange={e => setDraft(d => ({ ...d, secrets: e.target.value }))} />
                ) : (
                  <p className="text-sm text-ink">{entity.secrets}</p>
                )
              ) : (
                <p className="text-sm text-ink-muted italic">Hidden — click to reveal</p>
              )}
            </div>
          )}
          {entity.dmOnlyNotes && (
            <div className="gm-secret p-3">
              <span className="label text-gm-secret">DM Notes</span>
              {editing ? (
                <textarea className="textarea text-sm" rows={2} value={draft.dmOnlyNotes ?? ''} onChange={e => setDraft(d => ({ ...d, dmOnlyNotes: e.target.value }))} />
              ) : (
                <p className="text-sm text-ink">{entity.dmOnlyNotes}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Edit save/cancel bar */}
      {editing && (
        <div className="flex gap-2 mt-3 pt-3 border-t border-border">
          <button
            className="btn-primary text-xs py-1.5"
            onClick={() => updateMutation.mutate(draft)}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? 'Saving…' : 'Save changes'}
          </button>
          <button className="btn-secondary text-xs py-1.5" onClick={() => { setEditing(false); setDraft(entity) }}>
            Cancel
          </button>
        </div>
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
        <p className="text-sm text-ink leading-relaxed">{value}</p>
      )}
    </div>
  )
}
