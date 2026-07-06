import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useState } from 'react'
import { CheckCircle, XCircle, Loader, Eye, EyeOff, Save, Plus, Trash2, Lock } from 'lucide-react'

type Provider = 'anthropic' | 'evolink'

function KeySection({ provider, label, hint }: { provider: Provider; label: string; hint: string }) {
  const qc = useQueryClient()
  const [key, setKey] = useState('')
  const [show, setShow] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saving' | 'validating' | 'valid' | 'invalid'>('idle')
  const [error, setError] = useState('')

  const { data: credsData } = useQuery({
    queryKey: ['credentials'],
    queryFn: () => api.get('/api/credentials').then(r => r.data),
  })
  const existingCred = credsData?.credentials?.find((c: { provider: string }) => c.provider === provider)

  async function save() {
    if (!key.trim()) return
    setStatus('saving')
    setError('')
    try {
      await api.put(`/api/credentials/${provider}`, { key })
      setStatus('validating')
      const { data } = await api.post(`/api/credentials/${provider}/validate`)
      setStatus(data.valid ? 'valid' : 'invalid')
      if (!data.valid) setError(data.error ?? 'Validation failed')
      else { setKey(''); qc.invalidateQueries({ queryKey: ['credentials'] }) }
    } catch (e) {
      setStatus('invalid')
      setError(apiError(e))
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label className="label mb-0">{label}</label>
        {existingCred && (
          <span className={`badge text-xs ${existingCred.status === 'valid' ? 'bg-green-500/10 text-green-500' : existingCred.status === 'invalid' ? 'bg-danger/10 text-danger' : 'bg-surface-2 text-ink-muted'}`}>
            {existingCred.status}
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            className="input pr-8"
            type={show ? 'text' : 'password'}
            value={key}
            onChange={e => { setKey(e.target.value); setStatus('idle') }}
            placeholder={existingCred ? '••••• (key on file — paste new to replace)' : 'Paste your API key…'}
          />
          <button className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink" onClick={() => setShow(v => !v)}>
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        <button className="btn-secondary" onClick={save} disabled={!key || status === 'saving' || status === 'validating'}>
          {status === 'saving' || status === 'validating' ? <Loader size={14} className="animate-spin" /> : 'Save & Test'}
        </button>
      </div>
      {status === 'valid' && <p className="text-xs text-green-500 flex items-center gap-1"><CheckCircle size={12} />Key is valid</p>}
      {status === 'invalid' && <p className="text-xs text-danger flex items-center gap-1"><XCircle size={12} />{error}</p>}
      <p className="text-xs text-ink-muted">{hint}</p>
    </div>
  )
}

interface StylePreset {
  id: string
  name: string
  promptFragment: string
  isBuiltin: boolean
}

function StylePresetsSection() {
  const qc = useQueryClient()
  const [newName, setNewName] = useState('')
  const [newFragment, setNewFragment] = useState('')
  const [createError, setCreateError] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['style-presets'],
    queryFn: () => api.get('/api/style-presets').then(r => r.data),
  })
  const presets: StylePreset[] = data?.presets ?? []

  const createMutation = useMutation({
    mutationFn: () => api.post('/api/style-presets', { name: newName.trim(), promptFragment: newFragment.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['style-presets'] })
      setNewName('')
      setNewFragment('')
      setCreateError('')
    },
    onError: (e) => setCreateError(apiError(e)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/style-presets/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['style-presets'] }),
  })

  const builtins = presets.filter(p => p.isBuiltin)
  const custom = presets.filter(p => !p.isBuiltin)

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="font-semibold text-ink">Art Style Presets</h2>
        <p className="text-xs text-ink-muted mt-0.5">
          Presets guide how the Art Director styles generated images. Built-ins are read-only.
        </p>
      </div>

      {isLoading && <p className="text-xs text-ink-muted">Loading…</p>}

      {builtins.length > 0 && (
        <div>
          <p className="label text-xs mb-2">Built-in</p>
          <div className="space-y-1">
            {builtins.map(p => (
              <div key={p.id} className="flex items-start gap-2 py-1.5 border-b border-border/50 last:border-0">
                <Lock size={11} className="text-ink-muted mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink">{p.name}</p>
                  <p className="text-xs text-ink-muted leading-relaxed truncate">{p.promptFragment}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {custom.length > 0 && (
        <div>
          <p className="label text-xs mb-2">Custom</p>
          <div className="space-y-1">
            {custom.map(p => (
              <div key={p.id} className="flex items-start gap-2 py-1.5 border-b border-border/50 last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink">{p.name}</p>
                  <p className="text-xs text-ink-muted leading-relaxed">{p.promptFragment}</p>
                </div>
                <button
                  className="btn-ghost p-1 text-danger shrink-0"
                  onClick={() => deleteMutation.mutate(p.id)}
                  disabled={deleteMutation.isPending}
                  title="Delete preset"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-border pt-4 space-y-2">
        <p className="label text-xs mb-2">Create custom preset</p>
        <input
          className="input text-sm"
          placeholder="Preset name (e.g. Comic book)"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          maxLength={60}
        />
        <textarea
          className="textarea text-sm"
          rows={2}
          placeholder="Prompt fragment appended to every generation with this style…"
          value={newFragment}
          onChange={e => setNewFragment(e.target.value)}
          maxLength={500}
        />
        {createError && <p className="text-xs text-danger">{createError}</p>}
        <button
          className="btn-secondary text-xs py-1.5 flex items-center gap-1"
          onClick={() => createMutation.mutate()}
          disabled={!newName.trim() || !newFragment.trim() || createMutation.isPending}
        >
          {createMutation.isPending ? <Loader size={12} className="animate-spin" /> : <Plus size={12} />}
          Add preset
        </button>
      </div>
    </div>
  )
}

const IMAGE_MODEL_OPTIONS = [
  { value: 'gpt-image-2',        label: 'High Detail — GPT Image 2' },
  { value: 'nano-banana-2-lite', label: 'Medium — Nano Banana 2 Lite' },
  { value: 'seedream-4.5',       label: 'Medium Alt — Seedream 4.5' },
  { value: 'z-image-turbo',      label: 'Low — Z Image Turbo' },
]

const IMAGE_CATEGORIES = [
  { key: 'npc',       label: 'NPC portraits' },
  { key: 'location',  label: 'Location images' },
  { key: 'item',      label: 'Item images' },
  { key: 'encounter', label: 'Encounter images' },
]

export default function SettingsPage() {
  const { data: meData } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get('/auth/me').then(r => r.data),
  })

  const { data: prefData, refetch: refetchPref } = useQuery({
    queryKey: ['preferences'],
    queryFn: () => api.get('/api/preferences').then(r => r.data),
  })

  const { data: credsData } = useQuery({
    queryKey: ['credentials'],
    queryFn: () => api.get('/api/credentials').then(r => r.data),
  })

  const hasEvolinkKey = credsData?.credentials?.some(
    (c: { provider: string; status: string }) => c.provider === 'evolink' && c.status === 'valid'
  )

  const qc = useQueryClient()
  const [displayName, setDisplayName] = useState(meData?.user?.displayName ?? '')
  const [textModel, setTextModel] = useState(meData?.user?.preference?.defaultTextModel ?? 'claude-opus-4-5')
  const [contentRating, setContentRating] = useState(meData?.user?.preference?.contentRating ?? 'standard')

  const storedImageModels: Record<string, string> = prefData?.preference?.imageModelByCategory ?? {}
  const [imageModelByCategory, setImageModelByCategory] = useState<Record<string, string>>(storedImageModels)

  const updatePref = useMutation({
    mutationFn: () => api.patch('/api/preferences', { defaultTextModel: textModel, contentRating }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  })

  const updateImageModels = useMutation({
    mutationFn: (models: Record<string, string>) => api.patch('/api/preferences', { imageModelByCategory: models }),
    onSuccess: () => refetchPref(),
  })

  const { data: usageData } = useQuery({
    queryKey: ['usage'],
    queryFn: () => api.get('/api/generate/usage').then(r => r.data),
  })

  const jobs = usageData?.jobs ?? []
  const totalTokens = jobs.reduce((sum: number, j: { tokensOrUnits: { output?: number } }) => sum + (j.tokensOrUnits?.output ?? 0), 0)

  function handleImageModelChange(category: string, model: string) {
    const updated = { ...imageModelByCategory, [category]: model }
    setImageModelByCategory(updated)
    updateImageModels.mutate(updated)
  }

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <h1 className="display-font text-3xl font-bold text-ink">Settings</h1>

      {/* API Keys */}
      <div className="card space-y-5">
        <h2 className="font-semibold text-ink">API Keys</h2>
        <p className="text-sm text-ink-muted">Keys are encrypted with AES-256-GCM and never sent to your browser after entry.</p>
        <KeySection
          provider="anthropic"
          label="Anthropic (Claude)"
          hint="Required for text generation when no Evolink key is set. Get your key at console.anthropic.com"
        />
        <div className="border-t border-border" />
        <KeySection
          provider="evolink"
          label="EvoLink"
          hint="Used for Claude text generation (fallback) and all image generation. Get your key at evolink.ai"
        />
      </div>

      {/* Generation prefs */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-ink">Generation Preferences</h2>

        <div>
          <label className="label">Default Claude model</label>
          <select className="input" value={textModel} onChange={e => setTextModel(e.target.value)}>
            <option value="claude-opus-4-5">Claude Opus (best quality)</option>
            <option value="claude-sonnet-4-5">Claude Sonnet (faster, cheaper)</option>
            <option value="claude-haiku-4-5">Claude Haiku (fastest)</option>
          </select>
        </div>

        <div>
          <label className="label">Content rating</label>
          <select className="input" value={contentRating} onChange={e => setContentRating(e.target.value)}>
            <option value="family">Family — all ages appropriate</option>
            <option value="standard">Standard — moderate adventure fare</option>
            <option value="grim">Grim — mature themes permitted</option>
          </select>
        </div>

        <button className="btn-primary" onClick={() => updatePref.mutate()} disabled={updatePref.isPending}>
          {updatePref.isPending ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
          Save preferences
        </button>
        {updatePref.isSuccess && <p className="text-xs text-green-500">✓ Saved</p>}
      </div>

      {/* Style Presets */}
      <StylePresetsSection />

      {/* Image Generation */}
      <div className="card space-y-4">
        <div>
          <h2 className="font-semibold text-ink">Image Generation</h2>
          <p className="text-sm text-ink-muted mt-1">
            Choose an image quality tier per entity category. Requires an Evolink key.
            {!hasEvolinkKey && <span className="text-amber-500 ml-1">Add an Evolink key above to enable image generation.</span>}
          </p>
        </div>
        <div className="space-y-3">
          {IMAGE_CATEGORIES.map(cat => (
            <div key={cat.key} className="flex items-center justify-between gap-4">
              <label className="label mb-0 min-w-[130px]">{cat.label}</label>
              <select
                className="input flex-1"
                value={imageModelByCategory[cat.key] ?? 'nano-banana-2-lite'}
                onChange={e => handleImageModelChange(cat.key, e.target.value)}
                disabled={!hasEvolinkKey}
              >
                {IMAGE_MODEL_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
        {updateImageModels.isSuccess && <p className="text-xs text-green-500">✓ Image preferences saved</p>}
      </div>

      {/* Usage */}
      <div className="card space-y-3">
        <h2 className="font-semibold text-ink">Usage</h2>
        <div className="flex gap-4 text-sm">
          <div>
            <p className="text-ink-muted text-xs label">Total generations</p>
            <p className="font-bold text-ink display-font text-xl">{jobs.length}</p>
          </div>
          <div>
            <p className="text-ink-muted text-xs label">Output tokens</p>
            <p className="font-bold text-ink display-font text-xl">{totalTokens.toLocaleString()}</p>
          </div>
        </div>
        {jobs.length > 0 && (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {jobs.slice(0, 20).map((j: { provider: string; kind: string; tokensOrUnits: { input?: number; output?: number }; createdAt: string }, i: number) => (
              <div key={i} className="flex items-center justify-between text-xs text-ink-muted py-1 border-b border-border/50">
                <span className="capitalize">{j.kind}</span>
                <span>{j.tokensOrUnits?.input ?? 0} in / {j.tokensOrUnits?.output ?? 0} out</span>
                <span>{new Date(j.createdAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
