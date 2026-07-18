import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { Upload, Download, Loader } from 'lucide-react'

// Narrative fields that make an NPC portable between campaigns. Everything else
// (ids, timestamps, campaign-bound references, image assets) is deliberately dropped
// so an exported file re-imports cleanly into any campaign.
const PORTABLE_FIELDS = [
  'name', 'role', 'description', 'appearance', 'personality', 'motivations',
  'secrets', 'voiceNotes', 'statBlock', 'status', 'dispositionToParty',
  'tags', 'dmOnlyNotes', 'customFields',
] as const

type NpcRecord = Record<string, unknown>

function pickPortable(npc: NpcRecord): NpcRecord {
  const out: NpcRecord = {}
  for (const key of PORTABLE_FIELDS) {
    const v = npc[key]
    if (v !== undefined && v !== null) out[key] = v
  }
  return out
}

export default function NpcImportExportButtons({ campaignId, onImported }: {
  campaignId: string
  onImported: () => void
}) {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<null | 'export' | 'import'>(null)

  async function handleExport() {
    setBusy('export')
    try {
      // Fetch the full list fresh (no search/filter) so the export is complete.
      const res = await api.get(`/api/entities/${campaignId}/npcs`)
      const items: NpcRecord[] = res.data?.items ?? []
      const payload = {
        app: 'keepers-table',
        kind: 'npcs',
        version: 1,
        npcs: items.map(pickPortable),
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'keepers-table-npcs.json'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert(apiError(e))
    } finally {
      setBusy(null)
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy('import')
    try {
      const text = await file.text()
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        alert('That file is not valid JSON.')
        return
      }

      // Accept an envelope { npcs: [...] }, a bare array, or a single NPC object.
      let list: NpcRecord[]
      if (Array.isArray(parsed)) {
        list = parsed as NpcRecord[]
      } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { npcs?: unknown }).npcs)) {
        list = (parsed as { npcs: NpcRecord[] }).npcs
      } else if (parsed && typeof parsed === 'object') {
        list = [parsed as NpcRecord]
      } else {
        alert("Couldn't find any NPCs in that file.")
        return
      }

      const candidates = list
        .map(pickPortable)
        .filter(n => typeof n.name === 'string' && (n.name as string).trim())

      if (candidates.length === 0) {
        alert('No NPCs with a name were found in that file.')
        return
      }

      let created = 0
      let failed = 0
      for (const npc of candidates) {
        try {
          await api.post(`/api/entities/${campaignId}/npcs`, npc)
          created++
        } catch {
          failed++
        }
      }

      qc.invalidateQueries({ queryKey: ['entities', campaignId] })
      onImported()

      const skipped = list.length - candidates.length
      const bits = [`Imported ${created} NPC${created === 1 ? '' : 's'}`]
      if (failed) bits.push(`${failed} failed`)
      if (skipped) bits.push(`${skipped} skipped (no name)`)
      alert(bits.join(', ') + '.')
    } finally {
      setBusy(null)
      if (fileRef.current) fileRef.current.value = '' // allow re-importing the same file
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleFile}
      />
      <button className="btn-ghost" onClick={() => fileRef.current?.click()} disabled={busy !== null} title="Import NPCs from a JSON file">
        {busy === 'import' ? <Loader size={16} className="animate-spin" /> : <Upload size={16} />} Import
      </button>
      <button className="btn-ghost" onClick={handleExport} disabled={busy !== null} title="Export this campaign's NPCs to a JSON file">
        {busy === 'export' ? <Loader size={16} className="animate-spin" /> : <Download size={16} />} Export
      </button>
    </div>
  )
}
