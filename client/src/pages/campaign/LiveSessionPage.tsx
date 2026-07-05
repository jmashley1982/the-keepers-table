import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { useState, useEffect, useRef, useCallback } from 'react'
import { cn } from '../../lib/cn'
import EntityCard from '../../components/entity/EntityCard'
import { Save, Loader, Clock, X, CheckCircle, AlertTriangle, ChevronDown, ChevronUp, Play, StopCircle } from 'lucide-react'

export default function LiveSessionPage() {
  const { campaignId, sessionId } = useParams<{ campaignId: string; sessionId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [notes, setNotes] = useState('')
  const [notesSaving, setNotesSaving] = useState(false)
  const [prepOpen, setPrepOpen] = useState(true)
  const [wrapOpen, setWrapOpen] = useState(false)
  const [wrapLoading, setWrapLoading] = useState(false)
  const [wrapResult, setWrapResult] = useState<WrapResult | null>(null)
  const [acceptedUpdates, setAcceptedUpdates] = useState<Set<number>>(new Set())
  const [acceptedNewEntities, setAcceptedNewEntities] = useState<Set<number>>(new Set())
  const [elapsed, setElapsed] = useState(0)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: sessionData } = useQuery({
    queryKey: ['session', campaignId, sessionId],
    queryFn: () => api.get(`/api/campaigns/${campaignId}/sessions/${sessionId}`).then(r => r.data),
    enabled: !!campaignId && !!sessionId,
  })

  const { data: encountersData } = useQuery({
    queryKey: ['entities', campaignId, 'encounters'],
    queryFn: () => api.get(`/api/entities/${campaignId}/encounters`).then(r => r.data),
    enabled: !!campaignId,
  })

  useEffect(() => {
    if (sessionData?.session?.dmRawNotes) setNotes(sessionData.session.dmRawNotes)
  }, [sessionData?.session?.id])

  // Timer
  useEffect(() => {
    const t = setInterval(() => setElapsed(e => e + 1), 60000)
    return () => clearInterval(t)
  }, [])

  // Debounce save notes
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
      // default: accept all
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
  const encounters = (encountersData?.items ?? []) as Encounter[]
  const sessionEncounters = encounters.filter(e => e.sessionId === sessionId)

  if (!session) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const hours = Math.floor(elapsed / 60)
  const mins = elapsed % 60

  return (
    <div className="flex flex-col h-screen bg-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-surface">
        <div className="flex items-center gap-3">
          <h1 className="display-font text-lg font-bold text-ink">
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
            <button className="btn-primary text-sm" onClick={() => startSession.mutate()}>
              <Play size={14} /> Start Session
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

      {/* Main layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main stage */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Encounters */}
          {sessionEncounters.length > 0 && (
            <div className="px-6 py-4 border-b border-border overflow-x-auto">
              <div className="flex gap-3">
                {sessionEncounters.map(enc => (
                  <div key={enc.id} className="card min-w-48 p-3 flex-shrink-0">
                    <p className="text-xs font-medium text-ink-muted">{enc.type}</p>
                    <p className="font-semibold text-ink text-sm">{enc.name}</p>
                    <span className="badge bg-surface-2 text-ink-muted text-xs">{enc.difficulty}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="flex-1 p-6 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Session Notes</label>
              {notesSaving && (
                <span className="text-xs text-ink-muted flex items-center gap-1">
                  <Loader size={11} className="animate-spin" /> Saving…
                </span>
              )}
            </div>
            <textarea
              className="textarea flex-1 resize-none text-sm"
              placeholder="Write freely — describe what's happening, NPC reactions, player decisions, anything notable. Claude will read these to generate the session recap."
              value={notes}
              onChange={e => handleNotesChange(e.target.value)}
            />
          </div>
        </div>

        {/* Prep queue sidebar */}
        <div className="w-64 border-l border-border bg-surface flex flex-col overflow-hidden">
          <button
            className="flex items-center justify-between px-4 py-3 border-b border-border text-sm font-medium text-ink hover:bg-surface-2 transition-colors"
            onClick={() => setPrepOpen(v => !v)}
          >
            Prep Queue
            {prepOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {prepOpen && (
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {encounters.length === 0 ? (
                <p className="text-xs text-ink-muted">No planned encounters. Use Quick Generate to create some.</p>
              ) : (
                encounters.map(enc => (
                  <div key={enc.id} className="card p-3 text-sm">
                    <p className="font-medium text-ink truncate">{enc.name}</p>
                    <p className="text-xs text-ink-muted">{enc.type} · {enc.difficulty}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Session Wrap Review Modal */}
      {wrapOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => !wrapLoading && setWrapOpen(false)} />
          <div className="relative bg-surface rounded-card border border-border w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
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
                  <p className="text-ink-muted">Claude is reading your notes and building the session recap…</p>
                </div>
              ) : wrapResult ? (
                <>
                  {/* Summary */}
                  <div>
                    <label className="label">Session Summary</label>
                    <textarea
                      className="textarea text-sm"
                      rows={5}
                      value={wrapResult.generated_summary}
                      onChange={e => setWrapResult(r => r ? { ...r, generated_summary: e.target.value } : r)}
                    />
                  </div>

                  {/* Key events */}
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

                  {/* State updates */}
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
                              {u.evidence && (
                                <p className="text-xs text-ink-muted mt-0.5 italic">"{u.evidence}"</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* New entities */}
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
                              {e.evidence && (
                                <p className="text-xs text-ink-muted mt-0.5 italic">"{e.evidence}"</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Hooks */}
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
              <div className="flex gap-3 px-6 py-4 border-t border-border">
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

interface Encounter { id: string; name: string; type: string; difficulty: string; sessionId?: string }
interface StateUpdate { entity_type: string; entity_id: string; field: string; new_value: unknown; evidence?: string }
interface NewEntity { entity_type: string; fields: Record<string, unknown>; evidence?: string }
interface WrapResult {
  generated_summary: string;
  key_events: string[];
  state_updates: StateUpdate[];
  new_entities_detected: NewEntity[];
  hooks_for_next: string[];
}
