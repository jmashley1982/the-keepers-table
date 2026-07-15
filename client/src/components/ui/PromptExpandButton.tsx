import { useState } from 'react'
import { Sparkles, Loader, ChevronRight } from 'lucide-react'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'

interface Props {
  value: string
  onSelect: (expanded: string) => void
  context?: 'battle_map' | 'world_map' | 'general'
  className?: string
}

export default function PromptExpandButton({ value, onSelect, context = 'general', className }: Props) {
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [open, setOpen] = useState(false)

  async function expand() {
    if (!value.trim() || loading) return
    setLoading(true)
    setSuggestions([])
    setOpen(false)
    try {
      const res = await api.post('/api/generate/expand-prompt', { prompt: value.trim(), context })
      const list: string[] = res.data.suggestions ?? []
      if (list.length > 0) {
        setSuggestions(list)
        setOpen(true)
      }
    } catch {
      // silently ignore — button just does nothing on failure
    } finally {
      setLoading(false)
    }
  }

  function pick(s: string) {
    onSelect(s)
    setOpen(false)
    setSuggestions([])
  }

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        onClick={expand}
        disabled={!value.trim() || loading}
        title={value.trim() ? 'Expand with AI' : 'Type something first'}
        className={cn(
          'flex items-center gap-1 px-1.5 py-1 rounded text-[10px] font-medium transition-colors',
          loading
            ? 'text-accent bg-accent/10 cursor-wait'
            : value.trim()
            ? 'text-ink-muted hover:text-accent hover:bg-accent/10'
            : 'text-ink-muted/30 cursor-not-allowed',
        )}
      >
        {loading
          ? <Loader size={11} className="animate-spin" />
          : <Sparkles size={11} />}
        {loading ? 'Expanding…' : 'Expand'}
      </button>

      {open && suggestions.length > 0 && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-40 w-80 bg-surface border border-border rounded-card shadow-2xl overflow-hidden">
            <div className="px-3 py-2 bg-surface-2 border-b border-border">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted flex items-center gap-1.5">
                <Sparkles size={10} className="text-accent" />
                AI suggestions — click to use
              </span>
            </div>
            <div className="divide-y divide-border/50">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => pick(s)}
                  className="w-full text-left px-3 py-2.5 text-xs text-ink leading-relaxed hover:bg-accent/10 transition-colors flex items-start gap-2 group"
                >
                  <ChevronRight size={11} className="text-accent/50 group-hover:text-accent shrink-0 mt-0.5 transition-colors" />
                  <span>{s}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
