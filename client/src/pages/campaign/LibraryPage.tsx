import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useState } from 'react'
import { cn } from '../../lib/cn'
import EntityCard from '../../components/entity/EntityCard'
import { Plus, Search, Filter } from 'lucide-react'

type Tab = 'npcs' | 'items' | 'locations' | 'factions' | 'encounters' | 'plot-threads'

const TABS: { id: Tab; label: string; emoji: string; entityType: string }[] = [
  { id: 'npcs', label: 'NPCs', emoji: '🧙', entityType: 'npc' },
  { id: 'items', label: 'Items', emoji: '⚔️', entityType: 'item' },
  { id: 'locations', label: 'Locations', emoji: '🗺️', entityType: 'location' },
  { id: 'factions', label: 'Factions', emoji: '⚜️', entityType: 'faction' },
  { id: 'encounters', label: 'Encounters', emoji: '💀', entityType: 'encounter' },
  { id: 'plot-threads', label: 'Plot Threads', emoji: '📜', entityType: 'plot_thread' },
]

export default function LibraryPage() {
  const { campaignId, tab } = useParams<{ campaignId: string; tab?: Tab }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<Tab>((tab as Tab) ?? 'npcs')
  const [search, setSearch] = useState('')

  const currentTabDef = TABS.find(t => t.id === activeTab)!

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['entities', campaignId, activeTab, search],
    queryFn: () => api.get(`/api/entities/${campaignId}/${activeTab}`, {
      params: search ? { q: search } : {},
    }).then(r => r.data),
    enabled: !!campaignId,
  })

  const items = data?.items ?? []

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-8 py-6 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <h1 className="display-font text-3xl font-bold text-ink">Library</h1>
          <button
            className="btn-primary"
            onClick={() => navigate(`/campaign/${campaignId}/generate/${currentTabDef.id === 'plot-threads' ? 'npc' : currentTabDef.id === 'encounters' ? 'encounter' : currentTabDef.id.slice(0, -1)}`)}
          >
            <Plus size={16} /> Generate {currentTabDef.label.slice(0, -1)}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => { setActiveTab(t.id); navigate(`/campaign/${campaignId}/library/${t.id}`) }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-card text-sm font-medium whitespace-nowrap transition-colors',
                activeTab === t.id
                  ? 'bg-accent text-white'
                  : 'text-ink-muted hover:text-ink hover:bg-surface-2'
              )}
            >
              {t.emoji} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="px-8 py-3 border-b border-border">
        <div className="relative max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            className="input pl-8 text-sm"
            placeholder={`Search ${currentTabDef.label.toLowerCase()}…`}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">{currentTabDef.emoji}</div>
            <h2 className="display-font text-xl text-ink mb-2">No {currentTabDef.label.toLowerCase()} yet</h2>
            <p className="text-ink-muted text-sm mb-4">
              {search ? `No results for "${search}"` : `Generate your first ${currentTabDef.label.slice(0, -1).toLowerCase()} to build your world.`}
            </p>
            {!search && (
              <button
                className="btn-primary"
                onClick={() => navigate(`/campaign/${campaignId}/generate/${currentTabDef.id === 'plot-threads' ? 'npc' : currentTabDef.id === 'encounters' ? 'encounter' : currentTabDef.id.slice(0, -1)}`)}
              >
                <Plus size={16} /> Generate
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {items.map((item: Record<string, unknown>) => (
              <EntityCard
                key={item.id as string}
                entity={item as unknown as Parameters<typeof EntityCard>[0]['entity']}
                entityType={currentTabDef.entityType as Parameters<typeof EntityCard>[0]['entityType']}
                campaignId={campaignId!}
                compact
                onSaved={refetch}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
