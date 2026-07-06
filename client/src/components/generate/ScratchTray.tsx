import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { useUIStore } from '../../store/useUIStore'
import { useParams } from 'react-router-dom'
import { cn } from '../../lib/cn'
import { X, Save, Trash2, ChevronRight, ChevronLeft } from 'lucide-react'

export default function ScratchTray() {
  const { campaignId } = useParams()
  const { scratchTray, markScratchSaved, removeScratchItem, clearScratch } = useUIStore()
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()

  const saveItem = useMutation({
    mutationFn: async ({ id, kind, data }: { id: string; kind: string; data: Record<string, unknown> }) => {
      if (!campaignId) throw new Error('Open a campaign to save items')
      const endpointMap: Record<string, string> = {
        npc: 'npcs', encounter: 'encounters', treasure: 'items', item: 'items',
        location: 'locations', faction: 'factions',
      }
      const endpoint = endpointMap[kind]
      if (!endpoint) throw new Error('Cannot save this type to campaign')
      await api.post(`/api/entities/${campaignId}/${endpoint}`, data)
      return id
    },
    onSuccess: (id) => {
      markScratchSaved(id)
      qc.invalidateQueries({ queryKey: ['entities', campaignId] })
    },
    onError: (e) => alert(apiError(e)),
  })

  const count = scratchTray.filter(i => !i.saved).length

  if (scratchTray.length === 0) return null

  return (
    <>
      {/* Toggle tab */}
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          'fixed right-0 top-1/2 -translate-y-1/2 z-40 bg-surface border border-border rounded-l-card py-3 px-2 flex flex-col items-center gap-1 transition-transform shadow-lg',
          open && 'translate-x-64'
        )}
      >
        {open ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        <span className="text-[10px] font-medium text-ink-muted [writing-mode:vertical-rl]">Scratch</span>
        {count > 0 && (
          <span className="bg-accent text-white text-[10px] rounded-full w-5 h-5 flex items-center justify-center font-bold">
            {count}
          </span>
        )}
      </button>

      {/* Tray panel */}
      {open && (
        <div className="fixed right-0 top-0 h-full w-64 bg-surface border-l border-border z-30 flex flex-col shadow-2xl animate-slide-in-right">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="font-semibold text-ink text-sm">Scratch Tray</h3>
            <div className="flex gap-1">
              {scratchTray.length > 0 && (
                <button className="btn-ghost p-1 text-xs text-ink-muted" onClick={clearScratch}>
                  Clear all
                </button>
              )}
              <button className="btn-ghost p-1" onClick={() => setOpen(false)}>
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {scratchTray.map(item => (
              <div
                key={item.id}
                className={cn(
                  'card text-sm p-3 transition-opacity',
                  item.saved && 'opacity-50'
                )}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-accent capitalize">{item.kind}</span>
                  <button className="btn-ghost p-0.5" onClick={() => removeScratchItem(item.id)}>
                    <X size={12} />
                  </button>
                </div>

                <p className="font-semibold text-ink text-xs truncate mb-1">
                  {(item.data.name as string) || (item.data.text as string)?.slice(0, 60) || 'Generated result'}
                </p>

                {!!item.data.description && (
                  <p className="text-xs text-ink-muted line-clamp-2">{String(item.data.description)}</p>
                )}
                {!!item.data.text && !item.data.name && (
                  <p className="text-xs text-ink-muted line-clamp-3 whitespace-pre-wrap">{String(item.data.text)}</p>
                )}

                {!item.saved && campaignId && item.kind !== 'freeform' && item.kind !== 'quick' && (
                  <button
                    className="btn-primary text-xs py-1 px-2 mt-2 w-full justify-center"
                    onClick={() => saveItem.mutate({ id: item.id, kind: item.kind, data: item.data })}
                    disabled={saveItem.isPending}
                  >
                    <Save size={11} /> Save to Campaign
                  </button>
                )}

                {item.saved && (
                  <span className="text-xs text-green-500 mt-1 flex items-center gap-1">✓ Saved</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
