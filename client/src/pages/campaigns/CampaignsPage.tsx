import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { Plus, BookOpen, Archive, MoreHorizontal, Trash2 } from 'lucide-react'
import { cn } from '../../lib/cn'
import ThemedLoader from '../../components/ui/Loader'
import EmptyState from '../../components/ui/EmptyState'
import { useUIStore } from '../../store/useUIStore'

export default function CampaignsPage() {
  const theme = useUIStore(s => s.theme)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (searchParams.get('create') === '1') {
      setCreating(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams])

  const [newName, setNewName] = useState('')
  const [newTemplate, setNewTemplate] = useState('')

  const { data: campaignsData, isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api.get('/api/campaigns').then(r => r.data),
  })

  const { data: templatesData } = useQuery({
    queryKey: ['system-templates'],
    queryFn: () => api.get('/api/system-templates').then(r => r.data),
  })

  const create = useMutation({
    mutationFn: () => api.post('/api/campaigns', { name: newName, systemTemplateId: newTemplate }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['campaigns'] })
      navigate(`/campaign/${res.data.campaign.id}`)
    },
  })

  const deleteCampaign = useMutation({
    mutationFn: (id: string) => api.delete(`/api/campaigns/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  })

  const campaigns = campaignsData?.campaigns ?? []
  const templates = templatesData?.templates ?? []

  return (
    <div
      className="relative min-h-full"
      style={theme === 'haunt' ? {
        backgroundImage: "url('/hero-haunt.webp')",
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
        backgroundAttachment: 'fixed',
      } : theme === 'icarus' ? {
        backgroundImage: "url('/hero-icarus.webp')",
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
        backgroundAttachment: 'fixed',
      } : theme === 'neon' ? {
        backgroundImage: "url('/hero-neon.webp')",
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
        backgroundAttachment: 'fixed',
      } : theme === 'eldritch' ? {
        backgroundImage: "url('/hero-eldritch.webp')",
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
        backgroundAttachment: 'fixed',
      } : theme === 'candlelight' ? {
        backgroundImage: "url('/hero-candlelight.webp')",
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
        backgroundAttachment: 'fixed',
      } : undefined}
    >
      {(theme === 'haunt' || theme === 'icarus' || theme === 'neon' || theme === 'eldritch' || theme === 'candlelight') && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.7) 100%)' }}
        />
      )}
    <div className="relative z-10 p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="display-font text-3xl font-bold text-ink">Your Campaigns</h1>
          <p className="text-ink-muted mt-1">Each campaign is its own world.</p>
        </div>
        <button className="btn-primary" onClick={() => setCreating(true)}>
          <Plus size={16} /> New Campaign
        </button>
      </div>

      {creating && (
        <div className="card mb-6 space-y-4 animate-fade-in border-accent/30">
          <h3 className="font-semibold text-ink">New campaign</h3>
          <div>
            <label className="label">Campaign name</label>
            <input className="input" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Storm King's Thunder" autoFocus />
          </div>
          <div>
            <label className="label">Game system</label>
            <select className="input" value={newTemplate} onChange={e => setNewTemplate(e.target.value)}>
              <option value="">Select…</option>
              {templates.map((t: { id: string; name: string }) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              className="btn-primary"
              onClick={() => create.mutate()}
              disabled={!newName || !newTemplate || create.isPending}
            >
              {create.isPending ? 'Creating…' : 'Create'}
            </button>
            <button className="btn-secondary" onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <ThemedLoader />
        </div>
      ) : campaigns.length === 0 ? (
        <EmptyState
          section="campaigns"
          icon={<BookOpen size={48} className="mx-auto text-ink-muted/30" />}
          action={
            <button className="btn-primary" onClick={() => setCreating(true)}>
              <Plus size={16} /> Start your first campaign
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map((c: {
            id: string; name: string; archived: boolean;
            systemTemplate: { name: string };
            _count: { npcs: number; sessions: number };
            updatedAt: string;
          }) => (
            <div
              key={c.id}
              className={cn('card cursor-pointer hover:border-accent/50 transition-all group', c.archived && 'opacity-60')}
              onClick={() => navigate(`/campaign/${c.id}`)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="display-font font-bold text-ink text-lg truncate">{c.name}</h3>
                  <p className="text-xs text-ink-muted mt-0.5">{c.systemTemplate?.name}</p>
                </div>
                <button
                  className="btn-ghost p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={e => { e.stopPropagation(); if (confirm('Delete this campaign?')) deleteCampaign.mutate(c.id) }}
                >
                  <Trash2 size={14} className="text-danger" />
                </button>
              </div>
              <div className="flex gap-4 text-xs text-ink-muted mt-auto">
                <span>{c._count?.npcs ?? 0} NPCs</span>
                <span>{c._count?.sessions ?? 0} sessions</span>
              </div>
              {c.archived && (
                <span className="badge bg-surface-2 text-ink-muted mt-2"><Archive size={10} className="mr-1" />Archived</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
    </div>
  )
}
