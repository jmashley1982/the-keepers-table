import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useState } from 'react'
import { cn } from '../../lib/cn'
import { ChevronDown, ChevronUp, Play } from 'lucide-react'

export default function SessionLogPage() {
  const { campaignId } = useParams<{ campaignId: string }>()
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['sessions', campaignId],
    queryFn: () => api.get(`/api/campaigns/${campaignId}/sessions`).then(r => r.data),
    enabled: !!campaignId,
  })

  const sessions: Session[] = data?.sessions ?? []

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
      ) : sessions.length === 0 ? (
        <div className="text-center py-20 text-ink-muted">
          <div className="text-5xl mb-4">📜</div>
          <h2 className="display-font text-xl text-ink mb-2">No sessions yet</h2>
          <p className="text-sm">Every great campaign starts with a first session.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map(s => (
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
                  {s.status === 'planned' || s.status === 'in_progress' ? (
                    <button
                      className="btn-primary text-xs py-1 px-2"
                      onClick={e => { e.stopPropagation(); navigate(`/campaign/${campaignId}/session/${s.id}`) }}
                    >
                      {s.status === 'in_progress' ? 'Resume' : 'Start'}
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
                      <p className="text-sm text-ink leading-relaxed">{s.generatedSummary}</p>
                    </div>
                  )}

                  {s.keyEvents?.length > 0 && (
                    <div>
                      <p className="label">Key Events</p>
                      <ul className="space-y-1">
                        {(s.keyEvents as string[]).map((ev, i) => (
                          <li key={i} className="text-sm text-ink flex gap-2">
                            <span className="text-accent flex-shrink-0">◆</span>{ev}
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
                          <li key={i} className="text-sm text-ink flex gap-2"><span>→</span>{h}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {s.dmRawNotes && (
                    <div>
                      <p className="label">DM Notes</p>
                      <p className="text-sm text-ink-muted whitespace-pre-wrap">{s.dmRawNotes}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface Session {
  id: string; sessionNumber: number; title?: string; status: string;
  datePlayed?: string; generatedSummary?: string; keyEvents: unknown[];
  hooksForNext: unknown[]; dmRawNotes?: string;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    planned: 'bg-surface-2 text-ink-muted',
    in_progress: 'bg-accent/10 text-accent',
    complete: 'bg-green-500/10 text-green-500',
  }
  return <span className={`badge ${colors[status] ?? ''} capitalize text-xs`}>{status.replace('_', ' ')}</span>
}
