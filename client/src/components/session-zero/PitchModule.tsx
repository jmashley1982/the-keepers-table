import { useState, useRef, useCallback, useEffect } from 'react'
import { api } from '../../lib/api'
import { Sparkles, Loader } from 'lucide-react'

interface PitchData {
  pitchElevator: string
  pitchGenre: string
  pitchLength: string
  pitchWhatIsNot: string
  tonGrimHeroic: number
  tonGrittyCinematic: number
  tonEpisodicSerialized: number
  tonCombatRoleplay: number
}

interface Props {
  campaignId: string
  initial: PitchData
  onSaved?: () => void
}

const LENGTH_OPTIONS = [
  { value: 'one-shot', label: 'One-shot' },
  { value: 'short-arc', label: 'Short arc (3–8 sessions)' },
  { value: 'long-campaign', label: 'Long campaign (20+ sessions)' },
  { value: 'open-ended', label: 'Open-ended' },
]

const SLIDERS: { key: keyof PitchData; left: string; right: string }[] = [
  { key: 'tonGrimHeroic',         left: 'Grim',      right: 'Heroic' },
  { key: 'tonGrittyCinematic',    left: 'Gritty',    right: 'Cinematic' },
  { key: 'tonEpisodicSerialized', left: 'Episodic',  right: 'Serialized' },
  { key: 'tonCombatRoleplay',     left: 'Combat-heavy', right: 'Roleplay-heavy' },
]

export default function PitchModule({ campaignId, initial, onSaved }: Props) {
  const [form, setForm] = useState<PitchData>(initial)
  const [saving, setSaving] = useState(false)
  const [aiText, setAiText] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setForm(initial) }, [campaignId])

  const save = useCallback((data: PitchData) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaving(true)
      try {
        await api.patch(`/api/campaigns/${campaignId}/session-zero/pitch`, data)
        onSaved?.()
      } finally {
        setSaving(false)
      }
    }, 1200)
  }, [campaignId, onSaved])

  function update<K extends keyof PitchData>(key: K, value: PitchData[K]) {
    const next = { ...form, [key]: value }
    setForm(next)
    save(next)
  }

  async function runAiAssist() {
    setAiLoading(true)
    setAiText('')
    try {
      const resp = await fetch(`/api/campaigns/${campaignId}/session-zero/pitch/assist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft: form.pitchElevator }),
        credentials: 'include',
      })
      if (!resp.body) return
      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let full = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const json = JSON.parse(line.slice(6))
            if (json.text) { full += json.text; setAiText(full) }
            if (json.done) {
              const next = { ...form, pitchElevator: full }
              setForm(next)
              save(next)
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Elevator Pitch */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="label">Elevator Pitch</label>
          <button
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full transition-colors"
            style={{ background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)', color: 'var(--color-accent)' }}
            onClick={runAiAssist}
            disabled={aiLoading}
          >
            {aiLoading ? <Loader size={11} className="animate-spin" /> : <Sparkles size={11} />}
            AI Assist
          </button>
        </div>
        <textarea
          className="input w-full min-h-[100px] text-sm leading-relaxed resize-y"
          placeholder="2–3 sentences that capture your campaign's hook, genre, and tone…"
          value={aiLoading ? aiText : form.pitchElevator}
          onChange={e => update('pitchElevator', e.target.value)}
          readOnly={aiLoading}
        />
        {aiLoading && (
          <p className="text-xs text-ink-muted mt-1">Writing pitch…</p>
        )}
      </div>

      {/* Genre + Length */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Genre</label>
          <input
            className="input"
            placeholder="High fantasy, dark sci-fi, weird west…"
            value={form.pitchGenre}
            onChange={e => update('pitchGenre', e.target.value)}
          />
        </div>
        <div>
          <label className="label">Expected Length</label>
          <select
            className="input"
            value={form.pitchLength}
            onChange={e => update('pitchLength', e.target.value)}
          >
            <option value="">Select…</option>
            {LENGTH_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* What It Is Not */}
      <div>
        <label className="label">What This Campaign Is NOT</label>
        <input
          className="input"
          placeholder="Not a murder-hobo sandbox, not a railroad…"
          value={form.pitchWhatIsNot}
          onChange={e => update('pitchWhatIsNot', e.target.value)}
        />
      </div>

      {/* Tone Sliders */}
      <div>
        <label className="label mb-3 block">Tone</label>
        <div className="space-y-4">
          {SLIDERS.map(({ key, left, right }) => (
            <div key={key}>
              <div className="flex justify-between text-xs text-ink-muted mb-1">
                <span>{left}</span>
                <span>{right}</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={form[key] as number}
                onChange={e => update(key, parseInt(e.target.value))}
                className="w-full accent-accent"
              />
            </div>
          ))}
        </div>
      </div>

      {saving && (
        <p className="text-xs text-ink-muted flex items-center gap-1">
          <Loader size={10} className="animate-spin" /> Saving…
        </p>
      )}
    </div>
  )
}
