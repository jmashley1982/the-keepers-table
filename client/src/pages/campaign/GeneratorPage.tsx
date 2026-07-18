import { useParams, useSearchParams } from 'react-router-dom'
import { useState, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import EntityCard from '../../components/entity/EntityCard'
import { Zap, Loader, Save, RefreshCw } from 'lucide-react'
import ThemedLoader from '../../components/ui/Loader'

type GeneratorKind = 'npc' | 'encounter' | 'treasure' | 'dialogue' | 'location' | 'item' | 'faction' | 'plot_thread'

const GENERATOR_CONFIG: Record<GeneratorKind, {
  title: string; emoji: string; apiKind: string; entityEndpoint: string; entityType: string;
  fields: { key: string; label: string; placeholder: string; type?: string }[];
}> = {
  npc: {
    title: 'NPC Generator', emoji: '🧙', apiKind: 'npc', entityEndpoint: 'npcs', entityType: 'npc',
    fields: [
      { key: 'prompt', label: 'Describe this NPC', placeholder: 'A gruff dwarven blacksmith who secretly works for the thieves guild…' },
      { key: 'role', label: 'Role / occupation', placeholder: 'Blacksmith, tavern keeper, guard captain…' },
      { key: 'tone', label: 'Tone / vibe', placeholder: 'Mysterious, jovial, threatening…' },
    ],
  },
  encounter: {
    title: 'Encounter Generator', emoji: '⚔️', apiKind: 'encounter', entityEndpoint: 'encounters', entityType: 'encounter',
    fields: [
      { key: 'prompt', label: 'Describe this encounter', placeholder: 'An ambush on the forest road by bandits with a twist…' },
      { key: 'difficulty', label: 'Difficulty', placeholder: 'Easy, medium, hard, deadly…' },
      { key: 'location', label: 'Location / environment', placeholder: 'Dense forest, castle courtyard, underwater cave…' },
    ],
  },
  treasure: {
    title: 'Treasure Generator', emoji: '💎', apiKind: 'treasure', entityEndpoint: 'items', entityType: 'item',
    fields: [
      { key: 'prompt', label: 'Describe the loot', placeholder: 'Dragon hoard, bandits\' stash, ancient elven tomb rewards…' },
      { key: 'rarity', label: 'Rarity level', placeholder: 'Common, uncommon, rare, legendary…' },
      { key: 'quantity', label: 'Number of items', placeholder: '1-3', type: 'number' },
    ],
  },
  dialogue: {
    title: 'Dialogue Generator', emoji: '💬', apiKind: 'dialogue', entityEndpoint: 'npcs', entityType: 'npc',
    fields: [
      { key: 'prompt', label: "Party's action / question", placeholder: 'The party asks the innkeeper about the missing merchant…' },
      { key: 'npc', label: 'NPC speaking', placeholder: 'Gruff innkeeper named Bram…' },
    ],
  },
  location: {
    title: 'Location Generator', emoji: '🗺️', apiKind: 'location', entityEndpoint: 'locations', entityType: 'location',
    fields: [
      { key: 'prompt', label: 'Describe this location', placeholder: 'An ancient ruined temple in the forest…' },
      { key: 'type', label: 'Type', placeholder: 'Settlement, dungeon, wilderness, building…' },
      { key: 'tone', label: 'Atmosphere / tone', placeholder: 'Eerie, bustling, dangerous, peaceful…' },
    ],
  },
  item: {
    title: 'Item Generator', emoji: '⚔️', apiKind: 'treasure', entityEndpoint: 'items', entityType: 'item',
    fields: [
      { key: 'prompt', label: 'Describe the item(s)', placeholder: 'A cursed blade found in the tomb, an enchanted ring dropped by the cultist…' },
      { key: 'rarity', label: 'Rarity level', placeholder: 'Common, uncommon, rare, legendary…' },
      { key: 'quantity', label: 'Number of items', placeholder: '1', type: 'number' },
    ],
  },
  faction: {
    title: 'Faction Generator', emoji: '⚜️', apiKind: 'faction', entityEndpoint: 'factions', entityType: 'faction',
    fields: [
      { key: 'prompt', label: 'Describe this faction', placeholder: 'A shadowy thieves guild operating beneath the capital city…' },
      { key: 'role', label: 'Role in the world', placeholder: 'Political power, criminal network, religious order, mercenaries…' },
      { key: 'tone', label: 'Tone / alignment', placeholder: 'Lawful but corrupt, chaotic neutral, secretly benevolent…' },
    ],
  },
  plot_thread: {
    title: 'Plot Thread Generator', emoji: '📜', apiKind: 'plot_thread', entityEndpoint: 'plot-threads', entityType: 'plot_thread',
    fields: [
      { key: 'prompt', label: 'Describe this plot thread', placeholder: 'The missing merchant who knew too much, a prophecy the party accidentally fulfilled…' },
      { key: 'tone', label: 'Tone / stakes', placeholder: 'High stakes, slow burn, comedic, tragic…' },
    ],
  },
}

export default function GeneratorPage() {
  const { campaignId, kind } = useParams<{ campaignId: string; kind: string }>()
  const [searchParams] = useSearchParams()
  const qc = useQueryClient()

  const config = GENERATOR_CONFIG[kind as GeneratorKind] ?? GENERATOR_CONFIG.npc
  const [fields, setFields] = useState<Record<string, string>>({
    prompt: searchParams.get('prompt') ?? '',
  })
  const [results, setResults] = useState<Array<{ data: Record<string, unknown>; saved: boolean }>>([])
  const [streamText, setStreamText] = useState('')
  const [streaming, setStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  async function generate() {
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()

    const promptParts = Object.entries(fields)
      .filter(([, v]) => v.trim())
      .map(([k, v]) => k === 'prompt' ? v : `${k}: ${v}`)
      .join('. ')

    setStreaming(true)
    setStreamText('')
    setResults([])

    try {
      // Try SSE streaming first
      const resp = await fetch('/api/generate/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ kind: config.apiKind, prompt: promptParts, campaignId, stream: true }),
        signal: abortRef.current.signal,
      })

      if (!resp.ok) {
        const errText = await resp.text()
        throw new Error(errText || resp.statusText)
      }

      const contentType = resp.headers.get('content-type') ?? ''

      if (contentType.includes('text/event-stream')) {
        // SSE streaming
        const reader = resp.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let fullText = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const raw = line.slice(6).trim()
              if (raw === '[DONE]') continue
              try {
                const parsed = JSON.parse(raw)
                if (parsed.text) {
                  fullText += parsed.text
                  setStreamText(fullText)
                } else if (parsed.done) {
                  // stream finished — result comes from fullText JSON parse below
                } else if (parsed.result) {
                  const result = parsed.result
                  const items = Array.isArray(result) ? result : [result]
                  setResults(items.map((r: Record<string, unknown>) => ({ data: r, saved: false })))
                  setStreamText('')
                }
              } catch { /* partial JSON, keep buffering */ }
            }
          }
        }
        // If we streamed text but got no structured result, try to parse the accumulated text
        if (fullText && results.length === 0) {
          try {
            const parsed = JSON.parse(fullText)
            const items = Array.isArray(parsed) ? parsed : [parsed]
            setResults(items.map((r: Record<string, unknown>) => ({ data: r, saved: false })))
            setStreamText('')
          } catch { /* leave as raw text */ }
        }
      } else {
        // JSON response
        const data = await resp.json()
        const result = data.result
        const items = Array.isArray(result) ? result : [result]
        setResults(items.map((r: Record<string, unknown>) => ({ data: r, saved: false })))
      }
    } catch (e: unknown) {
      if ((e as Error).name === 'AbortError') return
      alert(apiError(e))
    } finally {
      setStreaming(false)
      setStreamText('')
    }
  }

  const saveResult = useMutation({
    mutationFn: async ({ data: entityData, index }: { data: Record<string, unknown>; index: number }) => {
      const res = await api.post(`/api/entities/${campaignId}/${config.entityEndpoint}`, entityData)
      return { index, item: res.data?.item as Record<string, unknown> | undefined }
    },
    onSuccess: ({ index, item }) => {
      // Merge the persisted entity (with its real DB id) back into the card so the
      // portrait/generate-art button fires with a valid entityId.
      setResults(r => r.map((r0, i) => i === index
        ? { ...r0, data: item ? { ...r0.data, ...item } : r0.data, saved: true }
        : r0))
      qc.invalidateQueries({ queryKey: ['entities', campaignId] })
    },
    onError: (e) => alert(apiError(e)),
  })

  function createAnother() {
    setResults([])
    setStreamText('')
    setFields({ prompt: '' })
  }

  const entityType = config.entityType as Parameters<typeof EntityCard>[0]['entityType']

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="display-font text-3xl font-bold text-ink flex items-center gap-3">
          <span>{config.emoji}</span> {config.title}
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input form */}
        <div className="card space-y-4">
          {config.fields.map(f => (
            <div key={f.key}>
              <label className="label">{f.label}</label>
              {f.key === 'prompt' ? (
                <textarea
                  className="textarea h-28"
                  placeholder={f.placeholder}
                  value={fields[f.key] ?? ''}
                  onChange={e => setFields(prev => ({ ...prev, [f.key]: e.target.value }))}
                />
              ) : (
                <input
                  className="input"
                  type={f.type ?? 'text'}
                  placeholder={f.placeholder}
                  value={fields[f.key] ?? ''}
                  onChange={e => setFields(prev => ({ ...prev, [f.key]: e.target.value }))}
                />
              )}
            </div>
          ))}

          <button
            className="btn-primary w-full justify-center"
            onClick={generate}
            disabled={streaming || !fields.prompt?.trim()}
          >
            {streaming
              ? <><Loader size={16} className="animate-spin" /> Generating…</>
              : <><Zap size={16} /> Generate</>
            }
          </button>
        </div>

        {/* Results */}
        <div className="space-y-4">
          {results.length === 0 && !streaming && !streamText && (
            <div className="card text-center py-12 text-ink-muted">
              <div className="text-4xl mb-3">{config.emoji}</div>
              <p className="text-sm">Fill in the details and hit Generate.</p>
              <p className="text-xs mt-1 opacity-60">Claude will craft a detailed result ready to save to your library.</p>
            </div>
          )}

          {/* Streaming text preview */}
          {streamText && (
            <div className="card bg-surface-2 border-accent/20">
              <div className="flex items-center gap-2 mb-3">
                <Loader size={12} className="animate-spin text-accent" />
                <span className="text-xs text-accent font-medium">Generating…</span>
              </div>
              <pre className="text-xs text-ink-muted whitespace-pre-wrap font-mono leading-relaxed max-h-64 overflow-y-auto">
                {streamText}
              </pre>
            </div>
          )}

          {/* Loading placeholder (non-streaming) */}
          {streaming && !streamText && (
            <div className="card text-center py-12">
              <ThemedLoader
                size="lg"
                flavor={kind === 'npc' ? 'npc' : kind === 'encounter' ? 'encounter' : kind === 'treasure' ? 'treasure' : 'default'}
              />
            </div>
          )}

          {results.map((result, i) => (
            <div key={i} className="space-y-2 animate-resolve-in">
              <EntityCard
                entity={result.data as unknown as Parameters<typeof EntityCard>[0]['entity']}
                entityType={entityType}
                campaignId={campaignId!}
                scratchMode={!result.saved}
                onSave={() => saveResult.mutate({ data: result.data, index: i })}
                onRegenerate={generate}
              />
              {result.saved && (
                <div className="card bg-surface-2 border-accent/20 text-center space-y-2 py-4">
                  <p className="text-xs text-green-500 flex items-center justify-center gap-1">
                    <Save size={12} /> Saved to campaign library
                  </p>
                  <p className="text-sm text-ink">Create another {config.title.replace(' Generator', '')}?</p>
                  <button className="btn-primary justify-center mx-auto" onClick={createAnother}>
                    <Zap size={14} /> Create another
                  </button>
                </div>
              )}
              {!result.saved && (
                <button
                  className="btn-ghost w-full text-xs text-ink-muted justify-center"
                  onClick={generate}
                >
                  <RefreshCw size={11} /> Regenerate
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
