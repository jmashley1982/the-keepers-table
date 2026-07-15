import { useState } from 'react'
import { X, BookOpen, ChevronDown, ChevronUp, PlusCircle, CheckCircle } from 'lucide-react'
import { DW_CLASSES, DWAdvancedMove, DWClassTemplate } from '../../lib/dwClasses'
import { cn } from '../../lib/cn'

function MoveCard({
  move,
  onAddToFeatures,
  alreadyAdded,
}: {
  move: DWAdvancedMove
  onAddToFeatures?: (move: DWAdvancedMove) => void
  alreadyAdded?: boolean
}) {
  return (
    <div className="border border-border rounded-card p-3 bg-surface-2">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <span className="font-semibold text-sm text-ink">{move.name}</span>
        <span className="flex gap-1.5 flex-wrap items-center">
          {move.requires && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/30">
              Requires: {move.requires}
            </span>
          )}
          {move.replaces && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface text-ink-muted border border-border">
              Replaces: {move.replaces}
            </span>
          )}
          {onAddToFeatures && (
            alreadyAdded ? (
              <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-600 border border-green-500/30">
                <CheckCircle size={10} />
                Added
              </span>
            ) : (
              <button
                className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/30 hover:bg-accent hover:text-white transition-colors"
                onClick={() => onAddToFeatures(move)}
              >
                <PlusCircle size={10} />
                Add to features
              </button>
            )
          )}
        </span>
      </div>
      <p className="text-xs text-ink-muted mt-1.5 whitespace-pre-line">{move.description}</p>
    </div>
  )
}

function MoveTier({
  title,
  moves,
  onAddToFeatures,
  currentFeatures,
}: {
  title: string
  moves: DWAdvancedMove[]
  onAddToFeatures?: (move: DWAdvancedMove) => void
  currentFeatures?: string
}) {
  const [open, setOpen] = useState(true)
  if (moves.length === 0) return null
  return (
    <div>
      <button
        className="w-full flex items-center justify-between text-left py-1.5"
        onClick={() => setOpen(v => !v)}
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {title} <span className="normal-case font-normal">({moves.length} moves)</span>
        </span>
        {open ? <ChevronUp size={14} className="text-ink-muted" /> : <ChevronDown size={14} className="text-ink-muted" />}
      </button>
      {open && (
        <div className="space-y-2 mt-1">
          {moves.map(m => (
            <MoveCard
              key={m.name}
              move={m}
              onAddToFeatures={onAddToFeatures}
              alreadyAdded={
                onAddToFeatures != null &&
                !!currentFeatures &&
                currentFeatures.includes(m.name)
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function DWClassMovesModal({
  initialClass,
  onClose,
  onAddToFeatures,
  currentFeatures,
}: {
  initialClass?: string
  onClose: () => void
  onAddToFeatures?: (move: DWAdvancedMove) => void
  currentFeatures?: string
}) {
  const [selected, setSelected] = useState<DWClassTemplate>(
    DW_CLASSES.find(c => c.name === initialClass) ?? DW_CLASSES[0],
  )
  const [showStarting, setShowStarting] = useState(false)

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-surface rounded-card border border-border w-full max-w-2xl my-4 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <h2 className="display-font text-lg font-bold text-ink flex items-center gap-2">
            <BookOpen size={18} className="text-accent" />
            Dungeon World Class Moves
          </h2>
          <button className="btn-ghost p-1.5" onClick={onClose}><X size={16} /></button>
        </div>

        {onAddToFeatures && (
          <div className="px-5 pt-3 pb-0">
            <p className="text-xs text-ink-muted bg-accent/5 border border-accent/20 rounded px-2.5 py-1.5">
              Click <strong>Add to features</strong> on any move to append it to this character's features.
            </p>
          </div>
        )}

        {/* Class tabs */}
        <div className="px-5 pt-3 flex flex-wrap gap-1.5">
          {DW_CLASSES.map(cls => (
            <button
              key={cls.name}
              className={cn(
                'px-2.5 py-1 rounded text-xs border transition-colors',
                selected.name === cls.name
                  ? 'bg-accent text-white border-accent'
                  : 'bg-surface-2 text-ink-muted border-border hover:text-ink',
              )}
              onClick={() => setSelected(cls)}
            >
              {cls.name}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-4">
          <div className="text-xs text-ink-muted">
            {selected.name} — {selected.damageDie} damage, {selected.hpBase}+CON HP, Load {selected.loadBase}
          </div>

          <div>
            <button
              className="w-full flex items-center justify-between text-left py-1.5"
              onClick={() => setShowStarting(v => !v)}
            >
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Starting Moves</span>
              {showStarting ? <ChevronUp size={14} className="text-ink-muted" /> : <ChevronDown size={14} className="text-ink-muted" />}
            </button>
            {showStarting && (
              <pre className="text-xs text-ink-muted whitespace-pre-wrap font-sans border border-border rounded-card p-3 bg-surface-2 mt-1">
                {selected.startingMoves}
              </pre>
            )}
          </div>

          {selected.advancedMoves1.length === 0 && selected.advancedMoves2.length === 0 ? (
            <p className="text-sm text-ink-muted italic">
              No advanced move data available for this class.
            </p>
          ) : (
            <>
              <MoveTier
                title="Advanced Moves — Levels 2–5"
                moves={selected.advancedMoves1}
                onAddToFeatures={onAddToFeatures}
                currentFeatures={currentFeatures}
              />
              <MoveTier
                title="Advanced Moves — Levels 6–10"
                moves={selected.advancedMoves2}
                onAddToFeatures={onAddToFeatures}
                currentFeatures={currentFeatures}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
