import { useParams, useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { useState, useEffect, useRef, useCallback } from 'react'
import { cn } from '../../lib/cn'
import EntityCard from '../../components/entity/EntityCard'
import MapViewer from '../../components/map/MapViewer'
import PinLayer from '../../components/map/PinLayer'
import MentionTextarea, { MentionText } from '../../components/session/MentionTextarea'
import ThemedLoader from '../../components/ui/Loader'
import EmptyState from '../../components/ui/EmptyState'
import SessionWrapCeremony from '../../components/ui/SessionWrapCeremony'
import {
  Save, Loader, Clock, X, CheckCircle, StopCircle,
  Search, Users, Swords, MapPin, ChevronRight, ChevronDown, Plus,
  BookOpen, Scroll, AlertTriangle, Map as MapIcon, Shield, AtSign,
  Heart, Sword, FileText, CornerDownLeft,
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
interface PlayerCharacter {
  id: string; name: string; playerName?: string; race?: string;
  class?: string; subclass?: string; level?: number; background?: string;
  notes?: string; appearance?: string; backstory?: string;
  combatStats?: { hp?: number; maxHp?: number; ac?: number; initiative?: number }
  abilityScores?: { str?: number; dex?: number; con?: number; int?: number; wis?: number; cha?: number }
  portraitAsset?: { id: string }
}

// ─── constants ────────────────────────────────────────────────────────────────
const PANELS = ['notes', 'entities', 'peek'] as const
type Panel = typeof PANELS[number]

// ─── helpers ──────────────────────────────────────────────────────────────────
const SECTION_ICONS: Record<string, React.ReactNode> = {
  players: <Shield size={14} />, npcs: <Users size={14} />, encounters: <Swords size={14} />,
  locations: <MapPin size={14} />, items: <BookOpen size={14} />,
  factions: <Scroll size={14} />, maps: <MapIcon size={14} />,
}
const SECTION_LABELS: Record<string, string> = {
  players: 'Players', npcs: 'NPCs', encounters: 'Encounters', locations: 'Locations',
  items: 'Items', factions: 'Factions', maps: 'Maps',
}
const ENTITY_TYPES: Record<string, string> = {
  npcs: 'npc', encounters: 'encounter', locations: 'location',
  items: 'item', factions: 'faction',
}

interface MapAssetListItem {
  id: string; title: string; kind: string;
  imageAsset?: { id: string } | null;
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
  const [wrapCeremony, setWrapCeremony] = useState(false)
  const [wrapResult, setWrapResult] = useState<WrapResult | null>(null)
  const [acceptedUpdates, setAcceptedUpdates] = useState<Set<number>>(new Set())
  const [acceptedNewEntities, setAcceptedNewEntities] = useState<Set<number>>(new Set())
  const [elapsed, setElapsed] = useState(0)

  // ── Mobile panel switcher (Notes | Entities | Peek) ──
  const [activePanel, setActivePanel] = useState<Panel>('notes')

  // ── Quick Note strip ──
  const [quickNote, setQuickNote] = useState('')
  const [quickNoteStatus, setQuickNoteStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const quickNoteRef = useRef<HTMLInputElement>(null)

  const touchStartX = useRef<number>(0)
  const touchStartY = useRef<number>(0)

  function handlePanelTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }

  function handlePanelTouchEnd(e: React.TouchEvent) {
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - touchStartY.current
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.2) return
    const idx = PANELS.indexOf(activePanel)
    if (dx < 0 && idx < PANELS.length - 1) setActivePanel(PANELS[idx + 1])
    else if (dx > 0 && idx > 0) setActivePanel(PANELS[idx - 1])
  }

  // ── Section rail state ──
  const [activeSection, setActiveSection] = useState<string>('players')
  const [searchQuery, setSearchQuery] = useState('')
  const [peekedEntity, setPeekedEntity] = useState<{ entity: Entity; type: string } | null>(null)
  const [peekedPC, setPeekedPC] = useState<PlayerCharacter | null>(null)
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

  const { data: pcListData } = useQuery({
    queryKey: ['player-characters', campaignId],
    queryFn: () => api.get(`/api/campaigns/${campaignId}/player-characters`).then(r => r.data),
    enabled: !!campaignId,
  })
  const playerCharacters: PlayerCharacter[] = pcListData?.items ?? []

  const { data: sectionData } = useQuery({
    queryKey: ['entities', campaignId, activeSection],
    queryFn: () => api.get(`/api/entities/${campaignId}/${activeSection}`).then(r => r.data),
    enabled: !!campaignId && activeSection !== 'maps' && activeSection !== 'players',
  })

  const { data: mapsData } = useQuery({
    queryKey: ['maps', campaignId],
    queryFn: () => api.get(`/api/campaigns/${campaignId}/maps`).then(r => r.data),
    enabled: !!campaignId && activeSection === 'maps',
  })
  const campaignMaps: MapAssetListItem[] = (mapsData?.items ?? []).filter(
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

  // ── Auto-switch to peek panel on mobile when an entity is selected ──
  useEffect(() => {
    if (peekedEntity || peekedPC) setActivePanel('peek')
  }, [peekedEntity, peekedPC])

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

  async function appendQuickNote() {
    const text = quickNote.trim()
    if (!text || !campaignId || !sessionId || quickNoteStatus === 'saving') return
    setQuickNoteStatus('saving')
    try {
      const { data } = await api.post(
        `/api/campaigns/${campaignId}/sessions/${sessionId}/notes/append`,
        { text },
      )
      if (data.session?.dmRawNotes != null) {
        setNotes(data.session.dmRawNotes)
        if (saveTimer.current) clearTimeout(saveTimer.current)
      }
      setQuickNote('')
      setQuickNoteStatus('saved')
      setTimeout(() => setQuickNoteStatus('idle'), 2000)
      quickNoteRef.current?.focus()
    } catch {
      setQuickNoteStatus('error')
      setTimeout(() => setQuickNoteStatus('idle'), 2000)
    }
  }

  async function triggerWrap() {
    setWrapCeremony(true)
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
  const isLive = session && session.status !== 'complete'
  const allItems: Entity[] = sectionData?.items ?? []
  const filteredItems = searchQuery.trim()
    ? allItems.filter(e => e.name?.toLowerCase().includes(searchQuery.toLowerCase()))
    : allItems
  const filteredPCs = searchQuery.trim()
    ? playerCharacters.filter(pc => pc.name.toLowerCase().includes(searchQuery.toLowerCase()) || pc.playerName?.toLowerCase().includes(searchQuery.toLowerCase()))
    : playerCharacters

  if (!session) return (
    <div className="flex items-center justify-center h-full">
      <ThemedLoader />
    </div>
  )

  const hours = Math.floor(elapsed / 60)
  const mins = elapsed % 60

  return (
    <div className="flex flex-col h-screen bg-bg">
      {wrapCeremony && <SessionWrapCeremony onDone={() => setWrapCeremony(false)} />}
      {/* ── Header bar ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-border bg-surface shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="display-font text-base font-bold text-ink">
            {session.isSessionZero || session.sessionNumber === 0
              ? 'Session Zero — Campaign Planning'
              : `Session #${session.sessionNumber}${session.title ? ` — ${session.title}` : ''}`}
          </h1>
          {isLive && (
            <span className="badge bg-accent/10 text-accent text-xs flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              Live
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {isLive && elapsed > 0 && (
            <span className="text-xs text-ink-muted flex items-center gap-1">
              <Clock size={12} />
              {hours > 0 ? `${hours}h ` : ''}{mins}m
            </span>
          )}
          {isLive && (
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

      {/* ── Mobile panel tab strip ───────────────────────────────────── */}
      <div className="md:hidden flex flex-col border-b border-border bg-surface shrink-0">
        <div className="flex relative">
          {PANELS.map(panel => (
            <button
              key={panel}
              onClick={() => setActivePanel(panel)}
              className={cn(
                'flex-1 py-3 text-xs font-semibold capitalize transition-colors touch-manipulation min-h-[44px]',
                activePanel === panel ? 'text-accent' : 'text-ink-muted hover:text-ink',
              )}
            >
              {panel === 'notes' ? '📝 Notes' : panel === 'entities' ? '👥 Entities' : '🔍 Peek'}
            </button>
          ))}
          {/* Sliding active indicator */}
          <div
            className="absolute bottom-0 h-0.5 bg-accent transition-transform duration-200 ease-out"
            style={{
              width: `${100 / PANELS.length}%`,
              transform: `translateX(${PANELS.indexOf(activePanel) * 100}%)`,
            }}
          />
        </div>
      </div>

      {/* ── Main 3-column layout ─────────────────────────────────────── */}
      <div
        className="flex-1 flex overflow-hidden"
        onTouchStart={handlePanelTouchStart}
        onTouchEnd={handlePanelTouchEnd}
      >

        {/* ── LEFT: Section rail + entity list ─────────────────── */}
        <div className={cn(
          'border-r border-border bg-surface flex-col shrink-0 overflow-hidden',
          'md:flex md:w-64',
          activePanel === 'entities' ? 'flex flex-1' : 'hidden',
        )}>
          {/* Section tabs */}
          <div className="flex border-b border-border">
            {Object.keys(SECTION_ICONS).map(sec => (
              <button
                key={sec}
                onClick={() => { setActiveSection(sec); setPeekedEntity(null); setPeekedPC(null) }}
                className={cn(
                  'flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors touch-manipulation min-h-[44px]',
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
                <EmptyState
                  section="maps"
                  icon={false}
                  className="py-6"
                  action={
                    <button
                      className="btn-ghost text-xs text-accent"
                      onClick={() => navigate(`/campaign/${campaignId}/generate/world-map`)}
                    >
                      <Plus size={10} /> Generate a map
                    </button>
                  }
                />
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

          {/* Entity / PC list */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {activeSection === 'maps' ? null
              : activeSection === 'players' ? (
                filteredPCs.length === 0 ? (
                  <EmptyState
                    section="players"
                    icon={false}
                    className="py-6"
                    action={
                      <button
                        className="btn-ghost text-xs text-accent"
                        onClick={() => navigate(`/campaign/${campaignId}/players`)}
                      >
                        <Plus size={10} /> Add a PC
                      </button>
                    }
                  />
                ) : (
                  filteredPCs.map(pc => (
                    <button
                      key={pc.id}
                      onClick={() => setPeekedPC(peekedPC?.id === pc.id ? null : pc)}
                      className={cn(
                        'w-full text-left px-3 py-2.5 border-b border-border/50 hover:bg-surface-2 transition-colors flex items-center gap-2.5 touch-manipulation min-h-[44px]',
                        peekedPC?.id === pc.id && 'bg-accent/5 border-l-2 border-l-accent'
                      )}
                    >
                      {pc.portraitAsset ? (
                        <img
                          src={`/api/assets/${pc.portraitAsset.id}/serve`}
                          className="w-7 h-7 rounded-full object-cover shrink-0 border border-border"
                          alt={pc.name}
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-surface-2 border border-border flex items-center justify-center shrink-0">
                          <Shield size={12} className="text-ink-muted/50" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-ink truncate">{pc.name}</p>
                        <p className="text-[10px] text-ink-muted truncate">
                          {[pc.race, pc.class, pc.level ? `Lv${pc.level}` : ''].filter(Boolean).join(' · ')}
                          {pc.playerName && <span className="ml-1 opacity-60">({pc.playerName})</span>}
                        </p>
                      </div>
                      <ChevronRight size={10} className="text-ink-muted shrink-0" />
                    </button>
                  ))
                )
              ) : filteredItems.length === 0 ? (
                <EmptyState
                  section={activeSection}
                  icon={false}
                  className="py-6"
                  action={
                    <button
                      className="btn-ghost text-xs text-accent"
                      onClick={() => navigate(`/campaign/${campaignId}/generate/${ENTITY_TYPES[activeSection]}`)}
                    >
                      <Plus size={10} /> Generate one
                    </button>
                  }
                />
              ) : (
                filteredItems.map(entity => (
                  <button
                    key={entity.id}
                    onClick={() => setPeekedEntity(
                      peekedEntity?.entity.id === entity.id ? null : { entity, type: ENTITY_TYPES[activeSection] }
                    )}
                    className={cn(
                      'w-full text-left px-3 py-2.5 border-b border-border/50 hover:bg-surface-2 transition-colors flex items-center justify-between gap-2 touch-manipulation min-h-[44px]',
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
              )
            }
          </div>

          {/* ── Quick Notes strip — bottom of Entities panel, shown when session is live ── */}
          {session.status === 'in_progress' && (
            <div className="border-t border-border bg-surface shrink-0">
              <div className="flex items-center gap-1.5 px-2 py-1.5">
                <FileText size={11} className="text-accent/60 shrink-0" />
                <input
                  ref={quickNoteRef}
                  className="flex-1 bg-transparent text-xs text-ink placeholder:text-ink-muted/50 outline-none min-w-0 py-1"
                  placeholder="Jot a note… (Enter to save)"
                  value={quickNote}
                  onChange={e => setQuickNote(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void appendQuickNote()
                    }
                  }}
                  disabled={quickNoteStatus === 'saving'}
                />
                {quickNoteStatus === 'saving' && (
                  <Loader size={11} className="animate-spin text-ink-muted shrink-0" />
                )}
                {quickNoteStatus === 'saved' && (
                  <CheckCircle size={11} className="text-green-400 shrink-0" />
                )}
                {quickNoteStatus === 'error' && (
                  <AlertTriangle size={11} className="text-danger shrink-0" />
                )}
                {quickNoteStatus === 'idle' && quickNote.trim() && (
                  <button
                    className="shrink-0 text-ink-muted/50 hover:text-accent transition-colors touch-manipulation p-0.5"
                    onClick={() => void appendQuickNote()}
                    title="Save note (Enter)"
                  >
                    <CornerDownLeft size={11} />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── CENTER: Notes (+ entity peek overlay) / Map viewer ── */}
        <div className={cn(
          'flex-col overflow-hidden relative',
          'md:flex md:flex-1',
          activePanel === 'notes' ? 'flex flex-1' : 'hidden',
        )}>
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
                  assetId={campaignMaps.find(m => m.id === selectedMapId)?.imageAsset?.id ?? null}
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
                      if (pin.location) {
                        setPeekedEntity({ entity: pin.location as Entity, type: 'location' })
                      } else if (pin.locationId) {
                        api.get(`/api/entities/${campaignId}/locations/${pin.locationId}`).then(r => {
                          if (r.data?.item) setPeekedEntity({ entity: r.data.item, type: 'location' })
                        }).catch(() => {})
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

          {/* Peeked PC panel */}
          {peekedPC && (
            <div className="absolute inset-0 z-10 bg-bg/95 backdrop-blur-sm flex flex-col overflow-hidden animate-fade-in">
              <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
                <div className="flex items-center gap-2">
                  <Shield size={14} className="text-accent" />
                  <span className="text-sm font-semibold text-ink">{peekedPC.name}</span>
                  {peekedPC.playerName && <span className="text-xs text-ink-muted">({peekedPC.playerName})</span>}
                </div>
                <button className="btn-ghost p-1" onClick={() => setPeekedPC(null)}>
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {/* Identity row */}
                <div className="flex flex-wrap gap-2">
                  {peekedPC.race && <span className="badge bg-surface-2 text-ink-muted text-xs">{peekedPC.race}</span>}
                  {peekedPC.class && <span className="badge bg-surface-2 text-ink-muted text-xs">{peekedPC.subclass ? (peekedPC.class.toLowerCase() === 'barbarian' && ['SMASH!', 'DESTROY!', 'BEND BARS, LIFT GATES'].includes(peekedPC.subclass) ? `${peekedPC.class} (${peekedPC.subclass})` : `${peekedPC.subclass} ${peekedPC.class}`) : peekedPC.class}</span>}
                  {peekedPC.level && <span className="badge bg-accent/10 text-accent text-xs">Level {peekedPC.level}</span>}
                  {peekedPC.background && <span className="badge bg-surface-2 text-ink-muted text-xs">{peekedPC.background}</span>}
                </div>

                {/* Combat stats */}
                {peekedPC.combatStats && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-2">Combat</p>
                    <div className="grid grid-cols-3 gap-2">
                      {peekedPC.combatStats.hp != null && (
                        <div className="bg-surface-2 rounded-card p-2 text-center">
                          <div className="flex items-center justify-center gap-1 mb-0.5">
                            <Heart size={10} className="text-red-400" />
                            <span className="text-[10px] text-ink-muted">HP</span>
                          </div>
                          <p className="text-sm font-bold text-ink">
                            {peekedPC.combatStats.hp}
                            {peekedPC.combatStats.maxHp != null && <span className="text-ink-muted font-normal text-xs">/{peekedPC.combatStats.maxHp}</span>}
                          </p>
                        </div>
                      )}
                      {peekedPC.combatStats.ac != null && (
                        <div className="bg-surface-2 rounded-card p-2 text-center">
                          <div className="flex items-center justify-center gap-1 mb-0.5">
                            <Shield size={10} className="text-blue-400" />
                            <span className="text-[10px] text-ink-muted">AC</span>
                          </div>
                          <p className="text-sm font-bold text-ink">{peekedPC.combatStats.ac}</p>
                        </div>
                      )}
                      {peekedPC.combatStats.initiative != null && (
                        <div className="bg-surface-2 rounded-card p-2 text-center">
                          <div className="flex items-center justify-center gap-1 mb-0.5">
                            <Sword size={10} className="text-orange-400" />
                            <span className="text-[10px] text-ink-muted">Init</span>
                          </div>
                          <p className="text-sm font-bold text-ink">
                            {(peekedPC.combatStats.initiative ?? 0) >= 0 ? '+' : ''}{peekedPC.combatStats.initiative}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Ability scores */}
                {peekedPC.abilityScores && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-2">Ability Scores</p>
                    <div className="grid grid-cols-6 gap-1">
                      {(Object.entries(peekedPC.abilityScores) as [string, number | undefined][]).map(([stat, val]) => {
                        const mod = val != null ? Math.floor((val - 10) / 2) : null
                        return (
                          <div key={stat} className="bg-surface-2 rounded p-1.5 text-center">
                            <p className="text-[9px] text-ink-muted uppercase font-medium">{stat}</p>
                            <p className="text-xs font-bold text-ink">{val ?? '—'}</p>
                            {mod != null && <p className="text-[9px] text-ink-muted">{mod >= 0 ? `+${mod}` : mod}</p>}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {peekedPC.notes && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-1">Notes</p>
                    <p className="text-xs text-ink leading-relaxed whitespace-pre-wrap">{peekedPC.notes}</p>
                  </div>
                )}

                {/* Backstory */}
                {peekedPC.backstory && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted mb-1">Backstory</p>
                    <p className="text-xs text-ink leading-relaxed whitespace-pre-wrap">{peekedPC.backstory}</p>
                  </div>
                )}

                <button
                  className="btn-ghost text-xs w-full justify-center text-accent border border-border"
                  onClick={() => navigate(`/campaign/${campaignId}/players`)}
                >
                  Open full character sheet
                </button>
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
            <MentionTextarea
              campaignId={campaignId!}
              value={notes}
              onChange={handleNotesChange}
              className="textarea flex-1 resize-none text-sm font-mono leading-relaxed"
              placeholder={`Write freely — NPC reactions, player choices, combat outcomes.\n\nType @ to tag a PC, NPC, location, item, or faction.\nClaude will read these when you wrap the session.`}
            />
          </div>

          {/* Bottom hint bar */}
          <div className="shrink-0 px-5 py-2 border-t border-border bg-surface flex items-center gap-4 text-[10px] text-ink-muted">
            <span className="flex items-center gap-1"><AlertTriangle size={10} /> Click any entity on the left to peek</span>
            <span className="flex items-center gap-1"><AtSign size={10} /> Type @ to tag entities</span>
            <span className="flex items-center gap-1"><Save size={10} /> Auto-saves every 2s</span>
          </div>
        </div>

        {/* ── MOBILE PEEK panel — shown on mobile when peek tab is active ── */}
        <div className={cn(
          'flex-col overflow-hidden',
          'md:hidden',
          activePanel === 'peek' ? 'flex flex-1' : 'hidden',
        )}>
          {peekedEntity ? (
            <>
              <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                <span className="text-sm font-medium text-ink-muted capitalize">{peekedEntity.type} details</span>
                <button className="btn-ghost p-1 touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center" onClick={() => { setPeekedEntity(null); setActivePanel('entities') }}>
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <EntityCard
                  entity={peekedEntity.entity as Parameters<typeof EntityCard>[0]['entity']}
                  entityType={peekedEntity.type as Parameters<typeof EntityCard>[0]['entityType']}
                  campaignId={campaignId!}
                />
              </div>
            </>
          ) : peekedPC ? (
            <>
              <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                <div className="flex items-center gap-2">
                  <Shield size={14} className="text-accent" />
                  <span className="text-sm font-medium text-ink">{peekedPC.name}</span>
                </div>
                <button className="btn-ghost p-1 touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center" onClick={() => { setPeekedPC(null); setActivePanel('entities') }}>
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <p className="text-xs text-ink-muted">
                  {[peekedPC.race, peekedPC.class, peekedPC.level ? `Level ${peekedPC.level}` : ''].filter(Boolean).join(' · ')}
                </p>
                {peekedPC.combatStats && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {peekedPC.combatStats.hp != null && (
                      <div className="bg-surface-2 rounded-card p-2 text-center">
                        <div className="flex items-center justify-center gap-1 mb-0.5"><Heart size={10} className="text-red-400" /><span className="text-[10px] text-ink-muted">HP</span></div>
                        <p className="text-sm font-bold text-ink">{peekedPC.combatStats.hp}{peekedPC.combatStats.maxHp != null && <span className="text-ink-muted font-normal text-xs">/{peekedPC.combatStats.maxHp}</span>}</p>
                      </div>
                    )}
                    {peekedPC.combatStats.ac != null && (
                      <div className="bg-surface-2 rounded-card p-2 text-center">
                        <div className="flex items-center justify-center gap-1 mb-0.5"><Shield size={10} className="text-blue-400" /><span className="text-[10px] text-ink-muted">AC</span></div>
                        <p className="text-sm font-bold text-ink">{peekedPC.combatStats.ac}</p>
                      </div>
                    )}
                    {peekedPC.combatStats.initiative != null && (
                      <div className="bg-surface-2 rounded-card p-2 text-center">
                        <div className="flex items-center justify-center gap-1 mb-0.5"><Sword size={10} className="text-orange-400" /><span className="text-[10px] text-ink-muted">Init</span></div>
                        <p className="text-sm font-bold text-ink">{(peekedPC.combatStats.initiative ?? 0) >= 0 ? '+' : ''}{peekedPC.combatStats.initiative}</p>
                      </div>
                    )}
                  </div>
                )}
                {peekedPC.notes && <p className="mt-3 text-xs text-ink leading-relaxed whitespace-pre-wrap">{peekedPC.notes}</p>}
                <button className="btn-ghost text-xs w-full justify-center text-accent border border-border mt-4 min-h-[44px] touch-manipulation" onClick={() => navigate(`/campaign/${campaignId}/players`)}>
                  Open full character sheet
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-ink-muted p-8 text-center">
              <Search size={32} className="opacity-30" />
              <p className="text-sm">Select an entity from the Entities tab to see details here.</p>
              <button className="btn-ghost text-xs text-accent touch-manipulation min-h-[44px]" onClick={() => setActivePanel('entities')}>
                Browse entities →
              </button>
            </div>
          )}
        </div>

      </div>

      {/* ── Mobile dot indicator ──────────────────────────────────── */}
      <div className="md:hidden flex items-center justify-center gap-2.5 py-2.5 bg-surface border-t border-border shrink-0">
        {PANELS.map(panel => (
          <button
            key={panel}
            onClick={() => setActivePanel(panel)}
            className="p-1.5 touch-manipulation"
            aria-label={`Go to ${panel} panel`}
          >
            <span
              className={cn(
                'block rounded-full transition-all duration-200',
                activePanel === panel
                  ? 'w-2.5 h-2.5 bg-accent'
                  : 'w-2 h-2 bg-ink-muted/30',
              )}
            />
          </button>
        ))}
      </div>

      {/* ── Session Wrap Modal ────────────────────────────────────── */}
      {wrapOpen && createPortal(
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
                  <ThemedLoader size="lg" flavor="recap" />
                </div>
              ) : wrapResult ? (
                <>
                  <div>
                    <label className="label">Session Summary</label>
                    <MentionTextarea
                      className="textarea text-sm"
                      value={wrapResult.generated_summary}
                      onChange={v => setWrapResult(r => r ? { ...r, generated_summary: v } : r)}
                      campaignId={campaignId!}
                      placeholder=""
                    />
                  </div>

                  {wrapResult.key_events?.length > 0 && (
                    <div>
                      <label className="label">Key Events</label>
                      <ul className="space-y-1">
                        {wrapResult.key_events.map((ev, i) => (
                          <li key={i} className="text-sm text-ink flex gap-2">
                            <span className="text-accent shrink-0">◆</span>
                            <MentionText text={ev} campaignId={campaignId!} />
                          </li>
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
        </div>,
        document.body
      )}
    </div>
  )
}



