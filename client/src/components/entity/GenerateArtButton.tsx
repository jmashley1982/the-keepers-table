import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { cn } from '../../lib/cn'
import { useJobStatus } from '../../lib/useJobStatus'
import {
  Sparkles, RotateCcw, AlertCircle, ChevronDown, ChevronUp,
  Check, X, Loader, Wand2,
} from 'lucide-react'

const ENTITY_EMOJI: Record<string, string> = {
  npc: '🧙', item: '⚔️', location: '🗺️',
}

type GenerateOpts = { prompt?: string; stylePreset?: string; model?: string; aspectRatio?: AspectRatio }

type Phase =
  | { name: 'idle' }
  | { name: 'confirm'; estimate: number; softCap: number; pendingOpts: GenerateOpts }
  | { name: 'generating'; jobId: string }
  | { name: 'await_replace'; newAssetId: string; prevAssetId: string }
  | { name: 'failed'; error: string }

type AspectRatio = 'portrait'

interface StylePreset {
  id: string
  name: string
  promptFragment: string
  isBuiltin: boolean
}

export interface GenerateArtButtonProps {
  kind: 'portrait_npc' | 'portrait_pc' | 'item_art' | 'location_art'
  entityId: string
  campaignId: string
  entityType: 'npc' | 'pc' | 'item' | 'location'
  currentAssetId?: string | null
  onGenerated?: () => void
}

export default function GenerateArtButton({
  kind,
  entityId,
  campaignId,
  entityType,
  currentAssetId,
  onGenerated,
}: GenerateArtButtonProps) {
  const qc = useQueryClient()
  const [phase, setPhase] = useState<Phase>({ name: 'idle' })
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showRawError, setShowRawError] = useState(false)
  const [customPrompt, setCustomPrompt] = useState('')
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [aspectRatio] = useState<AspectRatio>('portrait')
  const [isPreviewing, setIsPreviewing] = useState(false)

  const { data: authData } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get('/auth/me').then(r => r.data),
    staleTime: 5 * 60_000,
  })
  const isFriend = authData?.user?.isFriend === true

  const { data: credsData } = useQuery({
    queryKey: ['credentials'],
    queryFn: () => api.get('/api/credentials').then(r => r.data),
    staleTime: 60_000,
  })
  const hasEvoLink = (credsData?.credentials ?? []).some(
    (c: { provider: string }) => c.provider === 'evolink'
  )

  const canGenerateImage = hasEvoLink || isFriend

  const { data: presetsData } = useQuery({
    queryKey: ['style-presets'],
    queryFn: () => api.get('/api/style-presets').then(r => r.data),
    staleTime: 120_000,
    enabled: canGenerateImage,
  })
  const presets: StylePreset[] = presetsData?.presets ?? []

  const isPc = entityType === 'pc'
  const entityPath = entityType === 'npc' ? 'npcs'
    : entityType === 'location' ? 'locations'
    : entityType === 'pc' ? 'player-characters'
    : 'items'
  const assetField = (entityType === 'npc' || entityType === 'pc') ? 'portraitAssetId' : 'imageAssetId'
  const patchBase = isPc
    ? `/api/campaigns/${campaignId}/player-characters`
    : `/api/entities/${campaignId}/${entityPath}`
  const invalidateKey = isPc
    ? ['player-characters', campaignId]
    : ['entities', campaignId, entityType]

  const jobId = phase.name === 'generating' ? phase.jobId : null
  const jobStatus = useJobStatus(jobId, () => setPhase({ name: 'idle' }))

  useEffect(() => {
    if (phase.name !== 'generating') return
    if (jobStatus.status === 'succeeded' && jobStatus.assetId) {
      if (currentAssetId && currentAssetId !== jobStatus.assetId) {
        setPhase({ name: 'await_replace', newAssetId: jobStatus.assetId, prevAssetId: currentAssetId })
      } else {
        setPhase({ name: 'idle' })
        qc.invalidateQueries({ queryKey: invalidateKey })
        onGenerated?.()
      }
    }
    if (jobStatus.status === 'failed') {
      setPhase({ name: 'failed', error: jobStatus.rawError ?? jobStatus.errorMessage ?? 'Generation failed' })
    }
  }, [jobStatus.status, jobStatus.assetId, jobStatus.errorMessage, jobStatus.rawError, phase.name, currentAssetId, campaignId, entityType, qc, onGenerated])

  const generateMutation = useMutation({
    mutationFn: (opts?: GenerateOpts & { confirmed?: boolean }) =>
      api.post<{ jobId: string }>('/api/generate/image', {
        kind,
        entityId,
        campaignId,
        prompt: opts?.prompt || undefined,
        stylePreset: opts?.stylePreset || undefined,
        model: opts?.model || undefined,
        aspectRatio: opts?.aspectRatio,
        confirmed: opts?.confirmed,
      }),
    onSuccess: (res) => {
      setPhase({ name: 'generating', jobId: res.data.jobId })
      setShowAdvanced(false)
      setCustomPrompt('')
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { status: number; data: { requiresConfirm?: boolean; estimate?: number; softCap?: number } } }
      if (axiosErr.response?.status === 402 && axiosErr.response.data.requiresConfirm) {
        const pendingOpts: GenerateOpts = {
          prompt: customPrompt.trim() || undefined,
          stylePreset: selectedPreset ?? undefined,
          model: selectedModel || undefined,
          aspectRatio,
        }
        setPhase({
          name: 'confirm',
          estimate: axiosErr.response.data.estimate ?? 0,
          softCap: axiosErr.response.data.softCap ?? 0.50,
          pendingOpts,
        })
        return
      }
      setPhase({ name: 'failed', error: apiError(err) })
    },
  })

  const deleteAssetMutation = useMutation({
    mutationFn: (assetId: string) => api.delete(`/api/assets/${assetId}`),
  })

  const revertMutation = useMutation({
    mutationFn: ({ prevAssetId, newAssetId }: { prevAssetId: string; newAssetId: string }) =>
      api.patch(`${patchBase}/${entityId}`, {
        [assetField]: prevAssetId,
      }).then(() => deleteAssetMutation.mutateAsync(newAssetId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: invalidateKey })
      setPhase({ name: 'idle' })
    },
  })

  function handleQuickGenerate() {
    generateMutation.mutate({
      stylePreset: selectedPreset ?? undefined,
      aspectRatio,
    })
  }

  function handleAdvancedGenerate() {
    generateMutation.mutate({
      prompt: customPrompt.trim() || undefined,
      stylePreset: selectedPreset ?? undefined,
      model: selectedModel || undefined,
      aspectRatio,
    })
  }

  async function handlePreviewPrompt() {
    setIsPreviewing(true)
    try {
      const res = await api.post<{ prompt: string }>('/api/generate/preview-prompt', {
        kind,
        entityId,
        campaignId,
        stylePreset: selectedPreset ?? undefined,
      })
      setCustomPrompt(res.data.prompt)
    } catch {
      // silently ignore preview errors — user can still type manually
    } finally {
      setIsPreviewing(false)
    }
  }

  function handleUseNew() {
    if (phase.name !== 'await_replace') return
    const { prevAssetId } = phase
    // Delete the superseded (old) asset from storage
    deleteAssetMutation.mutate(prevAssetId)
    qc.invalidateQueries({ queryKey: invalidateKey })
    setPhase({ name: 'idle' })
    onGenerated?.()
  }

  function handleKeepOld() {
    if (phase.name !== 'await_replace') return
    revertMutation.mutate({ prevAssetId: phase.prevAssetId, newAssetId: phase.newAssetId })
  }

  function handleRetry() {
    setPhase({ name: 'idle' })
    generateMutation.mutate({
      stylePreset: selectedPreset ?? undefined,
      aspectRatio,
    })
  }

  const isSubmitting = generateMutation.isPending

  if (!canGenerateImage) return null

  return (
    <div className="flex flex-col gap-0.5">
      {/* ── Generate / state chip row ──────────────────────────────────────── */}
      {phase.name === 'idle' && (
        <div className="flex items-center gap-0.5">
          <button
            onClick={handleQuickGenerate}
            disabled={isSubmitting}
            className="flex items-center gap-0.5 text-[10px] text-ink-muted hover:text-accent bg-surface-2 hover:bg-accent/10 border border-border hover:border-accent/40 rounded px-1.5 py-0.5 transition-colors leading-none"
            title={currentAssetId ? 'Regenerate art' : 'Generate art'}
          >
            {isSubmitting ? (
              <Loader size={9} className="animate-spin" />
            ) : (
              <Sparkles size={9} />
            )}
            <span>{currentAssetId ? 'Regen' : 'Gen'}</span>
          </button>
          <button
            onClick={() => setShowAdvanced(v => !v)}
            className={cn(
              'text-ink-muted hover:text-ink bg-surface-2 hover:bg-surface border border-border rounded px-0.5 py-0.5 transition-colors',
              showAdvanced && 'bg-surface border-accent/40 text-accent'
            )}
            title="Advanced options"
          >
            {showAdvanced ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
          </button>
        </div>
      )}

      {phase.name === 'confirm' && (
        <div className="flex flex-col gap-0.5">
          <p className="text-[9px] text-amber-400 leading-tight">
            ~${phase.estimate.toFixed(2)} &gt; ${phase.softCap.toFixed(2)} cap
          </p>
          <div className="flex gap-0.5">
            <button
              onClick={() => generateMutation.mutate({ ...phase.pendingOpts, confirmed: true })}
              disabled={generateMutation.isPending}
              className="flex items-center gap-0.5 text-[10px] text-accent bg-accent/10 hover:bg-accent/20 border border-accent/30 rounded px-1 py-0.5 transition-colors"
            >
              {generateMutation.isPending ? <Loader size={9} className="animate-spin" /> : <Sparkles size={9} />}
              Proceed
            </button>
            <button
              onClick={() => setPhase({ name: 'idle' })}
              className="text-[10px] text-ink-muted bg-surface-2 hover:bg-surface border border-border rounded px-1 py-0.5 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {phase.name === 'generating' && (
        <div className="flex items-center gap-1 text-[10px] text-accent bg-accent/10 rounded px-1.5 py-0.5">
          <Loader size={9} className="animate-spin shrink-0" />
          <span className="truncate">Generating…</span>
        </div>
      )}

      {phase.name === 'await_replace' && (
        <div className="flex flex-col gap-0.5">
          <p className="text-[9px] text-ink-muted leading-tight">New art ready</p>
          <div className="flex gap-0.5">
            <button
              onClick={handleUseNew}
              className="flex items-center gap-0.5 text-[10px] text-green-500 bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 rounded px-1 py-0.5 transition-colors"
            >
              <Check size={9} /> Use new
            </button>
            <button
              onClick={handleKeepOld}
              disabled={revertMutation.isPending}
              className="flex items-center gap-0.5 text-[10px] text-ink-muted bg-surface-2 hover:bg-surface border border-border rounded px-1 py-0.5 transition-colors"
            >
              {revertMutation.isPending ? <Loader size={9} className="animate-spin" /> : <X size={9} />}
              Keep old
            </button>
          </div>
        </div>
      )}

      {phase.name === 'failed' && (
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-0.5">
            <div className="flex items-center gap-0.5 text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded px-1 py-0.5 min-w-0">
              <AlertCircle size={9} className="shrink-0" />
              <span className="truncate">Failed</span>
            </div>
            <button
              onClick={handleRetry}
              disabled={generateMutation.isPending}
              className="text-[10px] text-ink-muted hover:text-accent bg-surface-2 hover:bg-surface border border-border rounded px-1 py-0.5 transition-colors flex items-center gap-0.5"
              title="Retry generation"
            >
              {generateMutation.isPending ? <Loader size={9} className="animate-spin" /> : <RotateCcw size={9} />}
            </button>
            <button
              onClick={() => setShowRawError(v => !v)}
              className="text-ink-muted hover:text-ink"
              title="Show error detail"
            >
              {showRawError ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
            </button>
          </div>
          {showRawError && (
            <p className="text-[9px] text-red-400 bg-red-500/5 rounded p-1 leading-tight break-all max-w-[150px]">
              {phase.error}
            </p>
          )}
        </div>
      )}

      {/* ── Advanced panel ─────────────────────────────────────────────────── */}
      {showAdvanced && phase.name === 'idle' && (
        <div className="mt-1 p-2 bg-surface-2 border border-border rounded-card space-y-2 w-52 text-[11px]">
          {/* Art Director prompt preview */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-ink-muted font-medium uppercase text-[9px] tracking-wide">Prompt</p>
              <button
                onClick={handlePreviewPrompt}
                disabled={isPreviewing}
                className="flex items-center gap-0.5 text-[9px] text-accent hover:text-accent/80 transition-colors"
                title="Let Art Director suggest a prompt"
              >
                {isPreviewing ? <Loader size={8} className="animate-spin" /> : <Wand2 size={8} />}
                <span>AI preview</span>
              </button>
            </div>
            <textarea
              className="w-full text-[10px] bg-surface border border-border rounded p-1.5 text-ink placeholder-ink-muted resize-none focus:outline-none focus:border-accent/60"
              rows={3}
              value={customPrompt}
              onChange={e => setCustomPrompt(e.target.value)}
              placeholder="Leave empty for Art Director, or click AI preview to load suggestion…"
            />
          </div>

          {/* Style preset */}
          {presets.length > 0 && (
            <div>
              <p className="text-ink-muted mb-1 font-medium uppercase text-[9px] tracking-wide">Style</p>
              <div className="flex flex-wrap gap-0.5">
                {presets.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPreset(prev => prev === p.name ? null : p.name)}
                    className={cn(
                      'text-[9px] px-1 py-0.5 rounded border transition-colors leading-none',
                      selectedPreset === p.name
                        ? 'bg-accent text-white border-accent'
                        : 'bg-surface border-border text-ink-muted hover:border-accent/40 hover:text-ink'
                    )}
                    title={p.promptFragment}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quality / model picker */}
          <div>
            <p className="text-ink-muted mb-1 font-medium uppercase text-[9px] tracking-wide">Quality</p>
            <div className="flex gap-0.5">
              {([
                ['gpt-image-2-ultra', 'Ultra'],
                ['gpt-image-2',       'High'],
                ['krea-2-turbo',      'Med'],
                ['z-image',           'Low'],
              ] as const).map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => setSelectedModel(prev => prev === v ? '' : v)}
                  className={cn(
                    'flex-1 text-[9px] py-0.5 rounded border transition-colors',
                    selectedModel === v
                      ? 'bg-accent text-white border-accent'
                      : 'bg-surface border-border text-ink-muted hover:border-accent/40'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[8px] text-ink-muted/60 mt-0.5 leading-tight">
              {selectedModel === 'gpt-image-2-ultra' ? 'GPT Image 2 (1K Med)' : selectedModel === 'gpt-image-2' ? 'GPT Image 2 (1K Low)' : selectedModel === 'krea-2-turbo' ? 'Krea 2 Turbo (1K)' : selectedModel === 'z-image' ? 'Z Image' : 'From your preferences'}
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-1 pt-0.5">
            <button
              onClick={handleAdvancedGenerate}
              disabled={isSubmitting}
              className="flex-1 btn-primary py-1 text-[10px] flex items-center justify-center gap-1"
            >
              {isSubmitting ? <Loader size={10} className="animate-spin" /> : <Sparkles size={10} />}
              Generate
            </button>
            <button
              onClick={() => setShowAdvanced(false)}
              className="btn-secondary py-1 text-[10px] px-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function EntityAvatarWithArt({
  assetId,
  portraitUrl,
  imageUrl,
  entityType,
  isGenerating,
  altText,
}: {
  assetId?: string | null
  portraitUrl?: string | null
  imageUrl?: string | null
  entityType: string
  isGenerating?: boolean
  altText?: string | null
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false)

  const src = assetId
    ? `/api/assets/${assetId}?size=thumb`
    : portraitUrl ?? imageUrl ?? null
  const fullSrc = assetId
    ? `/api/assets/${assetId}?size=full`
    : portraitUrl ?? imageUrl ?? null

  useEffect(() => {
    if (!lightboxOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightboxOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxOpen])

  return (
    <>
      <div className="relative w-12 h-12 flex-shrink-0">
        {src ? (
          <button
            onClick={() => setLightboxOpen(true)}
            className="block w-12 h-12 rounded-card overflow-hidden cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-accent/60"
            title="Click to enlarge"
          >
            <img
              src={src}
              alt={altText ?? `${entityType} art`}
              className="w-12 h-12 rounded-card object-cover hover:scale-105 transition-transform"
            />
          </button>
        ) : (
          <div className="w-12 h-12 rounded-card bg-surface-2 flex items-center justify-center text-xl">
            {ENTITY_EMOJI[entityType] ?? '📄'}
          </div>
        )}
        {isGenerating && (
          <div className="absolute inset-0 rounded-card bg-black/50 flex items-center justify-center pointer-events-none">
            <div className="w-5 h-5 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {lightboxOpen && fullSrc && (
        <div
          className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center p-6 cursor-zoom-out"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            onClick={() => setLightboxOpen(false)}
            className="absolute top-4 right-4 p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            title="Close"
          >
            <X size={20} />
          </button>
          <img
            src={fullSrc}
            alt={altText ?? `${entityType} art`}
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}
