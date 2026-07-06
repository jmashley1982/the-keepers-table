import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { useState, useCallback } from 'react'
import { Map, X, Download, Grid, Wand2 } from 'lucide-react'
import MapViewer from '../../components/map/MapViewer'
import { GridOverlay, GridEditor, DEFAULT_GRID } from '../../components/map/GridOverlay'
import type { GridSettings } from '../../components/map/GridOverlay'
import { cn } from '../../lib/cn'

type KindFilter = 'all' | 'battle' | 'region' | 'world' | 'other'

interface MapAssetRow {
  id: string
  title: string
  kind: string
  imageAssetId?: string
  grid?: unknown
  imageAsset?: { id: string; width?: number; height?: number }
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

  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const [viewingMap, setViewingMap] = useState<MapAssetRow | null>(null)
  const [imageSize, setImageSize] = useState<{ w: number; h: number }>({ w: 1024, h: 1024 })
  const [grid, setGrid] = useState<GridSettings>(DEFAULT_GRID)
  const [gridSaving, setGridSaving] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['maps', campaignId],
    queryFn: () => api.get(`/api/campaigns/${campaignId}/maps`).then(r => r.data),
    enabled: !!campaignId,
  })

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

  const viewingAssetId = viewingMap?.imageAsset?.id ?? viewingMap?.imageAssetId ?? null

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="display-font text-3xl font-bold text-ink flex items-center gap-3">
          <Map size={28} /> Maps
        </h1>
        <button
          className="btn-primary gap-1"
          onClick={() => navigate(`/campaign/${campaignId}/generate/battle-map`)}
        >
          <Wand2 size={14} /> Generate Battle Map
        </button>
      </div>

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
          <p className="text-sm text-ink-muted mb-6">Generate a battle map with AI to get started.</p>
          <button
            className="btn-primary"
            onClick={() => navigate(`/campaign/${campaignId}/generate/battle-map`)}
          >
            <Wand2 size={14} /> Generate Battle Map
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {maps.map(m => {
            const thumbAssetId = m.imageAsset?.id ?? m.imageAssetId
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
                  {m.grid && (m.grid as GridSettings).visible && (
                    <div className="absolute top-1.5 left-1.5 bg-black/50 rounded p-0.5">
                      <Grid size={10} className="text-white/70" />
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
          <div className="flex items-center gap-3 px-4 py-2 bg-black/70 border-b border-white/10 flex-shrink-0">
            <button
              onClick={() => setViewingMap(null)}
              className="p-1.5 rounded text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X size={16} />
            </button>
            <span className="text-white font-medium text-sm flex-1 truncate">{viewingMap.title}</span>
            <span className="text-white/40 text-xs">{KIND_LABELS[viewingMap.kind] ?? viewingMap.kind}</span>
            <button
              className="text-xs text-danger/70 hover:text-danger px-2 py-1 rounded hover:bg-white/5 transition-colors"
              onClick={() => { if (confirm('Delete this map?')) deleteMutation.mutate(viewingMap.id) }}
            >
              Delete
            </button>
          </div>

          <div className="flex-1 relative overflow-hidden">
            <MapViewer
              assetId={viewingAssetId}
              className="w-full h-full"
              onSizeLoaded={(w, h) => setImageSize({ w, h })}
            >
              <GridOverlay
                settings={grid}
                imageWidth={imageSize.w}
                imageHeight={imageSize.h}
              />
            </MapViewer>
          </div>

          {viewingAssetId && (
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
