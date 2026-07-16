import { useState, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { Link2, Loader, Plus, X, Users, ExternalLink } from 'lucide-react'

type Setting = 'line' | 'veil' | 'ok' | null

interface Topic {
  id: string
  topic: string
  isPreset: boolean
  gmSetting: Setting
}

interface SafetyData {
  topics: Topic[]
  contentRating: string
  sessionToolsUsed: string
  shareLink: { token: string; active: boolean } | null
  submissionCount: number
}

interface Props {
  campaignId: string
}

const SETTING_LABELS: Record<string, { label: string; color: string }> = {
  line:  { label: 'Line',  color: 'var(--color-danger)' },
  veil:  { label: 'Veil',  color: '#f59e0b' },
  ok:    { label: 'OK',    color: '#22c55e' },
}

const CONTENT_RATINGS = ['PG', 'PG-13', 'R', 'Adults Only']

export default function SafetyModule({ campaignId }: Props) {
  const qc = useQueryClient()
  const [newTopic, setNewTopic] = useState('')
  const [showSubmissions, setShowSubmissions] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data, isLoading } = useQuery<SafetyData>({
    queryKey: ['session-zero-safety', campaignId],
    queryFn: () => api.get(`/api/campaigns/${campaignId}/session-zero/safety`).then(r => r.data),
  })

  const { data: submissionData } = useQuery<{ merged: Record<string, string>; count: number }>({
    queryKey: ['session-zero-submissions', campaignId],
    queryFn: () => api.get(`/api/campaigns/${campaignId}/session-zero/safety/submissions`).then(r => r.data),
    enabled: showSubmissions,
  })

  const saveTopics = useMutation({
    mutationFn: (topics: { topic: string; gmSetting: Setting }[]) =>
      api.put(`/api/campaigns/${campaignId}/session-zero/safety`, { topics }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['session-zero-safety', campaignId] }),
  })

  const saveMeta = useCallback((field: 'contentRating' | 'sessionToolsUsed', value: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      api.put(`/api/campaigns/${campaignId}/session-zero/safety`, { [field]: value })
    }, 1000)
  }, [campaignId])

  const createShareLink = useMutation({
    mutationFn: () => api.post(`/api/campaigns/${campaignId}/session-zero/safety/share`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['session-zero-safety', campaignId] }),
  })

  const deactivateShareLink = useMutation({
    mutationFn: () => api.delete(`/api/campaigns/${campaignId}/session-zero/safety/share`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['session-zero-safety', campaignId] }),
  })

  const deleteTopic = useMutation({
    mutationFn: (topic: string) =>
      api.delete(`/api/campaigns/${campaignId}/session-zero/safety/topic`, { data: { topic } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['session-zero-safety', campaignId] }),
  })

  function setSetting(topic: Topic, setting: Setting) {
    saveTopics.mutate([{ topic: topic.topic, gmSetting: setting }])
    qc.setQueryData<SafetyData>(['session-zero-safety', campaignId], old =>
      old ? { ...old, topics: old.topics.map(t => t.id === topic.id ? { ...t, gmSetting: setting } : t) } : old
    )
  }

  function addCustomTopic() {
    const trimmed = newTopic.trim()
    if (!trimmed) return
    saveTopics.mutate([{ topic: trimmed, gmSetting: null }])
    qc.setQueryData<SafetyData>(['session-zero-safety', campaignId], old =>
      old ? {
        ...old,
        topics: [...old.topics, { id: `tmp-${Date.now()}`, topic: trimmed, isPreset: false, gmSetting: null }],
      } : old
    )
    setNewTopic('')
  }

  const shareUrl = data?.shareLink?.token
    ? `${window.location.origin}/safety-submit/${data.shareLink.token}`
    : null

  if (isLoading) return (
    <div className="flex justify-center py-12">
      <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const topics = data?.topics ?? []
  const presetTopics = topics.filter(t => t.isPreset)
  const customTopics = topics.filter(t => !t.isPreset)

  return (
    <div className="space-y-8">

      {/* Content Rating + Session Tools */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Content Rating</label>
          <div className="flex gap-2 flex-wrap mt-1">
            {CONTENT_RATINGS.map(r => (
              <button
                key={r}
                onClick={() => {
                  const next = data?.contentRating === r ? '' : r
                  qc.setQueryData<SafetyData>(['session-zero-safety', campaignId], old =>
                    old ? { ...old, contentRating: next } : old
                  )
                  saveMeta('contentRating', next)
                }}
                className="px-3 py-1 rounded-full text-xs font-medium border transition-colors"
                style={data?.contentRating === r ? {
                  background: 'var(--color-accent)',
                  color: '#fff',
                  borderColor: 'var(--color-accent)',
                } : {
                  background: 'transparent',
                  color: 'var(--color-ink-muted)',
                  borderColor: 'var(--color-border)',
                }}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">Safety Tools We Use</label>
          <input
            className="input text-sm mt-1"
            placeholder="X-card, Script Change, Lines & Veils…"
            defaultValue={data?.sessionToolsUsed ?? ''}
            onChange={e => saveMeta('sessionToolsUsed', e.target.value)}
          />
        </div>
      </div>

      {/* Lines & Veils Table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="label">Lines & Veils</p>
            <p className="text-xs text-ink-muted mt-0.5">
              <strong className="text-danger">Line</strong> = never appears · <strong className="text-yellow-500">Veil</strong> = fade to black · <strong className="text-green-500">OK</strong> = can happen
            </p>
          </div>
        </div>

        <div className="space-y-1">
          {presetTopics.map(topic => (
            <TopicRow key={topic.id} topic={topic} onSet={setSetting} />
          ))}
        </div>

        {customTopics.length > 0 && (
          <div className="mt-3 space-y-1">
            <p className="text-xs text-ink-muted uppercase tracking-wider mb-2">Custom topics</p>
            {customTopics.map(topic => (
              <TopicRow key={topic.id} topic={topic} onSet={setSetting}
                onDelete={() => deleteTopic.mutate(topic.topic)} />
            ))}
          </div>
        )}

        <div className="flex gap-2 mt-3">
          <input
            className="input flex-1 text-sm"
            placeholder="Add a custom topic…"
            value={newTopic}
            onChange={e => setNewTopic(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCustomTopic()}
          />
          <button
            className="btn-secondary flex items-center gap-1 text-sm"
            onClick={addCustomTopic}
            disabled={!newTopic.trim()}
          >
            <Plus size={14} /> Add
          </button>
        </div>
      </div>

      {/* Anonymous Player Submission */}
      <div className="rounded-card border border-border p-4 space-y-3"
        style={{ background: 'color-mix(in srgb, var(--color-accent) 4%, var(--color-surface))' }}>
        <div className="flex items-center gap-2">
          <Users size={15} className="text-accent" />
          <p className="font-medium text-sm text-ink">Anonymous Player Input</p>
        </div>
        <p className="text-xs text-ink-muted leading-relaxed">
          Share a link with your players so they can submit their own lines & veils anonymously.
          You'll see only a merged "strictest setting wins" view — never who said what.
        </p>

        {data?.shareLink?.active && shareUrl ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={shareUrl}
                className="input flex-1 text-xs font-mono"
                onClick={e => (e.target as HTMLInputElement).select()}
              />
              <button
                className="btn-secondary text-xs flex items-center gap-1"
                onClick={() => navigator.clipboard.writeText(shareUrl)}
              >
                <Link2 size={12} /> Copy
              </button>
              <a href={shareUrl} target="_blank" rel="noopener noreferrer"
                className="btn-secondary text-xs flex items-center gap-1">
                <ExternalLink size={12} />
              </a>
            </div>
            <div className="flex items-center justify-between">
              <button
                className="text-xs text-ink-muted hover:text-danger underline"
                onClick={() => deactivateShareLink.mutate()}
              >
                Deactivate link
              </button>
              {(data?.submissionCount ?? 0) > 0 && (
                <button
                  className="text-xs text-accent hover:underline"
                  onClick={() => setShowSubmissions(o => !o)}
                >
                  {showSubmissions ? 'Hide' : 'View'} merged results ({data?.submissionCount} {data?.submissionCount === 1 ? 'response' : 'responses'})
                </button>
              )}
            </div>
          </div>
        ) : (
          <button
            className="btn-secondary text-sm flex items-center gap-2"
            onClick={() => createShareLink.mutate()}
            disabled={createShareLink.isPending}
          >
            {createShareLink.isPending ? <Loader size={13} className="animate-spin" /> : <Link2 size={13} />}
            Generate share link
          </button>
        )}

        {showSubmissions && submissionData && submissionData.count > 0 && (
          <div className="mt-3 pt-3 border-t border-border space-y-1">
            <p className="text-xs font-medium text-ink mb-2">
              Merged table boundaries — {submissionData.count} anonymous {submissionData.count === 1 ? 'response' : 'responses'}
            </p>
            {Object.entries(submissionData.merged).map(([topic, setting]) => (
              <div key={topic} className="flex items-center justify-between text-xs">
                <span className="text-ink">{topic}</span>
                <span style={{ color: SETTING_LABELS[setting]?.color ?? 'var(--color-ink-muted)' }}
                  className="font-medium">
                  {SETTING_LABELS[setting]?.label ?? setting}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function TopicRow({
  topic,
  onSet,
  onDelete,
}: {
  topic: Topic
  onSet: (t: Topic, s: Setting) => void
  onDelete?: () => void
}) {
  const settings: Setting[] = ['line', 'veil', 'ok']

  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded-card hover:bg-white/[0.03] group">
      <span className="text-sm text-ink flex-1">{topic.topic}</span>
      <div className="flex items-center gap-1">
        {settings.map(s => {
          const active = topic.gmSetting === s
          const info = SETTING_LABELS[s!]!
          return (
            <button
              key={s}
              onClick={() => onSet(topic, active ? null : s)}
              className="px-2 py-0.5 rounded text-xs font-medium border transition-all"
              style={active ? {
                background: info.color,
                color: '#fff',
                borderColor: info.color,
              } : {
                background: 'transparent',
                color: 'var(--color-ink-muted)',
                borderColor: 'var(--color-border)',
              }}
            >
              {info.label}
            </button>
          )
        })}
        {onDelete && (
          <button
            onClick={onDelete}
            className="ml-1 opacity-0 group-hover:opacity-100 text-ink-muted hover:text-danger transition-opacity"
          >
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  )
}
