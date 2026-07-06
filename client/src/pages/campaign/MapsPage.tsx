import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { useState, useCallback, useRef, useEffect } from 'react'
import { Map, X, Download, Grid, Wand2, Upload, MapPin as PinIcon, Globe } from 'lucide-react'
import MapViewer from '../../components/map/MapViewer'
import PinLayer from '../../components/map/PinLayer'
import type { MapPin, AvailableLocation } from '../../components/map/PinLayer'
import { GridOverlay, GridEditor, DEFAULT_GRID } from '../../components/map/GridOverlay'
import type { GridSettings } from '../../components/map/GridOverlay'
import { useJobStatus } from '../../lib/useJobStatus'
import { cn } from '../../lib/cn'

type KindFilter = 'all' | 'battle' | 'region' | 'world' | 'other'

interface MapAssetRow {
  id: string
  title: string
  kind: string
  imageAssetId?: string
  grid?: unknown
  imageAsset?: { id: string; width?: number; height?: number }
  _count?: { pins: number }
}

const KIND_LABELS: Record<string, string> = {
  battle: 'Battle Map',
  region: 'Region Map',
  world: 'World Map',
  other: 'Other',
}

export default function MapsPage() {
  const { campaignId } = useParams<{ campaignId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)

  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const [viewingMap, setViewingMap] = useState<MapAssetRow | null>(null)
  const [imageSize, setImageSize] = useState<{ w: number; h: number }>({ w: 1024, h: 1024 })
  const [mapScale, setMapScale] = useState(1)
  const [grid, setGrid] = useState<GridSettings>(DEFAULT_GRID)
  const [gridSaving, setGridSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadJobId, setUploadJobId] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [editPins, setEditPins] = useState(false)

  const uploadStatus = useJobStatus(uploadJobId)

  useEffect(() => {
    if (uploadStatus.status === 'succeeded') {
      qc.invalidateQueries({ queryKey: ['maps', campaignId] })
      setUploadJobId(null)
      setUploading(false)
      setUploadError(null)
    } else if (uploadStatus.status === 'failed') {
      qc.invalidateQueries({ queryKey: ['maps', campaignId] })
      setUploadJobId(null)
      setUploading(false)
      setUploadError(uploadStatus.rawError ?? uploadStatus.errorMessage ?? 'Upload processing failed')
    }
  }, [uploadStatus.status, uploadStatus.rawError, uploadStatus.errorMessage, campaignId, qc])

  const { data, isLoading } = useQuery({
    queryKey: ['maps', campaignId],
    queryFn: () => api.get(`/api/campaigns/${campaignId}/maps`).then(r => r.data),
    enabled: !!campaignId,
  })

  const pinsQuery = useQuery<{ pins: MapPin[] }>({
    queryKey: ['pins', viewingMap?.id],
    queryFn: () =>
      api.get(`/api/campaigns/${campaignId}/maps/${viewingMap!.id}/pins`).then(r => r.data),
    enabled: !!viewingMap?.id,
  })
  const pins: MapPin[] = pinsQuery.data?.pins ?? []

  const { data: locationsData } = useQuery({
    queryKey: ['entities', campaignId, 'locations'],
    queryFn: () => api.get(`/api/entities/${campaignId}/locations`).then(r => r.data),
    enabled: !!campaignId,
  })
  const availableLocations: AvailableLocation[] = (locationsData?.items ?? []).map(
    (l: { id: string; name: string; type: string }) => ({ id: l.id, name: l.name, type: l.type }),
  )

  const deleteMutation = useMutation({
    mutationFn: (mapId: string) => api.delete(`/api/campaigns/${campaignId}/maps/${mapId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maps', campaignId] })
      setViewingMap(null)
    },
    onError: e => alert(apiError(e)),
  })

  const allMaps: MapAssetRow[] = data?.items ?? []
  const maps = kindFilter === 'all' ? allMaps : allMaps.filter(m => m.kind === kindFilter)

  const openMap = useCallback((m: MapAssetRow) => {
    setViewingMap(m)
    setImageSize({ w: m.imageAsset?.width ?? 1024, h: m.imageAsset?.height ?? 1024 })
    const savedGrid = m.grid as GridSettings | null
    setGrid(savedGrid ?? DEFAULT_GRID)
    setEditPins(false)
  }, [])

  const handleSaveGrid = useCallback(async () => {
    if (!viewingMap) return
    setGridSaving(true)
    try {
      await api.patch(`/api/campaigns/${campaignId}/maps/${viewingMap.id}`, { grid })
      qc.invalidateQueries({ queryKey: ['maps', campaignId] })
    } catch (e) {
      alert(apiError(e))
    } finally {
      setGridSaving(false)
    }
  }, [viewingMap, campaignId, grid, qc])

  const handleDownloadGrid = useCallback(async () => {
    if (!viewingMap) return
    try {
      const res = await api.post(
        `/api/campaigns/${campaignId}/maps/${viewingMap.id}/bake-grid`,
        { grid },
        { responseType: 'blob' },
      )
      const url = URL.createObjectURL(res.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${viewingMap.title.replace(/[^a-z0-9]/gi, '_')}_grid.png`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert(apiError(e))
    }
  }, [viewingMap, campaignId, grid])

  const handleGridDrag = useCallback((dx: number, dy: number) => {
    setGrid(prev => ({
      ...prev,
      offsetX: Math.round((prev.offsetX + dx) % prev.cellSize),
      offsetY: Math.round((prev.offsetY + dy) % prev.cellSize),
    }))
  }, [])

  const doUpload = useCallback(async (file: File) => {
    if (!campaignId) return
    const title = file.name.replace(/\.[^.]+$/, '').replace(/[_\-]/g, ' ') || 'Uploaded Map'
    setUploading(true)
    try {
      const mapRes = await api.post(`/api/campaigns/${campaignId}/maps`, {
        title,
        kind: 'battle',
        source: 'uploaded',
        generationPrompt: '',
      })
      const mapAsset = mapRes.data.map as { id: string }
      const formData = new FormData()
      formData.append('file', file)
      formData.append('entityType', 'map')
      formData.append('entityId', mapAsset.id)
      formData.append('kind', 'map_battle')
      const uploadRes = await api.post(
        `/api/campaigns/${campaignId}/assets/upload`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      )
      setUploadJobId(uploadRes.data.jobId as string)
      qc.invalidateQueries({ queryKey: ['maps', campaignId] })
    } catch (e) {
      alert(apiError(e))
      setUploading(false)
    }
  }, [campaignId, qc])

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    await doUpload(file)
  }, [doUpload])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.types.includes('Files')) setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!pageRef.current?.contains(e.relatedTarget as Node)) {
      setDragOver(false)
    }
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    await doUpload(file)
  }, [doUpload])

  const viewingAssetId = viewingMap?.imageAsset?.id ?? viewingMap?.imageAssetId ?? null
  const isWorldMap = viewingMap?.kind === 'world'

  return (
    <div
      ref={pageRef}
      className="p-8 max-w-6xl mx-auto relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag-drop overlay */}
      {dragOver && (
        <div className="fixed inset-0 z-[60] pointer-events-none flex items-center justify-center">
          <div className="absolute inset-4 border-2 border-dashed border-accent rounded-2xl bg-accent/5 flex flex-col items-center justify-center gap-3">
            <Upload size={40} className="text-accent" />
            <p className="text-accent font-semibold text-lg">Drop image to upload map</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="display-font text-3xl font-bold text-ink flex items-center gap-3">
          <Map size={28} /> Maps
        </h1>
        <div className="flex gap-2 flex-wrap justify-end">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileSelect}
          />
          <button
            className="btn-secondary gap-1"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <Upload size={14} />
            {uploading
              ? (uploadStatus.status === 'queued' || uploadStatus.status === 'running'
                  ? 'Processing…'
                  : 'Uploading…')
              : 'Upload Map'}
          </button>
          <button
            className="btn-secondary gap-1"
            onClick={() => navigate(`/campaign/${campaignId}/generate/world-map`)}
          >
            <Globe size={14} /> World Map
          </button>
          <button
            className="btn-primary gap-1"
            onClick={() => navigate(`/campaign/${campaignId}/generate/battle-map`)}
          >
            <Wand2 size={14} /> Battle Map
          </button>
        </div>
      </div>

      {/* Upload error banner */}
      {uploadError && (
        <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 p-3 flex items-start gap-3">
          <p className="text-danger text-sm flex-1">{uploadError}</p>
          <details className="text-xs">
            <summary className="text-danger/60 cursor-pointer hover:text-danger/80 select-none">Details</summary>
            <pre className="mt-1 text-[10px] text-danger/50 whitespace-pre-wrap break-all">{uploadError}</pre>
          </details>
          <button
            className="text-danger/60 hover:text-danger text-xs ml-1 shrink-0"
            onClick={() => setUploadError(null)}
          >
            ✕
          </button>
        </div>
      )}

      {/* Filter chips */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {(['all', 'battle', 'region', 'world', 'other'] as KindFilter[]).map(k => (
          <button
            key={k}
            onClick={() => setKindFilter(k)}
            className={cn('px-3 py-1 rounded-full text-xs border transition-colors',
              kindFilter === k
                ? 'bg-accent text-white border-accent'
                : 'bg-surface-2 text-ink-muted border-border hover:border-accent/40')}
          >
            {k === 'all' ? `All (${allMaps.length})` : `${KIND_LABELS[k] ?? k} (${allMaps.filter(m => m.kind === k).length})`}
          </button>
        ))}
      </div>

      {/* Gallery */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : maps.length === 0 ? (
        <div className="text-center py-20">
          <Map size={48} className="mx-auto text-ink-muted/30 mb-4" />
          <h2 className="display-font text-xl text-ink mb-2">
            {kindFilter === 'all' ? 'No maps yet' : `No ${KIND_LABELS[kindFilter] ?? kindFilter}s yet`}
          </h2>
          <p className="text-sm text-ink-muted mb-6">Generate a map with AI, upload an image, or drag & drop a file here.</p>
          <div className="flex gap-3 justify-center flex-wrap">
            <button
              className="btn-secondary gap-1"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={14} /> Upload Map
            </button>
            <button
              className="btn-secondary gap-1"
              onClick={() => navigate(`/campaign/${campaignId}/generate/world-map`)}
            >
              <Globe size={14} /> Generate World Map
            </button>
            <button
              className="btn-primary gap-1"
              onClick={() => navigate(`/campaign/${campaignId}/generate/battle-map`)}
            >
              <Wand2 size={14} /> Generate Battle Map
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {maps.map(m => {
            const thumbAssetId = m.imageAsset?.id ?? m.imageAssetId
            const pinCount = m._count?.pins ?? 0
            return (
              <div
                key={m.id}
                className="card hover:border-accent/40 cursor-pointer transition-colors group overflow-hidden p-0"
                onClick={() => openMap(m)}
              >
                <div className="aspect-square bg-neutral-900 flex items-center justify-center overflow-hidden relative">
                  {thumbAssetId ? (
                    <img
                      src={`/api/assets/${thumbAssetId}?size=thumb`}
                      alt={m.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <Map size={32} className="text-white/20" />
                  )}
                  {Boolean(m.grid) && (m.grid as GridSettings).visible && (
                    <div className="absolute top-1.5 left-1.5 bg-black/50 rounded p-0.5">
                      <Grid size={10} className="text-white/70" />
                    </div>
                  )}
                  {pinCount > 0 && (
                    <div className="absolute top-1.5 right-1.5 bg-black/60 rounded-full px-1.5 py-0.5 flex items-center gap-0.5">
                      <PinIcon size={9} className="text-white/80" />
                      <span className="text-white/80 text-[9px] font-semibold">{pinCount}</span>
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <h3 className="font-medium text-ink text-sm truncate">{m.title}</h3>
                  <p className="text-xs text-ink-muted capitalize mt-0.5">
                    {KIND_LABELS[m.kind] ?? m.kind}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Full-screen viewer */}
      {viewingMap && (
        <div className="fixed inset-0 z-50 flex flex-col bg-neutral-950">
          {/* Toolbar */}
          <div className="flex items-center gap-3 px-4 py-2 bg-black/70 border-b border-white/10 flex-shrink-0">
            <button
              onClick={() => setViewingMap(null)}
              className="p-1.5 rounded text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X size={16} />
            </button>
            <span className="text-white font-medium text-sm flex-1 truncate">{viewingMap.title}</span>
            <span className="text-white/40 text-xs">{KIND_LABELS[viewingMap.kind] ?? viewingMap.kind}</span>

            {viewingAssetId && (
              <button
                onClick={() => setEditPins(v => !v)}
                className={cn(
                  'text-xs px-2 py-1 rounded transition-colors flex items-center gap-1.5',
                  editPins
                    ? 'bg-accent/20 text-accent border border-accent/30'
                    : 'text-white/50 hover:text-white hover:bg-white/5',
                )}
              >
                <PinIcon size={12} />
                {editPins ? 'Stop editing' : 'Edit pins'}
                {pins.length > 0 && !editPins && (
                  <span className="bg-white/15 rounded-full px-1.5 text-[10px]">{pins.length}</span>
                )}
              </button>
            )}

            <button
              className="text-xs text-danger/70 hover:text-danger px-2 py-1 rounded hover:bg-white/5 transition-colors"
              onClick={() => { if (confirm('Delete this map?')) deleteMutation.mutate(viewingMap.id) }}
            >
              Delete
            </button>
          </div>

          {/* Pin editing hint */}
          {editPins && (
            <div className="bg-accent/10 border-b border-accent/20 px-4 py-1.5 flex-shrink-0">
              <p className="text-xs text-accent/80">
                Click map to place pin · Click a pin to view/delete · Drag to reposition
              </p>
            </div>
          )}

          {/* Map */}
          <div className="flex-1 relative overflow-hidden">
            <MapViewer
              assetId={viewingAssetId}
              className="w-full h-full"
              onSizeLoaded={(w, h) => setImageSize({ w, h })}
              onScaleChange={setMapScale}
              onGridDrag={grid.visible && !editPins ? handleGridDrag : undefined}
            >
              <GridOverlay
                settings={grid}
                imageWidth={imageSize.w}
                imageHeight={imageSize.h}
              />
              {viewingMap.id && (
                <PinLayer
                  mapId={viewingMap.id}
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
                  availableLocations={availableLocations}
                />
              )}
            </MapViewer>
          </div>

          {/* Bottom toolbar — grid editor (skip for world maps; region maps may use grid) */}
          {viewingAssetId && !isWorldMap && (
            <div className="bg-neutral-900/95 border-t border-white/10 flex-shrink-0 p-4">
              <div className="max-w-2xl mx-auto flex gap-6 items-start">
                <div className="flex-1">
                  <GridEditor settings={grid} onChange={setGrid} />
                </div>
                {grid.visible && (
                  <div className="flex flex-col gap-2 pt-1">
                    <button
                      className="btn-secondary text-xs"
                      onClick={handleSaveGrid}
                      disabled={gridSaving}
                    >
                      {gridSaving ? 'Saving…' : 'Save grid'}
                    </button>
                    <button
                      className="btn-secondary text-xs gap-1"
                      onClick={handleDownloadGrid}
                    >
                      <Download size={12} /> Download PNG
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
