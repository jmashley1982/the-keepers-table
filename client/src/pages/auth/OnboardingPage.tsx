import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { CheckCircle, XCircle, Loader, ChevronRight, ChevronLeft, Plus, Trash2 } from 'lucide-react'

type Step = 'keys' | 'campaign' | 'party'

interface Character {
  name: string
  class: string
  level: number
  playerName: string
}

export default function OnboardingPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [step, setStep] = useState<Step>('keys')

  // API Keys step
  const [anthropicKey, setAnthropicKey] = useState('')
  const [keyStatus, setKeyStatus] = useState<'idle' | 'saving' | 'validating' | 'valid' | 'invalid'>('idle')
  const [keyError, setKeyError] = useState('')

  // Campaign step
  const [campaignName, setCampaignName] = useState('')
  const [settingNotes, setSettingNotes] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [campaignId, setCampaignId] = useState('')

  // Party step
  const [partyName, setPartyName] = useState('The Party')
  const [characters, setCharacters] = useState<Character[]>([
    { name: '', class: '', level: 1, playerName: '' }
  ])

  const { data: templatesData } = useQuery({
    queryKey: ['system-templates'],
    queryFn: () => api.get('/api/system-templates').then(r => r.data),
  })
  const templates = templatesData?.templates ?? []

  async function saveAnthropicKey() {
    if (!anthropicKey.trim()) return
    setKeyStatus('saving')
    setKeyError('')
    try {
      await api.put('/api/credentials/anthropic', { key: anthropicKey })
      setKeyStatus('validating')
      const { data } = await api.post('/api/credentials/anthropic/validate')
      setKeyStatus(data.valid ? 'valid' : 'invalid')
      if (!data.valid) setKeyError(data.error ?? 'Key validation failed')
    } catch (e) {
      setKeyStatus('invalid')
      setKeyError(apiError(e))
    }
  }

  async function createCampaign() {
    try {
      const { data } = await api.post('/api/campaigns', {
        name: campaignName,
        systemTemplateId: templateId,
        settingNotes,
      })
      setCampaignId(data.campaign.id)
      setStep('party')
    } catch (e) {
      alert(apiError(e))
    }
  }

  async function createParty() {
    try {
      await api.post(`/api/campaigns/${campaignId}/parties`, {
        name: partyName,
        characters: characters.filter(c => c.name),
      })
      qc.invalidateQueries({ queryKey: ['campaigns'] })
      navigate(`/campaign/${campaignId}`)
    } catch (e) {
      alert(apiError(e))
    }
  }

  const KeyIcon = keyStatus === 'valid' ? CheckCircle : keyStatus === 'invalid' ? XCircle : keyStatus === 'saving' || keyStatus === 'validating' ? Loader : null

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-8 justify-center">
          {(['keys', 'campaign', 'party'] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${step === s ? 'bg-accent text-white' : ['keys', 'campaign', 'party'].indexOf(s) < ['keys', 'campaign', 'party'].indexOf(step) ? 'bg-accent/30 text-accent' : 'bg-surface-2 text-ink-muted'}`}>
                {i + 1}
              </div>
              {i < 2 && <div className="w-8 h-px bg-border" />}
            </div>
          ))}
        </div>

        {/* Step: API Keys */}
        {step === 'keys' && (
          <div className="card space-y-5 animate-fade-in">
            <div>
              <h2 className="display-font text-2xl font-bold text-ink">Connect your AI</h2>
              <p className="text-ink-muted text-sm mt-1">The Keeper's Table uses your own API keys — you control your spend.</p>
            </div>

            <div>
              <label className="label">Anthropic API Key (required for text generation)</label>
              <div className="flex gap-2">
                <input
                  className="input flex-1"
                  type="password"
                  value={anthropicKey}
                  onChange={e => { setAnthropicKey(e.target.value); setKeyStatus('idle') }}
                  placeholder="sk-ant-..."
                />
                <button
                  className="btn-secondary"
                  onClick={saveAnthropicKey}
                  disabled={!anthropicKey || keyStatus === 'saving' || keyStatus === 'validating'}
                >
                  {keyStatus === 'saving' || keyStatus === 'validating' ? (
                    <Loader size={14} className="animate-spin" />
                  ) : 'Test'}
                </button>
              </div>
              {keyStatus === 'valid' && (
                <p className="text-xs text-green-500 mt-1 flex items-center gap-1"><CheckCircle size={12} /> Key is valid — you're connected.</p>
              )}
              {keyStatus === 'invalid' && (
                <p className="text-xs text-danger mt-1 flex items-center gap-1"><XCircle size={12} /> {keyError}</p>
              )}
              <p className="text-xs text-ink-muted mt-2">
                Get your key at <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">console.anthropic.com</a>. Keys are encrypted at rest and never sent to your browser.
              </p>
            </div>

            <div className="flex justify-between pt-2">
              <button className="btn-ghost text-ink-muted" onClick={() => setStep('campaign')}>
                Skip for now
              </button>
              <button
                className="btn-primary"
                onClick={() => setStep('campaign')}
                disabled={keyStatus !== 'valid' && anthropicKey !== ''}
              >
                Continue <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Step: Campaign */}
        {step === 'campaign' && (
          <div className="card space-y-5 animate-fade-in">
            <div>
              <h2 className="display-font text-2xl font-bold text-ink">Your first campaign</h2>
              <p className="text-ink-muted text-sm mt-1">You can create more campaigns anytime.</p>
            </div>

            <div>
              <label className="label">Campaign name</label>
              <input className="input" value={campaignName} onChange={e => setCampaignName(e.target.value)} placeholder="e.g. Curse of Strahd" autoFocus />
            </div>

            <div>
              <label className="label">Game system</label>
              <select
                className="input"
                value={templateId}
                onChange={e => setTemplateId(e.target.value)}
              >
                <option value="">Select a system…</option>
                {templates.map((t: { id: string; name: string }) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Setting notes <span className="normal-case font-normal text-ink-muted">(optional but recommended)</span></label>
              <textarea
                className="textarea h-28"
                value={settingNotes}
                onChange={e => setSettingNotes(e.target.value)}
                placeholder="World premise, tone, important homebrew rules, anything Claude should always know about your world…"
              />
            </div>

            <div className="flex justify-between pt-2">
              <button className="btn-ghost" onClick={() => setStep('keys')}>
                <ChevronLeft size={16} /> Back
              </button>
              <button
                className="btn-primary"
                onClick={createCampaign}
                disabled={!campaignName || !templateId}
              >
                Create campaign <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Step: Party */}
        {step === 'party' && (
          <div className="card space-y-5 animate-fade-in">
            <div>
              <h2 className="display-font text-2xl font-bold text-ink">Your party</h2>
              <p className="text-ink-muted text-sm mt-1">Claude uses party info to tailor generated content. You can edit this anytime.</p>
            </div>

            <div>
              <label className="label">Party name</label>
              <input className="input" value={partyName} onChange={e => setPartyName(e.target.value)} />
            </div>

            <div className="space-y-2">
              <label className="label">Characters</label>
              {characters.map((c, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <div className="grid grid-cols-2 gap-2 flex-1">
                    <input className="input text-xs" placeholder="Character name" value={c.name} onChange={e => setCharacters(cs => cs.map((ch, j) => j === i ? { ...ch, name: e.target.value } : ch))} />
                    <input className="input text-xs" placeholder="Class" value={c.class} onChange={e => setCharacters(cs => cs.map((ch, j) => j === i ? { ...ch, class: e.target.value } : ch))} />
                    <input className="input text-xs" placeholder="Player name" value={c.playerName} onChange={e => setCharacters(cs => cs.map((ch, j) => j === i ? { ...ch, playerName: e.target.value } : ch))} />
                    <input className="input text-xs" type="number" placeholder="Level" value={c.level} onChange={e => setCharacters(cs => cs.map((ch, j) => j === i ? { ...ch, level: Number(e.target.value) } : ch))} />
                  </div>
                  <button className="btn-ghost p-1 text-ink-muted hover:text-danger" onClick={() => setCharacters(cs => cs.filter((_, j) => j !== i))}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button
                className="btn-ghost text-sm"
                onClick={() => setCharacters(cs => [...cs, { name: '', class: '', level: 1, playerName: '' }])}
              >
                <Plus size={14} /> Add character
              </button>
            </div>

            <div className="flex justify-between pt-2">
              <button className="btn-ghost" onClick={() => setStep('campaign')}>
                <ChevronLeft size={16} /> Back
              </button>
              <button className="btn-primary" onClick={createParty}>
                Enter the campaign <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
