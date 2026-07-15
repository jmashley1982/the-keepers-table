import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { Search, X, Link2, Swords } from 'lucide-react'
import { cn } from '../../lib/cn'

interface BestiaryEntry {
  id: string
  name: string
  enemyType: string
  size?: string
  cr?: string
  statBlock: Record<string, unknown>
  tags: string[]
  source: string
  isBuiltin: boolean
  description?: string
}

interface BestiaryPickerProps {
  campaignId: string
  linkedId?: string | null
  linkedName?: string | null
  onSelect: (entry: BestiaryEntry) => void
  onClear: () => void
}

export default function BestiaryPicker({
  campaignId, linkedId, linkedName, onSelect, onClear,
}: BestiaryPickerProps) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  const { data, isFetching } = useQuery({
    queryKey: ['bestiary-pick', campaignId, debouncedQ],
    queryFn: () =>
      api.get(`/api/campaigns/${campaignId}/enemies`, {
        params: { ...(debouncedQ.trim() ? { q: debouncedQ } : {}) },
      }).then(r => r.data),
    enabled: open && !!campaignId,
    staleTime: 30_000,
  })

  const srdEntries: BestiaryEntry[] = data?.srdEnemies ?? []
  const customEntries: BestiaryEntry[] = data?.customEnemies ?? []
  const allEntries = [...customEntries, ...srdEntries]

  function handleSelect(entry: BestiaryEntry) {
    onSelect(entry)
    setOpen(false)
    setQ('')
  }

  if (linkedId) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-card bg-accent/8 border border-accent/20">
        <Swords size={13} className="text-accent shrink-0" />
        <span className="text-xs text-ink flex-1 truncate">
          <span className="text-ink-muted mr-1">Linked:</span>
          <span className="font-medium">{linkedName ?? linkedId}</span>
        </span>
        <button
          className="btn-ghost p-0.5 text-ink-muted hover:text-danger"
          onClick={onClear}
          title="Unlink"
        >
          <X size={12} />
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      {!open ? (
        <button
          type="button"
          className="btn-ghost text-xs flex items-center gap-1.5 text-ink-muted hover:text-accent"
          onClick={() => setOpen(true)}
        >
          <Link2 size={13} />
          Link to Bestiary creature
        </button>
      ) : (
        <div className="border border-border rounded-card bg-surface shadow-lg overflow-hidden">
          <div className="relative border-b border-border">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              ref={inputRef}
              className="w-full pl-8 pr-8 py-2 text-xs bg-transparent text-ink placeholder:text-ink-muted outline-none"
              placeholder="Search bestiary…"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
              onClick={() => { setOpen(false); setQ('') }}
            >
              <X size={12} />
            </button>
          </div>

          <div className="max-h-52 overflow-y-auto">
            {isFetching && allEntries.length === 0 ? (
              <p className="text-xs text-ink-muted text-center py-4">Searching…</p>
            ) : allEntries.length === 0 ? (
              <p className="text-xs text-ink-muted text-center py-4">No creatures found</p>
            ) : (
              <>
                {customEntries.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-ink-muted uppercase tracking-wider px-3 pt-2 pb-1">Custom</p>
                    {customEntries.map(e => <EntryRow key={e.id} entry={e} onSelect={handleSelect} />)}
                  </div>
                )}
                {srdEntries.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-ink-muted uppercase tracking-wider px-3 pt-2 pb-1">
                      {data?.systemTemplateId === 'builtin-d-d-5e' ? 'D&D 5e SRD' : data?.systemTemplateId === 'builtin-dungeon-world' ? 'DW SRD' : 'SRD'}
                    </p>
                    {srdEntries.slice(0, 40).map((e, i) => <EntryRow key={e.id ?? i} entry={e} onSelect={handleSelect} />)}
                    {srdEntries.length > 40 && (
                      <p className="text-[10px] text-ink-muted text-center py-1">Search to narrow results…</p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function EntryRow({ entry, onSelect }: { entry: BestiaryEntry; onSelect: (e: BestiaryEntry) => void }) {
  return (
    <button
      type="button"
      className={cn(
        'w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-surface-2 transition-colors'
      )}
      onClick={() => onSelect(entry)}
    >
      <span className="text-xs font-medium text-ink truncate flex-1">{entry.name}</span>
      <span className="text-[10px] text-ink-muted shrink-0">
        {[entry.size, entry.enemyType].filter(Boolean).join(' ')}
        {entry.cr ? ` · CR ${entry.cr}` : ''}
      </span>
    </button>
  )
}
