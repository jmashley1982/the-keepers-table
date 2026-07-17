import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Contrast, Flame, Skull, Rocket, Terminal } from 'lucide-react'
import { useUIStore } from '../../store/useUIStore'
import { cn } from '../../lib/cn'

const THEME_OPTIONS = [
  { id: 'candlelight', label: 'Candlelight', icon: Flame },
  { id: 'eldritch',    label: 'Eldritch',    icon: Skull },
  { id: 'icarus',      label: 'Icarus',      icon: Rocket },
  { id: 'neon',        label: 'Neon',        icon: Terminal },
  { id: 'haunt',       label: 'Haunt',       icon: Contrast },
] as const

interface Props {
  variant?: 'inline' | 'floating'
  className?: string
}

export default function ThemeSwitcher({ variant = 'inline', className }: Props) {
  const { theme, setTheme, reduceEffects, setReduceEffects } = useUIStore()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickAway(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickAway)
    return () => document.removeEventListener('mousedown', onClickAway)
  }, [open])

  const ActiveIcon = THEME_OPTIONS.find(o => o.id === theme)?.icon ?? Flame

  return (
    <div
      ref={rootRef}
      className={cn(
        'relative',
        variant === 'floating' && 'fixed top-3 right-3 z-40',
        className,
      )}
    >
      <button
        onClick={() => setOpen(v => !v)}
        title={`Theme: ${theme}`}
        className={cn(
          'flex items-center gap-1.5 rounded-card text-ink-muted hover:text-ink transition-colors',
          variant === 'floating'
            ? 'w-9 h-9 justify-center border border-border shadow-sm'
            : 'px-2.5 py-1.5 text-xs hover:bg-surface-2',
        )}
        style={variant === 'floating' ? {
          background: 'color-mix(in srgb, var(--color-surface) 90%, transparent)',
          backdropFilter: 'blur(6px)',
        } : undefined}
      >
        <ActiveIcon size={variant === 'floating' ? 15 : 13} />
        {variant === 'inline' && (
          <ChevronDown size={11} className={cn('transition-transform', open && 'rotate-180')} />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 card py-1 px-0 w-40 z-50 animate-fade-in">
          {THEME_OPTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => { setTheme(id); setOpen(false) }}
              className={cn(
                'w-full text-left px-3 py-1.5 text-xs rounded flex items-center gap-2 transition-colors',
                theme === id ? 'text-accent font-semibold' : 'text-ink-muted hover:text-ink hover:bg-surface-2',
              )}
            >
              <Icon size={11} />
              {label}
            </button>
          ))}
          <div className="mx-3 my-1 h-px bg-border opacity-40" />
          <button
            onClick={() => setReduceEffects(!reduceEffects)}
            role="switch"
            aria-checked={reduceEffects}
            className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs text-ink-muted hover:text-ink transition-colors"
          >
            <span>Reduce motion</span>
            <span
              className="relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors"
              style={{ background: reduceEffects ? 'var(--color-accent)' : 'var(--color-border)' }}
            >
              <span
                className="inline-block h-3 w-3 rounded-full bg-white transition-transform"
                style={{ transform: reduceEffects ? 'translateX(0.875rem)' : 'translateX(0.125rem)' }}
              />
            </span>
          </button>
        </div>
      )}
    </div>
  )
}
