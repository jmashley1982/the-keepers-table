import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { cn } from '../../lib/cn'
import { useJobStatus } from '../../lib/useJobStatus'
import {
  Sparkles, RotateCcw, AlertCircle, ChevronDown, ChevronUp,
  Check, X, Loader, Wand2, ImagePlus, Zap, SlidersHorizontal,
} from 'lucide-react'

const ENTITY_EMOJI: Record<string, string> = {
  npc: '🧙', item: '⚔️', location: '🗺️',
}

const ART_LABEL: Record<string, string> = {
  portrait_npc: 'Portrait', portrait_pc: 'Portrait', item_art: 'Image', location_art: 'Image',
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

const POPUP_OPEN_EVENT = 'keeper:art-popup-open'
const LIGHTBOX_OPEN_EVENT = 'keeper:lightbox-open'

export default function GenerateArtButton({
  kind,
  entityId,
  campaignId,
  entityType,
  currentAssetId,
  onGenerated,
}: GenerateArtButtonProps) {
  const qc = useQueryClient()
  // Stable instance ID for singleton management
  const instanceId = useRef(Math.random().toString(36).slice(2)).current
  const [phase, setPhase] = useState<Phase>({ name: 'idle' })
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [showRawError, setShowRawError] = useState(false)
  const [customPrompt, setCustomPrompt] = useState('')
  const [selectedPreset, setSelectedPreset] = useState<string | null>(() => {
    try { return localStorage.getItem(`art_preset_${entityType}`) ?? null } catch { return null }
  })
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    try { return localStorage.getItem(`art_model_${entityType}`) ?? '' } catch { return '' }
  })
  const [aspectRatio] = useState<AspectRatio>('portrait')
  const [popupPos, setPopupPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 240 })
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const optionsBtnRef = useRef<HTMLButtonElement>(null)

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
    : ['entities', campaignId, entityPath]

  const artLabel = ART_LABEL[kind] ?? 'Image'

  const jobId = phase.name === 'generating' ? phase.jobId : null
  const jobStatus = useJobStatus(jobId, () => setPhase({ name: 'idle' }))

  // ── Job status → phase transitions ─────────────────────────────────────
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

  // ── Persist style/quality selections ───────────────────────────────────
  useEffect(() => {
    try {
      if (selectedPreset === null) localStorage.removeItem(`art_preset_${entityType}`)
      else localStorage.setItem(`art_preset_${entityType}`, selectedPreset)
    } catch { /* ignore */ }
  }, [selectedPreset, entityType])

  useEffect(() => {
    try {
      if (selectedModel === '') localStorage.removeItem(`art_model_${entityType}`)
      else localStorage.setItem(`art_model_${entityType}`, selectedModel)
    } catch { /* ignore */ }
  }, [selectedModel, entityType])

  // ── Popup open/close: body lock + Escape + singleton broadcast + reposition ──
  useEffect(() => {
    if (!optionsOpen) {
      document.body.style.overflow = ''
      return
    }
    // Broadcast to close any other open instance
    window.dispatchEvent(new CustomEvent(POPUP_OPEN_EVENT, { detail: { id: instanceId } }))
    // Prevent scrollbar from shifting page layout
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOptionsOpen(false) }
    const reposition = () => {
      if (optionsBtnRef.current) calcPopupPos(optionsBtnRef.current)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', reposition)
    // capture:true catches scroll from any scrollable ancestor
    window.addEventListener('scroll', reposition, { capture: true })
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, { capture: true })
      document.body.style.overflow = ''
    }
  }, [optionsOpen, instanceId])

  // ── Listen for another instance opening — close self ───────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail
      if (detail.id !== instanceId) setOptionsOpen(false)
    }
    window.addEventListener(POPUP_OPEN_EVENT, handler)
    return () => window.removeEventListener(POPUP_OPEN_EVENT, handler)
  }, [instanceId])

  // ── Mutations ───────────────────────────────────────────────────────────
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
      setOptionsOpen(false)
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
        setOptionsOpen(false)
        setPhase({
          name: 'confirm',
          estimate: axiosErr.response.data.estimate ?? 0,
          softCap: axiosErr.response.data.softCap ?? 0.50,
          pendingOpts,
        })
        return
      }
      setOptionsOpen(false)
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

  // ── Handlers ────────────────────────────────────────────────────────────
  function handleFirstGenerate() {
    generateMutation.mutate({ aspectRatio })
  }

  function handleAutoRegen() {
    generateMutation.mutate({ aspectRatio })
  }

  function handleOptionsGenerate() {
    // Close immediately — don't wait for onSuccess
    setOptionsOpen(false)
    generateMutation.mutate({
      prompt: customPrompt.trim() || undefined,
      stylePreset: selectedPreset ?? undefined,
      model: selectedModel || undefined,
      aspectRatio,
    })
  }

  async function handlePreviewPrompt() {
    setIsPreviewLoading(true)
    try {
      const res = await api.post<{ prompt: string }>('/api/generate/preview-prompt', {
        kind, entityId, campaignId,
        stylePreset: selectedPreset ?? undefined,
      })
      setCustomPrompt(res.data.prompt)
    } catch {
      // silently ignore
    } finally {
      setIsPreviewLoading(false)
    }
  }

  function calcPopupPos(fromEl: HTMLElement) {
    const rect = fromEl.getBoundingClientRect()
    const popW = 240
    const popH = 310
    const top = rect.top - popH - 6 < 8 ? rect.bottom + 6 : rect.top - popH - 6
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - popW - 8)
    setPopupPos({ top, left, width: popW })
  }

  function handleOpenOptions() {
    if (optionsBtnRef.current) calcPopupPos(optionsBtnRef.current)
    setOptionsOpen(true)
  }

  async function handleSmartAuto(e: React.MouseEvent<HTMLButtonElement>) {
    const anchor = optionsBtnRef.current ?? e.currentTarget
    calcPopupPos(anchor)
    setCustomPrompt('')
    setOptionsOpen(true)
    setIsPreviewLoading(true)
    try {
      const res = await api.post<{ prompt: string }>('/api/generate/preview-prompt', {
        kind, entityId, campaignId,
        stylePreset: selectedPreset ?? undefined,
      })
      setCustomPrompt(res.data.prompt)
    } catch {
      // silently ignore — user can still type or use AI preview button
    } finally {
      setIsPreviewLoading(false)
    }
  }

  function handleUseNew() {
    if (phase.name !== 'await_replace') return
    deleteAssetMutation.mutate(phase.prevAssetId)
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
    generateMutation.mutate({ aspectRatio })
  }

  const isSubmitting = generateMutation.isPending

  if (!canGenerateImage) return null

  // ── Popup (portal-rendered at body to escape stacking contexts) ─────────
  const popupPortal = optionsOpen ? createPortal(
    <>
      {/* Backdrop — covers full viewport outside any scroll container */}
      <div
        className="fixed inset-0 z-[9998]"
        onClick={() => setOptionsOpen(false)}
      />
      {/* Floating options card */}
      <div
        className="fixed z-[9999] rounded-card border shadow-xl"
        style={{
          top: popupPos.top,
          left: popupPos.left,
          width: popupPos.width,
          background: 'var(--color-surface)',
          borderColor: 'color-mix(in srgb, var(--color-accent) 30%, var(--color-border))',
          boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-3 py-2 border-b"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <span className="text-[11px] font-semibold text-ink flex items-center gap-1.5">
            <Wand2 size={11} className="text-accent" />
            {artLabel} Options
          </span>
          <button
            onClick={() => setOptionsOpen(false)}
            className="text-ink-muted hover:text-ink transition-colors"
          >
            <X size={12} />
          </button>
        </div>

        <div className="p-3 space-y-3">
          {/* Prompt */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-ink-muted font-medium uppercase text-[9px] tracking-wide">Prompt</p>
              <button
                onClick={handlePreviewPrompt}
                disabled={isPreviewLoading}
                className="flex items-center gap-0.5 text-[9px] text-accent hover:text-accent/80 transition-colors disabled:opacity-50"
                title="Fill with AI-generated prompt"
              >
                {isPreviewLoading ? <Loader size={8} className="animate-spin" /> : <Wand2 size={8} />}
                <span>AI preview</span>
              </button>
            </div>
            <div className="relative">
              <textarea
                className="w-full text-[10px] rounded p-1.5 text-ink placeholder-ink-muted resize-none focus:outline-none focus:ring-1"
                style={{
                  background: 'var(--color-surface-2)',
                  border: '1px solid var(--color-border)',
                  opacity: isPreviewLoading ? 0.5 : 1,
                }}
                rows={3}
                value={customPrompt}
                onChange={e => setCustomPrompt(e.target.value)}
                placeholder={isPreviewLoading ? 'Generating prompt…' : 'Leave empty for Art Director…'}
                readOnly={isPreviewLoading}
                autoFocus
              />
              {isPreviewLoading && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <Loader size={14} className="animate-spin text-accent" />
                </div>
              )}
            </div>
          </div>

          {/* Style presets */}
          {presets.length > 0 && (
            <div>
              <p className="text-ink-muted mb-1 font-medium uppercase text-[9px] tracking-wide">Style</p>
              <div className="flex flex-wrap gap-0.5">
                {presets.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPreset(prev => prev === p.name ? null : p.name)}
                    className={cn(
                      'text-[9px] px-1.5 py-0.5 rounded border transition-colors leading-none',
                      selectedPreset === p.name
                        ? 'bg-accent text-white border-accent'
                        : 'text-ink-muted hover:text-ink'
                    )}
                    style={selectedPreset !== p.name ? {
                      background: 'var(--color-surface-2)',
                      borderColor: 'var(--color-border)',
                    } : undefined}
                    title={p.promptFragment}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quality */}
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
                      : 'text-ink-muted hover:text-ink'
                  )}
                  style={selectedModel !== v ? {
                    background: 'var(--color-surface-2)',
                    borderColor: 'var(--color-border)',
                  } : undefined}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-1.5 pt-0.5">
            <button
              onClick={handleOptionsGenerate}
              disabled={isSubmitting}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-card text-[11px] font-bold transition-all disabled:opacity-50"
              style={{ background: 'var(--color-accent)', color: '#fff' }}
            >
              {isSubmitting ? <Loader size={10} className="animate-spin" /> : <Sparkles size={10} />}
              Generate
            </button>
            <button
              onClick={() => setOptionsOpen(false)}
              className="px-3 py-1.5 rounded-card text-[11px] text-ink-muted border transition-colors hover:text-ink"
              style={{
                background: 'var(--color-surface-2)',
                borderColor: 'var(--color-border)',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  ) : null

  return (
    <div className="flex flex-col gap-1 w-full">

      {/* ── IDLE: no portrait → Generate + Wand (preview) + Options ─────────── */}
      {phase.name === 'idle' && !currentAssetId && (
        <div className="flex items-center gap-1">
          <button
            onClick={handleFirstGenerate}
            disabled={isSubmitting}
            className="art-gen-btn flex items-center justify-center gap-1.5 flex-1 px-2 py-1.5 rounded-card text-xs font-bold transition-all disabled:opacity-50"
            title={`Generate ${artLabel} immediately`}
          >
            {isSubmitting ? <Loader size={11} className="animate-spin" /> : <ImagePlus size={11} />}
            Generate
          </button>
          <button
            ref={optionsBtnRef}
            onClick={handleSmartAuto}
            disabled={isSubmitting || isPreviewLoading}
            className={cn(
              'flex items-center justify-center w-7 h-7 rounded-card border transition-colors shrink-0',
              optionsOpen && isPreviewLoading
                ? 'text-accent border-accent/40 bg-accent/10'
                : 'text-ink-muted border-border bg-surface-2 hover:text-ink hover:bg-surface hover:border-accent/30'
            )}
            title="Preview AI prompt, then generate"
          >
            {isPreviewLoading ? <Loader size={10} className="animate-spin text-accent" /> : <Wand2 size={11} />}
          </button>
          <button
            onClick={handleOpenOptions}
            disabled={isSubmitting}
            className={cn(
              'flex items-center justify-center w-7 h-7 rounded-card border transition-colors shrink-0',
              optionsOpen && !isPreviewLoading
                ? 'text-accent border-accent/40 bg-accent/10'
                : 'text-ink-muted border-border bg-surface-2 hover:text-ink hover:bg-surface hover:border-accent/30'
            )}
            title="Generation options"
          >
            <SlidersHorizontal size={11} />
          </button>
        </div>
      )}

      {/* ── IDLE: has portrait → AUTO + Preview + Options popup trigger ──────── */}
      {phase.name === 'idle' && currentAssetId && (
        <div className="flex items-center gap-1">
          <button
            onClick={handleAutoRegen}
            disabled={isSubmitting}
            className="art-gen-btn-regen flex items-center justify-center gap-1.5 flex-1 px-2 py-1.5 rounded-card text-xs font-bold transition-all disabled:opacity-50"
            title={`Auto-regenerate ${artLabel} immediately`}
          >
            {isSubmitting ? <Loader size={11} className="animate-spin" /> : <Zap size={11} />}
            AUTO
          </button>
          <button
            ref={optionsBtnRef}
            onClick={handleSmartAuto}
            disabled={isSubmitting || isPreviewLoading}
            className={cn(
              'flex items-center justify-center w-7 h-7 rounded-card border transition-colors shrink-0',
              optionsOpen && isPreviewLoading
                ? 'text-accent border-accent/40 bg-accent/10'
                : 'text-ink-muted border-border bg-surface-2 hover:text-ink hover:bg-surface hover:border-accent/30'
            )}
            title="Preview AI prompt, then generate"
          >
            {isPreviewLoading ? <Loader size={10} className="animate-spin text-accent" /> : <Wand2 size={11} />}
          </button>
          <button
            onClick={handleOpenOptions}
            disabled={isSubmitting}
            className={cn(
              'flex items-center justify-center w-7 h-7 rounded-card border transition-colors shrink-0',
              optionsOpen && !isPreviewLoading
                ? 'text-accent border-accent/40 bg-accent/10'
                : 'text-ink-muted border-border bg-surface-2 hover:text-ink hover:bg-surface hover:border-accent/30'
            )}
            title="Generation options"
          >
            <SlidersHorizontal size={11} />
          </button>
        </div>
      )}

      {/* ── COST CONFIRM ───────────────────────────────────────────────────── */}
      {phase.name === 'confirm' && (
        <div className="flex flex-col gap-1">
          <p className="text-[10px] text-amber-400 leading-tight">
            ~${phase.estimate.toFixed(2)} &gt; ${phase.softCap.toFixed(2)} cap
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => generateMutation.mutate({ ...phase.pendingOpts, confirmed: true })}
              disabled={generateMutation.isPending}
              className="flex items-center gap-1 flex-1 justify-center text-[11px] font-medium text-accent bg-accent/10 hover:bg-accent/20 border border-accent/30 rounded px-2 py-1 transition-colors"
            >
              {generateMutation.isPending ? <Loader size={9} className="animate-spin" /> : <Sparkles size={9} />}
              Proceed
            </button>
            <button
              onClick={() => setPhase({ name: 'idle' })}
              className="text-[11px] text-ink-muted bg-surface-2 hover:bg-surface border border-border rounded px-2 py-1 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── GENERATING ─────────────────────────────────────────────────────── */}
      {phase.name === 'generating' && (
        <div className="flex items-center gap-1.5 text-[11px] text-accent bg-accent/10 rounded-card px-2 py-1.5 border border-accent/20">
          <Loader size={10} className="animate-spin shrink-0" />
          <span>Generating {artLabel.toLowerCase()}…</span>
        </div>
      )}

      {/* ── NEW ART READY ──────────────────────────────────────────────────── */}
      {phase.name === 'await_replace' && (
        <div className="p-2 bg-green-500/10 border border-green-500/25 rounded-card space-y-1.5 animate-resolve-in">
          <p className="text-[11px] font-semibold text-green-400">✦ New {artLabel.toLowerCase()} ready!</p>
          <div className="flex gap-1">
            <button
              onClick={handleUseNew}
              className="flex items-center gap-1 flex-1 justify-center text-[11px] font-semibold text-green-500 bg-green-500/15 hover:bg-green-500/25 border border-green-500/30 rounded px-2 py-1 transition-colors"
            >
              <Check size={9} /> Use new
            </button>
            <button
              onClick={handleKeepOld}
              disabled={revertMutation.isPending}
              className="flex items-center gap-1 text-[11px] text-ink-muted bg-surface-2 hover:bg-surface border border-border rounded px-2 py-1 transition-colors"
            >
              {revertMutation.isPending ? <Loader size={9} className="animate-spin" /> : <X size={9} />}
              Keep old
            </button>
          </div>
        </div>
      )}

      {/* ── FAILED ─────────────────────────────────────────────────────────── */}
      {phase.name === 'failed' && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <div className="flex items-center gap-1 text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded px-1.5 py-0.5 flex-1 min-w-0">
              <AlertCircle size={9} className="shrink-0" />
              <span className="truncate">Generation failed</span>
            </div>
            <button
              onClick={handleRetry}
              disabled={generateMutation.isPending}
              className="text-[11px] text-ink-muted hover:text-accent bg-surface-2 hover:bg-surface border border-border rounded px-1.5 py-0.5 transition-colors flex items-center gap-1"
              title="Retry"
            >
              {generateMutation.isPending ? <Loader size={9} className="animate-spin" /> : <RotateCcw size={9} />}
            </button>
            <button
              onClick={() => setShowRawError(v => !v)}
              className="text-ink-muted hover:text-ink p-0.5"
              title="Show error"
            >
              {showRawError ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
            </button>
          </div>
          {showRawError && (
            <p className="text-[9px] text-red-400 bg-red-500/5 rounded p-1 leading-tight break-all">
              {phase.error}
            </p>
          )}
        </div>
      )}

      {/* ── OPTIONS POPUP (portal) ──────────────────────────────────────────── */}
      {popupPortal}
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
  size = 'sm',
}: {
  assetId?: string | null
  portraitUrl?: string | null
  imageUrl?: string | null
  entityType: string
  isGenerating?: boolean
  altText?: string | null
  size?: 'sm' | 'lg'
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  // Stable instance ID so the singleton event can distinguish self from others
  const instanceId = useRef(Math.random().toString(36).slice(2)).current

  const src = assetId
    ? `/api/assets/${assetId}?size=thumb`
    : portraitUrl ?? imageUrl ?? null
  const fullSrc = assetId
    ? `/api/assets/${assetId}?size=full`
    : portraitUrl ?? imageUrl ?? null

  // ── Lightbox open/close: body lock + Escape + singleton broadcast ───────
  useEffect(() => {
    if (!lightboxOpen) {
      document.body.style.overflow = ''
      return
    }
    // Tell every other EntityAvatarWithArt to close
    window.dispatchEvent(new CustomEvent(LIGHTBOX_OPEN_EVENT, { detail: { id: instanceId } }))
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightboxOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [lightboxOpen, instanceId])

  // ── Close self when another instance opens ──────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail
      if (detail.id !== instanceId) setLightboxOpen(false)
    }
    window.addEventListener(LIGHTBOX_OPEN_EVENT, handler)
    return () => window.removeEventListener(LIGHTBOX_OPEN_EVENT, handler)
  }, [instanceId])

  const sizeClass = size === 'lg' ? 'w-24 h-32' : 'w-12 h-12'
  const imgClass = size === 'lg'
    ? 'w-24 h-32 rounded-card object-cover transition-opacity hover:opacity-90'
    : 'w-12 h-12 rounded-card object-cover transition-opacity hover:opacity-90'
  const emojiFontSize = size === 'lg' ? 'text-4xl' : 'text-xl'

  // ── Lightbox portal — rendered at document.body to escape stacking contexts
  const lightboxPortal = lightboxOpen && fullSrc ? createPortal(
    <div
      className="fixed inset-0 z-[9990] bg-black/85 flex items-center justify-center p-6 cursor-zoom-out"
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
        className="max-w-full max-h-full object-contain rounded-lg shadow-2xl cursor-default"
        onClick={e => e.stopPropagation()}
      />
    </div>,
    document.body,
  ) : null

  return (
    <>
      <div className={cn('relative flex-shrink-0', sizeClass)}>
        {src ? (
          <button
            onClick={() => setLightboxOpen(true)}
            className={cn('block rounded-card overflow-hidden cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-accent/60', sizeClass)}
            title="Click to enlarge"
          >
            <img
              src={src}
              alt={altText ?? `${entityType} art`}
              className={imgClass}
            />
          </button>
        ) : (
          <div className={cn('rounded-card bg-surface-2 flex items-center justify-center', sizeClass, emojiFontSize)}>
            {ENTITY_EMOJI[entityType] ?? '📄'}
          </div>
        )}
        {isGenerating && (
          <div className="absolute inset-0 rounded-card bg-black/50 flex items-center justify-center pointer-events-none">
            <div className="w-5 h-5 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Lightbox (portal-rendered at body to escape all ancestor stacking contexts) */}
      {lightboxPortal}
    </>
  )
}
