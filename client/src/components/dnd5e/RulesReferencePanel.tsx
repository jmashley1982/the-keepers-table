import { useState } from 'react'
import { X, Search, Loader, Shield } from 'lucide-react'
import { useDnd5eRules, useDnd5eRulesItem, type SrdItem } from '../../hooks/useDnd5eApi'
import { cn } from '../../lib/cn'

type RulesTab = 'conditions' | 'damage-types' | 'skills' | 'ability-scores'

const TABS: { id: RulesTab; label: string }[] = [
  { id: 'conditions', label: 'Conditions' },
  { id: 'damage-types', label: 'Damage Types' },
  { id: 'skills', label: 'Skills' },
  { id: 'ability-scores', label: 'Ability Scores' },
]

function RulesItemDetail({ category, index }: { category: RulesTab; index: string }) {
  const { data, isLoading } = useDnd5eRulesItem(category, index)
  if (isLoading) return <div className="flex justify-center py-8"><Loader size={20} className="animate-spin text-accent" /></div>
  if (!data) return <p className="text-sm text-ink-muted p-4">Failed to load.</p>

  const name = data.name as string
  const desc = data.desc as string[] | string | undefined
  const abilityScore = data.ability_score as { name?: string; full_name?: string } | undefined
  const skills = (data.skills as Array<{ name: string }> | undefined) ?? []

  const descLines = Array.isArray(desc)
    ? desc
    : desc
    ? [desc]
    : []

  return (
    <div className="p-4 space-y-3 text-sm">
      <h3 className="display-font font-bold text-ink">{name}</h3>

      {abilityScore && (
        <p className="text-xs text-ink-muted">
          <span className="font-semibold">Ability Score:</span> {abilityScore.full_name ?? abilityScore.name}
        </p>
      )}

      {skills.length > 0 && (
        <p className="text-xs text-ink-muted">
          <span className="font-semibold">Related Skills:</span> {skills.map(s => s.name).join(', ')}
        </p>
      )}

      {descLines.length > 0 ? (
        <div className="space-y-1.5">
          {descLines.map((line, i) => (
            <p key={i} className="text-xs text-ink leading-relaxed">{line}</p>
          ))}
        </div>
      ) : (
        <p className="text-xs text-ink-muted italic">No description available.</p>
      )}
    </div>
  )
}

interface RulesReferencePanelProps {
  onClose: () => void
}

export default function RulesReferencePanel({ onClose }: RulesReferencePanelProps) {
  const [tab, setTab] = useState<RulesTab>('conditions')
  const [q, setQ] = useState('')
  const [selectedIndex, setSelectedIndex] = useState<string | null>(null)

  const { data: rules, isLoading } = useDnd5eRules()

  const allItems: SrdItem[] = rules
    ? (tab === 'conditions'
      ? rules.conditions
      : tab === 'damage-types'
      ? rules.damageTypes
      : tab === 'skills'
      ? rules.skills
      : rules.abilityScores)
    : []

  const filtered = q.trim()
    ? allItems.filter(i => i.name.toLowerCase().includes(q.toLowerCase()))
    : allItems

  function handleTabChange(newTab: RulesTab) {
    setTab(newTab)
    setSelectedIndex(null)
    setQ('')
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-surface rounded-card border border-border w-full max-w-2xl my-4 shadow-xl flex flex-col"
        style={{ maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h2 className="display-font text-base font-bold text-ink flex items-center gap-2">
            <Shield size={16} className="text-accent" /> 5e Rules Reference
          </h2>
          <button className="btn-ghost p-1.5" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="px-4 py-2 border-b border-border shrink-0 space-y-2">
          <div className="flex gap-1 flex-wrap">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => handleTabChange(t.id)}
                className={cn(
                  'px-3 py-1.5 text-xs rounded-card font-medium transition-colors',
                  tab === t.id ? 'bg-accent text-white' : 'text-ink-muted hover:text-ink bg-surface-2'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              className="input pl-8 text-sm w-full"
              placeholder={`Search ${TABS.find(t => t.id === tab)?.label ?? ''}…`}
              value={q}
              onChange={e => { setQ(e.target.value); setSelectedIndex(null) }}
            />
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden min-h-0">
          <div className="w-1/2 border-r border-border overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader size={20} className="animate-spin text-accent" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-center text-sm text-ink-muted py-12">No results.</p>
            ) : (
              <div className="p-2 space-y-0.5">
                {filtered.map(item => (
                  <button
                    key={item.index}
                    onClick={() => setSelectedIndex(item.index === selectedIndex ? null : item.index)}
                    className={cn(
                      'w-full text-left px-3 py-2 text-sm rounded transition-colors',
                      selectedIndex === item.index
                        ? 'bg-accent/15 text-accent font-semibold'
                        : 'text-ink hover:bg-surface-2'
                    )}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="w-1/2 overflow-y-auto">
            {selectedIndex ? (
              <RulesItemDetail category={tab} index={selectedIndex} />
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-ink-muted p-4 text-center">
                Select an entry to read its description.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
