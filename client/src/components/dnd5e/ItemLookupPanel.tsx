import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Search, Package } from 'lucide-react'
import {
  useDnd5eEquipment,
  useDnd5eMagicItems,
  useDnd5eEquipmentDetail,
  useDnd5eMagicItemDetail,
  type SrdItem,
} from '../../hooks/useDnd5eApi'
import { cn } from '../../lib/cn'
import ThemedLoader from '../ui/Loader'
import EmptyState from '../ui/EmptyState'

type ItemTab = 'equipment' | 'magic-items'

function EquipmentDetail({ index }: { index: string }) {
  const { data: item, isLoading } = useDnd5eEquipmentDetail(index)
  if (isLoading) return <div className="flex justify-center py-8"><ThemedLoader /></div>
  if (!item) return <p className="text-sm text-ink-muted p-4">Failed to load.</p>

  const cost = item.cost as { quantity?: number; unit?: string } | undefined
  const weight = item.weight as number | undefined
  const damage = item.damage as { damage_dice?: string; damage_type?: { name?: string } } | undefined
  const properties = (item.properties as Array<{ name: string }> | undefined) ?? []
  const desc = (item.desc as string[] | undefined) ?? []
  const armorClass = item.armor_class as { base?: number; dex_bonus?: boolean } | undefined

  return (
    <div className="p-4 space-y-2 text-sm">
      <h3 className="display-font font-bold text-ink">{item.name as string}</h3>
      <p className="text-xs text-ink-muted capitalize">{item.equipment_category as { name?: string } | undefined
        ? (item.equipment_category as { name?: string }).name
        : String(item.equipment_category ?? '')}</p>

      <div className="space-y-1 text-xs">
        {cost && <div><span className="font-semibold text-ink-muted">Cost:</span> <span className="text-ink">{cost.quantity} {cost.unit}</span></div>}
        {weight !== undefined && <div><span className="font-semibold text-ink-muted">Weight:</span> <span className="text-ink">{weight} lb.</span></div>}
        {damage && <div><span className="font-semibold text-ink-muted">Damage:</span> <span className="text-ink">{damage.damage_dice} {damage.damage_type?.name}</span></div>}
        {armorClass && <div><span className="font-semibold text-ink-muted">AC:</span> <span className="text-ink">{armorClass.base}{armorClass.dex_bonus ? ' + DEX mod' : ''}</span></div>}
        {properties.length > 0 && (
          <div><span className="font-semibold text-ink-muted">Properties:</span> <span className="text-ink">{properties.map(p => p.name).join(', ')}</span></div>
        )}
      </div>

      {desc.length > 0 && (
        <div className="pt-1 space-y-1">
          {desc.map((line, i) => <p key={i} className="text-xs text-ink leading-relaxed">{line}</p>)}
        </div>
      )}
    </div>
  )
}

function MagicItemDetail({ index }: { index: string }) {
  const { data: item, isLoading } = useDnd5eMagicItemDetail(index)
  if (isLoading) return <div className="flex justify-center py-8"><ThemedLoader /></div>
  if (!item) return <p className="text-sm text-ink-muted p-4">Failed to load.</p>

  const rarity = item.rarity as { name?: string } | string | undefined
  const rarityName = typeof rarity === 'object' ? rarity?.name : String(rarity ?? '')
  const desc = (item.desc as string[] | undefined) ?? []
  const requiresAttunement = item.requires_attunement as string | boolean | undefined

  return (
    <div className="p-4 space-y-2 text-sm">
      <h3 className="display-font font-bold text-ink">{item.name as string}</h3>
      <div className="flex gap-2 flex-wrap text-xs">
        {rarityName && <span className="px-1.5 py-0.5 bg-surface-2 rounded text-ink-muted capitalize">{rarityName}</span>}
        {requiresAttunement && <span className="px-1.5 py-0.5 bg-accent/10 text-accent rounded">Attunement</span>}
      </div>

      {desc.length > 0 && (
        <div className="space-y-1 pt-1">
          {desc.map((line, i) => <p key={i} className="text-xs text-ink leading-relaxed">{line}</p>)}
        </div>
      )}
    </div>
  )
}

interface ItemLookupPanelProps {
  onClose: () => void
}

export default function ItemLookupPanel({ onClose }: ItemLookupPanelProps) {
  const [tab, setTab] = useState<ItemTab>('equipment')
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [selectedIndex, setSelectedIndex] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    setSelectedIndex(null)
  }, [tab])

  const { data: equipment, isLoading: loadingEq } = useDnd5eEquipment(debouncedQ || undefined)
  const { data: magicItems, isLoading: loadingMi } = useDnd5eMagicItems(debouncedQ || undefined)

  const items: SrdItem[] = tab === 'equipment' ? (equipment ?? []) : (magicItems ?? [])
  const isLoading = tab === 'equipment' ? loadingEq : loadingMi
  const displayItems = items.slice(0, 100)

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-surface rounded-card border border-border w-full max-w-2xl my-4 shadow-xl flex flex-col"
        style={{ maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h2 className="display-font text-base font-bold text-ink flex items-center gap-2">
            <Package size={16} className="text-accent" /> SRD Item Reference
          </h2>
          <button className="btn-ghost p-1.5" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="px-4 py-2 border-b border-border shrink-0 space-y-2">
          <div className="flex gap-1">
            {(['equipment', 'magic-items'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  'px-3 py-1.5 text-xs rounded-card font-medium transition-colors',
                  tab === t ? 'bg-accent text-white' : 'text-ink-muted hover:text-ink bg-surface-2'
                )}
              >
                {t === 'equipment' ? 'Equipment' : 'Magic Items'}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              className="input pl-8 text-sm w-full"
              placeholder={`Search ${tab === 'equipment' ? 'equipment' : 'magic items'}…`}
              value={q}
              onChange={e => { setQ(e.target.value); setSelectedIndex(null) }}
            />
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden min-h-0">
          <div className="w-1/2 border-r border-border overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <ThemedLoader />
              </div>
            ) : displayItems.length === 0 ? (
              <EmptyState icon="🔍" title="No items found" description="Try a different search term." />
            ) : (
              <div className="p-2 space-y-0.5">
                {displayItems.map(item => (
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
                {items.length > 100 && (
                  <p className="text-center text-xs text-ink-muted py-2">Showing 100 of {items.length} — search to narrow.</p>
                )}
              </div>
            )}
          </div>

          <div className="w-1/2 overflow-y-auto">
            {selectedIndex ? (
              tab === 'equipment'
                ? <EquipmentDetail index={selectedIndex} />
                : <MagicItemDetail index={selectedIndex} />
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-ink-muted p-4 text-center">
                Select an item to view its stats.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
