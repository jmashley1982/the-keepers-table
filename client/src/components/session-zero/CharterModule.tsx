import { useState, useRef, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { ChevronDown, ChevronUp, Loader } from 'lucide-react'
import ThemedLoader from '../ui/Loader'

interface Charter {
  scheduling?: string
  missedSession?: string
  pvpRules?: string
  lootSplitting?: string
  phones?: string
  rulesDisputes?: string
  homebrewPolicy?: string
}

const SECTIONS: { key: keyof Charter; label: string; placeholder: string }[] = [
  { key: 'scheduling',    label: 'Scheduling & Attendance',   placeholder: 'When we play, how much notice is needed for absences…' },
  { key: 'missedSession', label: 'Missed Session Policy',      placeholder: 'What happens to your character if you miss a session…' },
  { key: 'pvpRules',      label: 'PvP Rules',                  placeholder: 'Whether player vs. player conflict is allowed and under what conditions…' },
  { key: 'lootSplitting', label: 'Loot Splitting',             placeholder: 'How treasure is divided among the party…' },
  { key: 'phones',        label: 'Phones at the Table',        placeholder: 'Expectations around devices during play…' },
  { key: 'rulesDisputes', label: 'Rules Disputes',             placeholder: 'How to handle disagreements about rules in the moment…' },
  { key: 'homebrewPolicy',label: 'Homebrew Policy',            placeholder: 'What homebrew content is allowed, and how it gets approved…' },
]

const TEMPLATES: { name: string; charter: Charter }[] = [
  {
    name: 'Casual Table',
    charter: {
      scheduling:    'We play on [day] at [time]. Let anyone know by [day before] if you can\'t make it. Life happens — no worries.',
      missedSession: 'Your character will be conveniently off-screen. We\'ll fill you in next session. No punishments for real-life stuff.',
      pvpRules:      'PvP is discouraged. If you want characters to conflict, talk to the GM first and keep it fun for everyone.',
      lootSplitting: 'Roughly even split. If an item clearly suits one character, they get first dibs. No spreadsheets needed.',
      phones:        'Phones on silent during scenes. Quick checks between scenes are fine. No social media at the table.',
      rulesDisputes: 'GM ruling stands in the moment. We can look it up at the break. We\'re here to tell stories, not win arguments.',
      homebrewPolicy:'A few house rules are in play. Bring suggestions — we\'ll try them for a session and vote.',
    },
  },
  {
    name: 'Serious Long-form Campaign',
    charter: {
      scheduling:    'Sessions run [day] from [time] to [time]. Please commit to 80%+ attendance. Give 48 hours notice for absences when possible. Consistent absences will be addressed by the group.',
      missedSession: 'Absent characters are run passively by the GM — they won\'t gain XP that session. Three or more absences in a row triggers a check-in.',
      pvpRules:      'PvP requires genuine in-character motivation and GM approval. Betrayal arcs are possible but must be discussed out-of-game first. Player vs. player should serve the story.',
      lootSplitting: 'Treasure is split equally. Magic items go to whoever can use them best, decided by group vote. Contested items are arbitrated by the GM.',
      phones:        'Phones away during sessions except for genuine emergencies. Breaks every 90–120 minutes. D&D Beyond and reference tools on a separate device are fine.',
      rulesDisputes: 'GM ruling stands. We note the dispute and look it up at the next break. Rules lawyer debates kill momentum — save it for after.',
      homebrewPolicy:'Homebrew content requires GM approval before character creation. Bring a written description. We lean RAW for balance but reasonable fiction-first rulings are always on the table.',
    },
  },
  {
    name: 'Online / Discord Table',
    charter: {
      scheduling:    'Sessions are scheduled in #scheduling at least one week ahead. React with ✅ to confirm, ❌ if you can\'t make it. We need 3+ players to run.',
      missedSession: 'Missing is fine — react with ❌ in #scheduling. Your character goes NPC mode. Use #session-recap to catch up.',
      pvpRules:      'PvP is opt-in. Both players must agree before any conflict goes mechanical. Ping the GM if you want to set something up.',
      lootSplitting: 'Party loot is tracked in #loot-log. Decide in the session; if undecided after 24 hours the GM rolls randomly.',
      phones:        'We\'re online so, fair enough — but please stay in the call and minimize Discord distractions during active scenes.',
      rulesDisputes: 'Drop a 🔖 in chat to flag a rules question. GM decides in the moment. We review flagged rules at session end.',
      homebrewPolicy:'Post homebrew in #homebrew-review. Group gives thumbs up/down. Two ❌ reactions means it\'s tabled for discussion.',
    },
  },
]

interface Props { campaignId: string }

export default function CharterModule({ campaignId }: Props) {
  const qc = useQueryClient()
  const [expandedSection, setExpandedSection] = useState<keyof Charter | null>('scheduling')
  const [saving, setSaving] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['campaign', campaignId],
    queryFn: () => api.get(`/api/campaigns/${campaignId}`).then(r => r.data),
  })

  const charter: Charter = (data?.campaign?.tableCharter as Charter) ?? {}

  const save = useCallback((next: Charter) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaving(true)
      try {
        await api.patch(`/api/campaigns/${campaignId}/session-zero/charter`, { tableCharter: next })
        qc.setQueryData<typeof data>(['campaign', campaignId], old =>
          old ? { ...old, campaign: { ...old.campaign, tableCharter: next } } : old
        )
      } finally {
        setSaving(false)
      }
    }, 1000)
  }, [campaignId, qc])

  function updateSection(key: keyof Charter, value: string) {
    const next = { ...charter, [key]: value }
    qc.setQueryData<typeof data>(['campaign', campaignId], old =>
      old ? { ...old, campaign: { ...old.campaign, tableCharter: next } } : old
    )
    save(next)
  }

  function applyTemplate(template: typeof TEMPLATES[0]) {
    const next = { ...template.charter }
    qc.setQueryData<typeof data>(['campaign', campaignId], old =>
      old ? { ...old, campaign: { ...old.campaign, tableCharter: next } } : old
    )
    save(next)
    setExpandedSection('scheduling')
  }

  const isBlank = SECTIONS.every(s => !charter[s.key]?.trim())

  if (isLoading) return (
    <div className="flex justify-center py-12">
      <ThemedLoader />
    </div>
  )

  return (
    <div className="space-y-5">
      {isBlank && (
        <div>
          <p className="label mb-2">Start from a template</p>
          <div className="flex flex-wrap gap-2">
            {TEMPLATES.map(t => (
              <button
                key={t.name}
                onClick={() => applyTemplate(t)}
                className="px-3 py-1.5 rounded-full text-sm font-medium border transition-colors"
                style={{
                  background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)',
                  color: 'var(--color-accent)',
                  borderColor: 'color-mix(in srgb, var(--color-accent) 30%, transparent)',
                }}
              >
                {t.name}
              </button>
            ))}
          </div>
          <div className="my-4 flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-ink-muted">or write from scratch below</span>
            <div className="flex-1 h-px bg-border" />
          </div>
        </div>
      )}

      {!isBlank && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-ink-muted">Click any section to expand and edit.</p>
          <div className="flex gap-2">
            {TEMPLATES.map(t => (
              <button
                key={t.name}
                onClick={() => applyTemplate(t)}
                className="text-xs text-ink-muted hover:text-accent underline"
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {SECTIONS.map(({ key, label, placeholder }) => (
          <div key={key} className="rounded-card border border-border overflow-hidden"
            style={{ background: 'var(--color-surface)' }}>
            <button
              className="w-full flex items-center justify-between px-4 py-3 text-left"
              onClick={() => setExpandedSection(expandedSection === key ? null : key)}
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-ink">{label}</span>
                {charter[key]?.trim() ? (
                  <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" title="Filled" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-border flex-shrink-0" title="Empty" />
                )}
              </div>
              {expandedSection === key
                ? <ChevronUp size={14} className="text-ink-muted flex-shrink-0" />
                : <ChevronDown size={14} className="text-ink-muted flex-shrink-0" />}
            </button>

            {expandedSection === key && (
              <div className="px-4 pb-4 border-t border-border">
                <textarea
                  className="input w-full mt-3 min-h-[120px] text-sm leading-relaxed resize-y"
                  placeholder={placeholder}
                  value={charter[key] ?? ''}
                  onChange={e => updateSection(key, e.target.value)}
                  autoFocus
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {saving && (
        <p className="text-xs text-ink-muted flex items-center gap-1">
          <Loader size={10} className="animate-spin" /> Saving…
        </p>
      )}
    </div>
  )
}
