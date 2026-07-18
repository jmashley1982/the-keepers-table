import { useParams } from 'react-router-dom'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { CLAUDE_MODELS } from '../../lib/claudeModels'
import { Sparkles, Loader, AlertTriangle, Check, GitMerge, Link2, PencilLine } from 'lucide-react'

interface EditProposal {
  entityType: string; entityId: string; entityName: string
  field: string; currentValue?: string; newValue: string; reason?: string
}
interface MergeProposal {
  keepId: string; keepName: string; mergeId: string; mergeName: string
  mergedDescription: string; reason?: string
}
interface LinkProposal {
  entityAType: string; entityAId: string; entityAName: string
  entityBType: string; entityBId: string; entityBName: string
  relationshipType: string; notes?: string; reason?: string
}
interface Contradiction {
  summary: string; involved?: { type: string; id: string; name: string }[]; suggestion?: string
}
interface Proposals {
  edits: EditProposal[]; merges: MergeProposal[]; links: LinkProposal[]; contradictions: Contradiction[]
}

// Local review state layered over each proposal: whether it's accepted + the
// (possibly user-edited) value that will be applied.
type EditRow = EditProposal & { accepted: boolean; value: string }
type MergeRow = MergeProposal & { accepted: boolean; value: string }
type LinkRow = LinkProposal & { accepted: boolean }

export default function LoreCheckerPage() {
  const { campaignId } = useParams<{ campaignId: string }>()
  const qc = useQueryClient()

  const { data: me } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => (await api.get('/auth/me')).data,
  })
  const defaultModel: string = me?.user?.preference?.defaultTextModel ?? 'claude-opus-4-5'
  const [model, setModel] = useState<string>('')
  const activeModel = model || defaultModel

  const [edits, setEdits] = useState<EditRow[]>([])
  const [merges, setMerges] = useState<MergeRow[]>([])
  const [links, setLinks] = useState<LinkRow[]>([])
  const [contradictions, setContradictions] = useState<Contradiction[]>([])
  const [hasRun, setHasRun] = useState(false)
  const [truncated, setTruncated] = useState(false)
  const [applyMsg, setApplyMsg] = useState<string | null>(null)

  const run = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/api/generate/lore-check/${campaignId}`, { model: activeModel })
      return res.data as { proposals: Proposals; truncated?: boolean }
    },
    onSuccess: (data) => {
      const p = data.proposals ?? { edits: [], merges: [], links: [], contradictions: [] }
      setEdits((p.edits ?? []).map(e => ({ ...e, accepted: false, value: e.newValue ?? '' })))
      setMerges((p.merges ?? []).map(m => ({ ...m, accepted: false, value: m.mergedDescription ?? '' })))
      setLinks((p.links ?? []).map(l => ({ ...l, accepted: false })))
      setContradictions(p.contradictions ?? [])
      setTruncated(Boolean(data.truncated))
      setHasRun(true)
      setApplyMsg(null)
    },
    onError: (e) => alert(apiError(e)),
  })

  const acceptedCount =
    edits.filter(e => e.accepted).length + merges.filter(m => m.accepted).length + links.filter(l => l.accepted).length

  const apply = useMutation({
    mutationFn: async () => {
      const payload = {
        acceptedEdits: edits.filter(e => e.accepted).map(e => ({
          entityType: e.entityType, entityId: e.entityId, field: e.field, newValue: e.value,
        })),
        acceptedMerges: merges.filter(m => m.accepted).map(m => ({
          keepId: m.keepId, mergeId: m.mergeId, mergedDescription: m.value,
        })),
        acceptedLinks: links.filter(l => l.accepted).map(l => ({
          entityAType: l.entityAType, entityAId: l.entityAId,
          entityBType: l.entityBType, entityBId: l.entityBId,
          relationshipType: l.relationshipType, notes: l.notes,
        })),
      }
      return (await api.post(`/api/generate/lore-check/${campaignId}/apply`, payload)).data as {
        applied: { edits: number; merges: number; links: number }
      }
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['entities', campaignId] })
      const { edits: e, merges: m, links: l } = data.applied
      setApplyMsg(`Applied ${e} edit${e === 1 ? '' : 's'}, ${m} merge${m === 1 ? '' : 's'}, ${l} link${l === 1 ? '' : 's'}.`)
      // Drop applied rows so the list reflects what's left to review.
      setEdits(rows => rows.filter(r => !r.accepted))
      setMerges(rows => rows.filter(r => !r.accepted))
      setLinks(rows => rows.filter(r => !r.accepted))
    },
    onError: (e) => alert(apiError(e)),
  })

  const nothingFound = hasRun && !run.isPending &&
    edits.length === 0 && merges.length === 0 && links.length === 0 && contradictions.length === 0

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="display-font text-3xl font-bold text-ink flex items-center gap-3">
          <Sparkles className="text-accent" /> Lore Checker
        </h1>
        <p className="text-sm text-ink-muted mt-1">
          Claude reviews your whole campaign — session notes, NPCs, items, locations, factions, and plot threads —
          for contradictions and loose or duplicate story threads, then proposes tidy-ups for you to edit and confirm.
        </p>
      </div>

      {/* Controls */}
      <div className="card flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[200px]">
          <label className="label">Model</label>
          <select className="input" value={activeModel} onChange={e => setModel(e.target.value)}>
            {CLAUDE_MODELS.map(m => (
              <option key={m.value} value={m.value}>{m.label} — {m.badge}</option>
            ))}
          </select>
        </div>
        <button className="btn-primary justify-center" onClick={() => run.mutate()} disabled={run.isPending}>
          {run.isPending
            ? <><Loader size={16} className="animate-spin" /> Reviewing your campaign…</>
            : <><Sparkles size={16} /> {hasRun ? 'Re-run check' : 'Run Lore Check'}</>}
        </button>
      </div>

      {run.isPending && (
        <p className="text-xs text-ink-muted mt-3">
          This reads your entire campaign and can take a little while for large campaigns.
        </p>
      )}

      {truncated && (
        <p className="text-xs text-orange-400 mt-3 flex items-center gap-1">
          <AlertTriangle size={12} /> Your campaign is large, so only part of the lore was reviewed this pass.
        </p>
      )}

      {applyMsg && (
        <p className="text-sm text-green-500 mt-4 flex items-center gap-1"><Check size={14} /> {applyMsg}</p>
      )}

      {nothingFound && (
        <div className="card text-center py-10 text-ink-muted mt-4">
          <div className="text-3xl mb-2">✨</div>
          <p className="text-sm">No contradictions or loose threads found — your lore looks consistent.</p>
        </div>
      )}

      {/* Proposals */}
      {(edits.length > 0 || merges.length > 0 || links.length > 0 || contradictions.length > 0) && (
        <div className="mt-6 space-y-6">
          {edits.length > 0 && (
            <section>
              <h2 className="display-font font-semibold text-ink flex items-center gap-2 mb-2">
                <PencilLine size={16} /> Suggested edits ({edits.length})
              </h2>
              <div className="space-y-3">
                {edits.map((e, i) => (
                  <div key={i} className="card space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm">
                        <span className="font-semibold text-ink">{e.entityName}</span>
                        <span className="text-ink-muted"> · {e.field}</span>
                      </div>
                      <AcceptToggle checked={e.accepted} onChange={v => setEdits(rows => rows.map((r, j) => j === i ? { ...r, accepted: v } : r))} />
                    </div>
                    {e.reason && <p className="text-xs text-ink-muted italic">{e.reason}</p>}
                    {e.currentValue && (
                      <p className="text-xs text-ink-muted line-through opacity-70">{e.currentValue}</p>
                    )}
                    <textarea
                      className="textarea text-sm"
                      rows={2}
                      value={e.value}
                      onChange={ev => setEdits(rows => rows.map((r, j) => j === i ? { ...r, value: ev.target.value } : r))}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {merges.length > 0 && (
            <section>
              <h2 className="display-font font-semibold text-ink flex items-center gap-2 mb-2">
                <GitMerge size={16} /> Merge plot threads ({merges.length})
              </h2>
              <div className="space-y-3">
                {merges.map((m, i) => (
                  <div key={i} className="card space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm text-ink">
                        Fold <span className="font-semibold">{m.mergeName}</span> into{' '}
                        <span className="font-semibold">{m.keepName}</span>
                        <span className="text-ink-muted"> (the folded thread is marked dormant)</span>
                      </div>
                      <AcceptToggle checked={m.accepted} onChange={v => setMerges(rows => rows.map((r, j) => j === i ? { ...r, accepted: v } : r))} />
                    </div>
                    {m.reason && <p className="text-xs text-ink-muted italic">{m.reason}</p>}
                    <textarea
                      className="textarea text-sm"
                      rows={3}
                      value={m.value}
                      onChange={ev => setMerges(rows => rows.map((r, j) => j === i ? { ...r, value: ev.target.value } : r))}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {links.length > 0 && (
            <section>
              <h2 className="display-font font-semibold text-ink flex items-center gap-2 mb-2">
                <Link2 size={16} /> Suggested links ({links.length})
              </h2>
              <div className="space-y-3">
                {links.map((l, i) => (
                  <div key={i} className="card space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm text-ink">
                        <span className="font-semibold">{l.entityAName}</span>
                        <span className="text-accent"> —{l.relationshipType}→ </span>
                        <span className="font-semibold">{l.entityBName}</span>
                      </div>
                      <AcceptToggle checked={l.accepted} onChange={v => setLinks(rows => rows.map((r, j) => j === i ? { ...r, accepted: v } : r))} />
                    </div>
                    {l.notes && <p className="text-xs text-ink-muted">{l.notes}</p>}
                    {l.reason && <p className="text-xs text-ink-muted italic">{l.reason}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {contradictions.length > 0 && (
            <section>
              <h2 className="display-font font-semibold text-ink flex items-center gap-2 mb-2">
                <AlertTriangle size={16} className="text-orange-400" /> Contradictions to review ({contradictions.length})
              </h2>
              <div className="space-y-3">
                {contradictions.map((c, i) => (
                  <div key={i} className="card border-orange-400/30 space-y-1">
                    <p className="text-sm text-ink">{c.summary}</p>
                    {c.involved && c.involved.length > 0 && (
                      <p className="text-xs text-ink-muted">Involves: {c.involved.map(x => x.name).join(', ')}</p>
                    )}
                    {c.suggestion && <p className="text-xs text-ink-muted italic">Suggestion: {c.suggestion}</p>}
                  </div>
                ))}
              </div>
              <p className="text-xs text-ink-muted mt-2">
                Contradictions are advisory — resolve them by accepting a matching edit above or editing entities directly.
              </p>
            </section>
          )}

          {(edits.length > 0 || merges.length > 0 || links.length > 0) && (
            <div className="sticky bottom-4 flex justify-end">
              <button
                className="btn-primary shadow-lg"
                onClick={() => apply.mutate()}
                disabled={acceptedCount === 0 || apply.isPending}
              >
                {apply.isPending
                  ? <><Loader size={16} className="animate-spin" /> Applying…</>
                  : <><Check size={16} /> Apply {acceptedCount} accepted change{acceptedCount === 1 ? '' : 's'}</>}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AcceptToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-xs shrink-0 cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className={checked ? 'text-green-500 font-medium' : 'text-ink-muted'}>Accept</span>
    </label>
  )
}
