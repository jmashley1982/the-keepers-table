import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { useState } from 'react'
import { Plus, Play, CheckCircle, Loader, Volume2, Users } from 'lucide-react'
import { useUIStore } from '../../store/useUIStore'
import MentionText from '../../components/session/MentionText'

const CANDLELIGHT_ICONS = {
  newSession:    '/icons/candlelight/new_sesh.png',
  generateNpc:   '/icons/candlelight/gen_npc.png',
  genEncounter:  '/icons/candlelight/gen_enc.png',
  genTreasure:   '/icons/candlelight/gen_treas.png',
  npcs:          '/icons/candlelight/npcs.png',
  items:         '/icons/candlelight/items.png',
  locations:     '/icons/candlelight/locations.png',
  sessions:      '/icons/candlelight/sessions.png',
} as const

const ELDRITCH_ICONS = {
  newSession:    '/icons/eldritch/new_sesh.png',
  generateNpc:   '/icons/eldritch/gen_npc.png',
  genEncounter:  '/icons/eldritch/gen_enc.png',
  genTreasure:   '/icons/eldritch/gen_treas.png',
  npcs:          '/icons/eldritch/npcs.png',
  items:         '/icons/eldritch/items.png',
  locations:     '/icons/eldritch/locations.png',
  sessions:      '/icons/eldritch/sessions.png',
} as const

const HAUNT_ICONS = {
  newSession:    '/icons/haunt/new_sesh.png',
  generateNpc:   '/icons/haunt/gen_npc.png',
  genEncounter:  '/icons/haunt/gen_enc.png',
  genTreasure:   '/icons/haunt/gen_treas.png',
  npcs:          '/icons/haunt/npcs.png',
  items:         '/icons/haunt/items.png',
  locations:     '/icons/haunt/locations.png',
  sessions:      '/icons/haunt/sessions.png',
} as const

const ICARUS_ICONS = {
  newSession:    '/icons/icarus/new_sesh.png',
  generateNpc:   '/icons/icarus/gen_npc.png',
  genEncounter:  '/icons/icarus/gen_enc.png',
  genTreasure:   '/icons/icarus/gen_treas.png',
  npcs:          '/icons/icarus/npcs.png',
  items:         '/icons/icarus/items.png',
  locations:     '/icons/icarus/locations.png',
  sessions:      '/icons/icarus/sessions.png',
} as const

const NEON_ICONS = {
  newSession:    '/icons/neon/new_sesh.png',
  generateNpc:   '/icons/neon/gen_npc.png',
  genEncounter:  '/icons/neon/gen_enc.png',
  genTreasure:   '/icons/neon/gen_treas.png',
  npcs:          '/icons/neon/npcs.png',
  items:         '/icons/neon/items.png',
  locations:     '/icons/neon/locations.png',
  sessions:      '/icons/neon/sessions.png',
} as const

const THEME_ICONS: Partial<Record<string, typeof CANDLELIGHT_ICONS>> = {
  candlelight: CANDLELIGHT_ICONS,
  eldritch:    ELDRITCH_ICONS,
  haunt:       HAUNT_ICONS,
  icarus:      ICARUS_ICONS,
  neon:        NEON_ICONS,
}

export default function CampaignDashboard() {
  const { campaignId } = useParams<{ campaignId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const theme = useUIStore(s => s.theme)
  const ci = THEME_ICONS[theme] ?? null
  const [prepLoading, setPrepLoading] = useState(false)
  const [prepSuggestions, setPrepSuggestions] = useState<PrepSuggestion[]>([])
  const [prepError, setPrepError] = useState<string | null>(null)

  const { data: campData } = useQuery({
    queryKey: ['campaign', campaignId],
    queryFn: () => api.get(`/api/campaigns/${campaignId}`).then(r => r.data),
    enabled: !!campaignId,
  })

  const { data: sessionsData } = useQuery({
    queryKey: ['sessions', campaignId],
    queryFn: () => api.get(`/api/campaigns/${campaignId}/sessions`).then(r => r.data),
    enabled: !!campaignId,
  })

  const { data: pcData } = useQuery({
    queryKey: ['player-characters', campaignId],
    queryFn: () => api.get(`/api/campaigns/${campaignId}/player-characters`).then(r => r.data),
    enabled: !!campaignId,
  })

  const createSession = useMutation({
    mutationFn: () => api.post(`/api/campaigns/${campaignId}/sessions`, {
      partyId: campData?.campaign?.parties?.[0]?.id,
    }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['sessions', campaignId] })
      navigate(`/campaign/${campaignId}/session/${res.data.session.id}`)
    },
  })

  async function loadPrepSuggestions() {
    if (prepLoading || prepSuggestions.length > 0) return
    setPrepLoading(true)
    setPrepError(null)
    try {
      const { data } = await api.post(`/api/generate/prep-suggestions/${campaignId}`)
      setPrepSuggestions(data.suggestions ?? [])
    } catch (e) {
      setPrepError(apiError(e))
    } finally {
      setPrepLoading(false)
    }
  }

  const campaign = campData?.campaign
  const sessions: Session[] = sessionsData?.sessions ?? []
  const latestCompleteSession = sessions.find(s => s.status === 'complete' && !s.recapRead)
  const inProgressSession = sessions.find(s => s.status === 'in_progress')
  const plannedSessions = sessions.filter(s => s.status === 'planned')

  if (!campaign) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      {/* Campaign header */}
      <div>
        <h1 className="display-font text-4xl font-bold text-ink">{campaign.name}</h1>
        <p className="text-ink-muted mt-1">{campaign.systemTemplate?.name}</p>
      </div>

      {/* Recap card */}
      {latestCompleteSession && (
        <RecapCard session={latestCompleteSession} campaignId={campaignId!} onDismiss={() => qc.invalidateQueries({ queryKey: ['sessions', campaignId] })} />
      )}

      {/* Active session banner */}
      {inProgressSession && (
        <div className="card border-accent/50 bg-accent/5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-accent uppercase tracking-wide">Session in progress</p>
              <h3 className="font-semibold text-ink mt-0.5">
                #{inProgressSession.sessionNumber}{inProgressSession.title ? ` — ${inProgressSession.title}` : ''}
              </h3>
            </div>
            <button
              className="btn-primary"
              onClick={() => navigate(`/campaign/${campaignId}/session/${inProgressSession.id}`)}
            >
              <Play size={14} /> Resume
            </button>
          </div>
        </div>
      )}

      {/* Quick actions grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <ActionCard
          icon="⚔️" label="New Session" imageSrc={ci?.newSession}
          onClick={() => createSession.mutate()}
          loading={createSession.isPending}
        />
        <ActionCard icon="🧙" label="Generate NPC" imageSrc={ci?.generateNpc} onClick={() => navigate(`/campaign/${campaignId}/generate/npc`)} />
        <ActionCard icon="💀" label="Gen Encounter" imageSrc={ci?.genEncounter} onClick={() => navigate(`/campaign/${campaignId}/generate/encounter`)} />
        <ActionCard icon="💎" label="Gen Treasure" imageSrc={ci?.genTreasure} onClick={() => navigate(`/campaign/${campaignId}/generate/treasure`)} />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'NPCs',      count: campaign._count?.npcs ?? 0,      icon: '🧙', imageSrc: ci?.npcs,      tab: 'npcs' },
          { label: 'Items',     count: campaign._count?.items ?? 0,     icon: '⚔️', imageSrc: ci?.items,     tab: 'items' },
          { label: 'Locations', count: campaign._count?.locations ?? 0, icon: '🗺️', imageSrc: ci?.locations, tab: 'locations' },
          { label: 'Sessions',  count: campaign._count?.sessions ?? 0,  icon: '📜', imageSrc: ci?.sessions,  tab: null },
        ].map(stat => (
          <div
            key={stat.label}
            className="card text-center cursor-pointer hover:border-accent/40 transition-colors"
            onClick={() => stat.tab ? navigate(`/campaign/${campaignId}/library/${stat.tab}`) : navigate(`/campaign/${campaignId}/log`)}
          >
            {stat.imageSrc
              ? <img src={stat.imageSrc} alt={stat.label} className="w-14 h-14 mx-auto mb-1 object-contain" />
              : <div className="text-2xl mb-1">{stat.icon}</div>
            }
            <div className="display-font text-xl font-bold text-ink">{stat.count}</div>
            <div className="text-xs text-ink-muted">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Party snapshot */}
      <PartySnapshot characters={pcData?.items ?? []} onNavigate={(pcId) => navigate(`/campaign/${campaignId}/players?pc=${pcId}`)} />

      {/* Prep suggestions */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="display-font text-lg font-bold text-ink">Prep next session</h2>
          {prepSuggestions.length === 0 && (
            <button className="btn-secondary text-xs" onClick={loadPrepSuggestions} disabled={prepLoading}>
              {prepLoading ? <><Loader size={12} className="animate-spin" /> Thinking…</> : '✨ Get suggestions'}
            </button>
          )}
        </div>

        {prepError && (
          <p className="text-sm text-danger mb-2">{prepError}</p>
        )}

        {prepSuggestions.length > 0 ? (
          <div className="space-y-2">
            {prepSuggestions.map((s, i) => (
              <div key={i} className="p-3 bg-surface-2 rounded-card">
                <div className="flex items-center gap-2 mb-1">
                  <span className="badge bg-accent/10 text-accent text-xs capitalize">{s.type}</span>
                  <h4 className="font-medium text-ink text-sm">{s.title}</h4>
                </div>
                <p className="text-xs text-ink-muted">{s.description}</p>
                {s.suggestedPrompt && (
                  <button
                    className="btn-ghost text-xs mt-2 text-accent"
                    onClick={() => navigate(`/campaign/${campaignId}/generate/${s.type}?prompt=${encodeURIComponent(s.suggestedPrompt)}`)}
                  >
                    Generate this →
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : !prepError ? (
          <p className="text-sm text-ink-muted">
            {sessions.filter(s => s.status === 'complete').length === 0
              ? 'Run your first session to get AI-powered prep suggestions.'
              : 'Click "Get suggestions" to have Claude draft next-session ideas from your hooks and plot threads.'}
          </p>
        ) : null}
      </div>

      {/* Recent sessions */}
      {sessions.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="display-font text-lg font-bold text-ink">Sessions</h2>
            <button className="btn-ghost text-xs" onClick={() => navigate(`/campaign/${campaignId}/log`)}>
              View all →
            </button>
          </div>
          <div className="space-y-2">
            {sessions.slice(0, 5).map(s => (
              <div
                key={s.id}
                className="flex items-center justify-between p-2 rounded-card hover:bg-surface-2 cursor-pointer transition-colors"
                onClick={() => navigate(`/campaign/${campaignId}/session/${s.id}`)}
              >
                <div>
                  <span className="text-sm font-medium text-ink">
                    #{s.sessionNumber}{s.title ? ` — ${s.title}` : ''}
                  </span>
                  {s.datePlayed && (
                    <span className="text-xs text-ink-muted ml-2">{new Date(s.datePlayed).toLocaleDateString()}</span>
                  )}
                </div>
                <StatusBadge status={s.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

interface PrepSuggestion {
  title: string; description: string; type: string; suggestedPrompt: string; relatedThreadId?: string;
}
interface Session {
  id: string; sessionNumber: number; title?: string; status: string; recapRead: boolean;
  datePlayed?: string; generatedSummary?: string; keyEvents: string[]; hooksForNext: string[];
}
interface PC {
  id: string; name: string; playerName: string; class: string; level: number;
  portraitAssetId: string | null; portraitAsset?: { id: string; altText?: string | null } | null;
}

function ActionCard({ icon, label, onClick, loading, imageSrc }: { icon: string; label: string; onClick: () => void; loading?: boolean; imageSrc?: string }) {
  return (
    <button
      className="card text-center hover:border-accent/50 hover:bg-accent/5 transition-all cursor-pointer group touch-manipulation min-h-[60px]"
      onClick={onClick}
      disabled={loading}
    >
      {loading
        ? <div className="text-2xl mb-1">⏳</div>
        : imageSrc
          ? <img src={imageSrc} alt={label} className="w-14 h-14 mx-auto mb-1 object-contain group-hover:scale-110 transition-transform" />
          : <div className="text-2xl mb-1 group-hover:scale-110 transition-transform">{icon}</div>
      }
      <div className="text-xs font-medium text-ink-muted group-hover:text-ink transition-colors">{label}</div>
    </button>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    planned: 'bg-surface-2 text-ink-muted',
    in_progress: 'bg-accent/10 text-accent',
    complete: 'bg-green-500/10 text-green-500',
  }
  return <span className={`badge ${colors[status] ?? ''} capitalize text-xs`}>{status.replace('_', ' ')}</span>
}

function PartySnapshot({ characters, onNavigate }: { characters: PC[]; onNavigate: (pcId: string) => void }) {
  if (characters.length === 0) return null
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="display-font text-lg font-bold text-ink flex items-center gap-2">
          <Users size={18} className="text-accent" />
          Party
        </h2>
        <span className="text-xs text-ink-muted">{characters.length} character{characters.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {characters.map(pc => {
          const assetId = pc.portraitAsset?.id ?? pc.portraitAssetId
          return (
            <button
              key={pc.id}
              className="flex flex-col items-center gap-2 p-3 rounded-card hover:bg-surface-2 cursor-pointer transition-colors group text-center"
              onClick={() => onNavigate(pc.id)}
            >
              <div className="relative w-16 h-16 flex-shrink-0">
                {assetId ? (
                  <img
                    src={`/api/assets/${assetId}?size=thumb`}
                    alt={pc.portraitAsset?.altText ?? `${pc.name} portrait`}
                    className="w-16 h-16 rounded-full object-cover border-2 border-border group-hover:border-accent/50 transition-colors"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-surface-2 border-2 border-border group-hover:border-accent/50 transition-colors flex items-center justify-center text-2xl">
                    🧙
                  </div>
                )}
              </div>
              <div className="w-full min-w-0">
                <p className="text-sm font-semibold text-ink truncate group-hover:text-accent transition-colors">{pc.name}</p>
                {pc.playerName && (
                  <p className="text-xs text-ink-muted truncate">{pc.playerName}</p>
                )}
                {(pc.class || pc.level) && (
                  <span className="inline-block mt-1 badge bg-accent/10 text-accent text-xs">
                    {[pc.class, pc.level ? `Lvl ${pc.level}` : null].filter(Boolean).join(' · ')}
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function RecapCard({ session, campaignId, onDismiss }: { session: Session; campaignId: string; onDismiss: () => void }) {
  const qc = useQueryClient()
  const markRead = useMutation({
    mutationFn: () => api.patch(`/api/campaigns/${campaignId}/sessions/${session.id}`, { recapRead: true }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sessions', campaignId] }); onDismiss() },
  })

  return (
    <div className="card border-accent/30 bg-accent/5 animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <h2 className="display-font text-lg font-bold text-ink flex items-center gap-2">
          <Volume2 size={18} className="text-accent" />
          Previously on Session #{session.sessionNumber}…
        </h2>
        <button className="btn-ghost text-xs text-ink-muted" onClick={() => markRead.mutate()}>
          <CheckCircle size={14} /> Mark as read
        </button>
      </div>
      {session.generatedSummary && (
        <p className="text-sm text-ink leading-relaxed mb-3">
          <MentionText text={session.generatedSummary} campaignId={campaignId} />
        </p>
      )}
      {session.keyEvents?.length > 0 && (
        <ul className="space-y-1 mb-2">
          {(session.keyEvents as string[]).slice(0, 4).map((e, i) => (
            <li key={i} className="text-xs text-ink-muted flex gap-2">
              <span className="text-accent shrink-0">◆</span>
              <MentionText text={e} campaignId={campaignId} />
            </li>
          ))}
        </ul>
      )}
      {session.hooksForNext?.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1">Hooks for next time</p>
          <ul className="space-y-0.5">
            {(session.hooksForNext as string[]).map((h, i) => (
              <li key={i} className="text-xs text-ink flex gap-2">
                <span>→</span>
                <MentionText text={h} campaignId={campaignId} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
