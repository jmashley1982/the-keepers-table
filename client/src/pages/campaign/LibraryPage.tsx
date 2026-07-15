import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useState } from 'react'
import { cn } from '../../lib/cn'
import EntityCard from '../../components/entity/EntityCard'
import { Plus, Search, X } from 'lucide-react'

type Tab = 'npcs' | 'items' | 'locations' | 'factions' | 'encounters' | 'plot-threads'

const TABS: { id: Tab; label: string; emoji: string; entityType: string }[] = [
  { id: 'npcs', label: 'NPCs', emoji: '🧙', entityType: 'npc' },
  { id: 'items', label: 'Items', emoji: '⚔️', entityType: 'item' },
  { id: 'locations', label: 'Locations', emoji: '🗺️', entityType: 'location' },
  { id: 'factions', label: 'Factions', emoji: '⚜️', entityType: 'faction' },
  { id: 'encounters', label: 'Encounters', emoji: '💀', entityType: 'encounter' },
  { id: 'plot-threads', label: 'Plot Threads', emoji: '📜', entityType: 'plot_thread' },
]

const NPC_STATUSES = ['alive', 'dead', 'missing', 'unknown'] as const
const NPC_DISPOSITIONS = ['hostile', 'wary', 'neutral', 'friendly', 'complicated'] as const

const STATUS_CHIP: Record<string, { text: string; activeBg: string; activeBorder: string }> = {
  alive:   { text: 'text-green-500',  activeBg: 'bg-green-500/15',  activeBorder: 'border-green-500/40' },
  dead:    { text: 'text-red-400',    activeBg: 'bg-red-400/15',    activeBorder: 'border-red-400/40' },
  missing: { text: 'text-orange-400', activeBg: 'bg-orange-400/15', activeBorder: 'border-orange-400/40' },
  unknown: { text: 'text-ink-muted',  activeBg: 'bg-surface',       activeBorder: 'border-border' },
}
const DISPOSITION_CHIP: Record<string, { text: string; activeBg: string; activeBorder: string }> = {
  hostile:     { text: 'text-red-500',    activeBg: 'bg-red-500/15',    activeBorder: 'border-red-500/40' },
  wary:        { text: 'text-orange-400', activeBg: 'bg-orange-400/15', activeBorder: 'border-orange-400/40' },
  neutral:     { text: 'text-ink-muted',  activeBg: 'bg-surface',       activeBorder: 'border-border' },
  friendly:    { text: 'text-green-500',  activeBg: 'bg-green-500/15',  activeBorder: 'border-green-500/40' },
  complicated: { text: 'text-purple-400', activeBg: 'bg-purple-400/15', activeBorder: 'border-purple-400/40' },
}

export default function LibraryPage() {
  const { campaignId, tab } = useParams<{ campaignId: string; tab?: Tab }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<Tab>((tab as Tab) ?? 'npcs')
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string | null>(null)
  const [filterDisposition, setFilterDisposition] = useState<string | null>(null)

  const currentTabDef = TABS.find(t => t.id === activeTab)!
  const isNpcTab = activeTab === 'npcs'

  function switchTab(t: Tab) {
    setActiveTab(t)
    setFilterStatus(null)
    setFilterDisposition(null)
    navigate(`/campaign/${campaignId}/library/${t}`)
  }

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['entities', campaignId, activeTab, search],
    queryFn: () => api.get(`/api/entities/${campaignId}/${activeTab}`, {
      params: search ? { q: search } : {},
    }).then(r => r.data),
    enabled: !!campaignId,
  })

  const allItems: Record<string, unknown>[] = data?.items ?? []

  const items = isNpcTab
    ? allItems.filter(item => {
        if (filterStatus && item.status !== filterStatus) return false
        if (filterDisposition && item.dispositionToParty !== filterDisposition) return false
        return true
      })
    : allItems

  const hasActiveFilters = isNpcTab && (filterStatus !== null || filterDisposition !== null)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-8 py-6 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <h1 className="display-font text-3xl font-bold text-ink">Library</h1>
          <button
            className="btn-primary"
            onClick={() => navigate(`/campaign/${campaignId}/generate/${currentTabDef.id === 'plot-threads' ? 'plot_thread' : currentTabDef.id === 'encounters' ? 'encounter' : currentTabDef.id.slice(0, -1)}`)}
          >
            <Plus size={16} /> Generate {currentTabDef.label.slice(0, -1)}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => switchTab(t.id)}
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

      {/* Search + NPC filter chips */}
      <div className="px-8 py-3 border-b border-border space-y-2">
        <div className="relative max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            className="input pl-8 text-sm"
            placeholder={`Search ${currentTabDef.label.toLowerCase()}…`}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {isNpcTab && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-ink-muted font-medium shrink-0">Filter:</span>

            {NPC_STATUSES.map(s => {
              const c = STATUS_CHIP[s]
              const active = filterStatus === s
              return (
                <button
                  key={s}
                  onClick={() => setFilterStatus(active ? null : s)}
                  className={cn(
                    'text-xs px-2 py-0.5 rounded-full border transition-colors capitalize font-medium',
                    active
                      ? cn(c.text, c.activeBg, c.activeBorder)
                      : 'text-ink-muted bg-surface-2 border-border hover:text-ink'
                  )}
                >
                  {s}
                </button>
              )
            })}

            <span className="text-ink-muted/40 text-xs shrink-0">·</span>

            {NPC_DISPOSITIONS.map(d => {
              const c = DISPOSITION_CHIP[d]
              const active = filterDisposition === d
              return (
                <button
                  key={d}
                  onClick={() => setFilterDisposition(active ? null : d)}
                  className={cn(
                    'text-xs px-2 py-0.5 rounded-full border transition-colors capitalize',
                    active
                      ? cn(c.text, c.activeBg, c.activeBorder)
                      : 'text-ink-muted bg-surface-2 border-border hover:text-ink'
                  )}
                >
                  {d}
                </button>
              )
            })}

            {hasActiveFilters && (
              <button
                onClick={() => { setFilterStatus(null); setFilterDisposition(null) }}
                className="flex items-center gap-0.5 text-xs text-ink-muted hover:text-ink ml-1"
              >
                <X size={11} /> Clear
              </button>
            )}
          </div>
        )}
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
              {search
                ? `No results for "${search}"`
                : hasActiveFilters
                  ? 'No NPCs match the selected filters.'
                  : `Generate your first ${currentTabDef.label.slice(0, -1).toLowerCase()} to build your world.`
              }
            </p>
            {!search && !hasActiveFilters && (
              <button
                className="btn-primary"
                onClick={() => navigate(`/campaign/${campaignId}/generate/${currentTabDef.id === 'plot-threads' ? 'plot_thread' : currentTabDef.id === 'encounters' ? 'encounter' : currentTabDef.id.slice(0, -1)}`)}
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
