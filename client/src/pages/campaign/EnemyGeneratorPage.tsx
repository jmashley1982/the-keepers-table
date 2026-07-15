import { useParams, useNavigate } from 'react-router-dom'
import { useState, useRef } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { Zap, Loader, Save, RefreshCw, ChevronDown, ChevronRight, Swords } from 'lucide-react'
import { cn } from '../../lib/cn'

interface EnemyResult {
  name: string
  description: string
  enemyType: string
  size?: string
  cr?: string
  statBlock: Record<string, unknown>
  tags: string[]
  source: string
}

function AbilityScore({ label, value }: { label: string; value: number }) {
  const mod = Math.floor((value - 10) / 2)
  return (
    <div className="flex flex-col items-center">
      <span className="text-[10px] font-bold text-ink-muted uppercase">{label}</span>
      <span className="text-sm font-bold text-ink">{value}</span>
      <span className="text-xs text-ink-muted">({mod >= 0 ? `+${mod}` : mod})</span>
    </div>
  )
}

function EnemyCard({
  enemy,
  systemTemplateId,
  scratchMode,
  onSave,
  saved,
  onRegenerate,
}: {
  enemy: EnemyResult
  systemTemplateId: string
  scratchMode?: boolean
  onSave?: (patch: Partial<EnemyResult>) => void
  saved?: boolean
  onRegenerate?: () => void
}) {
  const [expanded, setExpanded] = useState(true)
  const [editName, setEditName] = useState(enemy.name)
  const [editType, setEditType] = useState(enemy.enemyType)
  const [editDesc, setEditDesc] = useState(enemy.description)
  const sb = enemy.statBlock ?? {}
  const is5e = systemTemplateId === 'builtin-d-d-5e'
  const isDw = systemTemplateId === 'builtin-dungeon-world'

  return (
    <div className={cn('card', scratchMode && !saved && 'border-accent/30')}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="display-font text-lg font-bold text-ink">{enemy.name}</h3>
            {enemy.cr && (
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-surface-2 text-ink-muted">CR {enemy.cr}</span>
            )}
          </div>
          <p className="text-xs text-ink-muted mt-0.5 capitalize">
            {[enemy.size, enemy.enemyType].filter(Boolean).join(' ')}
          </p>
          <div className="flex gap-1 flex-wrap mt-1">
            {(enemy.tags || []).map(tag => (
              <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] text-ink-muted bg-surface-2 capitalize">{tag}</span>
            ))}
          </div>
        </div>
        <button onClick={() => setExpanded(v => !v)} className="p-1 text-ink-muted hover:text-ink transition-colors mt-1">
          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-border space-y-3 animate-fade-in">
          {enemy.description && (
            <p className="text-xs text-ink-muted italic">{enemy.description}</p>
          )}

          {is5e && (
            <>
              {['str','dex','con','int','wis','cha'].some(s => sb[s] !== undefined) && (
                <div className="grid grid-cols-6 gap-1 bg-surface-2 rounded-card px-2 py-2">
                  {(['str','dex','con','int','wis','cha'] as const).map(stat =>
                    sb[stat] !== undefined ? (
                      <AbilityScore key={stat} label={stat.toUpperCase()} value={sb[stat] as number} />
                    ) : null
                  )}
                </div>
              )}
              {[
                ['AC', sb.ac], ['HP', sb.hp], ['Speed', sb.speed],
                ['Saves', sb.saves], ['Skills', sb.skills],
                ['Senses', sb.senses], ['Languages', sb.languages],
              ].filter(([, v]) => v !== undefined && v !== '').map(([label, val]) => (
                <div key={label as string} className="flex gap-2 text-xs">
                  <span className="font-semibold text-ink-muted min-w-[80px] shrink-0">{label as string}</span>
                  <span className="text-ink">{String(val)}</span>
                </div>
              ))}
              {sb.traits && (
                <div>
                  <p className="text-[11px] font-bold text-ink-muted uppercase tracking-wide mb-1">Traits</p>
                  <p className="text-xs text-ink whitespace-pre-wrap">{sb.traits as string}</p>
                </div>
              )}
              {sb.actions && (
                <div>
                  <p className="text-[11px] font-bold text-ink-muted uppercase tracking-wide mb-1">Actions</p>
                  <p className="text-xs text-ink whitespace-pre-wrap">{sb.actions as string}</p>
                </div>
              )}
            </>
          )}

          {isDw && (
            <div className="space-y-1.5">
              <div className="flex gap-4 flex-wrap">
                {sb.hp !== undefined && <div className="text-xs"><span className="font-semibold text-ink-muted mr-1">HP</span><span className="text-ink">{String(sb.hp)}</span></div>}
                {sb.armor !== undefined && <div className="text-xs"><span className="font-semibold text-ink-muted mr-1">Armor</span><span className="text-ink">{String(sb.armor)}</span></div>}
                {!!sb.damage && <div className="text-xs"><span className="font-semibold text-ink-muted mr-1">Damage</span><span className="text-ink">{String(sb.damage)}</span></div>}
              </div>
              {!!sb.instinct && (
                <div className="text-xs"><span className="font-semibold text-ink-muted mr-1">Instinct</span><span className="text-ink">{String(sb.instinct)}</span></div>
              )}
              {!!sb.moves && (
                <div>
                  <p className="text-[11px] font-bold text-ink-muted uppercase tracking-wide mb-1">Moves</p>
                  {(sb.moves as string).split('\n').filter(Boolean).map((m, i) => (
                    <p key={i} className="text-xs text-ink">• {m}</p>
                  ))}
                </div>
              )}
              {!!sb.tags && (
                <div className="text-xs"><span className="font-semibold text-ink-muted mr-1">Tags</span><span className="text-ink">{String(sb.tags)}</span></div>
              )}
            </div>
          )}

          {!is5e && !isDw && Object.entries(sb).map(([k, v]) => (
            <div key={k} className="flex gap-2 text-xs">
              <span className="font-semibold text-ink-muted capitalize min-w-[80px] shrink-0">{k}</span>
              <span className="text-ink">{String(v)}</span>
            </div>
          ))}
        </div>
      )}

      {scratchMode && (
        <div className="mt-3 pt-3 border-t border-border space-y-3">
          {!saved ? (
            <>
              {/* Editable fields before saving */}
              <div className="space-y-2">
                <div>
                  <label className="label text-xs">Name</label>
                  <input className="input text-sm" value={editName} onChange={e => setEditName(e.target.value)} />
                </div>
                <div>
                  <label className="label text-xs">Creature Type</label>
                  <input className="input text-sm" value={editType} onChange={e => setEditType(e.target.value)} />
                </div>
                <div>
                  <label className="label text-xs">Description</label>
                  <textarea className="textarea text-sm h-16" value={editDesc} onChange={e => setEditDesc(e.target.value)} />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  className="btn-primary flex-1 justify-center text-sm"
                  onClick={() => onSave?.({ name: editName, enemyType: editType, description: editDesc })}
                >
                  <Save size={14} /> Save to Campaign
                </button>
                <button
                  className="btn-ghost text-ink-muted text-sm"
                  onClick={onRegenerate}
                >
                  <RefreshCw size={13} /> Regenerate
                </button>
              </div>
            </>
          ) : (
            <p className="text-xs text-green-500 flex items-center gap-1 w-full justify-center">
              <Save size={12} /> Saved to bestiary
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default function EnemyGeneratorPage() {
  const { campaignId } = useParams<{ campaignId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: campaignData } = useQuery({
    queryKey: ['campaign', campaignId],
    queryFn: () => api.get(`/api/campaigns/${campaignId}`).then(r => r.data),
    enabled: !!campaignId,
  })
  const systemTemplateId: string = campaignData?.campaign?.systemTemplateId ?? ''

  const [prompt, setPrompt] = useState('')
  const [enemyType, setEnemyType] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [results, setResults] = useState<Array<{ data: EnemyResult; saved: boolean }>>([])
  const [streamText, setStreamText] = useState('')
  const [streaming, setStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  async function generate() {
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()

    const promptParts = [
      prompt,
      enemyType ? `Type: ${enemyType}` : '',
      difficulty ? `Difficulty/Power: ${difficulty}` : '',
    ].filter(Boolean).join('. ')

    setStreaming(true)
    setStreamText('')
    setResults([])

    try {
      const resp = await fetch('/api/generate/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ kind: 'enemy', prompt: promptParts, campaignId, stream: true }),
        signal: abortRef.current.signal,
      })

      if (!resp.ok) {
        const errText = await resp.text()
        throw new Error(errText || resp.statusText)
      }

      const contentType = resp.headers.get('content-type') ?? ''

      if (contentType.includes('text/event-stream')) {
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
                } else if (parsed.result) {
                  const items = Array.isArray(parsed.result) ? parsed.result : [parsed.result]
                  setResults(items.map((r: EnemyResult) => ({ data: r, saved: false })))
                  setStreamText('')
                }
              } catch { /* partial */ }
            }
          }
        }
        if (fullText && results.length === 0) {
          try {
            const parsed = JSON.parse(fullText)
            const items = Array.isArray(parsed) ? parsed : [parsed]
            setResults(items.map((r: EnemyResult) => ({ data: r, saved: false })))
            setStreamText('')
          } catch { /* leave as text */ }
        }
      } else {
        const data = await resp.json()
        const items = Array.isArray(data.result) ? data.result : [data.result]
        setResults(items.map((r: EnemyResult) => ({ data: r, saved: false })))
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
    mutationFn: async ({ data: enemy, patch, index }: { data: EnemyResult; patch: Partial<EnemyResult>; index: number }) => {
      await api.post(`/api/campaigns/${campaignId}/enemies`, { ...enemy, ...patch, source: 'generated' })
      return index
    },
    onSuccess: (index) => {
      setResults(r => r.map((item, i) => i === index ? { ...item, saved: true } : item))
      qc.invalidateQueries({ queryKey: ['enemies', campaignId] })
      setTimeout(() => navigate(`/campaign/${campaignId}/enemies`), 800)
    },
    onError: (e) => alert(apiError(e)),
  })

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="display-font text-3xl font-bold text-ink flex items-center gap-3">
          <Swords size={28} className="text-accent" />
          Enemy Generator
        </h1>
        <p className="text-ink-muted text-sm mt-1">Create enemies tailored to your campaign's system and setting.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <div className="card space-y-4">
          <div>
            <label className="label">Describe this enemy</label>
            <textarea
              className="textarea h-28"
              placeholder="A skeletal knight serving an ancient lich, bound by cursed armor that won't let it rest…"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Creature type (optional)</label>
            <input
              className="input"
              placeholder="Undead, beast, humanoid, fiend, dragon…"
              value={enemyType}
              onChange={e => setEnemyType(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Power / difficulty (optional)</label>
            <input
              className="input"
              placeholder="CR 5, boss encounter, minion level, terrifying…"
              value={difficulty}
              onChange={e => setDifficulty(e.target.value)}
            />
          </div>
          <button
            className="btn-primary w-full justify-center"
            onClick={generate}
            disabled={streaming || !prompt.trim()}
          >
            {streaming
              ? <><Loader size={16} className="animate-spin" /> Generating…</>
              : <><Zap size={16} /> Generate Enemy</>
            }
          </button>
        </div>

        {/* Results */}
        <div className="space-y-4">
          {results.length === 0 && !streaming && !streamText && (
            <div className="card text-center py-12 text-ink-muted">
              <Swords size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Fill in the details and hit Generate.</p>
              <p className="text-xs mt-1 opacity-60">Claude will craft a full stat block ready to save.</p>
            </div>
          )}

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

          {streaming && !streamText && (
            <div className="card text-center py-12">
              <Loader size={32} className="animate-spin mx-auto text-accent mb-3" />
              <p className="text-ink-muted text-sm">Claude is crafting your enemy…</p>
            </div>
          )}

          {results.map((result, i) => (
            <EnemyCard
              key={i}
              enemy={result.data}
              systemTemplateId={systemTemplateId}
              scratchMode={!result.saved}
              saved={result.saved}
              onSave={(patch) => saveResult.mutate({ data: result.data, patch: patch ?? {}, index: i })}
              onRegenerate={generate}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
