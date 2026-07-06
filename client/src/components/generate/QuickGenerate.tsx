import { useState, useRef, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { useUIStore } from '../../store/useUIStore'
import { cn } from '../../lib/cn'
import { X, Zap, Loader } from 'lucide-react'

type Kind = 'auto' | 'npc' | 'encounter' | 'treasure' | 'location' | 'dialogue'

const CHIPS: { kind: Kind; label: string; emoji: string }[] = [
  { kind: 'auto', label: 'Auto', emoji: '✨' },
  { kind: 'npc', label: 'NPC', emoji: '🧙' },
  { kind: 'encounter', label: 'Encounter', emoji: '⚔️' },
  { kind: 'treasure', label: 'Treasure', emoji: '💎' },
  { kind: 'location', label: 'Location', emoji: '🗺️' },
  { kind: 'dialogue', label: 'Dialogue', emoji: '💬' },
]

const KIND_MAP: Record<string, string> = {
  auto: 'quick',
  npc: 'npc',
  encounter: 'encounter',
  treasure: 'treasure',
  location: 'location',
  dialogue: 'dialogue',
}

export default function QuickGenerate({ onClose, campaignId }: { onClose: () => void; campaignId?: string }) {
  const [prompt, setPrompt] = useState('')
  const [kind, setKind] = useState<Kind>('auto')
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const { addScratchItem } = useUIStore()

  useEffect(() => { inputRef.current?.focus() }, [])

  const generate = useMutation({
    mutationFn: async () => {
      const effectiveKind = KIND_MAP[kind] ?? 'quick'

      // Use streaming for dialogue/quick, JSON for structured
      const useStream = kind === 'dialogue' || kind === 'auto'

      if (useStream) {
        setStreaming(true)
        setStreamText('')

        const response = await fetch('/api/generate/text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ kind: effectiveKind, prompt, campaignId, stream: true }),
        })

        if (!response.ok) {
          const err = await response.json()
          throw new Error(err.error ?? 'Generation failed')
        }

        const reader = response.body!.getReader()
        const decoder = new TextDecoder()
        let fullText = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value)
          const lines = chunk.split('\n')
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6))
                if (data.text) { fullText += data.text; setStreamText(fullText) }
                if (data.done) {
                  setStreaming(false)
                  addScratchItem({ id: crypto.randomUUID(), kind: 'freeform', data: { text: fullText, prompt } })
                }
                if (data.error) throw new Error(data.error)
              } catch { /* ignore JSON parse errors from partial chunks */ }
            }
          }
        }
        setStreaming(false)
        return
      }

      // Structured JSON generation
      const { data } = await api.post('/api/generate/text', {
        kind: effectiveKind,
        prompt,
        campaignId,
        stream: false,
      })

      const result = data.result
      if (Array.isArray(result)) {
        result.forEach((item: Record<string, unknown>) => {
          addScratchItem({ id: crypto.randomUUID(), kind: effectiveKind, data: item })
        })
      } else {
        addScratchItem({ id: crypto.randomUUID(), kind: effectiveKind, data: result as Record<string, unknown> })
      }
    },
  })

  const handleSubmit = () => {
    if (!prompt.trim() || generate.isPending || streaming) return
    generate.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={e => e.target === e.currentTarget && onClose()}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-xl mx-4 animate-fade-in">
        <div className="card shadow-2xl border-border/80">
          {/* Kind chips */}
          <div className="flex gap-1.5 mb-3 flex-wrap">
            {CHIPS.map(c => (
              <button
                key={c.kind}
                onClick={() => setKind(c.kind)}
                className={cn(
                  'px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                  kind === c.kind
                    ? 'bg-accent text-white'
                    : 'bg-surface-2 text-ink-muted hover:text-ink'
                )}
              >
                {c.emoji} {c.label}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="flex gap-2">
            <input
              ref={inputRef}
              className="input flex-1"
              placeholder={
                kind === 'auto' ? 'Describe anything… "ambush near the old mill"' :
                kind === 'npc' ? 'Describe an NPC… "gruff dwarven blacksmith with a secret"' :
                kind === 'encounter' ? 'Describe an encounter… "undead skeletons guarding a crypt"' :
                kind === 'treasure' ? 'Describe loot… "reward for saving the village"' :
                kind === 'location' ? 'Describe a place… "ancient elven library"' :
                'Who is speaking? "the tavern keeper reacts to the party"'
              }
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            />
            <button
              className="btn-primary px-3"
              onClick={handleSubmit}
              disabled={!prompt.trim() || generate.isPending || streaming}
            >
              {generate.isPending || streaming ? <Loader size={16} className="animate-spin" /> : <Zap size={16} />}
            </button>
            <button className="btn-ghost p-2" onClick={onClose}>
              <X size={16} />
            </button>
          </div>

          {/* No key warning */}
          {generate.error && (
            <p className="text-xs text-danger mt-2">{apiError(generate.error)}</p>
          )}

          {/* Streaming output */}
          {(streaming || streamText) && (
            <div className="mt-3 p-3 bg-surface-2 rounded-card text-sm text-ink max-h-48 overflow-y-auto">
              <p className={cn('leading-relaxed whitespace-pre-wrap', streaming && 'streaming-cursor')}>{streamText}</p>
            </div>
          )}

          {!campaignId && (
            <p className="text-xs text-ink-muted mt-2">💡 Open a campaign to get context-aware generation.</p>
          )}
        </div>
      </div>
    </div>
  )
}
