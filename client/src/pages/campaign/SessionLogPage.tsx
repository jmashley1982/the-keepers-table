import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useState } from 'react'
import { ChevronDown, ChevronUp, Play, Loader, Sparkles } from 'lucide-react'
import MentionText from '../../components/session/MentionText'
import SessionZeroWorkspace from '../../components/session-zero/SessionZeroWorkspace'

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
            <SessionZeroWorkspace campaignId={campaignId!} session={sessionZero} />
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
