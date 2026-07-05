import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import EntityCard from '../../components/entity/EntityCard'
import { Zap, Loader, Plus, Trash2, Save } from 'lucide-react'

type GeneratorKind = 'npc' | 'encounter' | 'treasure' | 'dialogue' | 'location'

const GENERATOR_CONFIG: Record<GeneratorKind, {
  title: string; emoji: string; kind: string;
  fields: { key: string; label: string; placeholder: string; type?: string }[];
}> = {
  npc: {
    title: 'NPC Generator', emoji: '🧙', kind: 'npc',
    fields: [
      { key: 'prompt', label: 'Describe this NPC', placeholder: 'A gruff dwarven blacksmith who secretly works for the thieves guild…' },
      { key: 'role', label: 'Role / occupation', placeholder: 'Blacksmith, tavern keeper, guard captain…' },
      { key: 'tone', label: 'Tone / vibe', placeholder: 'Mysterious, jovial, threatening…' },
    ],
  },
  encounter: {
    title: 'Encounter Generator', emoji: '⚔️', kind: 'encounter',
    fields: [
      { key: 'prompt', label: 'Describe this encounter', placeholder: 'An ambush on the forest road by bandits with a twist…' },
      { key: 'difficulty', label: 'Difficulty', placeholder: 'Easy, medium, hard, deadly…' },
      { key: 'location', label: 'Location / environment', placeholder: 'Dense forest, castle courtyard, underwater cave…' },
    ],
  },
  treasure: {
    title: 'Treasure Generator', emoji: '💎', kind: 'treasure',
    fields: [
      { key: 'prompt', label: 'Describe the loot', placeholder: 'Dragon hoard, bandits\' stash, ancient elven tomb rewards…' },
      { key: 'rarity', label: 'Rarity level', placeholder: 'Common, uncommon, rare, legendary…' },
      { key: 'quantity', label: 'Number of items', placeholder: '1-3', type: 'number' },
    ],
  },
  dialogue: {
    title: 'Dialogue Generator', emoji: '💬', kind: 'dialogue',
    fields: [
      { key: 'prompt', label: "Party's action / question", placeholder: 'The party asks the innkeeper about the missing merchant…' },
      { key: 'npc', label: 'NPC speaking', placeholder: 'Gruff innkeeper named Bram…' },
    ],
  },
  location: {
    title: 'Location Generator', emoji: '🗺️', kind: 'npc',
    fields: [
      { key: 'prompt', label: 'Describe this location', placeholder: 'An ancient ruined temple in the forest…' },
      { key: 'type', label: 'Type', placeholder: 'Settlement, dungeon, wilderness, building…' },
      { key: 'tone', label: 'Atmosphere / tone', placeholder: 'Eerie, bustling, dangerous, peaceful…' },
    ],
  },
}

export default function GeneratorPage() {
  const { campaignId, kind } = useParams<{ campaignId: string; kind: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const config = GENERATOR_CONFIG[kind as GeneratorKind] ?? GENERATOR_CONFIG.npc
  const [fields, setFields] = useState<Record<string, string>>({
    prompt: searchParams.get('prompt') ?? '',
  })
  const [results, setResults] = useState<Array<{ data: Record<string, unknown>; saved: boolean }>>([])

  const generate = useMutation({
    mutationFn: async () => {
      const promptParts = Object.entries(fields)
        .filter(([, v]) => v.trim())
        .map(([k, v]) => k === 'prompt' ? v : `${k}: ${v}`)
        .join('. ')

      const { data } = await api.post('/api/generate/text', {
        kind: config.kind,
        prompt: promptParts,
        campaignId,
        stream: false,
      })

      const result = data.result
      if (Array.isArray(result)) {
        setResults(result.map((r: Record<string, unknown>) => ({ data: r, saved: false })))
      } else {
        setResults([{ data: result as Record<string, unknown>, saved: false }])
      }
    },
  })

  const saveResult = useMutation({
    mutationFn: async ({ data: entityData, index }: { data: Record<string, unknown>; index: number }) => {
      const endpointMap: Record<string, string> = {
        npc: 'npcs', encounter: 'encounters', treasure: 'items', item: 'items', location: 'locations',
      }
      const endpoint = endpointMap[kind ?? ''] ?? 'npcs'
      await api.post(`/api/entities/${campaignId}/${endpoint}`, entityData)
      return index
    },
    onSuccess: (index) => {
      setResults(r => r.map((item, i) => i === index ? { ...item, saved: true } : item))
      qc.invalidateQueries({ queryKey: ['entities', campaignId] })
    },
    onError: (e) => alert(apiError(e)),
  })

  const entityTypeMap: Record<string, string> = {
    npc: 'npc', encounter: 'encounter', treasure: 'item', location: 'location',
  }
  const entityType = (entityTypeMap[kind ?? ''] ?? 'npc') as Parameters<typeof EntityCard>[0]['entityType']

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
            onClick={() => generate.mutate()}
            disabled={generate.isPending || !fields.prompt?.trim()}
          >
            {generate.isPending
              ? <><Loader size={16} className="animate-spin" /> Generating…</>
              : <><Zap size={16} /> Generate</>
            }
          </button>

          {generate.error && (
            <p className="text-sm text-danger">{apiError(generate.error)}</p>
          )}
        </div>

        {/* Results */}
        <div className="space-y-4">
          {results.length === 0 && !generate.isPending && (
            <div className="card text-center py-12 text-ink-muted">
              <div className="text-4xl mb-3">{config.emoji}</div>
              <p className="text-sm">Fill in the details and hit Generate.</p>
            </div>
          )}

          {generate.isPending && (
            <div className="card text-center py-12">
              <Loader size={32} className="animate-spin mx-auto text-accent mb-3" />
              <p className="text-ink-muted text-sm">Claude is crafting your {kind}…</p>
            </div>
          )}

          {results.map((result, i) => (
            <div key={i} className="space-y-2 animate-fade-in">
              <EntityCard
                entity={result.data as Parameters<typeof EntityCard>[0]['entity']}
                entityType={entityType}
                campaignId={campaignId!}
                scratchMode={!result.saved}
                onSave={() => saveResult.mutate({ data: result.data, index: i })}
                onRegenerate={() => generate.mutate()}
              />
              {result.saved && (
                <p className="text-xs text-green-500 text-center flex items-center justify-center gap-1">
                  <Save size={12} /> Saved to campaign library
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
