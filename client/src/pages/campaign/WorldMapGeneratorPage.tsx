import { useState, useCallback, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { useJobStatus } from '../../lib/useJobStatus'
import MapViewer from '../../components/map/MapViewer'
import PinLayer from '../../components/map/PinLayer'
import type { MapPin, AvailableLocation } from '../../components/map/PinLayer'
import {
  Globe, Loader, ArrowLeft, Wand2, Zap, MapPin as PinIcon,
  ChevronDown, ChevronUp, Sparkles, Check,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import PromptExpandButton from '../../components/ui/PromptExpandButton'

interface StylePreset { id: string; name: string; isBuiltin: boolean }

interface MapAsset {
  id: string
  title: string
  kind: string
  imageAssetId?: string
  imageAsset?: { id: string; width?: number; height?: number }
}

const ASPECT_OPTIONS = [
  { value: '16:9', label: '16:9', hint: 'wide landscape' },
  { value: '9:16', label: '9:16', hint: 'tall portrait' },
  { value: '5:4', label: '5:4', hint: 'near-square wide' },
  { value: '4:5', label: '4:5', hint: 'near-square tall' },
] as const

type Aspect = typeof ASPECT_OPTIONS[number]['value']

export default function WorldMapGeneratorPage() {
  const { campaignId } = useParams<{ campaignId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [scope, setScope] = useState<'world' | 'region'>('world')
  const [description, setDescription] = useState('')
  const [useFromCampaign, setUseFromCampaign] = useState(false)
  const [geoSummary, setGeoSummary] = useState('')
  const [geoLoading, setGeoLoading] = useState(false)
  const [aspect, setAspect] = useState<Aspect>('16:9')
  const [selectedModel, setSelectedModel] = useState<string>('gpt-image-2')
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [customPrompt, setCustomPrompt] = useState('')

  const [softCapConfirm, setSoftCapConfirm] = useState<{
    body: Record<string, string>
    mapAsset: MapAsset
    estimate: number
    softCap: number
  } | null>(null)
  const [confirmPending, setConfirmPending] = useState(false)

  const [mapAsset, setMapAsset] = useState<MapAsset | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [imageSize, setImageSize] = useState<{ w: number; h: number }>({ w: 1280, h: 720 })
  const [mapScale, setMapScale] = useState(1)
  const [editPins, setEditPins] = useState(false)
  const [showPinPanel, setShowPinPanel] = useState(false)
  const [showPinPrompt, setShowPinPrompt] = useState(false)
  const [pendingLocationId, setPendingLocationId] = useState<string | null>(null)
  const mapRefreshedRef = useRef(false)
  const pinPromptShownRef = useRef(false)

  const { data: presetsData } = useQuery({
    queryKey: ['style-presets'],
    queryFn: () => api.get('/api/style-presets').then(r => r.data),
  })

  const { data: locationsData } = useQuery({
    queryKey: ['entities', campaignId, 'locations'],
    queryFn: () => api.get(`/api/entities/${campaignId}/locations`).then(r => r.data),
    enabled: !!campaignId,
  })

  const presets: StylePreset[] = presetsData
    ? [...(presetsData.builtins ?? []), ...(presetsData.custom ?? [])]
    : []

  const allLocations: AvailableLocation[] = (locationsData?.items ?? []).map(
    (l: { id: string; name: string; type: string }) => ({ id: l.id, name: l.name, type: l.type }),
  )

  const pinsQuery = useQuery<{ pins: MapPin[] }>({
    queryKey: ['pins', mapAsset?.id],
    queryFn: () => api.get(`/api/campaigns/${campaignId}/maps/${mapAsset!.id}/pins`).then(r => r.data),
    enabled: !!mapAsset?.id,
  })

  const pins: MapPin[] = pinsQuery.data?.pins ?? []
  const pinnedLocationIds = new Set(pins.map(p => p.locationId).filter(Boolean))
  const unpinnedLocations = allLocations.filter(l => !pinnedLocationIds.has(l.id))
  const pinnedLocations = allLocations.filter(l => pinnedLocationIds.has(l.id))

  const jobStatus = useJobStatus(jobId)

  const isGenerating =
    jobId !== null && (jobStatus.status === 'queued' || jobStatus.status === 'running')
  const hasMap = !!(mapAsset?.imageAsset?.id ?? mapAsset?.imageAssetId)

  const refreshMap = useCallback(async () => {
    if (!mapAsset) return
    try {
      const res = await api.get(`/api/campaigns/${campaignId}/maps/${mapAsset.id}`)
      setMapAsset(res.data.map as MapAsset)
      qc.invalidateQueries({ queryKey: ['maps', campaignId] })
    } catch {
      // ignore
    }
  }, [mapAsset, campaignId, qc])

  useEffect(() => {
    if (
      jobStatus.status === 'succeeded' &&
      jobStatus.assetId &&
      mapAsset &&
      !mapAsset.imageAssetId &&
      !mapAsset.imageAsset &&
      !mapRefreshedRef.current
    ) {
      mapRefreshedRef.current = true
      void refreshMap()
    }
  }, [jobStatus.status, jobStatus.assetId, mapAsset, refreshMap])

  useEffect(() => {
    if (
      jobStatus.status === 'succeeded' &&
      jobStatus.assetId &&
      hasMap &&
      !showPinPanel &&
      !showPinPrompt &&
      !pinPromptShownRef.current
    ) {
      pinPromptShownRef.current = true
      setShowPinPrompt(true)
    }
  }, [jobStatus.status, jobStatus.assetId, hasMap, showPinPanel, showPinPrompt])

  const handlePreviewContext = useCallback(async () => {
    if (!campaignId) return
    setGeoLoading(true)
    try {
      const res = await api.post('/api/generate/world-map-context', {
        campaignId,
        scope,
        description: description.trim() || undefined,
      })
      setGeoSummary((res.data as { summary: string }).summary)
    } catch (e) {
      alert(apiError(e))
    } finally {
      setGeoLoading(false)
    }
  }, [campaignId, scope, description])

  const submitImageGenerate = useCallback(async (body: Record<string, string>, confirmed?: boolean) => {
    const payload: Record<string, unknown> = { ...body }
    if (confirmed) payload.confirmed = true
    const genRes = await api.post('/api/generate/image', payload)
    setJobId((genRes.data as { jobId: string }).jobId)
    setSoftCapConfirm(null)
  }, [])

  const handleConfirmedGenerate = useCallback(async () => {
    if (!softCapConfirm || confirmPending) return
    setConfirmPending(true)
    try {
      setMapAsset(softCapConfirm.mapAsset)
      await submitImageGenerate(softCapConfirm.body, true)
    } catch (e) {
      alert(apiError(e))
      setSoftCapConfirm(null)
    } finally {
      setConfirmPending(false)
    }
  }, [softCapConfirm, confirmPending, submitImageGenerate])

  const handleGenerate = useCallback(async () => {
    if (!campaignId) return
    const descToUse = customPrompt.trim() || (useFromCampaign && geoSummary ? geoSummary : description.trim())
    if (!descToUse) return

    setMapAsset(null)
    setJobId(null)
    setSoftCapConfirm(null)
    setShowPinPanel(false)
    setShowPinPrompt(false)
    setEditPins(false)
    setPendingLocationId(null)
    mapRefreshedRef.current = false
    pinPromptShownRef.current = false

    try {
      const title = description.trim().slice(0, 60) || `${scope === 'world' ? 'World' : 'Region'} Map`
      const mapRes = await api.post(`/api/campaigns/${campaignId}/maps`, {
        title,
        kind: scope,
        source: 'generated',
        generationPrompt: descToUse,
      })
      const map = mapRes.data.map as MapAsset
      setMapAsset(map)

      const body: Record<string, string> = {
        kind: `map_${scope}`,
        entityId: map.id,
        campaignId,
        aspectRatio: aspect,
        model: selectedModel,
      }
      if (selectedPreset) body.stylePreset = selectedPreset
      if (customPrompt.trim()) body.prompt = customPrompt.trim()

      try {
        await submitImageGenerate(body)
      } catch (e: unknown) {
        const err = e as { response?: { status?: number; data?: { requiresConfirm?: boolean; estimate?: number; softCap?: number } } }
        if (err?.response?.status === 402 && err?.response?.data?.requiresConfirm) {
          setSoftCapConfirm({ body, mapAsset: map, estimate: err.response.data.estimate ?? 0, softCap: err.response.data.softCap ?? 0 })
        } else {
          alert(apiError(e))
        }
      }
    } catch (e) {
      alert(apiError(e))
    }
  }, [campaignId, scope, description, customPrompt, useFromCampaign, geoSummary, aspect, selectedPreset, selectedModel, submitImageGenerate])

  const displayAssetId = mapAsset?.imageAsset?.id ?? mapAsset?.imageAssetId ?? null

  const canGenerate =
    (description.trim().length > 0 || customPrompt.trim().length > 0 || (useFromCampaign && geoSummary.length > 0)) &&
    !isGenerating

  const handlePendingLocationConsumed = useCallback(() => {
    setPendingLocationId(null)
  }, [])

  const handlePinsChange = useCallback(() => {
    void pinsQuery.refetch()
    qc.invalidateQueries({ queryKey: ['maps', campaignId] })
  }, [pinsQuery, qc, campaignId])

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left panel */}
      <div className="w-80 flex-shrink-0 flex flex-col bg-surface border-r border-border overflow-y-auto">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <button
            onClick={() => navigate(`/campaign/${campaignId}/maps`)}
            className="btn-ghost text-xs gap-1 text-ink-muted"
          >
            <ArrowLeft size={12} /> Maps
          </button>
          <span className="text-ink font-semibold flex items-center gap-2 ml-1">
            <Globe size={16} /> World Map
          </span>
        </div>

        {/* === PIN MODE PANEL === */}
        {showPinPanel && hasMap ? (
          <div className="flex-1 flex flex-col">
            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold text-ink flex items-center gap-1.5">
                  <PinIcon size={13} /> Pin locations
                </h2>
                <button
                  onClick={() => { setShowPinPanel(false); setEditPins(false); setPendingLocationId(null) }}
                  className="text-xs text-ink-muted hover:text-ink"
                >
                  Done
                </button>
              </div>
              <p className="text-xs text-ink-muted">
                Select a location below, then click on the map to place its pin.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {unpinnedLocations.length > 0 && (
                <div>
                  <p className="text-[10px] text-ink-muted uppercase tracking-wide mb-1.5 px-1">
                    Unpinned ({unpinnedLocations.length})
                  </p>
                  {unpinnedLocations.map(loc => {
                    const isArmed = pendingLocationId === loc.id
                    return (
                      <button
                        key={loc.id}
                        onClick={() => setPendingLocationId(isArmed ? null : loc.id)}
                        className={cn(
                          'w-full text-left px-3 py-2 rounded-lg border transition-colors text-sm',
                          isArmed
                            ? 'bg-amber-900/30 border-amber-600/40 text-amber-200'
                            : 'bg-surface-2 border-border hover:border-accent/40 text-ink',
                        )}
                      >
                        <span className="font-medium">{loc.name}</span>
                        <span className="text-xs text-ink-muted capitalize ml-2">{loc.type}</span>
                        {isArmed && (
                          <p className="text-xs text-amber-300 mt-0.5">Click map to place ↗</p>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}

              {pinnedLocations.length > 0 && (
                <div>
                  <p className="text-[10px] text-ink-muted uppercase tracking-wide mb-1.5 px-1 mt-3">
                    Pinned ({pinnedLocations.length})
                  </p>
                  {pinnedLocations.map(loc => (
                    <div
                      key={loc.id}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-2 border border-border text-sm"
                    >
                      <Check size={12} className="text-accent flex-shrink-0" />
                      <span className="text-ink-muted truncate">{loc.name}</span>
                    </div>
                  ))}
                </div>
              )}

              {allLocations.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-xs text-ink-muted">No locations in campaign library yet.</p>
                  <p className="text-xs text-ink-muted mt-1">Place anonymous pins freely, or add locations to the library first.</p>
                </div>
              )}

              <div className="pt-2">
                <button
                  onClick={() => {
                    setPendingLocationId(null)
                    setEditPins(prev => !prev)
                  }}
                  className={cn(
                    'w-full btn-secondary text-xs',
                    !editPins && 'opacity-60',
                  )}
                >
                  <PinIcon size={11} />
                  {editPins ? 'Free-place pins active' : 'Enable free-place pins'}
                </button>
              </div>
            </div>

            <div className="p-3 border-t border-border">
              <button
                className="btn-secondary w-full text-xs gap-1"
                onClick={() => navigate(`/campaign/${campaignId}/maps`)}
              >
                View in Maps gallery
              </button>
            </div>
          </div>
        ) : (
          /* === GENERATOR FORM PANEL === */
          <div className="p-4 space-y-4 flex-1">
            {/* Scope toggle */}
            <div>
              <label className="label">Map scope</label>
              <div className="flex gap-2">
                {(['world', 'region'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setScope(s)}
                    className={cn('btn-ghost text-xs flex-1 capitalize', scope === s && 'bg-accent/10 text-accent border-accent/30')}
                  >
                    {s === 'world' ? '🌍 World' : '🗺 Region'}
                  </button>
                ))}
              </div>
              <p className="text-xs text-ink-muted mt-1.5">
                {scope === 'world'
                  ? 'Full continent or world overview — macro geography, biomes, ocean regions.'
                  : 'A single region at moderate detail — roads, villages, landmarks.'}
              </p>
            </div>

            {/* Description */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label mb-0">Geographic description</label>
                <PromptExpandButton value={description} onSelect={setDescription} context="world_map" />
              </div>
              <textarea
                className="textarea h-24"
                placeholder={scope === 'world'
                  ? 'A vast continent with arctic wastes in the north, ancient forests in the centre, and volcanic archipelagos to the south…'
                  : 'Rolling hills and ancient ruins around the River Anor, with a dwarven keep dominating the eastern ridge…'}
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>

            {/* Generate from campaign */}
            <div className="card p-3 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="useFromCampaign"
                  checked={useFromCampaign}
                  onChange={e => setUseFromCampaign(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="useFromCampaign" className="text-sm text-ink cursor-pointer select-none">
                  Generate from campaign locations
                </label>
              </div>
              {useFromCampaign && (
                <div className="space-y-2 animate-fade-in">
                  <button
                    onClick={handlePreviewContext}
                    disabled={geoLoading}
                    className="btn-secondary text-xs w-full gap-1"
                  >
                    {geoLoading
                      ? <><Loader size={12} className="animate-spin" /> Summarising…</>
                      : <><Sparkles size={12} /> Preview geography context</>}
                  </button>
                  {geoSummary && (
                    <div>
                      <p className="text-xs text-ink-muted mb-1">Claude's geography summary (editable):</p>
                      <textarea
                        className="textarea h-20 text-xs"
                        value={geoSummary}
                        onChange={e => setGeoSummary(e.target.value)}
                      />
                    </div>
                  )}
                </div>
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
                {ASPECT_OPTIONS.map(({ value, label, hint }) => (
                  <button
                    key={value}
                    onClick={() => setAspect(value)}
                    className={cn(
                      'flex-1 rounded py-1.5 text-xs font-medium transition-all',
                      aspect === value
                        ? 'bg-surface text-ink shadow-sm'
                        : 'text-ink-muted hover:text-ink',
                    )}
                    title={hint}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-ink-muted mt-1">
                {ASPECT_OPTIONS.find(a => a.value === aspect)?.hint}
              </p>
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
                    placeholder="painterly fantasy world map, parchment tones, mountains in the north, great forest in the centre…"
                    value={customPrompt}
                    onChange={e => setCustomPrompt(e.target.value)}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {!showPinPanel && (
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
                  : <><Wand2 size={14} /> Generate {scope === 'world' ? 'World' : 'Region'} Map</>}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Map viewer */}
        <div className="flex-1 relative">
          {isGenerating && !hasMap && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-950 z-10">
              <Loader size={40} className="animate-spin text-accent mb-4" />
              <p className="text-white/60 text-sm">
                {!mapAsset ? 'Creating map entry…' : jobStatus.status === 'queued' ? 'Queued…' : `Generating ${scope} map…`}
              </p>
              <p className="text-white/30 text-xs mt-1">Painted world maps take 20–90 seconds</p>
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
              <Globe size={48} className="text-white/20 mb-4" />
              <p className="text-white/40 text-sm">Enter a geographic description and generate</p>
            </div>
          )}

          <MapViewer
            assetId={displayAssetId}
            className="w-full h-full"
            onSizeLoaded={(w, h) => setImageSize({ w, h })}
            onScaleChange={setMapScale}
          >
            {mapAsset?.id && (
              <PinLayer
                mapId={mapAsset.id}
                campaignId={campaignId!}
                pins={pins}
                imageWidth={imageSize.w}
                imageHeight={imageSize.h}
                scale={mapScale}
                editMode={editPins}
                onPinsChange={handlePinsChange}
                availableLocations={allLocations}
                pendingLocationId={pendingLocationId}
                onPendingLocationConsumed={handlePendingLocationConsumed}
              />
            )}
          </MapViewer>
        </div>

        {/* Explicit pin-locations accept/skip prompt (appears once generation succeeds) */}
        {showPinPrompt && hasMap && !showPinPanel && (
          <div className="border-t border-accent/30 bg-accent/5 flex-shrink-0 px-4 py-3 flex items-center gap-3">
            <PinIcon size={16} className="text-accent flex-shrink-0" />
            <p className="text-sm text-ink flex-1">
              Your {scope} map is ready! Want to pin your campaign locations onto it?
            </p>
            <button
              className="btn-primary text-xs"
              onClick={() => { setShowPinPanel(true); setEditPins(true); setShowPinPrompt(false) }}
            >
              Pin locations
            </button>
            <button
              className="btn-ghost text-xs text-ink-muted"
              onClick={() => setShowPinPrompt(false)}
            >
              Skip
            </button>
          </div>
        )}

        {/* Bottom toolbar — once map is ready and not in pin panel or pin prompt */}
        {hasMap && !showPinPanel && !showPinPrompt && (
          <div className="border-t border-border bg-surface flex-shrink-0 px-4 py-2 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setShowPinPanel(true); setEditPins(true) }}
                className="btn-secondary text-xs gap-1.5"
              >
                <PinIcon size={12} /> Pin locations
              </button>
              {pins.length > 0 && (
                <span className="text-xs text-ink-muted">{pins.length} pin{pins.length !== 1 ? 's' : ''}</span>
              )}
            </div>
            <button
              className="btn-ghost text-xs gap-1 text-ink-muted"
              onClick={() => navigate(`/campaign/${campaignId}/maps`)}
            >
              View in Maps gallery
            </button>
          </div>
        )}

        {/* Pending location hint bar */}
        {pendingLocationId && (
          <div className="absolute top-0 left-0 right-0 bg-amber-900/80 border-b border-amber-600/30 px-4 py-2 flex items-center gap-2 z-20">
            <PinIcon size={13} className="text-amber-300" />
            <span className="text-sm text-amber-100 flex-1">
              Click anywhere on the map to place a pin for <strong>{allLocations.find(l => l.id === pendingLocationId)?.name}</strong>
            </span>
            <button
              onClick={() => setPendingLocationId(null)}
              className="text-xs text-amber-300 hover:text-amber-100"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
