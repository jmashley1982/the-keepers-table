import { useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { useJobStatus } from '../../lib/useJobStatus'
import MapViewer from '../../components/map/MapViewer'
import { GridOverlay, GridEditor, DEFAULT_GRID } from '../../components/map/GridOverlay'
import type { GridSettings } from '../../components/map/GridOverlay'
import {
  Map, Zap, Loader, Download, Link, ArrowLeft,
  ChevronDown, ChevronUp, Wand2,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import PromptExpandButton from '../../components/ui/PromptExpandButton'
import ThemedLoader from '../../components/ui/Loader'

interface StylePreset { id: string; name: string; isBuiltin: boolean }
interface EntityOption { id: string; name: string }

interface MapAsset {
  id: string
  title: string
  kind: string
  imageAssetId?: string
  grid?: unknown
  linkedLocationId?: string
  linkedEncounterId?: string
  imageAsset?: { id: string; width?: number; height?: number }
}

export default function BattleMapGeneratorPage() {
  const { campaignId } = useParams<{ campaignId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [description, setDescription] = useState('')
  const [linkedType, setLinkedType] = useState<'none' | 'encounter' | 'location'>('none')
  const [linkedId, setLinkedId] = useState('')
  const [aspect, setAspect] = useState<'16:9' | '9:16' | '5:4' | '4:5'>('16:9')
  const [selectedModel, setSelectedModel] = useState<string>('gpt-image-2')
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [customPrompt, setCustomPrompt] = useState('')

  const [softCapConfirm, setSoftCapConfirm] = useState<{
    mapId: string
    body: Record<string, string>
    estimate: number
    softCap: number
  } | null>(null)
  const [confirmPending, setConfirmPending] = useState(false)

  const [mapAsset, setMapAsset] = useState<MapAsset | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [imageSize, setImageSize] = useState<{ w: number; h: number }>({ w: 1024, h: 1024 })
  const [grid, setGrid] = useState<GridSettings>(DEFAULT_GRID)
  const [gridSaving, setGridSaving] = useState(false)
  const [attachMessage, setAttachMessage] = useState('')

  const { data: presetsData } = useQuery({
    queryKey: ['style-presets'],
    queryFn: () => api.get('/api/style-presets').then(r => r.data),
  })

  const { data: encountersData } = useQuery({
    queryKey: ['entities', campaignId, 'encounters'],
    queryFn: () => api.get(`/api/entities/${campaignId}/encounters`).then(r => r.data),
    enabled: !!campaignId,
  })

  const { data: locationsData } = useQuery({
    queryKey: ['entities', campaignId, 'locations'],
    queryFn: () => api.get(`/api/entities/${campaignId}/locations`).then(r => r.data),
    enabled: !!campaignId,
  })

  const presets: StylePreset[] = presetsData ? [...(presetsData.builtins ?? []), ...(presetsData.custom ?? [])] : []
  const encounters: EntityOption[] = encountersData?.items ?? []
  const locations: EntityOption[] = locationsData?.items ?? []

  const createMap = useMutation({
    mutationFn: async () => {
      const entityList = linkedType === 'encounter' ? encounters : locations
      const linked = entityList.find(e => e.id === linkedId)
      const title = description.trim().slice(0, 60) || (linked?.name ?? 'Battle Map')
      const body: Record<string, string> = { title, kind: 'battle', source: 'generated', generationPrompt: description }
      if (linkedType === 'encounter' && linkedId) body.linkedEncounterId = linkedId
      if (linkedType === 'location' && linkedId) body.linkedLocationId = linkedId
      const res = await api.post(`/api/campaigns/${campaignId}/maps`, body)
      return res.data.map as MapAsset
    },
  })

  const generateImage = useMutation({
    mutationFn: async (mapId: string) => {
      const body: Record<string, string> = {
        kind: 'map_battle',
        entityId: mapId,
        campaignId: campaignId!,
        aspectRatio: aspect,
        model: selectedModel,
      }
      if (selectedPreset) body.stylePreset = selectedPreset
      if (customPrompt.trim()) body.prompt = customPrompt.trim()
      const res = await api.post('/api/generate/image', body)
      return res.data.jobId as string
    },
  })

  const handleConfirmedGenerate = useCallback(async () => {
    if (!softCapConfirm || confirmPending) return
    setConfirmPending(true)
    try {
      const res = await api.post('/api/generate/image', { ...softCapConfirm.body, confirmed: true })
      setJobId(res.data.jobId as string)
      setSoftCapConfirm(null)
    } catch (e) {
      alert(apiError(e))
      setSoftCapConfirm(null)
    } finally {
      setConfirmPending(false)
    }
  }, [softCapConfirm, confirmPending])

  const handleGenerate = useCallback(async () => {
    if (!description.trim() && !customPrompt.trim()) return
    try {
      setMapAsset(null)
      setJobId(null)
      setSoftCapConfirm(null)
      setGrid(DEFAULT_GRID)
      const map = await createMap.mutateAsync()
      setMapAsset(map)

      const body: Record<string, string> = {
        kind: 'map_battle',
        entityId: map.id,
        campaignId: campaignId!,
        aspectRatio: aspect,
        model: selectedModel,
      }
      if (selectedPreset) body.stylePreset = selectedPreset
      if (customPrompt.trim()) body.prompt = customPrompt.trim()

      try {
        const res = await api.post('/api/generate/image', body)
        setJobId(res.data.jobId as string)
      } catch (e: unknown) {
        const err = e as { response?: { status?: number; data?: { requiresConfirm?: boolean; estimate?: number; softCap?: number } } }
        if (err?.response?.status === 402 && err?.response?.data?.requiresConfirm) {
          setSoftCapConfirm({ mapId: map.id, body, estimate: err.response.data.estimate ?? 0, softCap: err.response.data.softCap ?? 0 })
        } else {
          alert(apiError(e))
        }
      }
    } catch (e) {
      alert(apiError(e))
    }
  }, [description, customPrompt, aspect, selectedPreset, selectedModel, campaignId, createMap])

  const jobStatus = useJobStatus(jobId)

  const onJobSucceeded = useCallback(async () => {
    if (!mapAsset || !jobStatus.assetId) return
    try {
      const res = await api.get(`/api/campaigns/${campaignId}/maps/${mapAsset.id}`)
      const refreshed = res.data.map as MapAsset
      setMapAsset(refreshed)
      qc.invalidateQueries({ queryKey: ['maps', campaignId] })
    } catch {/* ignore */}
  }, [mapAsset, jobStatus.assetId, campaignId, qc])

  if (jobStatus.status === 'succeeded' && jobStatus.assetId && mapAsset && !mapAsset.imageAssetId) {
    onJobSucceeded()
  }

  const displayAssetId = mapAsset?.imageAsset?.id ?? mapAsset?.imageAssetId ?? null

  const handleSaveGrid = useCallback(async () => {
    if (!mapAsset) return
    setGridSaving(true)
    try {
      await api.patch(`/api/campaigns/${campaignId}/maps/${mapAsset.id}`, { grid })
    } catch (e) {
      alert(apiError(e))
    } finally {
      setGridSaving(false)
    }
  }, [mapAsset, campaignId, grid])

  const handleDownloadGrid = useCallback(async () => {
    if (!mapAsset) return
    try {
      const res = await api.post(
        `/api/campaigns/${campaignId}/maps/${mapAsset.id}/bake-grid`,
        { grid },
        { responseType: 'blob' },
      )
      const url = URL.createObjectURL(res.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${mapAsset.title.replace(/[^a-z0-9]/gi, '_')}_grid.png`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert(apiError(e))
    }
  }, [mapAsset, campaignId, grid])

  const handleAttach = useCallback(async () => {
    if (!mapAsset) return
    const mapBody: Record<string, string | null> = {}
    if (linkedType === 'encounter' && linkedId) mapBody.linkedEncounterId = linkedId
    else if (linkedType === 'location' && linkedId) mapBody.linkedLocationId = linkedId
    else { setAttachMessage('Select an encounter or location to attach.'); return }
    try {
      await api.patch(`/api/campaigns/${campaignId}/maps/${mapAsset.id}`, mapBody)
      const entityPath = linkedType === 'encounter' ? 'encounters' : 'locations'
      await api.patch(`/api/entities/${campaignId}/${entityPath}/${linkedId}`, { mapAssetId: mapAsset.id })
      qc.invalidateQueries({ queryKey: ['entities', campaignId, linkedType] })
      setAttachMessage('Attached!')
      setTimeout(() => setAttachMessage(''), 3000)
    } catch (e) {
      setAttachMessage(apiError(e))
    }
  }, [mapAsset, campaignId, linkedType, linkedId, qc])

  const isGenerating = createMap.isPending || generateImage.isPending ||
    jobStatus.status === 'queued' || jobStatus.status === 'running'
  const canGenerate = (description.trim().length > 0 || customPrompt.trim().length > 0) && !isGenerating
  const hasMap = !!displayAssetId

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left panel — form */}
      <div className="w-80 flex-shrink-0 flex flex-col bg-surface border-r border-border overflow-y-auto">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <button
            onClick={() => navigate(`/campaign/${campaignId}/maps`)}
            className="btn-ghost text-xs gap-1 text-ink-muted"
          >
            <ArrowLeft size={12} /> Maps
          </button>
          <span className="text-ink font-semibold flex items-center gap-2 ml-1">
            <Map size={16} /> Battle Map
          </span>
        </div>

        <div className="p-4 space-y-4 flex-1">
          {/* Scene description */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label mb-0">Scene description</label>
              <PromptExpandButton value={description} onSelect={setDescription} context="battle_map" />
            </div>
            <textarea
              className="textarea h-28"
              placeholder="A ruined tavern with collapsed roof, overturned tables, fireplace in the north wall, three exits…"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          {/* Encounter/Location link */}
          <div>
            <label className="label">Link to (optional)</label>
            <div className="flex gap-2 mb-2">
              {(['none', 'encounter', 'location'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => { setLinkedType(t); setLinkedId('') }}
                  className={cn('btn-ghost text-xs capitalize', linkedType === t && 'bg-accent/10 text-accent border-accent/30')}
                >
                  {t}
                </button>
              ))}
            </div>
            {linkedType !== 'none' && (
              <select
                className="input"
                value={linkedId}
                onChange={e => setLinkedId(e.target.value)}
              >
                <option value="">— select {linkedType} —</option>
                {(linkedType === 'encounter' ? encounters : locations).map(e => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Quality / model */}
          <div>
            <label className="label">Quality</label>
            <div className="flex gap-1 bg-surface-2 rounded-card p-1">
              {([['gpt-image-2-ultra', 'Ultra'], ['gpt-image-2', 'High'], ['krea-2-turbo', 'Med'], ['z-image', 'Low']] as const).map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => setSelectedModel(v)}
                  className={cn(
                    'flex-1 rounded py-1.5 text-xs font-medium transition-all',
                    selectedModel === v
                      ? 'bg-surface text-ink shadow-sm'
                      : 'text-ink-muted hover:text-ink',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Aspect ratio */}
          <div>
            <label className="label">Aspect ratio</label>
            <div className="grid grid-cols-4 gap-1 bg-surface-2 rounded-card p-1">
              {(['16:9', '9:16', '5:4', '4:5'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setAspect(v)}
                  className={cn(
                    'rounded py-1.5 text-xs font-medium transition-all',
                    aspect === v
                      ? 'bg-surface text-ink shadow-sm'
                      : 'text-ink-muted hover:text-ink',
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Style presets */}
          {presets.length > 0 && (
            <div>
              <label className="label">Style preset</label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setSelectedPreset(null)}
                  className={cn('px-2 py-0.5 rounded-full text-xs border transition-colors',
                    !selectedPreset
                      ? 'bg-accent text-white border-accent'
                      : 'bg-surface-2 text-ink-muted border-border hover:border-accent/40')}
                >
                  Default
                </button>
                {presets.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPreset(p.name === selectedPreset ? null : p.name)}
                    className={cn('px-2 py-0.5 rounded-full text-xs border transition-colors',
                      selectedPreset === p.name
                        ? 'bg-accent text-white border-accent'
                        : 'bg-surface-2 text-ink-muted border-border hover:border-accent/40')}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Advanced */}
          <div>
            <button
              onClick={() => setAdvancedOpen(v => !v)}
              className="flex items-center gap-1 text-xs text-ink-muted hover:text-ink transition-colors"
            >
              {advancedOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              Advanced
            </button>
            {advancedOpen && (
              <div className="mt-2 space-y-2 animate-fade-in">
                <label className="label text-xs">Custom prompt (overrides AI director)</label>
                <textarea
                  className="textarea h-20 text-xs"
                  placeholder="top-down orthographic tavern interior, stone floor, wooden beams…"
                  value={customPrompt}
                  onChange={e => setCustomPrompt(e.target.value)}
                />
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-border space-y-3">
          {softCapConfirm && (
            <div className="rounded-lg border border-amber-600/40 bg-amber-900/20 p-3 text-sm space-y-2">
              <p className="font-medium text-amber-300 text-xs">Over spending limit</p>
              <p className="text-ink-muted text-xs">
                Estimated cost <span className="text-ink font-medium">${softCapConfirm.estimate.toFixed(4)}</span> would
                exceed your soft cap of <span className="text-ink font-medium">${softCapConfirm.softCap.toFixed(2)}</span>.
              </p>
              <div className="flex gap-2">
                <button
                  className="btn-primary flex-1 text-xs justify-center"
                  onClick={handleConfirmedGenerate}
                  disabled={confirmPending}
                >
                  {confirmPending ? <><Loader size={12} className="animate-spin" /> Queuing…</> : 'Proceed anyway'}
                </button>
                <button
                  className="btn-ghost flex-1 text-xs justify-center"
                  onClick={() => setSoftCapConfirm(null)}
                  disabled={confirmPending}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {!softCapConfirm && (
            <button
              className="btn-primary w-full justify-center"
              onClick={handleGenerate}
              disabled={!canGenerate}
            >
              {isGenerating
                ? <><Loader size={14} className="animate-spin" /> Generating…</>
                : <><Wand2 size={14} /> Generate Map</>}
            </button>
          )}
        </div>
      </div>

      {/* Main area — viewer */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Map viewer */}
        <div className="flex-1 relative">
          {isGenerating && !hasMap && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-950 z-10">
              <ThemedLoader size="lg" flavor="map" className="mb-4" />
              <p className="text-white/60 text-sm">
                {createMap.isPending ? 'Creating map entry…'
                  : generateImage.isPending ? 'Queuing generation…'
                  : 'Generating battle map…'}
              </p>
              <p className="text-white/30 text-xs mt-1">This usually takes 15–60 seconds</p>
            </div>
          )}

          {jobStatus.status === 'failed' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-950 z-10 p-6 text-center">
              <p className="text-danger text-sm mb-3">{jobStatus.errorMessage ?? 'Generation failed'}</p>
              <button className="btn-primary mb-3" onClick={handleGenerate}>
                <Zap size={14} /> Retry
              </button>
              {jobStatus.rawError && (
                <details className="text-left w-full max-w-sm">
                  <summary className="text-xs text-white/30 cursor-pointer hover:text-white/50 select-none">
                    Raw error details
                  </summary>
                  <pre className="mt-2 text-[10px] text-white/40 bg-black/40 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
                    {jobStatus.rawError}
                  </pre>
                </details>
              )}
            </div>
          )}

          {!hasMap && !isGenerating && jobStatus.status !== 'failed' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-950">
              <Map size={48} className="text-white/20 mb-4" />
              <p className="text-white/40 text-sm">Enter a scene description and generate</p>
            </div>
          )}

          <MapViewer
            assetId={displayAssetId}
            className="w-full h-full"
            onSizeLoaded={(w, h) => setImageSize({ w, h })}
            onGridDrag={grid.visible ? (dx, dy) => setGrid(prev => ({
              ...prev,
              offsetX: Math.round((prev.offsetX + dx) % prev.cellSize),
              offsetY: Math.round((prev.offsetY + dy) % prev.cellSize),
            })) : undefined}
          >
            <GridOverlay
              settings={grid}
              imageWidth={imageSize.w}
              imageHeight={imageSize.h}
            />
          </MapViewer>
        </div>

        {/* Bottom toolbar */}
        {hasMap && (
          <div className="border-t border-border bg-surface flex-shrink-0">
            <div className="flex gap-6 px-4 py-3">
              {/* Grid editor */}
              <div className="flex-1 max-w-sm">
                <GridEditor settings={grid} onChange={setGrid} />
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2 justify-center">
                {grid.visible && (
                  <>
                    <button
                      className="btn-secondary text-xs gap-1"
                      onClick={handleSaveGrid}
                      disabled={gridSaving}
                    >
                      {gridSaving ? <Loader size={12} className="animate-spin" /> : null}
                      Save grid settings
                    </button>
                    <button
                      className="btn-secondary text-xs gap-1"
                      onClick={handleDownloadGrid}
                    >
                      <Download size={12} /> Download PNG with grid
                    </button>
                  </>
                )}

                <div className="flex items-center gap-2">
                  <button
                    className="btn-ghost text-xs gap-1"
                    onClick={handleAttach}
                  >
                    <Link size={12} /> Attach to {linkedType === 'none' ? 'encounter/location' : linkedType}
                  </button>
                  {attachMessage && (
                    <span className="text-xs text-accent">{attachMessage}</span>
                  )}
                </div>

                <button
                  className="btn-ghost text-xs gap-1 text-ink-muted"
                  onClick={() => navigate(`/campaign/${campaignId}/maps`)}
                >
                  <Map size={12} /> View in Maps gallery
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
