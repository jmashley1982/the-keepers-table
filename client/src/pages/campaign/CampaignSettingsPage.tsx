import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { useState } from 'react'
import { Save, Loader, Plus, Trash2 } from 'lucide-react'

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

  const campaign = campData?.campaign
  const templates = templatesData?.templates ?? []

  const [name, setName] = useState<string | null>(null)
  const [settingNotes, setSettingNotes] = useState<string | null>(null)
  const [templateId, setTemplateId] = useState<string | null>(null)

  const effectiveName = name ?? (campaign?.name ?? '')
  const effectiveSettingNotes = settingNotes ?? (campaign?.settingNotes ?? '')
  const effectiveTemplateId = templateId ?? (campaign?.systemTemplateId ?? '')

  const update = useMutation({
    mutationFn: () => api.patch(`/api/campaigns/${campaignId}`, { name: effectiveName, settingNotes: effectiveSettingNotes, systemTemplateId: effectiveTemplateId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaign', campaignId] }),
  })

  // Party management
  const { data: partiesData } = useQuery({
    queryKey: ['parties', campaignId],
    queryFn: () => api.get(`/api/campaigns/${campaignId}/parties`).then(r => r.data),
    enabled: !!campaignId,
  })
  const parties = partiesData?.parties ?? []

  if (!campaign) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
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
            placeholder="World premise, tone, homebrew rules — always in Claude's context…"
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

      {/* Parties */}
      <div className="card space-y-3">
        <h2 className="font-semibold text-ink">Parties</h2>
        {parties.map((p: Party) => (
          <div key={p.id} className="p-3 bg-surface-2 rounded-card">
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
