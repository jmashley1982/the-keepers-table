import { useState, useRef, useEffect } from 'react'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { X, Zap, Loader, RefreshCw, CheckCircle2, Image, Skull, PlusCircle, Copy } from 'lucide-react'
import { useJobStatus } from '../../lib/useJobStatus'

type TextKind = 'auto' | 'npc' | 'encounter' | 'treasure' | 'location' | 'foe'
type Kind = TextKind | 'image' | 'note'
type Quality = 'low' | 'med' | 'high'
type SaveKind = 'npc' | 'encounter' | 'location' | 'treasure' | 'foe'

const TEXT_KIND_MAP: Record<TextKind, string> = {
  auto: 'quick', npc: 'npc', encounter: 'encounter',
  treasure: 'treasure', location: 'location', foe: 'enemy',
}

const QUALITY_MODELS: Record<Quality, string> = {
  low: 'flux-dev',
  med: 'nano-banana-2',
  high: 'nano-banana-pro',
}

const QUALITY_META: Record<Quality, string> = {
  low: 'Fast · ~$0.02',
  med: 'Balanced · ~$0.03',
  high: 'Best · ~$0.06',
}

const CHIPS: { kind: Kind; label: string; emoji: string }[] = [
  { kind: 'auto',      label: 'Auto',      emoji: '✨' },
  { kind: 'npc',       label: 'NPC',       emoji: '🧙' },
  { kind: 'encounter', label: 'Encounter', emoji: '⚔️' },
  { kind: 'treasure',  label: 'Treasure',  emoji: '💎' },
  { kind: 'location',  label: 'Location',  emoji: '🗺️' },
  { kind: 'foe',       label: 'Foe',       emoji: '💀' },
  { kind: 'image',     label: 'Image',     emoji: '🎨' },
  { kind: 'note',      label: 'Note',      emoji: '📝' },
]

const PLACEHOLDERS: Record<Kind, string> = {
  auto:      'Describe anything… "ambush near the old mill"',
  npc:       'Describe an NPC… "gruff dwarven blacksmith with a secret"',
  encounter: 'Describe an encounter… "undead skeletons guarding a crypt"',
  treasure:  'Describe loot… "reward for saving the village"',
  location:  'Describe a place… "ancient elven library"',
  foe:       'Describe a foe… "ancient vampire lord with a tragic past"',
  image:     'Describe the image… "misty forest at dawn, ancient ruins"',
  note:      'Jot down a quick thought…',
}

const SAVE_CONFIG: Record<SaveKind, { route: string; label: string; extra?: Record<string, string> }> = {
  npc:       { route: 'npcs',       label: 'Add to NPCs' },
  encounter: { route: 'encounters', label: 'Add to Encounters' },
  location:  { route: 'locations',  label: 'Add to Locations' },
  treasure:  { route: 'items',      label: 'Add to Loot', extra: { category: 'Treasure' } },
  foe:       { route: 'npcs',       label: 'Add to Foes', extra: { role: 'Foe' } },
}

const AUTO_SAVE_KINDS: SaveKind[] = ['npc', 'encounter', 'location', 'treasure', 'foe']
const AUTO_SAVE_LABELS: Record<SaveKind, string> = {
  npc: 'NPC', encounter: 'Encounter', location: 'Location', treasure: 'Loot', foe: 'Foe',
}

function extractEntityName(text: string, fallback = 'Generated Entry'): string {
  const nameLine = text.split('\n').find(l => /^name[:\s]/i.test(l.trim()))
  if (nameLine) return nameLine.replace(/^name[:\s]+/i, '').trim().slice(0, 80) || fallback
  return text.split('\n').find(l => l.trim())?.trim().slice(0, 80) || fallback
}

function flattenToText(val: unknown, depth = 0): string {
  if (val === null || val === undefined || val === '') return ''
  if (typeof val === 'string') return val.trim()
  if (typeof val === 'number' || typeof val === 'boolean') return String(val)
  if (Array.isArray(val)) {
    return val.map(item => {
      const t = flattenToText(item, depth + 1)
      return t ? `• ${t}` : ''
    }).filter(Boolean).join('\n')
  }
  if (typeof val === 'object') {
    return Object.entries(val as Record<string, unknown>)
      .map(([key, v]) => {
        const text = flattenToText(v, depth + 1)
        if (!text) return ''
        const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        const isNested = typeof v === 'object' && v !== null
        return isNested ? `${label}:\n${text}` : `${label}: ${text}`
      })
      .filter(Boolean)
      .join('\n\n')
  }
  return ''
}

export default function QuickGenerate({ onClose, campaignId }: { onClose: () => void; campaignId?: string }) {
  const [prompt, setPrompt]     = useState('')
  const [kind, setKind]         = useState<Kind>('auto')
  const [quality, setQuality]   = useState<Quality>('med')
  const [busy, setBusy]         = useState(false)
  const [streamText, setStreamText] = useState('')
  const [result, setResult]     = useState<string | null>(null)
  const [imageJobId, setImageJobId] = useState<string | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const [saveMsg, setSaveMsg]   = useState<{ text: string; ok: boolean } | null>(null)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const noteRef = useRef<HTMLTextAreaElement>(null)

  const imageStatus = useJobStatus(imageJobId)

  useEffect(() => {
    if (!campaignId) return
    api.get(`/api/campaigns/${campaignId}/sessions/active`)
      .then(r => setActiveSessionId(r.data.session.id))
      .catch(() => setActiveSessionId(null))
  }, [campaignId])

  useEffect(() => {
    if (!campaignId) return
    if (kind === 'note') noteRef.current?.focus()
    else inputRef.current?.focus()
  }, [campaignId, kind])

  function handleKindChange(k: Kind) {
    setKind(k)
    setResult(null)
    setStreamText('')
    setImageJobId(null)
    setSaveMsg(null)
    setError(null)
  }

  async function generate() {
    if (!prompt.trim() || busy || kind === 'note') return
    setBusy(true)
    setError(null)
    setResult(null)
    setStreamText('')
    setSaveMsg(null)
    setImageJobId(null)

    try {
      if (kind === 'image') {
        if (!campaignId) { setError('Open a campaign to generate images'); return }
        const model = QUALITY_MODELS[quality]
        const { data } = await api.post<{ jobId: string }>('/api/generate/quick-image', {
          prompt, campaignId, model,
        })
        setImageJobId(data.jobId)
        return
      }

      const effectiveKind = TEXT_KIND_MAP[kind as TextKind] ?? 'quick'
      const response = await fetch('/api/generate/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ kind: effectiveKind, prompt, campaignId, stream: true }),
      })

      if (!response.ok) {
        const err = await response.json() as { error?: string }
        throw new Error(err.error ?? 'Generation failed')
      }

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let fullText = ''
      let parsedResult: unknown = undefined

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue
          let data: Record<string, unknown>
          try { data = JSON.parse(line.slice(6)) } catch { continue }
          if (typeof data.text === 'string') { fullText += data.text; setStreamText(s => s + data.text) }
          if (data.result !== undefined) parsedResult = data.result
          if (data.error) throw new Error(String(data.error))
        }
      }

      const displayText = parsedResult && typeof parsedResult === 'object'
        ? flattenToText(parsedResult)
        : fullText
      setResult(displayText || fullText)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setBusy(false)
      setStreamText('')
    }
  }

  async function saveToEntity(saveKind: SaveKind) {
    if (!campaignId || !result) return
    setSaveMsg(null)
    try {
      const { route, extra } = SAVE_CONFIG[saveKind]
      const name = extractEntityName(result)
      await api.post(`/api/entities/${campaignId}/${route}`, {
        name,
        description: result,
        ...extra,
      })
      setSaveMsg({ text: `Saved to ${SAVE_CONFIG[saveKind].label.replace('Add to ', '')}!`, ok: true })
    } catch {
      setSaveMsg({ text: 'Failed to save', ok: false })
    }
  }

  async function addToSessionNotes() {
    if (!campaignId || !activeSessionId || !prompt.trim()) return
    setSaveMsg(null)
    try {
      await api.post(`/api/campaigns/${campaignId}/sessions/${activeSessionId}/notes/append`, {
        text: prompt.trim(),
      })
      setSaveMsg({ text: 'Added to session notes', ok: true })
      setPrompt('')
    } catch (err) {
      setSaveMsg({ text: err instanceof Error ? err.message : 'Failed to add', ok: false })
    }
  }

  async function copyNote() {
    if (!prompt.trim()) return
    try {
      await navigator.clipboard.writeText(prompt)
      setSaveMsg({ text: 'Copied to clipboard', ok: true })
    } catch {
      setSaveMsg({ text: 'Failed to copy', ok: false })
    }
  }

  const isTextKind = kind !== 'image' && kind !== 'note'
  const saveKind = kind !== 'auto' && kind !== 'image' && kind !== 'note' ? (kind as SaveKind) : null

  const imageLoading = imageJobId && imageStatus.status !== 'succeeded' && imageStatus.status !== 'failed'
  const imageReady   = imageJobId && imageStatus.status === 'succeeded' && imageStatus.assetId

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-xl mx-4 animate-fade-in">
        {/* No-campaign gate */}
        {!campaignId && (
          <div className="card shadow-2xl border-border/80 text-center py-8 px-6 space-y-3">
            <p className="text-2xl">🗺️</p>
            <p className="font-semibold text-ink">Open a campaign first</p>
            <p className="text-sm text-ink-muted">
              Quick Generate needs a campaign context — open one from the sidebar, then try again.
            </p>
            <button className="btn-primary mt-2" onClick={onClose}>Got it</button>
          </div>
        )}

        {campaignId && <div className="card shadow-2xl border-border/80">

          {/* Kind chips */}
          <div className="flex gap-1.5 mb-3 flex-wrap">
            {CHIPS.map(c => (
              <button
                key={c.kind}
                onClick={() => handleKindChange(c.kind)}
                className={cn(
                  'px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                  kind === c.kind
                    ? 'bg-accent text-white'
                    : 'bg-surface-2 text-ink-muted hover:text-ink',
                )}
              >
                {c.emoji} {c.label}
              </button>
            ))}
          </div>

          {/* Note mode */}
          {kind === 'note' && (
            <>
              <textarea
                ref={noteRef}
                className="input w-full min-h-[120px] resize-none"
                placeholder={PLACEHOLDERS.note}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
              />
              <div className="flex flex-wrap items-center gap-2 mt-3">
                {activeSessionId && (
                  <button
                    className="btn-ghost text-xs flex items-center gap-1.5 px-2.5 py-1.5 text-accent border border-accent/30"
                    onClick={addToSessionNotes}
                    disabled={!prompt.trim()}
                  >
                    <PlusCircle size={12} /> Add to session notes
                  </button>
                )}
                <button
                  className="btn-ghost text-xs flex items-center gap-1.5 px-2.5 py-1.5"
                  onClick={copyNote}
                  disabled={!prompt.trim()}
                >
                  <Copy size={12} /> Copy
                </button>
                <button className="btn-ghost p-2 ml-auto" onClick={onClose}>
                  <X size={16} />
                </button>
              </div>
              {!activeSessionId && (
                <p className="text-xs text-ink-muted mt-2">No active session to append to.</p>
              )}
              {saveMsg && (
                <p className={cn(
                  'text-xs flex items-center gap-1 mt-2',
                  saveMsg.ok ? 'text-green-400' : 'text-danger',
                )}>
                  {saveMsg.ok && <CheckCircle2 size={12} />}
                  {saveMsg.text}
                </p>
              )}
            </>
          )}

          {/* AI generation modes */}
          {kind !== 'note' && (
            <>
              {/* Quality selector — image only */}
              {kind === 'image' && (
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs text-ink-muted shrink-0">Quality:</span>
                  {(['low', 'med', 'high'] as Quality[]).map(q => (
                    <button
                      key={q}
                      onClick={() => setQuality(q)}
                      className={cn(
                        'px-2.5 py-1 rounded-full text-xs font-medium transition-colors capitalize',
                        quality === q
                          ? 'bg-accent/80 text-white'
                          : 'bg-surface-2 text-ink-muted hover:text-ink',
                      )}
                    >
                      {q}
                    </button>
                  ))}
                  <span className="text-[10px] text-ink-muted ml-auto">{QUALITY_META[quality]}</span>
                </div>
              )}

              {/* Input row */}
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  className="input flex-1"
                  placeholder={PLACEHOLDERS[kind]}
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && generate()}
                />
                <button
                  className="btn-primary px-3"
                  onClick={generate}
                  disabled={!prompt.trim() || busy}
                >
                  {busy
                    ? <Loader size={16} className="animate-spin" />
                    : kind === 'image' ? <Image size={16} /> : <Zap size={16} />}
                </button>
                <button className="btn-ghost p-2" onClick={onClose}>
                  <X size={16} />
                </button>
              </div>

              {/* Error */}
              {error && <p className="text-xs text-danger mt-2">{error}</p>}

              {/* Streaming preview */}
              {busy && isTextKind && streamText && (
                <div className="mt-3 p-3 bg-surface-2 rounded-card">
                  <p className="text-xs text-ink-muted leading-relaxed line-clamp-3 streaming-cursor">
                    {streamText}
                  </p>
                </div>
              )}

              {/* Text result */}
              {result && (
                <div className="mt-3 space-y-2">
                  <div className="p-3 bg-surface-2 rounded-card max-h-64 overflow-y-auto">
                    <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{result}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Regen */}
                    <button
                      className="btn-ghost text-xs flex items-center gap-1.5 px-2.5 py-1.5"
                      onClick={generate}
                      disabled={busy}
                    >
                      <RefreshCw size={12} /> Regen
                    </button>

                    {/* Specific kind: single save button */}
                    {saveKind && (
                      <button
                        className="btn-ghost text-xs flex items-center gap-1.5 px-2.5 py-1.5 text-accent border border-accent/30"
                        onClick={() => saveToEntity(saveKind)}
                        disabled={busy}
                      >
                        <PlusCircle size={12} /> {SAVE_CONFIG[saveKind].label}
                      </button>
                    )}

                    {/* Auto: multi-save chips */}
                    {kind === 'auto' && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] text-ink-muted">Save as:</span>
                        {AUTO_SAVE_KINDS.map(sk => (
                          <button
                            key={sk}
                            className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-surface-2 text-ink-muted hover:text-accent hover:bg-accent/10 transition-colors border border-transparent hover:border-accent/20"
                            onClick={() => saveToEntity(sk)}
                            disabled={busy}
                          >
                            {AUTO_SAVE_LABELS[sk]}
                          </button>
                        ))}
                      </div>
                    )}

                    {saveMsg && (
                      <span className={cn(
                        'text-xs flex items-center gap-1',
                        saveMsg.ok ? 'text-green-400' : 'text-danger',
                      )}>
                        {saveMsg.ok && <CheckCircle2 size={12} />}
                        {saveMsg.text}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Image gen status / result */}
              {imageJobId && (
                <div className="mt-3">
                  {imageLoading && (
                    <div className="flex items-center gap-2 text-sm text-ink-muted p-3 bg-surface-2 rounded-card">
                      <Loader size={14} className="animate-spin" />
                      Generating image…
                    </div>
                  )}

                  {imageStatus.status === 'failed' && (
                    <p className="text-xs text-danger p-3">
                      {imageStatus.errorMessage ?? 'Image generation failed'}
                    </p>
                  )}

                  {imageReady && (
                    <div className="space-y-2">
                      <img
                        src={`/api/assets/${imageStatus.assetId}?size=full`}
                        className="w-full rounded-card"
                        alt="Generated image"
                      />
                      <button
                        className="btn-ghost text-xs flex items-center gap-1.5 px-2.5 py-1.5"
                        onClick={() => { setImageJobId(null); generate() }}
                        disabled={busy}
                      >
                        <RefreshCw size={12} /> Regen
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

        </div>}
      </div>
    </div>
  )
}
