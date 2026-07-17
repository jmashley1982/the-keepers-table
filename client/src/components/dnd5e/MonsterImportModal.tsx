import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Search, Loader, Download } from 'lucide-react'
import { useDnd5eMonsters, useDnd5eMonster, type SrdItem } from '../../hooks/useDnd5eApi'
import { cn } from '../../lib/cn'
import { api, apiError } from '../../lib/api'
import { useQueryClient } from '@tanstack/react-query'
import ThemedLoader from '../ui/Loader'
import EmptyState from '../ui/EmptyState'

function abilityMod(v: number) {
  const m = Math.floor((v - 10) / 2)
  return m >= 0 ? `+${m}` : String(m)
}

function MonsterPreview({ index }: { index: string }) {
  const { data: m, isLoading } = useDnd5eMonster(index)
  if (isLoading) return <div className="flex justify-center py-8"><ThemedLoader /></div>
  if (!m) return <p className="text-sm text-ink-muted p-3">Failed to load.</p>

  const size = m.size as string | undefined
  const type = m.type as string | undefined
  const cr = m.challenge_rating as number | string | undefined
  const hp = m.hit_points as number | undefined
  const hpDice = m.hit_points_roll as string | undefined
  const ac = (m.armor_class as Array<{ value: number }> | undefined)?.[0]?.value
  const speed = Object.entries((m.speed as Record<string, string | number>) ?? {})
    .map(([k, v]) => `${k} ${v}`).join(', ')
  const str = m.strength as number
  const dex = m.dexterity as number
  const con = m.constitution as number
  const int_ = m.intelligence as number
  const wis = m.wisdom as number
  const cha = m.charisma as number
  const senses = Object.entries((m.senses as Record<string, string | number>) ?? {})
    .map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`).join(', ')
  const languages = m.languages as string | undefined
  const actions = (m.actions as Array<{ name: string; desc: string }> | undefined) ?? []
  const specialAbilities = (m.special_abilities as Array<{ name: string; desc: string }> | undefined) ?? []

  return (
    <div className="p-3 space-y-2 text-xs">
      <p className="text-ink-muted italic capitalize">{[size, type].filter(Boolean).join(' ')} · CR {cr ?? '—'}</p>

      <div className="grid grid-cols-6 gap-1 bg-surface rounded px-2 py-2">
        {[['STR', str], ['DEX', dex], ['CON', con], ['INT', int_], ['WIS', wis], ['CHA', cha]].map(([label, val]) => (
          <div key={label as string} className="flex flex-col items-center">
            <span className="text-[9px] font-bold text-ink-muted">{label}</span>
            <span className="font-bold text-ink">{val}</span>
            <span className="text-ink-muted">({abilityMod(val as number)})</span>
          </div>
        ))}
      </div>

      <div className="space-y-0.5">
        {ac !== undefined && <div><span className="font-semibold text-ink-muted">AC:</span> <span className="text-ink">{ac}</span></div>}
        {hp !== undefined && <div><span className="font-semibold text-ink-muted">HP:</span> <span className="text-ink">{hp} {hpDice ? `(${hpDice})` : ''}</span></div>}
        {speed && <div><span className="font-semibold text-ink-muted">Speed:</span> <span className="text-ink">{speed}</span></div>}
        {senses && <div><span className="font-semibold text-ink-muted">Senses:</span> <span className="text-ink">{senses}</span></div>}
        {languages && <div><span className="font-semibold text-ink-muted">Languages:</span> <span className="text-ink">{languages}</span></div>}
      </div>

      {specialAbilities.length > 0 && (
        <div>
          <p className="font-semibold text-ink-muted uppercase tracking-wide mb-0.5" style={{ fontSize: '9px' }}>Traits</p>
          {specialAbilities.slice(0, 3).map(a => (
            <p key={a.name} className="text-ink"><span className="font-semibold">{a.name}.</span> {a.desc.slice(0, 120)}{a.desc.length > 120 ? '…' : ''}</p>
          ))}
        </div>
      )}

      {actions.length > 0 && (
        <div>
          <p className="font-semibold text-ink-muted uppercase tracking-wide mb-0.5" style={{ fontSize: '9px' }}>Actions</p>
          {actions.slice(0, 3).map(a => (
            <p key={a.name} className="text-ink"><span className="font-semibold">{a.name}.</span> {a.desc.slice(0, 120)}{a.desc.length > 120 ? '…' : ''}</p>
          ))}
        </div>
      )}
    </div>
  )
}

function mapMonsterToEnemy(m: Record<string, unknown>) {
  const size = (m.size as string | undefined)?.toLowerCase() ?? ''
  const type = m.type as string | undefined ?? ''
  const subtype = m.subtype as string | undefined
  const enemyType = subtype ? `${type} (${subtype})` : type
  const cr = m.challenge_rating as number | string | undefined
  const hp = m.hit_points as number | undefined
  const hpDice = m.hit_points_roll as string | undefined
  const ac = (m.armor_class as Array<{ value: number }> | undefined)?.[0]?.value
  const speed = Object.entries((m.speed as Record<string, string | number>) ?? {})
    .map(([k, v]) => `${k} ${v}`).join(', ')
  const senses = Object.entries((m.senses as Record<string, string | number>) ?? {})
    .map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`).join(', ')
  const languages = m.languages as string | undefined
  const actions = (m.actions as Array<{ name: string; desc: string }> | undefined) ?? []
  const specialAbilities = (m.special_abilities as Array<{ name: string; desc: string }> | undefined) ?? []

  const traits = specialAbilities.map(a => `${a.name}: ${a.desc}`).join('\n')
  const actionsText = actions.map(a => `${a.name}: ${a.desc}`).join('\n')

  const typeNames = (m.damage_immunities as string[] | undefined) ?? []
  const tags: string[] = [type, ...(typeNames.slice(0, 2))]
    .filter(Boolean)
    .map(t => t.toLowerCase())

  return {
    name: m.name as string,
    description: `${(m.name as string)} — a ${size} ${enemyType}.`,
    enemyType,
    size,
    cr: cr !== undefined ? String(cr) : null,
    source: 'srd_import',
    tags,
    statBlock: {
      str: m.strength ?? 10,
      dex: m.dexterity ?? 10,
      con: m.constitution ?? 10,
      int: m.intelligence ?? 10,
      wis: m.wisdom ?? 10,
      cha: m.charisma ?? 10,
      ac: ac ?? 10,
      hp: hp !== undefined ? `${hp}${hpDice ? ` (${hpDice})` : ''}` : '',
      speed,
      senses,
      languages: languages ?? '',
      traits,
      actions: actionsText,
      saves: '',
      skills: '',
    },
  }
}

interface MonsterImportModalProps {
  campaignId: string
  onClose: () => void
  onImported?: () => void
}

export default function MonsterImportModal({ campaignId, onClose, onImported }: MonsterImportModalProps) {
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [selectedIndex, setSelectedIndex] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300)
    return () => clearTimeout(t)
  }, [q])

  const { data: monsters, isLoading } = useDnd5eMonsters(debouncedQ || undefined)
  const { data: selectedMonster } = useDnd5eMonster(selectedIndex)

  const displayMonsters = (monsters ?? []).slice(0, 150)

  async function handleImport() {
    if (!selectedMonster) return
    setImporting(true)
    setImportError('')
    try {
      const payload = mapMonsterToEnemy(selectedMonster)
      await api.post(`/api/campaigns/${campaignId}/enemies`, payload)
      qc.invalidateQueries({ queryKey: ['enemies', campaignId] })
      onImported?.()
      onClose()
    } catch (err) {
      setImportError(apiError(err))
    } finally {
      setImporting(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-surface rounded-card border border-border w-full max-w-2xl my-4 shadow-xl flex flex-col"
        style={{ maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h2 className="display-font text-base font-bold text-ink flex items-center gap-2">
            <Download size={16} className="text-accent" /> Import from SRD
          </h2>
          <button className="btn-ghost p-1.5" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="px-4 py-3 border-b border-border shrink-0">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              className="input pl-8 text-sm w-full"
              placeholder="Search SRD monsters…"
              value={q}
              onChange={e => { setQ(e.target.value); setSelectedIndex(null) }}
              autoFocus
            />
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden min-h-0">
          <div className="w-1/2 border-r border-border overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <ThemedLoader />
              </div>
            ) : displayMonsters.length === 0 ? (
              <EmptyState icon="🔍" title="No monsters found" description="Try a different search term." />
            ) : (
              <div className="p-2 space-y-0.5">
                {displayMonsters.map(m => (
                  <button
                    key={m.index}
                    onClick={() => setSelectedIndex(m.index)}
                    className={cn(
                      'w-full text-left px-3 py-2 text-sm rounded transition-colors',
                      selectedIndex === m.index
                        ? 'bg-accent/15 text-accent font-semibold'
                        : 'text-ink hover:bg-surface-2'
                    )}
                  >
                    {m.name}
                  </button>
                ))}
                {(monsters ?? []).length > 150 && (
                  <p className="text-center text-xs text-ink-muted py-2">Refine your search to see more.</p>
                )}
              </div>
            )}
          </div>

          <div className="w-1/2 overflow-y-auto">
            {selectedIndex ? (
              <MonsterPreview index={selectedIndex} />
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-ink-muted p-4 text-center">
                Select a monster to preview its stat block.
              </div>
            )}
          </div>
        </div>

        <div className="px-4 py-3 border-t border-border shrink-0 flex items-center justify-between gap-3">
          {importError && <p className="text-xs text-red-400">{importError}</p>}
          <div className="flex gap-2 ml-auto">
            <button className="btn-ghost text-sm" onClick={onClose}>Cancel</button>
            <button
              className="btn-primary text-sm flex items-center gap-1.5"
              disabled={!selectedIndex || importing}
              onClick={handleImport}
            >
              {importing ? <Loader size={13} className="animate-spin" /> : <Download size={13} />}
              Import to Bestiary
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
