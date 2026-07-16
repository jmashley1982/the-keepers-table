import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronDown, ChevronUp, Play, Loader, Sparkles, StopCircle, CheckCircle } from 'lucide-react'
import MentionText from '../../components/session/MentionText'

export default function SessionLogPage() {
  const { campaignId } = useParams<{ campaignId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['sessions', campaignId],
    queryFn: () => api.get(`/api/campaigns/${campaignId}/sessions`).then(r => r.data),
    enabled: !!campaignId,
  })

  const allSessions: Session[] = data?.sessions ?? []
  const sessionZero = allSessions.find(s => s.isSessionZero || s.sessionNumber === 0) ?? null
  const sessions = allSessions.filter(s => !s.isSessionZero && s.sessionNumber !== 0)

  const createSessionZero = useMutation({
    mutationFn: () => api.post(`/api/campaigns/${campaignId}/sessions/session-zero`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions', campaignId] }),
  })

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="display-font text-3xl font-bold text-ink">Session Log</h1>
        <button
          className="btn-primary"
          onClick={async () => {
            const { data: res } = await api.post(`/api/campaigns/${campaignId}/sessions`)
            navigate(`/campaign/${campaignId}/session/${res.session.id}`)
          }}
        >
          <Play size={16} /> New Session
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {sessionZero ? (
            <SessionZeroCard campaignId={campaignId!} session={sessionZero} />
          ) : (
            <button
              className="w-full card border-dashed border-2 border-border hover:border-accent/40 transition-colors flex items-center justify-center gap-2 py-4 text-sm text-ink-muted hover:text-accent"
              onClick={() => createSessionZero.mutate()}
              disabled={createSessionZero.isPending}
            >
              {createSessionZero.isPending ? <Loader size={14} className="animate-spin" /> : <Sparkles size={14} />}
              Set up Session Zero — plan your world before the first game
            </button>
          )}

          {sessions.length === 0 && !sessionZero ? (
            <div className="text-center py-20 text-ink-muted">
              <div className="text-5xl mb-4">📜</div>
              <h2 className="display-font text-xl text-ink mb-2">No sessions yet</h2>
              <p className="text-sm">Every great campaign starts with a first session.</p>
            </div>
          ) : (
            sessions.map(s => (
            <div key={s.id} className="card">
              <button
                className="w-full flex items-center justify-between"
                onClick={() => setExpanded(expanded === s.id ? null : s.id)}
              >
                <div className="flex items-center gap-3 text-left">
                  <span className="display-font font-bold text-ink text-lg">
                    #{s.sessionNumber}
                  </span>
                  <div>
                    <p className="font-medium text-ink text-sm">{s.title ?? 'Untitled Session'}</p>
                    {s.datePlayed && (
                      <p className="text-xs text-ink-muted">{new Date(s.datePlayed).toLocaleDateString()}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <StatusBadge status={s.status} />
                  {s.status !== 'complete' ? (
                    <button
                      className="btn-primary text-xs py-1 px-2"
                      onClick={e => { e.stopPropagation(); navigate(`/campaign/${campaignId}/session/${s.id}`) }}
                    >
                      Resume
                    </button>
                  ) : null}
                  {expanded === s.id ? <ChevronUp size={14} className="text-ink-muted" /> : <ChevronDown size={14} className="text-ink-muted" />}
                </div>
              </button>

              {expanded === s.id && (
                <div className="mt-4 pt-4 border-t border-border space-y-4 animate-fade-in">
                  {s.generatedSummary && (
                    <div>
                      <p className="label">Summary</p>
                      <MentionText
                        text={s.generatedSummary}
                        campaignId={campaignId!}
                        className="text-sm text-ink leading-relaxed"
                      />
                    </div>
                  )}

                  {s.keyEvents?.length > 0 && (
                    <div>
                      <p className="label">Key Events</p>
                      <ul className="space-y-1">
                        {(s.keyEvents as string[]).map((ev, i) => (
                          <li key={i} className="text-sm text-ink flex gap-2">
                            <span className="text-accent flex-shrink-0">◆</span>
                            <MentionText text={ev} campaignId={campaignId!} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {s.hooksForNext?.length > 0 && (
                    <div>
                      <p className="label">Hooks for Next Session</p>
                      <ul className="space-y-1">
                        {(s.hooksForNext as string[]).map((h, i) => (
                          <li key={i} className="text-sm text-ink flex gap-2">
                            <span>→</span>
                            <MentionText text={h} campaignId={campaignId!} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {s.dmRawNotes && (
                    <div>
                      <p className="label">DM Notes</p>
                      <MentionText
                        text={s.dmRawNotes}
                        campaignId={campaignId!}
                        className="text-sm text-ink-muted"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function SessionZeroCard({ campaignId, session }: { campaignId: string; session: Session }) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(session.status !== 'complete')
  const [notes, setNotes] = useState(session.dmRawNotes ?? '')
  const [saving, setSaving] = useState(false)
  const [wrapping, setWrapping] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setNotes(session.dmRawNotes ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id])

  const saveNotes = useCallback((text: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaving(true)
      try {
        await api.patch(`/api/campaigns/${campaignId}/sessions/${session.id}`, { dmRawNotes: text })
      } finally {
        setSaving(false)
      }
    }, 1500)
  }, [campaignId, session.id])

  async function wrapSessionZero() {
    setWrapping(true)
    try {
      const { data } = await api.post(`/api/generate/session-wrap/${session.id}`)
      const result = data.result
      await api.post(`/api/campaigns/${campaignId}/sessions/${session.id}/wrap/confirm`, {
        summary: result?.generated_summary ?? '',
        keyEvents: result?.key_events ?? [],
        hooksForNext: result?.hooks_for_next ?? [],
        acceptedUpdates: [],
        acceptedNewEntities: [],
      })
      qc.invalidateQueries({ queryKey: ['sessions', campaignId] })
    } catch (e) {
      alert(apiError(e))
    } finally {
      setWrapping(false)
    }
  }

  return (
    <div className="card border-accent/30 bg-accent/[0.03]">
      <button
        className="w-full flex items-center justify-between"
        onClick={() => setExpanded(o => !o)}
      >
        <div className="flex items-center gap-3 text-left">
          <span className="display-font font-bold text-accent text-lg">✦</span>
          <div>
            <p className="font-medium text-ink text-sm">Session Zero — Campaign Planning</p>
            <p className="text-xs text-ink-muted">World-building, factions, and player agreements</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {session.status === 'complete' ? (
            <span className="badge bg-green-500/10 text-green-500 text-xs flex items-center gap-1">
              <CheckCircle size={10} /> Wrapped
            </span>
          ) : saving ? (
            <span className="text-xs text-ink-muted flex items-center gap-1"><Loader size={10} className="animate-spin" /> Saving…</span>
          ) : null}
          {expanded ? <ChevronUp size={14} className="text-ink-muted" /> : <ChevronDown size={14} className="text-ink-muted" />}
        </div>
      </button>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-border space-y-4 animate-fade-in">
          {session.status !== 'complete' ? (
            <>
              <textarea
                className="input w-full min-h-[220px] text-sm leading-relaxed resize-y font-mono"
                placeholder="Plan your campaign here — world overview, major factions, table rules, player agreements, safety tools, story themes…"
                value={notes}
                onChange={e => { setNotes(e.target.value); saveNotes(e.target.value) }}
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-ink-muted">Notes auto-save as you type. Session Zero never needs to be wrapped.</p>
                <button
                  className="btn-secondary text-sm border-accent/40 text-accent"
                  onClick={wrapSessionZero}
                  disabled={wrapping || !notes.trim()}
                >
                  {wrapping ? <Loader size={14} className="animate-spin" /> : <StopCircle size={14} />}
                  Wrap Session
                </button>
              </div>
            </>
          ) : (
            <>
              {session.generatedSummary && (
                <div>
                  <p className="label">Campaign Setup Summary</p>
                  <MentionText
                    text={session.generatedSummary}
                    campaignId={campaignId}
                    className="text-sm text-ink leading-relaxed"
                  />
                </div>
              )}
              {session.dmRawNotes && (
                <div>
                  <p className="label">Planning Notes</p>
                  <MentionText
                    text={session.dmRawNotes}
                    campaignId={campaignId}
                    className="text-sm text-ink-muted"
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

interface Session {
  id: string; sessionNumber: number; title?: string; status: string;
  datePlayed?: string; generatedSummary?: string; keyEvents: unknown[];
  hooksForNext: unknown[]; dmRawNotes?: string; isSessionZero?: boolean;
}

function StatusBadge({ status }: { status: string }) {
  const display = status === 'planned' ? 'in_progress' : status
  const colors: Record<string, string> = {
    in_progress: 'bg-accent/10 text-accent',
    complete: 'bg-green-500/10 text-green-500',
  }
  return <span className={`badge ${colors[display] ?? ''} capitalize text-xs`}>{display.replace('_', ' ')}</span>
}
