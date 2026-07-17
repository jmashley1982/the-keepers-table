import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import ThemedLoader from '../components/ui/Loader'
import ThemeSwitcher from '../components/layout/ThemeSwitcher'

type Setting = 'line' | 'veil' | 'ok'

const SETTING_OPTIONS: { value: Setting; label: string; desc: string; color: string }[] = [
  { value: 'line', label: 'Line',  desc: 'Never include this', color: 'var(--color-danger)' },
  { value: 'veil', label: 'Veil',  desc: 'Fade to black',       color: '#f59e0b' },
  { value: 'ok',   label: 'OK',    desc: 'Fine at this table',  color: '#22c55e' },
]

export default function SafetySubmitPage() {
  const { token } = useParams<{ token: string }>()
  const [settings, setSettings] = useState<Record<string, Setting>>({})
  const [submitted, setSubmitted] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['safety-submit', token],
    queryFn: () =>
      fetch(`/api/campaigns/safety/submit/${token}`).then(r => {
        if (!r.ok) throw new Error('Link not found or no longer active')
        return r.json() as Promise<{ campaignName: string; presetTopics: string[] }>
      }),
    retry: false,
  })

  const submit = useMutation({
    mutationFn: () =>
      fetch(`/api/campaigns/safety/submit/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topics: settings }),
      }).then(r => { if (!r.ok) throw new Error('Submission failed'); return r.json() }),
    onSuccess: () => setSubmitted(true),
  })

  if (isLoading) return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <ThemeSwitcher variant="floating" />
      <ThemedLoader />
    </div>
  )

  if (error || !data) return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <ThemeSwitcher variant="floating" />
      <div className="text-center max-w-sm">
        <div className="text-4xl mb-4">🔒</div>
        <h1 className="display-font text-xl font-bold text-ink mb-2">Link not available</h1>
        <p className="text-ink-muted text-sm">This link may have expired or been deactivated by the GM.</p>
      </div>
    </div>
  )

  if (submitted) return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <ThemeSwitcher variant="floating" />
      <div className="text-center max-w-sm">
        <div className="text-4xl mb-4">✅</div>
        <h1 className="display-font text-xl font-bold text-ink mb-2">Submitted!</h1>
        <p className="text-ink-muted text-sm">
          Your preferences have been sent anonymously. The GM will only see a merged summary — your name is not attached.
        </p>
      </div>
    </div>
  )

  const answered = Object.keys(settings).length
  const total = data.presetTopics.length

  return (
    <div
      className="min-h-screen p-4 pb-16"
      style={{ background: 'var(--color-bg)' }}
    >
      <ThemeSwitcher variant="floating" />
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-8 pt-8">
          <p className="text-xs text-ink-muted uppercase tracking-wider mb-1">The Keeper's Table</p>
          <h1 className="display-font text-2xl font-bold text-ink mb-1">{data.campaignName}</h1>
          <p className="text-sm text-ink-muted">Safety preferences — anonymous submission</p>
          <p className="text-xs text-ink-muted mt-3 max-w-sm mx-auto leading-relaxed">
            Mark topics as <strong>Line</strong> (never happens), <strong>Veil</strong> (fade to black), or <strong>OK</strong>.
            You don't have to answer everything. Your GM will see a merged summary only — no names attached.
          </p>
        </div>

        <div className="space-y-2 mb-6">
          {data.presetTopics.map(topic => (
            <div key={topic} className="card py-3 flex items-center justify-between gap-3">
              <span className="text-sm text-ink">{topic}</span>
              <div className="flex gap-1 flex-shrink-0">
                {SETTING_OPTIONS.map(opt => {
                  const active = settings[topic] === opt.value
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setSettings(s =>
                        s[topic] === opt.value
                          ? Object.fromEntries(Object.entries(s).filter(([k]) => k !== topic))
                          : { ...s, [topic]: opt.value }
                      )}
                      title={opt.desc}
                      className="px-2.5 py-1 rounded text-xs font-medium border transition-all"
                      style={active ? {
                        background: opt.color,
                        color: '#fff',
                        borderColor: opt.color,
                      } : {
                        background: 'transparent',
                        color: 'var(--color-ink-muted)',
                        borderColor: 'var(--color-border)',
                      }}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="sticky bottom-4">
          <button
            className="btn-primary w-full justify-center py-3"
            onClick={() => submit.mutate()}
            disabled={submit.isPending || answered === 0}
          >
            {submit.isPending
              ? 'Submitting…'
              : answered === 0
              ? 'Mark at least one topic to submit'
              : `Submit ${answered} of ${total} preferences anonymously`}
          </button>
          {submit.isError && (
            <p className="text-center text-xs text-danger mt-2">Submission failed — please try again.</p>
          )}
        </div>
      </div>
    </div>
  )
}
