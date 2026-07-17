import { useState, useEffect } from 'react'
import { X, Search, ChevronDown, ChevronUp, BookOpen } from 'lucide-react'
import { useDnd5eSpells, useDnd5eSpell, type SrdItem } from '../../hooks/useDnd5eApi'
import { cn } from '../../lib/cn'
import ThemedLoader from '../ui/Loader'

const SCHOOLS = [
  { value: '', label: 'All Schools' },
  { value: 'abjuration', label: 'Abjuration' },
  { value: 'conjuration', label: 'Conjuration' },
  { value: 'divination', label: 'Divination' },
  { value: 'enchantment', label: 'Enchantment' },
  { value: 'evocation', label: 'Evocation' },
  { value: 'illusion', label: 'Illusion' },
  { value: 'necromancy', label: 'Necromancy' },
  { value: 'transmutation', label: 'Transmutation' },
]

const LEVELS = [
  { value: '', label: 'All Levels' },
  { value: '0', label: 'Cantrip (0)' },
  ...Array.from({ length: 9 }, (_, i) => ({ value: String(i + 1), label: `Level ${i + 1}` })),
]

function SpellDetail({ index, onAddToNotes }: { index: string; onAddToNotes?: (text: string) => void }) {
  const { data: spell, isLoading } = useDnd5eSpell(index)

  if (isLoading) return (
    <div className="flex justify-center py-8">
      <ThemedLoader />
    </div>
  )
  if (!spell) return <p className="text-sm text-ink-muted p-4">Failed to load spell details.</p>

  const level = spell.level === 0 ? 'Cantrip' : `${spell.level}th level`
  const school = (spell.school as { name?: string } | null)?.name ?? ''
  const components = (spell.components as string[] | null) ?? []
  const material = spell.material as string | undefined
  const desc = (spell.desc as string[] | null) ?? []
  const higherLevel = (spell.higher_level as string[] | null) ?? []
  const summary = [
    `${spell.name} (${level} ${school})`,
    `Casting Time: ${spell.casting_time ?? '—'} | Range: ${spell.range ?? '—'} | Duration: ${spell.duration ?? '—'}`,
    `Components: ${components.join(', ')}${material ? ` (${material})` : ''}`,
    ...desc,
    ...(higherLevel.length ? [`At Higher Levels: ${higherLevel.join(' ')}`] : []),
  ].join('\n')

  return (
    <div className="p-4 space-y-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="display-font text-base font-bold text-ink">{spell.name as string}</h3>
          <p className="text-xs text-ink-muted italic">{level} {school}</p>
        </div>
        {onAddToNotes && (
          <button
            className="btn-secondary text-xs py-1 shrink-0 flex items-center gap-1"
            onClick={() => onAddToNotes(summary)}
          >
            <BookOpen size={11} /> Add to Notes
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div><span className="font-semibold text-ink-muted">Casting Time:</span> <span className="text-ink">{spell.casting_time as string}</span></div>
        <div><span className="font-semibold text-ink-muted">Range:</span> <span className="text-ink">{spell.range as string}</span></div>
        <div><span className="font-semibold text-ink-muted">Duration:</span> <span className="text-ink">{spell.duration as string}</span></div>
        <div><span className="font-semibold text-ink-muted">Concentration:</span> <span className="text-ink">{spell.concentration ? 'Yes' : 'No'}</span></div>
        <div><span className="font-semibold text-ink-muted">Ritual:</span> <span className="text-ink">{spell.ritual ? 'Yes' : 'No'}</span></div>
        <div>
          <span className="font-semibold text-ink-muted">Components:</span>{' '}
          <span className="text-ink">{components.join(', ')}</span>
        </div>
      </div>

      {material && (
        <p className="text-xs text-ink-muted italic">Material: {material}</p>
      )}

      <div className="space-y-1">
        {desc.map((line, i) => (
          <p key={i} className="text-xs text-ink leading-relaxed">{line}</p>
        ))}
      </div>

      {higherLevel.length > 0 && (
        <div className="border-t border-border pt-2">
          <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1">At Higher Levels</p>
          {higherLevel.map((line, i) => (
            <p key={i} className="text-xs text-ink">{line}</p>
          ))}
        </div>
      )}

      {spell.classes && (
        <p className="text-xs text-ink-muted">
          <span className="font-semibold">Classes:</span>{' '}
          {(spell.classes as Array<{ name: string }>).map(c => c.name).join(', ')}
        </p>
      )}
    </div>
  )
}

function SpellRow({
  spell,
  selected,
  onSelect,
}: {
  spell: SrdItem
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full text-left px-3 py-2 text-sm rounded flex items-center justify-between gap-2 transition-colors',
        selected ? 'bg-accent/15 text-accent' : 'text-ink hover:bg-surface-2'
      )}
    >
      <span className="font-medium">{spell.name}</span>
      {selected ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
    </button>
  )
}

interface SpellLookupModalProps {
  onClose: () => void
  onAddToNotes?: (text: string) => void
}

export default function SpellLookupModal({ onClose, onAddToNotes }: SpellLookupModalProps) {
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [level, setLevel] = useState('')
  const [school, setSchool] = useState('')
  const [selectedIndex, setSelectedIndex] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300)
    return () => clearTimeout(t)
  }, [q])

  const { data: spells, isLoading } = useDnd5eSpells(
    debouncedQ || undefined,
    level || undefined,
    school || undefined,
  )

  const displaySpells = (spells ?? []).slice(0, 100)

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-surface rounded-card border border-border w-full max-w-2xl my-4 shadow-xl flex flex-col"
        style={{ maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h2 className="display-font text-base font-bold text-ink flex items-center gap-2">
            <BookOpen size={16} className="text-accent" /> Spell Reference
          </h2>
          <button className="btn-ghost p-1.5" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="px-4 py-3 border-b border-border space-y-2 shrink-0">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              className="input pl-8 text-sm w-full"
              placeholder="Search spells…"
              value={q}
              onChange={e => setQ(e.target.value)}
              autoFocus
            />
          </div>
          <div className="flex gap-2">
            <select className="input text-xs flex-1" value={level} onChange={e => { setLevel(e.target.value); setSelectedIndex(null) }}>
              {LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
            <select className="input text-xs flex-1" value={school} onChange={e => { setSchool(e.target.value); setSelectedIndex(null) }}>
              {SCHOOLS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <ThemedLoader />
            </div>
          ) : displaySpells.length === 0 ? (
            <p className="text-center text-sm text-ink-muted py-12">No spells found.</p>
          ) : (
            <div className="p-2 space-y-0.5">
              {displaySpells.map(spell => (
                <div key={spell.index}>
                  <SpellRow
                    spell={spell}
                    selected={selectedIndex === spell.index}
                    onSelect={() => setSelectedIndex(selectedIndex === spell.index ? null : spell.index)}
                  />
                  {selectedIndex === spell.index && (
                    <div className="mx-2 mb-1 rounded-card border border-border bg-surface-2 animate-fade-in">
                      <SpellDetail index={spell.index} onAddToNotes={onAddToNotes} />
                    </div>
                  )}
                </div>
              ))}
              {(spells ?? []).length > 100 && (
                <p className="text-center text-xs text-ink-muted py-2">
                  Showing first 100 results — refine your search.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
