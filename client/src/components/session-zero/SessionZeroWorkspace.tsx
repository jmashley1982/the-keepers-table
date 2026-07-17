import { useState, useRef, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { Loader, StopCircle, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react'
import ThemedLoader from '../ui/Loader'
import SessionWrapCeremony from '../ui/SessionWrapCeremony'
import PitchModule from './PitchModule'
import SafetyModule from './SafetyModule'
import CharterModule from './CharterModule'
import WorldBuildingModule from './WorldBuildingModule'
import MentionText from '../session/MentionText'

const TABS = ['Campaign Pitch', 'Safety Tools', 'Table Charter', 'World Canvas', 'Notes'] as const
type Tab = typeof TABS[number]

interface Session {
  id: string
  status: string
  dmRawNotes?: string
  generatedSummary?: string
  keyEvents: unknown[]
  hooksForNext: unknown[]
}

interface Props {
  campaignId: string
  session: Session
}

export default function SessionZeroWorkspace({ campaignId, session }: Props) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(session.status !== 'complete')
  const [activeTab, setActiveTab] = useState<Tab>('Campaign Pitch')
  const [notes, setNotes] = useState(session.dmRawNotes ?? '')
  const [saving, setSaving] = useState(false)
  const [wrapping, setWrapping] = useState(false)
  const [wrapCeremony, setWrapCeremony] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: campaignData } = useQuery({
    queryKey: ['campaign', campaignId],
    queryFn: () => api.get(`/api/campaigns/${campaignId}`).then(r => r.data),
    enabled: !!campaignId,
  })

  const campaign = campaignData?.campaign

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
    setWrapCeremony(true)
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

  const pitchInitial = campaign ? {
    pitchElevator:         campaign.pitchElevator         ?? '',
    pitchGenre:            campaign.pitchGenre            ?? '',
    pitchLength:           campaign.pitchLength           ?? '',
    pitchWhatIsNot:        campaign.pitchWhatIsNot        ?? '',
    tonGrimHeroic:         campaign.tonGrimHeroic         ?? 50,
    tonGrittyCinematic:    campaign.tonGrittyCinematic    ?? 50,
    tonEpisodicSerialized: campaign.tonEpisodicSerialized ?? 50,
    tonCombatRoleplay:     campaign.tonCombatRoleplay     ?? 50,
  } : null

  return (
    <div className="card border-accent/30 bg-accent/[0.03]">
      {wrapCeremony && <SessionWrapCeremony onDone={() => setWrapCeremony(false)} />}
      {/* Header */}
      <button
        className="w-full flex items-center justify-between"
        onClick={() => setExpanded(o => !o)}
      >
        <div className="flex items-center gap-3 text-left">
          <span className="display-font font-bold text-accent text-lg">✦</span>
          <div>
            <p className="font-medium text-ink text-sm">Session Zero — Campaign Planning</p>
            <p className="text-xs text-ink-muted">
              {session.status === 'complete' ? 'Wrapped' : '5 planning modules'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {session.status === 'complete' ? (
            <span className="badge bg-green-500/10 text-green-500 text-xs flex items-center gap-1">
              <CheckCircle size={10} /> Wrapped
            </span>
          ) : saving ? (
            <span className="text-xs text-ink-muted flex items-center gap-1">
              <Loader size={10} className="animate-spin" /> Saving…
            </span>
          ) : null}
          {expanded ? <ChevronUp size={14} className="text-ink-muted" /> : <ChevronDown size={14} className="text-ink-muted" />}
        </div>
      </button>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-border animate-fade-in">
          {session.status === 'complete' ? (
            <CompletedView session={session} campaignId={campaignId} />
          ) : (
            <>
              {/* Tab bar — scrollable on small screens */}
              <div className="flex gap-0 mb-5 border-b border-border overflow-x-auto pb-0">
                {TABS.map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className="px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap flex-shrink-0"
                    style={activeTab === tab ? {
                      color: 'var(--color-accent)',
                      borderBottomColor: 'var(--color-accent)',
                    } : {
                      color: 'var(--color-ink-muted)',
                      borderBottomColor: 'transparent',
                    }}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="min-h-[300px]">
                {activeTab === 'Campaign Pitch' && pitchInitial && (
                  <PitchModule
                    campaignId={campaignId}
                    initial={pitchInitial}
                    onSaved={() => qc.invalidateQueries({ queryKey: ['campaign', campaignId] })}
                  />
                )}
                {activeTab === 'Campaign Pitch' && !pitchInitial && (
                  <div className="flex justify-center py-12">
                    <ThemedLoader />
                  </div>
                )}

                {activeTab === 'Safety Tools' && (
                  <SafetyModule campaignId={campaignId} />
                )}

                {activeTab === 'Table Charter' && (
                  <CharterModule campaignId={campaignId} />
                )}

                {activeTab === 'World Canvas' && (
                  <WorldBuildingModule campaignId={campaignId} />
                )}

                {activeTab === 'Notes' && (
                  <div className="space-y-3">
                    <p className="text-xs text-ink-muted">
                      Legacy freeform notes — everything from before the structured Session Zero workspace.
                    </p>
                    <textarea
                      className="input w-full min-h-[220px] text-sm leading-relaxed resize-y font-mono"
                      placeholder="Freeform notes, world overview, planning…"
                      value={notes}
                      onChange={e => { setNotes(e.target.value); saveNotes(e.target.value) }}
                    />
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between mt-5 pt-4 border-t border-border">
                <p className="text-xs text-ink-muted">All fields auto-save as you type.</p>
                <button
                  className="btn-secondary text-sm border-accent/40 text-accent"
                  onClick={wrapSessionZero}
                  disabled={wrapping}
                >
                  {wrapping ? <Loader size={14} className="animate-spin" /> : <StopCircle size={14} />}
                  Wrap Session Zero
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function CompletedView({ session, campaignId }: { session: Session; campaignId: string }) {
  return (
    <div className="space-y-4">
      {session.generatedSummary && (
        <div>
          <p className="label">Campaign Setup Summary</p>
          <MentionText text={session.generatedSummary} campaignId={campaignId} className="text-sm text-ink leading-relaxed" />
        </div>
      )}
      {(session.keyEvents as string[])?.length > 0 && (
        <div>
          <p className="label">Key Decisions</p>
          <ul className="space-y-1">
            {(session.keyEvents as string[]).map((ev, i) => (
              <li key={i} className="text-sm text-ink flex gap-2">
                <span className="text-accent flex-shrink-0">◆</span>
                <MentionText text={ev} campaignId={campaignId} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {session.dmRawNotes && (
        <div>
          <p className="label">Planning Notes</p>
          <MentionText text={session.dmRawNotes} campaignId={campaignId} className="text-sm text-ink-muted" />
        </div>
      )}
    </div>
  )
}
