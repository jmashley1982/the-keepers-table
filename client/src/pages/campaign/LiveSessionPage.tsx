import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { useState, useEffect, useRef, useCallback } from 'react'
import { cn } from '../../lib/cn'
import EntityCard from '../../components/entity/EntityCard'
import MapViewer from '../../components/map/MapViewer'
import PinLayer from '../../components/map/PinLayer'
import {
  Save, Loader, Clock, X, CheckCircle, Play, StopCircle,
  Search, Users, Swords, MapPin, ChevronRight, Plus,
  BookOpen, Scroll, AlertTriangle, Map as MapIcon,
} from 'lucide-react'

// ─── types ────────────────────────────────────────────────────────────────────
interface Encounter { id: string; name: string; type: string; difficulty: string; sessionId?: string }
interface StateUpdate { entity_type: string; entity_id: string; field: string; new_value: unknown; evidence?: string }
interface NewEntity { entity_type: string; fields: Record<string, unknown>; evidence?: string }
interface WrapResult {
  generated_summary: string; key_events: string[]; state_updates: StateUpdate[];
  new_entities_detected: NewEntity[]; hooks_for_next: string[];
}
interface Entity { id: string; name: string; role?: string; status?: string; type?: string; difficulty?: string; dispositionToParty?: string; description?: string; [key: string]: unknown }

// ─── helpers ──────────────────────────────────────────────────────────────────
const SECTION_ICONS: Record<string, React.ReactNode> = {
  npcs: <Users size={14} />, encounters: <Swords size={14} />,
  locations: <MapPin size={14} />, items: <BookOpen size={14} />,
  factions: <Scroll size={14} />, maps: <MapIcon size={14} />,
}
const SECTION_LABELS: Record<string, string> = {
  npcs: 'NPCs', encounters: 'Encounters', locations: 'Locations',
  items: 'Items', factions: 'Factions', maps: 'Maps',
}
const ENTITY_TYPES: Record<string, string> = {
  npcs: 'npc', encounters: 'encounter', locations: 'location',
  items: 'item', factions: 'faction',
}

interface MapAssetListItem {
  id: string; title: string; kind: string; imageAssetId?: string | null;
  updatedAt: string; _count?: { pins: number }
}

export default function LiveSessionPage() {
  const { campaignId, sessionId } = useParams<{ campaignId: string; sessionId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  // ── UI state ──
  const [notes, setNotes] = useState('')
  const [notesSaving, setNotesSaving] = useState(false)
  const [wrapOpen, setWrapOpen] = useState(false)
  const [wrapLoading, setWrapLoading] = useState(false)
  const [wrapResult, setWrapResult] = useState<WrapResult | null>(null)
  const [acceptedUpdates, setAcceptedUpdates] = useState<Set<number>>(new Set())
  const [acceptedNewEntities, setAcceptedNewEntities] = useState<Set<number>>(new Set())
  const [elapsed, setElapsed] = useState(0)

  // ── Section rail state ──
  const [activeSection, setActiveSection] = useState<string>('npcs')
  const [searchQuery, setSearchQuery] = useState('')
  const [peekedEntity, setPeekedEntity] = useState<{ entity: Entity; type: string } | null>(null)
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null)
  const [mapImageSize, setMapImageSize] = useState({ w: 1280, h: 720 })
  const [mapScale, setMapScale] = useState(1)

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Data fetching ──
  const { data: sessionData } = useQuery({
    queryKey: ['session', campaignId, sessionId],
    queryFn: () => api.get(`/api/campaigns/${campaignId}/sessions/${sessionId}`).then(r => r.data),
    enabled: !!campaignId && !!sessionId,
  })

  const { data: sectionData } = useQuery({
    queryKey: ['entities', campaignId, activeSection],
    queryFn: () => api.get(`/api/entities/${campaignId}/${activeSection}`).then(r => r.data),
    enabled: !!campaignId && activeSection !== 'maps',
  })

  const { data: mapsData } = useQuery({
    queryKey: ['maps', campaignId],
    queryFn: () => api.get(`/api/campaigns/${campaignId}/maps`).then(r => r.data),
    enabled: !!campaignId && activeSection === 'maps',
  })
  const campaignMaps: MapAssetListItem[] = (mapsData?.maps ?? []).filter(
    (m: MapAssetListItem) => m.kind === 'world' || m.kind === 'region'
  )

  const { data: mapPinsData, refetch: refetchPins } = useQuery({
    queryKey: ['map-pins', selectedMapId],
    queryFn: () => api.get(`/api/campaigns/${campaignId}/maps/${selectedMapId}/pins`).then(r => r.data),
    enabled: !!selectedMapId && !!campaignId,
  })

  // Auto-select most recently updated map when switching into Maps section
  useEffect(() => {
    if (activeSection !== 'maps' || campaignMaps.length === 0 || selectedMapId) return
    const sorted = [...campaignMaps].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    setSelectedMapId(sorted[0].id)
  }, [activeSection, campaignMaps.length, selectedMapId])

  useEffect(() => {
    if (sessionData?.session?.dmRawNotes) setNotes(sessionData.session.dmRawNotes)
  }, [sessionData?.session?.id])

  // ── Timer ──
  useEffect(() => {
    const t = setInterval(() => setElapsed(e => e + 1), 60000)
    return () => clearInterval(t)
  }, [])

  // ── Auto-save notes ──
  const saveNotes = useCallback((text: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setNotesSaving(true)
      try {
        await api.patch(`/api/campaigns/${campaignId}/sessions/${sessionId}`, { dmRawNotes: text })
      } finally {
        setNotesSaving(false)
      }
    }, 2000)
  }, [campaignId, sessionId])

  function handleNotesChange(text: string) {
    setNotes(text)
    saveNotes(text)
  }

  const startSession = useMutation({
    mutationFn: () => api.post(`/api/campaigns/${campaignId}/sessions/${sessionId}/start`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['session', campaignId, sessionId] }),
  })

  async function triggerWrap() {
    setWrapLoading(true)
    setWrapOpen(true)
    try {
      const { data } = await api.post(`/api/generate/session-wrap/${sessionId}`)
      setWrapResult(data.result)
      if (data.result?.state_updates) setAcceptedUpdates(new Set(data.result.state_updates.map((_: unknown, i: number) => i)))
      if (data.result?.new_entities_detected) setAcceptedNewEntities(new Set(data.result.new_entities_detected.map((_: unknown, i: number) => i)))
    } catch (e) {
      alert(apiError(e))
    } finally {
      setWrapLoading(false)
    }
  }

  const confirmWrap = useMutation({
    mutationFn: () => {
      const updates = (wrapResult?.state_updates ?? []).filter((_: unknown, i: number) => acceptedUpdates.has(i))
      const newEntities = (wrapResult?.new_entities_detected ?? []).filter((_: unknown, i: number) => acceptedNewEntities.has(i))
      return api.post(`/api/campaigns/${campaignId}/sessions/${sessionId}/wrap/confirm`, {
        summary: wrapResult?.generated_summary ?? '',
        keyEvents: wrapResult?.key_events ?? [],
        hooksForNext: wrapResult?.hooks_for_next ?? [],
        acceptedUpdates: updates.map((u: StateUpdate) => ({ entityType: u.entity_type, entityId: u.entity_id, field: u.field, newValue: u.new_value })),
        acceptedNewEntities: newEntities.map((e: NewEntity) => ({ entityType: e.entity_type, fields: e.fields })),
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions', campaignId] })
      navigate(`/campaign/${campaignId}`)
    },
  })

  const session = sessionData?.session
  const allItems: Entity[] = sectionData?.items ?? []
  const filteredItems = searchQuery.trim()
    ? allItems.filter(e => e.name?.toLowerCase().includes(searchQuery.toLowerCase()))
    : allItems

  if (!session) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const hours = Math.floor(elapsed / 60)
  const mins = elapsed % 60

  return (
    <div className="flex flex-col h-screen bg-bg">
      {/* ── Header bar ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-border bg-surface shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="display-font text-base font-bold text-ink">
            Session #{session.sessionNumber}{session.title ? ` — ${session.title}` : ''}
          </h1>
          {session.status === 'in_progress' && (
            <span className="badge bg-accent/10 text-accent text-xs flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              Live
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {session.status === 'in_progress' && elapsed > 0 && (
            <span className="text-xs text-ink-muted flex items-center gap-1">
              <Clock size={12} />
              {hours > 0 ? `${hours}h ` : ''}{mins}m
            </span>
          )}
          {session.status === 'planned' && (
            <button className="btn-primary text-sm" onClick={() => startSession.mutate()} disabled={startSession.isPending}>
              {startSession.isPending ? <Loader size={14} className="animate-spin" /> : <Play size={14} />}
              Start Session
            </button>
          )}
          {session.status === 'in_progress' && (
            <button
              className="btn-secondary text-sm border-accent/40 text-accent"
              onClick={triggerWrap}
              disabled={wrapLoading}
            >
              {wrapLoading ? <Loader size={14} className="animate-spin" /> : <StopCircle size={14} />}
              Wrap Session
            </button>
          )}
        </div>
      </div>

      {/* ── Main 3-column layout ─────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── LEFT: Section rail + entity list ─────────────────── */}
        <div className="w-64 border-r border-border bg-surface flex flex-col shrink-0 overflow-hidden">
          {/* Section tabs */}
          <div className="flex border-b border-border">
            {Object.keys(SECTION_ICONS).map(sec => (
              <button
                key={sec}
                onClick={() => { setActiveSection(sec); setPeekedEntity(null) }}
                className={cn(
                  'flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors',
                  activeSection === sec
                    ? 'text-accent border-b-2 border-accent bg-accent/5'
                    : 'text-ink-muted hover:text-ink hover:bg-surface-2'
                )}
                title={SECTION_LABELS[sec]}
              >
                {SECTION_ICONS[sec]}
                <span className="hidden sm:block">{SECTION_LABELS[sec].slice(0, 3)}</span>
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input
                className="input text-xs pl-6 py-1.5 h-auto"
                placeholder={`Search ${SECTION_LABELS[activeSection]}…`}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Maps compact selector (shown instead of entity list when in maps section) */}
          {activeSection === 'maps' && (
            <div className="p-3 border-b border-border">
              {campaignMaps.length === 0 ? (
                <div className="text-center py-4">
                  <MapIcon size={20} className="mx-auto text-ink-muted/30 mb-2" />
                  <p className="text-xs text-ink-muted mb-2">No maps yet.</p>
                  <button
                    className="btn-ghost text-xs text-accent"
                    onClick={() => navigate(`/campaign/${campaignId}/generate/world-map`)}
                  >
                    <Plus size={10} /> Generate a map
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] text-ink-muted uppercase tracking-wide font-medium">Map</label>
                  <select
                    className="input text-xs py-1.5 h-auto"
                    value={selectedMapId ?? ''}
                    onChange={e => setSelectedMapId(e.target.value || null)}
                  >
                    {campaignMaps.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.title} ({m.kind}{m._count?.pins ? ` · ${m._count.pins} pins` : ''})
                      </option>
                    ))}
                  </select>
                  {selectedMapId && (
                    <p className="text-[10px] text-ink-muted">Click a pin to peek its linked location.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Entity list */}
          <div className="flex-1 overflow-y-auto">
            {activeSection === 'maps' ? null : filteredItems.length === 0 ? (
              <div className="p-4 text-center">
                <p className="text-xs text-ink-muted">No {SECTION_LABELS[activeSection].toLowerCase()} yet.</p>
                <button
                  className="btn-ghost text-xs mt-2 text-accent"
                  onClick={() => navigate(`/campaign/${campaignId}/generate/${ENTITY_TYPES[activeSection]}`)}
                >
                  <Plus size={10} /> Generate one
                </button>
              </div>
            ) : (
              filteredItems.map(entity => (
                <button
                  key={entity.id}
                  onClick={() => setPeekedEntity(
                    peekedEntity?.entity.id === entity.id ? null : { entity, type: ENTITY_TYPES[activeSection] }
                  )}
                  className={cn(
                    'w-full text-left px-3 py-2.5 border-b border-border/50 hover:bg-surface-2 transition-colors flex items-center justify-between gap-2',
                    peekedEntity?.entity.id === entity.id && 'bg-accent/5 border-l-2 border-l-accent'
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-ink truncate">{entity.name}</p>
                    <p className="text-[10px] text-ink-muted truncate">
                      {entity.role ?? entity.type ?? entity.difficulty ?? ''}
                    </p>
                  </div>
                  <ChevronRight size={10} className="text-ink-muted shrink-0" />
                </button>
              ))
            )}
          </div>
        </div>

        {/* ── CENTER: Notes (+ entity peek overlay) / Map viewer ── */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {/* Map viewer (shown when maps section is active and a map is selected) */}
          {activeSection === 'maps' && selectedMapId && !peekedEntity && (
            <div className="absolute inset-0 z-5 bg-neutral-950 flex flex-col overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-surface shrink-0">
                <MapIcon size={13} className="text-accent shrink-0" />
                {campaignMaps.length > 1 ? (
                  <select
                    className="input text-xs py-0.5 h-auto flex-1"
                    value={selectedMapId}
                    onChange={e => setSelectedMapId(e.target.value)}
                  >
                    {campaignMaps.map(m => (
                      <option key={m.id} value={m.id}>{m.title}</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs font-medium text-ink truncate flex-1">
                    {campaignMaps.find(m => m.id === selectedMapId)?.title ?? 'Map'}
                  </p>
                )}
              </div>
              <div className="flex-1 relative overflow-hidden">
                <MapViewer
                  assetId={campaignMaps.find(m => m.id === selectedMapId)?.imageAssetId ?? null}
                  className="w-full h-full"
                  onSizeLoaded={(w, h) => setMapImageSize({ w, h })}
                  onScaleChange={setMapScale}
                >
                  <PinLayer
                    mapId={selectedMapId}
                    campaignId={campaignId!}
                    pins={mapPinsData?.pins ?? []}
                    imageWidth={mapImageSize.w}
                    imageHeight={mapImageSize.h}
                    scale={mapScale}
                    editMode={false}
                    onPinsChange={() => refetchPins()}
                    availableLocations={[]}
                    onPinClick={(pin) => {
                      if (pin.locationId) {
                        api.get(`/api/entities/${campaignId}/locations`).then(r => {
                          const loc = (r.data?.items ?? []).find((l: Entity) => l.id === pin.locationId)
                          if (loc) setPeekedEntity({ entity: loc, type: 'location' })
                        }).catch(() => {})
                      } else if (pin.label) {
                        setPeekedEntity({ entity: { id: pin.id, name: pin.label } as Entity, type: 'location' })
                      }
                    }}
                  />
                </MapViewer>
              </div>
            </div>
          )}

          {/* Peeked entity panel */}
          {peekedEntity && (
            <div className="absolute inset-0 z-10 bg-bg/95 backdrop-blur-sm flex flex-col overflow-hidden animate-fade-in">
              <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
                <span className="text-sm font-medium text-ink-muted capitalize">
                  {peekedEntity.type} details
                </span>
                <button className="btn-ghost p-1" onClick={() => setPeekedEntity(null)}>
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5">
                <EntityCard
                  entity={peekedEntity.entity as Parameters<typeof EntityCard>[0]['entity']}
                  entityType={peekedEntity.type as Parameters<typeof EntityCard>[0]['entityType']}
                  campaignId={campaignId!}
                />
              </div>
            </div>
          )}

          {/* Notes area */}
          <div className="flex-1 flex flex-col p-5 overflow-hidden">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <label className="label mb-0 text-xs uppercase tracking-wide text-ink-muted">Session Notes</label>
              {notesSaving && (
                <span className="text-xs text-ink-muted flex items-center gap-1">
                  <Loader size={11} className="animate-spin" /> Saving…
                </span>
              )}
              {!notesSaving && notes.length > 0 && (
                <span className="text-xs text-ink-muted flex items-center gap-1">
                  <Save size={11} className="text-green-500" /> Auto-saved
                </span>
              )}
            </div>
            <textarea
              className="textarea flex-1 resize-none text-sm font-mono leading-relaxed"
              placeholder={`Write freely — NPC reactions, player choices, combat outcomes, anything notable.\n\nClaude will read these when you wrap the session to generate the recap and detect entity updates.`}
              value={notes}
              onChange={e => handleNotesChange(e.target.value)}
            />
          </div>

          {/* Bottom hint bar */}
          <div className="shrink-0 px-5 py-2 border-t border-border bg-surface flex items-center gap-4 text-[10px] text-ink-muted">
            <span className="flex items-center gap-1"><AlertTriangle size={10} /> Click any entity on the left to peek its details</span>
            <span className="flex items-center gap-1"><Save size={10} /> Notes auto-save every 2s</span>
          </div>
        </div>

        {/* ── RIGHT: Quick reference / encounter bar ────────────── */}
        <div className="w-56 border-l border-border bg-surface flex flex-col shrink-0 overflow-hidden">
          <div className="px-3 py-2.5 border-b border-border shrink-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Quick Reference</p>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {/* Session encounters */}
            <QuickRefSection
              campaignId={campaignId!}
              sessionId={sessionId!}
              navigate={navigate}
            />
          </div>
        </div>
      </div>

      {/* ── Session Wrap Modal ────────────────────────────────────── */}
      {wrapOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => !wrapLoading && setWrapOpen(false)} />
          <div className="relative bg-surface rounded-card border border-border w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
              <h2 className="display-font text-xl font-bold text-ink">Session Wrap Review</h2>
              {!wrapLoading && (
                <button className="btn-ghost p-1" onClick={() => setWrapOpen(false)}>
                  <X size={16} />
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {wrapLoading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Loader size={32} className="animate-spin text-accent" />
                  <p className="text-ink-muted text-sm">Claude is reading your notes and building the session recap…</p>
                </div>
              ) : wrapResult ? (
                <>
                  <div>
                    <label className="label">Session Summary</label>
                    <textarea
                      className="textarea text-sm"
                      rows={5}
                      value={wrapResult.generated_summary}
                      onChange={e => setWrapResult(r => r ? { ...r, generated_summary: e.target.value } : r)}
                    />
                  </div>

                  {wrapResult.key_events?.length > 0 && (
                    <div>
                      <label className="label">Key Events</label>
                      <ul className="space-y-1">
                        {wrapResult.key_events.map((ev, i) => (
                          <li key={i} className="text-sm text-ink flex gap-2"><span className="text-accent">◆</span>{ev}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {wrapResult.state_updates?.length > 0 && (
                    <div>
                      <label className="label">Proposed Updates</label>
                      <div className="space-y-2">
                        {wrapResult.state_updates.map((u, i) => (
                          <div key={i} className={cn('flex items-start gap-3 p-3 rounded-card border', acceptedUpdates.has(i) ? 'border-accent/30 bg-accent/5' : 'border-border opacity-60')}>
                            <button
                              onClick={() => setAcceptedUpdates(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n })}
                              className={cn('mt-0.5 flex-shrink-0', acceptedUpdates.has(i) ? 'text-accent' : 'text-ink-muted')}
                            >
                              <CheckCircle size={16} />
                            </button>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-ink capitalize">
                                {u.entity_type} · {u.field}: <span className="text-accent">{String(u.new_value)}</span>
                              </p>
                              {u.evidence && <p className="text-xs text-ink-muted mt-0.5 italic">"{u.evidence}"</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {wrapResult.new_entities_detected?.length > 0 && (
                    <div>
                      <label className="label">New Entities Detected</label>
                      <div className="space-y-2">
                        {wrapResult.new_entities_detected.map((e, i) => (
                          <div key={i} className={cn('flex items-start gap-3 p-3 rounded-card border', acceptedNewEntities.has(i) ? 'border-accent/30 bg-accent/5' : 'border-border opacity-60')}>
                            <button
                              onClick={() => setAcceptedNewEntities(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n })}
                              className={cn('mt-0.5 flex-shrink-0', acceptedNewEntities.has(i) ? 'text-accent' : 'text-ink-muted')}
                            >
                              <CheckCircle size={16} />
                            </button>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-ink capitalize">
                                New {e.entity_type}: <span className="text-accent">{String(e.fields?.name ?? 'Unknown')}</span>
                              </p>
                              {e.evidence && <p className="text-xs text-ink-muted mt-0.5 italic">"{e.evidence}"</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {wrapResult.hooks_for_next?.length > 0 && (
                    <div>
                      <label className="label">Hooks for Next Session</label>
                      <ul className="space-y-1">
                        {wrapResult.hooks_for_next.map((h, i) => (
                          <li key={i} className="text-sm text-ink flex gap-2"><span>→</span>{h}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : null}
            </div>

            {wrapResult && !wrapLoading && (
              <div className="flex gap-3 px-6 py-4 border-t border-border shrink-0">
                <button
                  className="btn-primary flex-1 justify-center"
                  onClick={() => confirmWrap.mutate()}
                  disabled={confirmWrap.isPending}
                >
                  {confirmWrap.isPending ? <Loader size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                  Confirm & Close Session
                </button>
                <button className="btn-secondary" onClick={() => setWrapOpen(false)}>
                  Keep editing
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Quick Reference sidebar ───────────────────────────────────────────────────
function QuickRefSection({ campaignId, sessionId, navigate }: { campaignId: string; sessionId: string; navigate: ReturnType<typeof useNavigate> }) {
  const { data } = useQuery({
    queryKey: ['entities', campaignId, 'encounters'],
    queryFn: () => api.get(`/api/entities/${campaignId}/encounters`).then(r => r.data),
    enabled: !!campaignId,
  })

  const encounters: Encounter[] = data?.items ?? []
  const sessionEncounters = encounters.filter(e => e.sessionId === sessionId)
  const unlinked = encounters.filter(e => !e.sessionId)

  return (
    <>
      {sessionEncounters.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-ink-muted uppercase tracking-wider mb-1.5">This Session</p>
          <div className="space-y-1.5">
            {sessionEncounters.map(enc => (
              <div key={enc.id} className="p-2 rounded-card bg-surface-2 border border-border/50">
                <p className="text-xs font-medium text-ink">{enc.name}</p>
                <p className="text-[10px] text-ink-muted">{enc.type} · {enc.difficulty}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {unlinked.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-ink-muted uppercase tracking-wider mb-1.5">All Encounters</p>
          <div className="space-y-1.5">
            {unlinked.slice(0, 6).map(enc => (
              <div key={enc.id} className="p-2 rounded-card bg-surface-2 border border-border/50">
                <p className="text-xs font-medium text-ink">{enc.name}</p>
                <p className="text-[10px] text-ink-muted">{enc.type} · {enc.difficulty}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {encounters.length === 0 && (
        <div className="text-center pt-4">
          <Swords size={24} className="mx-auto text-ink-muted/30 mb-2" />
          <p className="text-[10px] text-ink-muted mb-2">No encounters yet</p>
          <button
            className="btn-ghost text-xs text-accent"
            onClick={() => navigate(`/campaign/${campaignId}/generate/encounter`)}
          >
            <Plus size={10} /> Generate
          </button>
        </div>
      )}
    </>
  )
}

