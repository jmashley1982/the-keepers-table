import { useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { useJobStatus } from '../../lib/useJobStatus'
import MapViewer from '../../components/map/MapViewer'
import PinLayer from '../../components/map/PinLayer'
import type { MapPin } from '../../components/map/PinLayer'
import {
  Globe, Loader, ArrowLeft, Wand2, Zap, MapPin as PinIcon, ChevronDown, ChevronUp, Sparkles,
} from 'lucide-react'
import { cn } from '../../lib/cn'

interface StylePreset { id: string; name: string; isBuiltin: boolean }
interface EntityOption { id: string; name: string }

interface MapAsset {
  id: string
  title: string
  kind: string
  imageAssetId?: string
  imageAsset?: { id: string; width?: number; height?: number }
}

const ASPECT_OPTIONS = [
  { value: 'landscape', label: '16:9' },
  { value: 'square', label: '1:1' },
  { value: 'portrait', label: '2:3' },
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
  const [aspect, setAspect] = useState<Aspect>('landscape')
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [customPrompt, setCustomPrompt] = useState('')

  const [mapAsset, setMapAsset] = useState<MapAsset | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [imageSize, setImageSize] = useState<{ w: number; h: number }>({ w: 1024, h: 1024 })
  const [mapScale, setMapScale] = useState(1)
  const [editPins, setEditPins] = useState(false)
  const [showPinPrompt, setShowPinPrompt] = useState(false)

  const { data: presetsData } = useQuery({
    queryKey: ['style-presets'],
    queryFn: () => api.get('/api/style-presets').then(r => r.data),
  })

  const presets: StylePreset[] = presetsData
    ? [...(presetsData.builtins ?? []), ...(presetsData.custom ?? [])]
    : []

  const pinsQuery = useQuery<{ pins: MapPin[] }>({
    queryKey: ['pins', mapAsset?.id],
    queryFn: () => api.get(`/api/campaigns/${campaignId}/maps/${mapAsset!.id}/pins`).then(r => r.data),
    enabled: !!mapAsset?.id,
  })

  const pins: MapPin[] = pinsQuery.data?.pins ?? []

  const jobStatus = useJobStatus(jobId)

  const isGenerating =
    jobId !== null && (jobStatus.status === 'queued' || jobStatus.status === 'running')
  const hasMap = !!(mapAsset?.imageAsset?.id ?? mapAsset?.imageAssetId)

  const refreshMap = useCallback(async () => {
    if (!mapAsset) return
    try {
      const res = await api.get(`/api/campaigns/${campaignId}/maps/${mapAsset.id}`)
      const refreshed = res.data.map as MapAsset
      setMapAsset(refreshed)
      qc.invalidateQueries({ queryKey: ['maps', campaignId] })
    } catch {
      // ignore
    }
  }, [mapAsset, campaignId, qc])

  if (jobStatus.status === 'succeeded' && jobStatus.assetId && mapAsset && !mapAsset.imageAssetId && !mapAsset.imageAsset) {
    refreshMap()
  }

  if (jobStatus.status === 'succeeded' && jobStatus.assetId && !showPinPrompt && hasMap) {
    setShowPinPrompt(true)
  }

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

  const handleGenerate = useCallback(async () => {
    if (!campaignId) return
    const descToUse = customPrompt.trim() || (useFromCampaign && geoSummary ? geoSummary : description.trim())
    if (!descToUse) return

    setMapAsset(null)
    setJobId(null)
    setShowPinPrompt(false)
    setEditPins(false)

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
      }
      if (selectedPreset) body.stylePreset = selectedPreset
      if (customPrompt.trim()) body.prompt = customPrompt.trim()
      else if (useFromCampaign && geoSummary) body.prompt = geoSummary
      const genRes = await api.post('/api/generate/image', body)
      setJobId((genRes.data as { jobId: string }).jobId)
    } catch (e) {
      alert(apiError(e))
    }
  }, [campaignId, scope, description, customPrompt, useFromCampaign, geoSummary, aspect, selectedPreset])

  const displayAssetId = mapAsset?.imageAsset?.id ?? mapAsset?.imageAssetId ?? null

  const canGenerate =
    (description.trim().length > 0 || customPrompt.trim().length > 0 || (useFromCampaign && geoSummary.length > 0)) &&
    !isGenerating

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
            <label className="label">Geographic description</label>
            <textarea
              className="textarea h-24"
              placeholder={scope === 'world'
                ? 'A vast continent spanning arctic wastes in the north, ancient forests in the centre, and volcanic archipelagos to the south…'
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

          {/* Aspect ratio */}
          <div>
            <label className="label">Aspect ratio</label>
            <div className="flex gap-1.5">
              {ASPECT_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setAspect(value)}
                  className={cn('btn-ghost text-xs flex-1', aspect === value && 'bg-accent/10 text-accent border-accent/30')}
                >
                  {label}
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
                  placeholder="painterly fantasy world map, parchment tones, mountains in the north, great forest in the centre…"
                  value={customPrompt}
                  onChange={e => setCustomPrompt(e.target.value)}
                />
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-border">
          <button
            className="btn-primary w-full justify-center"
            onClick={handleGenerate}
            disabled={!canGenerate}
          >
            {isGenerating
              ? <><Loader size={14} className="animate-spin" /> Generating…</>
              : <><Wand2 size={14} /> Generate {scope === 'world' ? 'World' : 'Region'} Map</>}
          </button>
        </div>
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
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-950 z-10">
              <p className="text-danger text-sm mb-3">{jobStatus.errorMessage ?? 'Generation failed'}</p>
              <button className="btn-primary" onClick={handleGenerate}>
                <Zap size={14} /> Retry
              </button>
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
            onImageClick={editPins && mapAsset ? undefined : undefined}
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
                onPinsChange={() => {
                  void pinsQuery.refetch()
                  qc.invalidateQueries({ queryKey: ['maps', campaignId] })
                }}
              />
            )}
          </MapViewer>
        </div>

        {/* Bottom toolbar — visible once map is ready */}
        {hasMap && (
          <div className="border-t border-border bg-surface flex-shrink-0 px-4 py-2 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEditPins(v => !v)}
                className={cn('btn-secondary text-xs gap-1.5', editPins && 'bg-accent/15 border-accent/40 text-accent')}
              >
                <PinIcon size={12} />
                {editPins ? 'Stop editing pins' : 'Edit pins'}
              </button>
              {editPins && (
                <span className="text-xs text-ink-muted">
                  Click map to place pin · Click pin to view · Drag pin to move
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {pins.length > 0 && (
                <span className="text-xs text-ink-muted">{pins.length} pin{pins.length !== 1 ? 's' : ''}</span>
              )}
              <button
                className="btn-ghost text-xs gap-1 text-ink-muted"
                onClick={() => navigate(`/campaign/${campaignId}/maps`)}
              >
                View in Maps gallery
              </button>
            </div>
          </div>
        )}

        {/* "Drop pins" prompt banner */}
        {showPinPrompt && !editPins && (
          <div className="border-t border-accent/30 bg-accent/5 flex-shrink-0 px-4 py-3 flex items-center gap-3">
            <PinIcon size={16} className="text-accent flex-shrink-0" />
            <p className="text-sm text-ink flex-1">
              Your {scope} map is ready! Want to pin your campaign locations onto it?
            </p>
            <button
              className="btn-primary text-xs"
              onClick={() => { setEditPins(true); setShowPinPrompt(false) }}
            >
              Drop pins
            </button>
            <button
              className="btn-ghost text-xs text-ink-muted"
              onClick={() => setShowPinPrompt(false)}
            >
              Skip
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
