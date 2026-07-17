import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { useState } from 'react'
import { cn } from '../../lib/cn'
import { Plus, Search, ChevronDown, ChevronRight, Trash2, BookOpen, Swords, Edit2, Check, X, Download } from 'lucide-react'
import MonsterImportModal from '../../components/dnd5e/MonsterImportModal'
import ThemedLoader from '../../components/ui/Loader'
import EmptyState from '../../components/ui/EmptyState'

interface Enemy {
  id: string
  name: string
  description: string
  enemyType: string
  size?: string
  cr?: string
  statBlock: Record<string, unknown>
  source: string
  isBuiltin: boolean
  tags: string[]
  campaignId?: string
  createdAt?: string
}

const TYPE_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'custom', label: 'Custom' },
  { id: 'beast', label: 'Beast' },
  { id: 'humanoid', label: 'Humanoid' },
  { id: 'undead', label: 'Undead' },
  { id: 'fiend', label: 'Fiend' },
  { id: 'dragon', label: 'Dragon' },
  { id: 'construct', label: 'Construct' },
  { id: 'elemental', label: 'Elemental' },
  { id: 'monstrosity', label: 'Monstrosity' },
  { id: 'fey', label: 'Fey' },
  { id: 'aberration', label: 'Aberration' },
  { id: 'giant', label: 'Giant' },
  { id: 'plant', label: 'Plant' },
]

function StatBlockRow({ label, value }: { label: string; value: string | number | unknown }) {
  if (!value && value !== 0) return null
  return (
    <div className="flex gap-2 text-xs">
      <span className="font-semibold text-ink-muted min-w-[80px] shrink-0">{label}</span>
      <span className="text-ink">{String(value)}</span>
    </div>
  )
}

function AbilityScore({ label, value }: { label: string; value: number }) {
  const mod = Math.floor((value - 10) / 2)
  const modStr = mod >= 0 ? `+${mod}` : String(mod)
  return (
    <div className="flex flex-col items-center">
      <span className="text-[10px] font-bold text-ink-muted uppercase">{label}</span>
      <span className="text-sm font-bold text-ink">{value}</span>
      <span className="text-xs text-ink-muted">({modStr})</span>
    </div>
  )
}

function EnemyCard({
  enemy,
  onDelete,
  onEdit,
  systemTemplateId,
}: {
  enemy: Enemy
  onDelete?: () => void
  onEdit?: (patch: { name: string; description: string; enemyType: string }) => void
  systemTemplateId: string
}) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(enemy.name)
  const [editDesc, setEditDesc] = useState(enemy.description)
  const [editType, setEditType] = useState(enemy.enemyType)
  const sb = enemy.statBlock ?? {}

  const is5e = systemTemplateId === 'builtin-d-d-5e'
  const isDw = systemTemplateId === 'builtin-dungeon-world'

  const crBadge = enemy.cr ? `CR ${enemy.cr}` : null
  const hpBadge = sb.hp ? `HP ${sb.hp}` : null
  const acBadge = sb.ac ? `AC ${sb.ac}` : null

  return (
    <div className="card hover:shadow-md transition-shadow">
      <div
        className="flex items-start justify-between gap-2 cursor-pointer select-none"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="display-font text-base font-bold text-ink">{enemy.name}</h3>
            {enemy.isBuiltin && systemTemplateId === 'builtin-d-d-5e' && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-accent/10 text-accent">D&D 5e SRD</span>
            )}
            {enemy.isBuiltin && systemTemplateId === 'builtin-dungeon-world' && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-accent/10 text-accent">DW SRD</span>
            )}
            {enemy.isBuiltin && systemTemplateId !== 'builtin-d-d-5e' && systemTemplateId !== 'builtin-dungeon-world' && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-accent/10 text-accent">SRD</span>
            )}
            {!enemy.isBuiltin && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-surface-2 text-ink-muted">Campaign</span>
            )}
          </div>
          <p className="text-xs text-ink-muted mt-0.5 capitalize">
            {[enemy.size, enemy.enemyType].filter(Boolean).join(' ')}
          </p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {crBadge && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: 'var(--color-surface-2)', color: 'var(--color-ink)' }}>{crBadge}</span>
            )}
            {hpBadge && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: 'var(--color-surface-2)', color: 'var(--color-ink)' }}>{hpBadge}</span>
            )}
            {acBadge && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: 'var(--color-surface-2)', color: 'var(--color-ink)' }}>{acBadge}</span>
            )}
            {enemy.tags.slice(0, 4).map(tag => (
              <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] text-ink-muted bg-surface-2 capitalize">{tag}</span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {onEdit && !editing && (
            <button
              className="p-1.5 rounded hover:bg-accent/10 hover:text-accent transition-colors text-ink-muted"
              onClick={e => { e.stopPropagation(); setEditName(enemy.name); setEditDesc(enemy.description); setEditType(enemy.enemyType); setEditing(true); setExpanded(true) }}
              title="Edit"
            >
              <Edit2 size={13} />
            </button>
          )}
          {onDelete && (
            <button
              className="p-1.5 rounded hover:bg-danger/10 hover:text-danger transition-colors text-ink-muted"
              onClick={e => { e.stopPropagation(); onDelete() }}
              title="Delete"
            >
              <Trash2 size={13} />
            </button>
          )}
          {!editing && (expanded ? <ChevronDown size={15} className="text-ink-muted" /> : <ChevronRight size={15} className="text-ink-muted" />)}
        </div>
      </div>

      {/* Inline edit form */}
      {editing && (
        <div className="mt-3 pt-3 border-t border-border space-y-2 animate-fade-in" onClick={e => e.stopPropagation()}>
          <div>
            <label className="label text-xs">Name</label>
            <input className="input text-sm" value={editName} onChange={e => setEditName(e.target.value)} />
          </div>
          <div>
            <label className="label text-xs">Creature Type</label>
            <input className="input text-sm" value={editType} onChange={e => setEditType(e.target.value)} placeholder="undead, beast, humanoid…" />
          </div>
          <div>
            <label className="label text-xs">Description</label>
            <textarea className="textarea text-sm h-16" value={editDesc} onChange={e => setEditDesc(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button
              className="btn-primary flex-1 justify-center text-sm"
              onClick={() => { onEdit!({ name: editName.trim() || enemy.name, description: editDesc, enemyType: editType }); setEditing(false) }}
            >
              <Check size={13} /> Save
            </button>
            <button className="btn-ghost text-sm" onClick={() => setEditing(false)}>
              <X size={13} /> Cancel
            </button>
          </div>
        </div>
      )}

      {expanded && (
        <div className="mt-3 pt-3 border-t border-border animate-fade-in space-y-3">
          {enemy.description && (
            <p className="text-xs text-ink-muted italic">{enemy.description}</p>
          )}

          {/* D&D 5e stat block */}
          {is5e && (
            <>
              {(sb.str || sb.dex || sb.con) && (
                <div className="grid grid-cols-6 gap-1 bg-surface-2 rounded-card px-2 py-2">
                  {(['str','dex','con','int','wis','cha'] as const).map(stat => (
                    sb[stat] !== undefined && (
                      <AbilityScore key={stat} label={stat.toUpperCase()} value={sb[stat] as number} />
                    )
                  ))}
                </div>
              )}
              <div className="space-y-1">
                <StatBlockRow label="Speed" value={sb.speed as string} />
                <StatBlockRow label="Saves" value={sb.saves as string} />
                <StatBlockRow label="Skills" value={sb.skills as string} />
                <StatBlockRow label="Senses" value={sb.senses as string} />
                <StatBlockRow label="Languages" value={sb.languages as string} />
              </div>
              {sb.traits && (
                <div>
                  <p className="text-[11px] font-bold text-ink-muted uppercase tracking-wide mb-1">Traits</p>
                  <p className="text-xs text-ink">{sb.traits as string}</p>
                </div>
              )}
              {sb.actions && (
                <div>
                  <p className="text-[11px] font-bold text-ink-muted uppercase tracking-wide mb-1">Actions</p>
                  <p className="text-xs text-ink">{sb.actions as string}</p>
                </div>
              )}
            </>
          )}

          {/* Dungeon World stat block */}
          {isDw && (
            <div className="space-y-1">
              <div className="flex gap-4 flex-wrap">
                {sb.hp !== undefined && <StatBlockRow label="HP" value={sb.hp as number} />}
                {sb.armor !== undefined && <StatBlockRow label="Armor" value={sb.armor as number} />}
                {!!sb.damage && <StatBlockRow label="Damage" value={sb.damage as string} />}
              </div>
              {!!sb.instinct && <StatBlockRow label="Instinct" value={sb.instinct as string} />}
              {!!sb.moves && (
                <div>
                  <p className="text-[11px] font-bold text-ink-muted uppercase tracking-wide mb-1">Moves</p>
                  <div className="space-y-0.5">
                    {(sb.moves as string).split('\n').filter(Boolean).map((m, i) => (
                      <p key={i} className="text-xs text-ink">• {m}</p>
                    ))}
                  </div>
                </div>
              )}
              {!!sb.tags && <StatBlockRow label="Tags" value={sb.tags as string} />}
            </div>
          )}

          {/* Generic stat block for other systems */}
          {!is5e && !isDw && Object.keys(sb).length > 0 && (
            <div className="space-y-1">
              {Object.entries(sb).map(([k, v]) => (
                <StatBlockRow key={k} label={k} value={v as string | number} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function EnemiesPage() {
  const { campaignId } = useParams<{ campaignId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [searchInput, setSearchInput] = useState('')
  const [importModalOpen, setImportModalOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['enemies', campaignId, search, typeFilter],
    queryFn: () => api.get(`/api/campaigns/${campaignId}/enemies`, {
      params: {
        ...(search ? { q: search } : {}),
        ...(typeFilter === 'custom' ? { source: 'custom' } : typeFilter !== 'all' ? { type: typeFilter } : {}),
      },
    }).then(r => r.data),
    enabled: !!campaignId,
  })

  const deleteEnemy = useMutation({
    mutationFn: (enemyId: string) =>
      api.delete(`/api/campaigns/${campaignId}/enemies/${enemyId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['enemies', campaignId] }),
    onError: (e) => alert(apiError(e)),
  })

  const editEnemy = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { name: string; description: string; enemyType: string } }) =>
      api.patch(`/api/campaigns/${campaignId}/enemies/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['enemies', campaignId] }),
    onError: (e) => alert(apiError(e)),
  })

  const srdEnemies: Enemy[] = data?.srdEnemies ?? []
  const customEnemies: Enemy[] = data?.customEnemies ?? []
  const systemTemplateId: string = data?.systemTemplateId ?? ''

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setSearch(searchInput)
  }

  const systemName =
    systemTemplateId === 'builtin-d-d-5e' ? 'D&D 5e'
    : systemTemplateId === 'builtin-dungeon-world' ? 'Dungeon World'
    : 'System'

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-8 py-6 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="display-font text-3xl font-bold text-ink flex items-center gap-3">
              <Swords size={28} className="text-accent" />
              Bestiary
            </h1>
            <p className="text-ink-muted text-sm mt-0.5">
              {srdEnemies.length} system monsters · {customEnemies.length} custom creatures
            </p>
          </div>
          <div className="flex items-center gap-2">
            {systemTemplateId === 'builtin-d-d-5e' && (
              <button
                className="btn-secondary flex items-center gap-1.5"
                onClick={() => setImportModalOpen(true)}
              >
                <Download size={16} /> Import from SRD
              </button>
            )}
            <button
              className="btn-primary"
              onClick={() => navigate(`/campaign/${campaignId}/generate/enemy`)}
            >
              <Plus size={16} /> Generate Foe
            </button>
          </div>
        </div>
        {importModalOpen && campaignId && (
          <MonsterImportModal
            campaignId={campaignId}
            onClose={() => setImportModalOpen(false)}
          />
        )}

        {/* Search */}
        <form onSubmit={handleSearch} className="flex gap-2 max-w-md">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              className="input pl-8 text-sm w-full"
              placeholder="Search bestiary…"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
            />
          </div>
          <button type="submit" className="btn-secondary text-sm">Search</button>
          {search && (
            <button
              type="button"
              className="btn-ghost text-sm"
              onClick={() => { setSearch(''); setSearchInput('') }}
            >
              Clear
            </button>
          )}
        </form>

        {/* Type filters */}
        <div className="flex gap-1 mt-3 overflow-x-auto pb-1">
          {TYPE_FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setTypeFilter(f.id)}
              className={cn(
                'flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap',
                typeFilter === f.id
                  ? 'bg-accent text-white'
                  : 'text-ink-muted hover:text-ink bg-surface-2 hover:bg-surface-2'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-8">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <ThemedLoader />
          </div>
        ) : (
          <>
            {/* Custom Creatures */}
            {customEnemies.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="display-font text-lg font-bold text-ink">Custom Creatures</h2>
                  <span className="px-2 py-0.5 rounded-full text-xs bg-accent/10 text-accent font-medium">{customEnemies.length}</span>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {customEnemies.map(enemy => (
                    <EnemyCard
                      key={enemy.id}
                      enemy={enemy}
                      systemTemplateId={systemTemplateId}
                      onDelete={() => deleteEnemy.mutate(enemy.id)}
                      onEdit={(patch) => editEnemy.mutate({ id: enemy.id, patch })}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* SRD Bestiary */}
            {srdEnemies.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <BookOpen size={16} className="text-ink-muted" />
                  <h2 className="display-font text-lg font-bold text-ink">{systemName} Bestiary</h2>
                  <span className="px-2 py-0.5 rounded-full text-xs bg-surface-2 text-ink-muted font-medium">{srdEnemies.length}</span>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
                  {srdEnemies.map((enemy: Enemy) => (
                    <EnemyCard
                      key={enemy.id as string}
                      enemy={enemy}
                      systemTemplateId={systemTemplateId}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Empty state */}
            {srdEnemies.length === 0 && customEnemies.length === 0 && (
              search ? (
                <EmptyState
                  icon="🔍"
                  title="No creatures match your search"
                  description={`No creatures match "${search}"`}
                />
              ) : (
                <EmptyState
                  section="creatures"
                  description="Generate creatures with AI or switch to a system with a built-in bestiary."
                  action={(
                    <button
                      className="btn-primary"
                      onClick={() => navigate(`/campaign/${campaignId}/generate/enemy`)}
                    >
                      <Plus size={16} /> Generate Foe
                    </button>
                  )}
                />
              )
            )}
          </>
        )}
      </div>
    </div>
  )
}
