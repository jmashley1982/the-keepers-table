import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { useState } from 'react'
import { Save, Loader, Info } from 'lucide-react'
import ThemedLoader from '../../components/ui/Loader'

const CLAUDE_MODELS = [
  { value: '',                  label: 'Use account default',  desc: 'Falls back to your global AI settings' },
  { value: 'claude-haiku-4-5',  label: 'Claude Haiku',         desc: 'Fastest · lowest cost · good for quick rolls' },
  { value: 'claude-sonnet-4-5', label: 'Claude Sonnet ⭐',      desc: 'Balanced · recommended for most campaigns' },
  { value: 'claude-opus-4-5',   label: 'Claude Opus',          desc: 'Most capable · higher cost · best for complex writing' },
]

export default function CampaignSettingsPage() {
  const { campaignId } = useParams<{ campaignId: string }>()
  const qc = useQueryClient()

  const { data: campData } = useQuery({
    queryKey: ['campaign', campaignId],
    queryFn: () => api.get(`/api/campaigns/${campaignId}`).then(r => r.data),
    enabled: !!campaignId,
  })

  const { data: templatesData } = useQuery({
    queryKey: ['system-templates'],
    queryFn: () => api.get('/api/system-templates').then(r => r.data),
  })

  const { data: partiesData } = useQuery({
    queryKey: ['parties', campaignId],
    queryFn: () => api.get(`/api/campaigns/${campaignId}/parties`).then(r => r.data),
    enabled: !!campaignId,
  })

  const campaign = campData?.campaign
  const templates = templatesData?.templates ?? []
  const parties = partiesData?.parties ?? []

  const [name, setName] = useState<string | null>(null)
  const [settingNotes, setSettingNotes] = useState<string | null>(null)
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [aiModel, setAiModel] = useState<string | null>(null)

  const effectiveName = name ?? (campaign?.name ?? '')
  const effectiveSettingNotes = settingNotes ?? (campaign?.settingNotes ?? '')
  const effectiveTemplateId = templateId ?? (campaign?.systemTemplateId ?? '')
  const effectiveAiModel = aiModel ?? (campaign?.aiModel ?? '')

  const update = useMutation({
    mutationFn: () => api.patch(`/api/campaigns/${campaignId}`, {
      name: effectiveName,
      settingNotes: effectiveSettingNotes,
      systemTemplateId: effectiveTemplateId,
      aiModel: effectiveAiModel,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaign', campaignId] }),
  })

  if (!campaign) return (
    <div className="flex items-center justify-center h-full">
      <ThemedLoader />
    </div>
  )

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <h1 className="display-font text-3xl font-bold text-ink">Campaign Settings</h1>

      {/* Basic info */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-ink">Campaign Info</h2>

        <div>
          <label className="label">Campaign name</label>
          <input className="input" value={effectiveName} onChange={e => setName(e.target.value)} />
        </div>

        <div>
          <label className="label">Game system</label>
          <select className="input" value={effectiveTemplateId} onChange={e => setTemplateId(e.target.value)}>
            {templates.map((t: { id: string; name: string }) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Setting notes</label>
          <textarea
            className="textarea h-36"
            value={effectiveSettingNotes}
            onChange={e => setSettingNotes(e.target.value)}
            placeholder="World premise, tone, homebrew rules — always included in Claude's context…"
          />
        </div>

        <button
          className="btn-primary"
          onClick={() => update.mutate()}
          disabled={update.isPending}
        >
          {update.isPending ? <><Loader size={14} className="animate-spin" /> Saving…</> : <><Save size={14} /> Save changes</>}
        </button>

        {update.isSuccess && <p className="text-xs text-green-500">✓ Saved</p>}
        {update.isError && <p className="text-xs text-danger">{apiError(update.error)}</p>}
      </div>

      {/* AI model */}
      <div className="card space-y-4">
        <div>
          <h2 className="font-semibold text-ink">AI Model</h2>
          <p className="text-xs text-ink-muted mt-0.5">
            Choose which Claude model powers generation for this campaign. Overrides your account default.
          </p>
        </div>

        <div className="space-y-2">
          {CLAUDE_MODELS.map(m => (
            <label
              key={m.value}
              className="flex items-start gap-3 p-3 rounded-card border cursor-pointer transition-colors"
              style={effectiveAiModel === m.value ? {
                borderColor: 'var(--color-accent)',
                background: 'color-mix(in srgb, var(--color-accent) 6%, transparent)',
              } : {
                borderColor: 'var(--color-border)',
                background: 'transparent',
              }}
            >
              <input
                type="radio"
                name="aiModel"
                value={m.value}
                checked={effectiveAiModel === m.value}
                onChange={() => setAiModel(m.value)}
                className="mt-0.5 accent-accent"
              />
              <div>
                <p className="text-sm font-medium text-ink">{m.label}</p>
                <p className="text-xs text-ink-muted">{m.desc}</p>
              </div>
            </label>
          ))}
        </div>

        <div className="flex items-start gap-2 p-3 rounded-card text-xs text-ink-muted"
          style={{ background: 'color-mix(in srgb, var(--color-surface-2) 60%, transparent)' }}>
          <Info size={13} className="flex-shrink-0 mt-0.5" />
          <span>
            Sonnet or higher is recommended for campaign-aware generation — Haiku may produce less
            consistent results with long campaign context. Internal utility calls (e.g. image alt text)
            always use Haiku regardless of this setting.
          </span>
        </div>

        <button
          className="btn-primary"
          onClick={() => update.mutate()}
          disabled={update.isPending}
        >
          {update.isPending ? <><Loader size={14} className="animate-spin" /> Saving…</> : <><Save size={14} /> Save changes</>}
        </button>
      </div>

      {/* Parties */}
      <div className="card space-y-3">
        <h2 className="font-semibold text-ink">Parties</h2>
        {parties.map((p: Party) => (
          <div key={p.id} className="p-3 rounded-card" style={{ background: 'var(--color-surface-2)' }}>
            <h3 className="font-medium text-ink">{p.name}</h3>
            <p className="text-xs text-ink-muted mt-0.5">
              {(p.characters as Character[]).map(c => c.name).filter(Boolean).join(', ') || 'No characters yet'}
            </p>
          </div>
        ))}
        {parties.length === 0 && (
          <p className="text-sm text-ink-muted">No parties. Go through onboarding or add one below.</p>
        )}
      </div>
    </div>
  )
}

interface Character { name: string; class?: string; level?: number }
interface Party { id: string; name: string; characters: unknown[] }
