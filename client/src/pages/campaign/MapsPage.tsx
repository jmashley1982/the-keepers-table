import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { useState } from 'react'
import { Plus, Map, Upload } from 'lucide-react'

export default function MapsPage() {
  const { campaignId } = useParams<{ campaignId: string }>()
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newKind, setNewKind] = useState('battle')

  const { data, isLoading } = useQuery({
    queryKey: ['maps', campaignId],
    queryFn: () => api.get(`/api/entities/${campaignId}/maps`).then(r => r.data),
    enabled: !!campaignId,
  })

  const create = useMutation({
    mutationFn: () => api.post(`/api/entities/${campaignId}/maps`, {
      title: newTitle, kind: newKind, source: 'uploaded',
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maps', campaignId] })
      setCreating(false)
      setNewTitle('')
    },
    onError: e => alert(apiError(e)),
  })

  const maps = data?.items ?? []

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="display-font text-3xl font-bold text-ink">Maps</h1>
        <button className="btn-primary" onClick={() => setCreating(true)}>
          <Plus size={16} /> Add Map
        </button>
      </div>

      {creating && (
        <div className="card mb-6 space-y-3 animate-fade-in">
          <h3 className="font-semibold text-ink">Add map asset</h3>
          <div>
            <label className="label">Title</label>
            <input className="input" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="The Sunken City" autoFocus />
          </div>
          <div>
            <label className="label">Kind</label>
            <select className="input" value={newKind} onChange={e => setNewKind(e.target.value)}>
              <option value="battle">Battle Map</option>
              <option value="region">Region Map</option>
              <option value="world">World Map</option>
              <option value="other">Other</option>
            </select>
          </div>
          <p className="text-xs text-ink-muted">Image upload support coming in Phase 3. You can add a map entry now and attach an image URL later.</p>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={() => create.mutate()} disabled={!newTitle || create.isPending}>
              {create.isPending ? 'Adding…' : 'Add'}
            </button>
            <button className="btn-secondary" onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : maps.length === 0 ? (
        <div className="text-center py-20">
          <Map size={48} className="mx-auto text-ink-muted/30 mb-4" />
          <h2 className="display-font text-xl text-ink mb-2">No maps yet</h2>
          <p className="text-sm text-ink-muted mb-4">Map generation via EvoLink coming in Phase 3. Add entries manually for now.</p>
          <button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> Add Map</button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {maps.map((m: MapAsset) => (
            <div key={m.id} className="card hover:border-accent/40 cursor-pointer transition-colors">
              <div className="aspect-square bg-surface-2 rounded-card mb-3 flex items-center justify-center overflow-hidden">
                {m.imageUrl ? (
                  <img src={m.imageUrl} alt={m.title} className="w-full h-full object-cover" />
                ) : (
                  <Map size={32} className="text-ink-muted/30" />
                )}
              </div>
              <h3 className="font-medium text-ink text-sm truncate">{m.title}</h3>
              <p className="text-xs text-ink-muted capitalize">{m.kind} map</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface MapAsset { id: string; title: string; kind: string; imageUrl?: string }
