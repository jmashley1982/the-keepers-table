import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { AtSign, User, MapPin, BookOpen, Scroll, Shield } from 'lucide-react'

type EntityType = 'pc' | 'npc' | 'location' | 'item' | 'faction'

interface MentionEntity {
  id: string
  name: string
  type: EntityType
  subtitle?: string
}

const TYPE_LABELS: Record<EntityType, string> = {
  pc: 'PC', npc: 'NPC', location: 'Loc', item: 'Item', faction: 'Faction',
}
const TYPE_COLORS: Record<EntityType, string> = {
  pc:       'bg-blue-500/15 text-blue-400',
  npc:      'bg-accent/15 text-accent',
  location: 'bg-emerald-500/15 text-emerald-400',
  item:     'bg-orange-500/15 text-orange-400',
  faction:  'bg-purple-500/15 text-purple-400',
}
const TYPE_ICONS: Record<EntityType, React.ReactNode> = {
  pc:       <Shield size={10} />,
  npc:      <User size={10} />,
  location: <MapPin size={10} />,
  item:     <BookOpen size={10} />,
  faction:  <Scroll size={10} />,
}

interface RawEntity { id: string; name: string; role?: string; type?: string; class?: string; level?: number }

interface Props {
  value: string
  onChange: (v: string) => void
  campaignId: string
  className?: string
  placeholder?: string
}

export default function MentionTextarea({ value, onChange, campaignId, className, placeholder }: Props) {
  const textareaRef  = useRef<HTMLTextAreaElement>(null)
  const navigatingRef = useRef(false)   // true while arrow/enter/esc is handling the dropdown
  const [mentionState, setMentionState] = useState<{ query: string; start: number } | null>(null)
  const [selectedIdx, setSelectedIdx] = useState(0)

  const { data: npcData }     = useQuery({ queryKey: ['entities', campaignId, 'npcs'],      queryFn: () => api.get(`/api/entities/${campaignId}/npcs`).then(r => r.data),      enabled: !!campaignId })
  const { data: locData }     = useQuery({ queryKey: ['entities', campaignId, 'locations'], queryFn: () => api.get(`/api/entities/${campaignId}/locations`).then(r => r.data), enabled: !!campaignId })
  const { data: itemData }    = useQuery({ queryKey: ['entities', campaignId, 'items'],     queryFn: () => api.get(`/api/entities/${campaignId}/items`).then(r => r.data),     enabled: !!campaignId })
  const { data: factionData } = useQuery({ queryKey: ['entities', campaignId, 'factions'], queryFn: () => api.get(`/api/entities/${campaignId}/factions`).then(r => r.data), enabled: !!campaignId })
  const { data: pcData }      = useQuery({ queryKey: ['player-characters', campaignId],    queryFn: () => api.get(`/api/campaigns/${campaignId}/player-characters`).then(r => r.data), enabled: !!campaignId })

  const allEntities: MentionEntity[] = [
    ...(pcData?.items      ?? []).map((e: RawEntity) => ({ id: e.id, name: e.name, type: 'pc'       as const, subtitle: [e.class, e.level ? `Lv${e.level}` : ''].filter(Boolean).join(' ') || undefined })),
    ...(npcData?.items     ?? []).map((e: RawEntity) => ({ id: e.id, name: e.name, type: 'npc'      as const, subtitle: e.role })),
    ...(locData?.items     ?? []).map((e: RawEntity) => ({ id: e.id, name: e.name, type: 'location' as const, subtitle: e.type })),
    ...(itemData?.items    ?? []).map((e: RawEntity) => ({ id: e.id, name: e.name, type: 'item'     as const })),
    ...(factionData?.items ?? []).map((e: RawEntity) => ({ id: e.id, name: e.name, type: 'faction'  as const })),
  ]

  const filtered = mentionState
    ? allEntities.filter(e => e.name.toLowerCase().includes(mentionState.query.toLowerCase())).slice(0, 8)
    : []

  function detectMention(text: string, cursor: number) {
    let i = cursor - 1
    while (i >= 0 && text[i] !== '\n' && text[i] !== ' ') {
      if (text[i] === '@') {
        const query = text.slice(i + 1, cursor)
        setMentionState({ query, start: i })
        setSelectedIdx(0)
        return
      }
      i--
    }
    setMentionState(null)
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    onChange(e.target.value)
    detectMention(e.target.value, e.target.selectionStart ?? e.target.value.length)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!mentionState || filtered.length === 0) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Tab' || e.key === 'Escape') {
      navigatingRef.current = true
      // Reset on the next microtask so onSelect (which fires after keydown) is suppressed
      Promise.resolve().then(() => { navigatingRef.current = false })
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx(i => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      insertMention(filtered[selectedIdx])
    } else if (e.key === 'Escape') {
      setMentionState(null)
    }
  }

  function insertMention(entity: MentionEntity) {
    if (!mentionState) return
    const before = value.slice(0, mentionState.start)
    const after  = value.slice(mentionState.start + 1 + mentionState.query.length)
    const tag    = `@${TYPE_LABELS[entity.type]}:${entity.name}`
    const newVal = `${before}${tag}${after}`
    onChange(newVal)
    setMentionState(null)
    setTimeout(() => {
      if (!textareaRef.current) return
      const pos = before.length + tag.length
      textareaRef.current.selectionStart = pos
      textareaRef.current.selectionEnd   = pos
      textareaRef.current.focus()
    }, 0)
  }

  return (
    <div className="relative flex-1 flex flex-col min-h-0">
      <textarea
        ref={textareaRef}
        className={className}
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onSelect={e => {
          if (navigatingRef.current) return   // suppress cursor-move detection during dropdown navigation
          const ta = e.target as HTMLTextAreaElement
          detectMention(ta.value, ta.selectionStart)
        }}
      />

      {mentionState && (
        <div className="absolute bottom-2 left-2 w-72 bg-surface border border-border rounded-card shadow-2xl z-20 overflow-hidden">
          <div className="px-3 py-1.5 border-b border-border bg-surface-2 flex items-center gap-1.5 text-[10px] text-ink-muted uppercase tracking-wide font-medium">
            <AtSign size={10} />
            Tag an entity
            {mentionState.query && <span className="ml-1 text-accent">"{mentionState.query}"</span>}
          </div>

          {filtered.length === 0 ? (
            <div className="px-3 py-3 text-xs text-ink-muted text-center">No matches</div>
          ) : (
            filtered.map((entity, i) => (
              <button
                key={entity.id}
                onMouseDown={e => { e.preventDefault(); insertMention(entity) }}
                onMouseEnter={() => setSelectedIdx(i)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors border-l-2',
                  i === selectedIdx
                    ? 'bg-accent/20 border-accent text-ink'
                    : 'border-transparent hover:bg-surface-2'
                )}
              >
                <span className="text-ink-muted shrink-0">{TYPE_ICONS[entity.type]}</span>
                <span className="flex-1 min-w-0">
                  <span className="text-xs font-medium text-ink truncate block">{entity.name}</span>
                  {entity.subtitle && <span className="text-[10px] text-ink-muted">{entity.subtitle}</span>}
                </span>
                <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider shrink-0', TYPE_COLORS[entity.type])}>
                  {TYPE_LABELS[entity.type]}
                </span>
              </button>
            ))
          )}

          <div className="px-3 py-1 border-t border-border bg-surface-2 text-[10px] text-ink-muted/70 flex gap-3">
            <span>↑↓ navigate</span>
            <span>↵ / Tab select</span>
            <span>Esc close</span>
          </div>
        </div>
      )}
    </div>
  )
}
