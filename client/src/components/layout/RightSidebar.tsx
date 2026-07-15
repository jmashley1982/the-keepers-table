import { useState, useRef, useEffect } from 'react'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { useUIStore } from '../../store/useUIStore'
import { useJobStatus } from '../../lib/useJobStatus'
import {
  ChevronLeft, ChevronRight, Wand2, User, Swords, Package,
  MapPin, MessageSquare, Image as ImageIcon, Loader,
  RefreshCw, BookOpen, CheckCircle2, Zap, type LucideIcon,
} from 'lucide-react'

type TextKind = 'auto' | 'npc' | 'encounter' | 'treasure' | 'location' | 'dialogue'
type Kind = TextKind | 'image'
type Quality = 'low' | 'med' | 'high'

interface SessionSummary {
  id: string
  sessionNumber: number
  status: string
  dmRawNotes: string | null
}

const TEXT_KIND_MAP: Record<TextKind, string> = {
  auto: 'quick', npc: 'npc', encounter: 'encounter',
  treasure: 'treasure', location: 'location', dialogue: 'dialogue',
}

const QUALITY_MODELS: Record<Quality, string> = {
  low: 'flux-dev', med: 'nano-banana-2', high: 'nano-banana-pro',
}

interface KindDef { kind: Kind; label: string; Icon: LucideIcon }
const KINDS: KindDef[] = [
  { kind: 'auto',      label: 'Auto',      Icon: Wand2 },
  { kind: 'npc',       label: 'NPC',       Icon: User },
  { kind: 'encounter', label: 'Encounter', Icon: Swords },
  { kind: 'treasure',  label: 'Treasure',  Icon: Package },
  { kind: 'location',  label: 'Location',  Icon: MapPin },
  { kind: 'dialogue',  label: 'Dialogue',  Icon: MessageSquare },
  { kind: 'image',     label: 'Image',     Icon: ImageIcon },
]

const PLACEHOLDERS: Record<Kind, string> = {
  auto:      'Describe anything…',
  npc:       'Gruff dwarven blacksmith with a secret…',
  encounter: 'Undead skeletons guarding a crypt…',
  treasure:  'Reward for saving the village…',
  location:  'Ancient elven library…',
  dialogue:  'Tavern keeper reacts to the party…',
  image:     'Misty forest at dawn, ancient ruins…',
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

export default function RightSidebar({ campaignId }: { campaignId?: string }) {
  const { rightSidebarCollapsed, setRightSidebarCollapsed } = useUIStore()

  const [kind, setKind]             = useState<Kind>('npc')
  const [prompt, setPrompt]         = useState('')
  const [quality, setQuality]       = useState<Quality>('med')
  const [busy, setBusy]             = useState(false)
  const [streamText, setStreamText] = useState('')
  const [result, setResult]         = useState<string | null>(null)
  const [imageJobId, setImageJobId] = useState<string | null>(null)
  const [error, setError]           = useState<string | null>(null)
  const [sessionMsg, setSessionMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const imageStatus = useJobStatus(imageJobId)

  useEffect(() => {
    if (!rightSidebarCollapsed) inputRef.current?.focus()
  }, [rightSidebarCollapsed, kind])

  function selectKind(k: Kind) {
    setKind(k)
    setResult(null)
    setStreamText('')
    setImageJobId(null)
    setSessionMsg(null)
    setError(null)
    if (rightSidebarCollapsed) setRightSidebarCollapsed(false)
  }

  async function generate() {
    if (!prompt.trim() || busy || !campaignId) return
    setBusy(true)
    setError(null)
    setResult(null)
    setStreamText('')
    setSessionMsg(null)
    setImageJobId(null)

    try {
      if (kind === 'image') {
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
          if (typeof data.text === 'string') {
            const piece = data.text
            fullText += piece
            setStreamText(prev => prev + piece)
          }
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

  async function addToSession() {
    if (!campaignId || !result) return
    setSessionMsg(null)
    try {
      const { data } = await api.get<{ sessions: SessionSummary[] }>(`/api/campaigns/${campaignId}/sessions`)
      const sessions = data.sessions
      const target = sessions.find(s => s.status === 'in_progress') ?? sessions[0]
      if (!target) { setSessionMsg({ text: 'No session found', ok: false }); return }
      const kindLabel = KINDS.find(k => k.kind === kind)?.label ?? 'Quick Gen'
      const append = `\n\n[${kindLabel} — Quick Gen]\n${result}`
      await api.patch(`/api/campaigns/${campaignId}/sessions/${target.id}`, {
        dmRawNotes: (target.dmRawNotes ?? '') + append,
      })
      setSessionMsg({ text: `Added to Session #${target.sessionNumber}`, ok: true })
    } catch {
      setSessionMsg({ text: 'Failed to save', ok: false })
    }
  }

  const imageLoading = imageJobId && imageStatus.status !== 'succeeded' && imageStatus.status !== 'failed'
  const imageReady   = imageJobId && imageStatus.status === 'succeeded' && imageStatus.assetId

  if (!campaignId) return null

  return (
    <aside
      className={cn(
        'hidden md:flex flex-col h-full flex-shrink-0 relative transition-all duration-200',
        rightSidebarCollapsed ? 'w-10' : 'w-64',
      )}
      style={{
        background: 'linear-gradient(180deg, var(--color-surface) 0%, color-mix(in srgb, var(--color-surface) 95%, var(--color-bg)) 100%)',
        borderLeft: '1px solid var(--color-border)',
      }}
    >
      {/* Toggle button — left edge */}
      <button
        onClick={() => setRightSidebarCollapsed(!rightSidebarCollapsed)}
        title={rightSidebarCollapsed ? 'Open Quick Generate' : 'Collapse panel'}
        className="absolute -left-3 top-4 w-6 h-6 rounded-full border border-border bg-surface flex items-center justify-center text-ink-muted hover:text-ink transition-colors z-20 shadow-sm"
      >
        {rightSidebarCollapsed
          ? <ChevronLeft size={11} />
          : <ChevronRight size={11} />}
      </button>

      {/* Collapsed: icon strip */}
      {rightSidebarCollapsed && (
        <div className="flex flex-col items-center gap-1 pt-12 px-1">
          {KINDS.map(({ kind: k, label, Icon }) => (
            <button
              key={k}
              title={label}
              onClick={() => selectKind(k)}
              className={cn(
                'w-8 h-8 rounded-card flex items-center justify-center transition-colors text-ink-muted hover:text-ink hover:bg-white/10',
                kind === k && 'text-accent bg-accent/10',
              )}
            >
              <Icon size={15} />
            </button>
          ))}
        </div>
      )}

      {/* Expanded: full panel */}
      {!rightSidebarCollapsed && (
        <div className="flex flex-col h-full overflow-hidden">
          {/* Header */}
          <div className="px-3 pt-3 pb-2 border-b border-border flex items-center gap-2 shrink-0">
            <Zap size={13} style={{ color: 'var(--color-accent)' }} />
            <span className="text-xs font-semibold text-ink">Quick Generate</span>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-2 py-2 flex flex-col gap-3">

            {/* Kind buttons */}
            <div className="grid grid-cols-2 gap-1">
              {KINDS.map(({ kind: k, label, Icon }) => (
                <button
                  key={k}
                  onClick={() => selectKind(k)}
                  className={cn(
                    'flex items-center gap-1.5 px-2 py-1.5 rounded-card text-xs font-medium transition-colors',
                    kind === k
                      ? 'bg-accent/15 text-accent'
                      : 'text-ink-muted hover:text-ink hover:bg-white/5',
                  )}
                >
                  <Icon size={12} />
                  {label}
                </button>
              ))}
            </div>

            {/* Quality selector — image only */}
            {kind === 'image' && (
              <div className="space-y-1">
                <p className="text-[10px] text-ink-muted uppercase tracking-wider px-1">Quality</p>
                <div className="flex gap-1">
                  {(['low', 'med', 'high'] as Quality[]).map(q => (
                    <button
                      key={q}
                      onClick={() => setQuality(q)}
                      className={cn(
                        'flex-1 py-1 rounded text-[10px] font-medium capitalize transition-colors',
                        quality === q ? 'bg-accent/80 text-white' : 'bg-surface-2 text-ink-muted hover:text-ink',
                      )}
                    >
                      {q}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-ink-muted px-1">
                  {quality === 'low' ? '~$0.02 · Fast' : quality === 'med' ? '~$0.03 · Balanced' : '~$0.06 · Best'}
                </p>
              </div>
            )}

            {/* Prompt input */}
            <div className="space-y-1.5">
              <input
                ref={inputRef}
                className="input text-xs"
                placeholder={PLACEHOLDERS[kind]}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && generate()}
              />
              <button
                className="btn-primary w-full flex items-center justify-center gap-1.5 py-1.5 text-xs"
                onClick={generate}
                disabled={!prompt.trim() || busy || !campaignId}
              >
                {busy
                  ? <><Loader size={12} className="animate-spin" /> Generating…</>
                  : <><Zap size={12} /> Generate</>}
              </button>
            </div>

            {/* Error */}
            {error && <p className="text-xs text-danger px-1">{error}</p>}

            {/* Streaming preview */}
            {busy && kind !== 'image' && streamText && (
              <div className="p-2 bg-surface-2 rounded-card">
                <p className="text-xs text-ink-muted leading-relaxed streaming-cursor line-clamp-4">
                  {streamText}
                </p>
              </div>
            )}

            {/* Text result */}
            {result && (
              <div className="space-y-2">
                <div className="p-2 bg-surface-2 rounded-card max-h-72 overflow-y-auto">
                  <p className="text-xs text-ink leading-relaxed whitespace-pre-wrap">{result}</p>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  <button
                    className="btn-ghost text-[11px] flex items-center gap-1 px-2 py-1"
                    onClick={generate}
                    disabled={busy}
                  >
                    <RefreshCw size={10} /> Regen
                  </button>
                  <button
                    className="btn-ghost text-[11px] flex items-center gap-1 px-2 py-1"
                    onClick={addToSession}
                    disabled={busy}
                  >
                    <BookOpen size={10} /> Add to Session
                  </button>
                </div>
                {sessionMsg && (
                  <p className={cn(
                    'text-[11px] flex items-center gap-1 px-1',
                    sessionMsg.ok ? 'text-green-400' : 'text-danger',
                  )}>
                    {sessionMsg.ok && <CheckCircle2 size={10} />}
                    {sessionMsg.text}
                  </p>
                )}
              </div>
            )}

            {/* Image result */}
            {imageJobId && (
              <div>
                {imageLoading && (
                  <div className="flex items-center gap-2 text-xs text-ink-muted p-2 bg-surface-2 rounded-card">
                    <Loader size={12} className="animate-spin" /> Generating image…
                  </div>
                )}
                {imageStatus.status === 'failed' && (
                  <p className="text-xs text-danger p-2">{imageStatus.errorMessage ?? 'Image generation failed'}</p>
                )}
                {imageReady && (
                  <div className="space-y-2">
                    <img
                      src={`/api/assets/${imageStatus.assetId}?size=full`}
                      className="w-full rounded-card"
                      alt="Generated image"
                    />
                    <button
                      className="btn-ghost text-[11px] flex items-center gap-1 px-2 py-1"
                      onClick={() => { setImageJobId(null); generate() }}
                    >
                      <RefreshCw size={10} /> Regen
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  )
}
