import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { Plus, ChevronDown, ChevronUp, Sparkles, Loader, BookOpen, Trash2, ExternalLink } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import ThemedLoader from '../ui/Loader'

type Category = 'faction' | 'region' | 'npc' | 'pantheon' | 'conflict' | 'secret'

interface Entry {
  id: string
  category: Category
  name: string
  summary: string
  detail: string
  entityId: string | null
  entityType: string | null
}

const CATEGORIES: { value: Category; label: string; icon: string; libraryType?: string }[] = [
  { value: 'faction',  label: 'Factions',           icon: '⚔️',  libraryType: 'faction' },
  { value: 'region',   label: 'Regions / Locations', icon: '🗺️',  libraryType: 'location' },
  { value: 'npc',      label: 'Major NPCs',          icon: '🧙',  libraryType: 'npc' },
  { value: 'pantheon', label: 'Pantheon / Powers',   icon: '✨' },
  { value: 'conflict', label: 'Central Conflict',    icon: '⚡' },
  { value: 'secret',   label: 'Secrets & Mysteries', icon: '🔐' },
]

interface Props { campaignId: string }

export default function WorldBuildingModule({ campaignId }: Props) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [activeCategory, setActiveCategory] = useState<Category>('faction')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandingId, setExpandingId] = useState<string | null>(null)
  const [promotingId, setPromotingId] = useState<string | null>(null)
  const [addingName, setAddingName] = useState('')
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())

  const { data, isLoading } = useQuery<{ entries: Entry[] }>({
    queryKey: ['world-building', campaignId],
    queryFn: () => api.get(`/api/campaigns/${campaignId}/session-zero/world-building`).then(r => r.data),
  })

  const createEntry = useMutation({
    mutationFn: (name: string) =>
      api.post(`/api/campaigns/${campaignId}/session-zero/world-building`, { name, category: activeCategory }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['world-building', campaignId] })
      setAddingName('')
    },
  })

  const deleteEntry = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/campaigns/${campaignId}/session-zero/world-building/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['world-building', campaignId] }),
  })

  async function saveField(entry: Entry, field: 'name' | 'summary' | 'detail', value: string) {
    setSavingIds(s => new Set(s).add(entry.id))
    try {
      await api.patch(`/api/campaigns/${campaignId}/session-zero/world-building/${entry.id}`, { [field]: value })
      qc.setQueryData<{ entries: Entry[] }>(['world-building', campaignId], old =>
        old ? { entries: old.entries.map(e => e.id === entry.id ? { ...e, [field]: value } : e) } : old
      )
    } finally {
      setSavingIds(s => { const n = new Set(s); n.delete(entry.id); return n })
    }
  }

  async function expandWithAI(entry: Entry) {
    setExpandingId(entry.id)
    qc.setQueryData<{ entries: Entry[] }>(['world-building', campaignId], old =>
      old ? { entries: old.entries.map(e => e.id === entry.id ? { ...e, detail: '' } : e) } : old
    )
    try {
      const resp = await fetch(`/api/campaigns/${campaignId}/session-zero/world-building/${entry.id}/expand`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!resp.body) return
      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let full = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const json = JSON.parse(line.slice(6))
            if (json.text) {
              full += json.text
              qc.setQueryData<{ entries: Entry[] }>(['world-building', campaignId], old =>
                old ? { entries: old.entries.map(e => e.id === entry.id ? { ...e, detail: full } : e) } : old
              )
            }
          } catch { /* ignore */ }
        }
      }
    } finally {
      setExpandingId(null)
    }
  }

  async function promoteToLibrary(entry: Entry) {
    setPromotingId(entry.id)
    try {
      const { data: res } = await api.post(
        `/api/campaigns/${campaignId}/session-zero/world-building/${entry.id}/promote`
      )
      qc.setQueryData<{ entries: Entry[] }>(['world-building', campaignId], old =>
        old ? { entries: old.entries.map(e => e.id === entry.id ? { ...e, ...res.entry } : e) } : old
      )
    } catch (e) {
      alert(apiError(e))
    } finally {
      setPromotingId(null)
    }
  }

  const entries = (data?.entries ?? []).filter(e => e.category === activeCategory)
  const catInfo = CATEGORIES.find(c => c.value === activeCategory)!

  return (
    <div className="space-y-5">
      {/* Category tabs */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map(cat => {
          const count = (data?.entries ?? []).filter(e => e.category === cat.value).length
          return (
            <button
              key={cat.value}
              onClick={() => setActiveCategory(cat.value)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all"
              style={activeCategory === cat.value ? {
                background: 'var(--color-accent)',
                color: '#fff',
                borderColor: 'var(--color-accent)',
              } : {
                background: 'transparent',
                color: 'var(--color-ink-muted)',
                borderColor: 'var(--color-border)',
              }}
            >
              <span>{cat.icon}</span>
              {cat.label}
              {count > 0 && (
                <span className="ml-1 rounded-full px-1.5 text-xs"
                  style={activeCategory === cat.value
                    ? { background: 'rgba(255,255,255,0.25)' }
                    : { background: 'var(--color-border)', color: 'var(--color-ink-muted)' }}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Entry list */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <ThemedLoader />
        </div>
      ) : (
        <div className="space-y-2">
          {entries.length === 0 && (
            <p className="text-sm text-ink-muted text-center py-6">
              No {catInfo.label.toLowerCase()} yet — add the first one below.
            </p>
          )}

          {entries.map(entry => (
            <EntryCard
              key={entry.id}
              entry={entry}
              expanded={expandedId === entry.id}
              onToggle={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
              onSave={saveField}
              onDelete={() => deleteEntry.mutate(entry.id)}
              onExpand={() => expandWithAI(entry)}
              onPromote={() => promoteToLibrary(entry)}
              onGoToLibrary={() => {
                if (entry.entityType === 'npc') navigate(`/campaign/${campaignId}/library?kind=npc`)
                else if (entry.entityType === 'location') navigate(`/campaign/${campaignId}/library?kind=location`)
                else if (entry.entityType === 'faction') navigate(`/campaign/${campaignId}/library?kind=faction`)
              }}
              isExpanding={expandingId === entry.id}
              isPromoting={promotingId === entry.id}
              isSaving={savingIds.has(entry.id)}
              canPromote={!!catInfo.libraryType && !entry.entityId}
            />
          ))}
        </div>
      )}

      {/* Add entry */}
      <div className="flex gap-2">
        <input
          className="input flex-1 text-sm"
          placeholder={`Add a ${catInfo.label.replace(/s$/, '').replace('ies', 'y').toLowerCase()}…`}
          value={addingName}
          onChange={e => setAddingName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addingName.trim() && createEntry.mutate(addingName.trim())}
        />
        <button
          className="btn-primary flex items-center gap-1 text-sm"
          onClick={() => addingName.trim() && createEntry.mutate(addingName.trim())}
          disabled={!addingName.trim() || createEntry.isPending}
        >
          {createEntry.isPending ? <Loader size={13} className="animate-spin" /> : <Plus size={13} />}
          Add
        </button>
      </div>
    </div>
  )
}

function EntryCard({
  entry, expanded, onToggle, onSave, onDelete, onExpand, onPromote, onGoToLibrary,
  isExpanding, isPromoting, isSaving, canPromote,
}: {
  entry: Entry
  expanded: boolean
  onToggle: () => void
  onSave: (e: Entry, f: 'name' | 'summary' | 'detail', v: string) => void
  onDelete: () => void
  onExpand: () => void
  onPromote: () => void
  onGoToLibrary: () => void
  isExpanding: boolean
  isPromoting: boolean
  isSaving: boolean
  canPromote: boolean
}) {
  const [localName, setLocalName] = useState(entry.name)
  const [localSummary, setLocalSummary] = useState(entry.summary)
  const [localDetail, setLocalDetail] = useState(entry.detail)

  // Sync when AI expand writes to entry.detail
  if (isExpanding && localDetail !== entry.detail) setLocalDetail(entry.detail)

  return (
    <div className="rounded-card border border-border overflow-hidden" style={{ background: 'var(--color-surface)' }}>
      <button className="w-full flex items-center justify-between px-4 py-3 text-left group" onClick={onToggle}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="font-medium text-sm text-ink truncate">{entry.name}</span>
          {entry.summary && (
            <span className="text-xs text-ink-muted truncate hidden sm:block">— {entry.summary}</span>
          )}
          {isSaving && <Loader size={10} className="animate-spin text-ink-muted flex-shrink-0" />}
          {entry.entityId && (
            <span className="text-xs px-1.5 py-0.5 rounded-full flex-shrink-0"
              style={{ background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)', color: 'var(--color-accent)' }}>
              In Library
            </span>
          )}
        </div>
        {expanded ? <ChevronUp size={14} className="text-ink-muted flex-shrink-0" /> : <ChevronDown size={14} className="text-ink-muted flex-shrink-0" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-border space-y-3 pt-3">
          <div>
            <label className="label">Name</label>
            <input
              className="input text-sm"
              value={localName}
              onChange={e => setLocalName(e.target.value)}
              onBlur={() => localName !== entry.name && onSave(entry, 'name', localName)}
            />
          </div>

          <div>
            <label className="label">One-line summary</label>
            <input
              className="input text-sm"
              placeholder="A sentence that captures the essence…"
              value={localSummary}
              onChange={e => setLocalSummary(e.target.value)}
              onBlur={() => localSummary !== entry.summary && onSave(entry, 'summary', localSummary)}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label">Detail</label>
              <button
                onClick={onExpand}
                disabled={isExpanding}
                className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full transition-colors"
                style={{ background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)', color: 'var(--color-accent)' }}
              >
                {isExpanding ? <Loader size={11} className="animate-spin" /> : <Sparkles size={11} />}
                Expand with AI
              </button>
            </div>
            <textarea
              className="input w-full min-h-[120px] text-sm leading-relaxed resize-y"
              placeholder="Full description, history, motivations, secrets…"
              value={isExpanding ? entry.detail : localDetail}
              onChange={e => setLocalDetail(e.target.value)}
              onBlur={() => !isExpanding && localDetail !== entry.detail && onSave(entry, 'detail', localDetail)}
              readOnly={isExpanding}
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <button
              onClick={onDelete}
              className="text-xs text-ink-muted hover:text-danger transition-colors flex items-center gap-1"
            >
              <Trash2 size={12} /> Delete
            </button>
            <div className="flex items-center gap-2">
              {entry.entityId && (
                <button
                  onClick={onGoToLibrary}
                  className="flex items-center gap-1 text-xs text-accent hover:underline"
                >
                  <ExternalLink size={12} /> View in Library
                </button>
              )}
              {canPromote && (
                <button
                  onClick={onPromote}
                  disabled={isPromoting}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium transition-colors"
                  style={{
                    background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
                    color: 'var(--color-accent)',
                    border: '1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)',
                  }}
                >
                  {isPromoting ? <Loader size={11} className="animate-spin" /> : <BookOpen size={11} />}
                  Add to Library
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
