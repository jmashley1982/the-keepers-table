import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  /** Icon-only trigger with no chevron/label — for narrow spaces like the collapsed sidebar rail. */
  compact?: boolean
  className?: string
}

const MENU_WIDTH = 160 // px, matches w-40
const VIEWPORT_MARGIN = 8

export default function ThemeSwitcher({ variant = 'inline', compact = false, className }: Props) {
  const { theme, setTheme, reduceEffects, setReduceEffects } = useUIStore()
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickAway(e: MouseEvent) {
      const target = e.target as Node
      if (rootRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onClickAway)
    return () => document.removeEventListener('mousedown', onClickAway)
  }, [open])

  // Menu is portaled to <body> (fixed position) so it always paints above
  // page content — an absolutely-positioned descendant can be defeated by
  // any later sibling elsewhere on the page that shares or exceeds its
  // ancestor's stacking context (e.g. SplashPage's header/main both being
  // `relative z-10`), leaving the menu visible but unclickable.
  function toggleOpen() {
    if (!open && rootRef.current) {
      const rect = rootRef.current.getBoundingClientRect()
      const maxLeft = window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN
      const left = Math.min(Math.max(rect.right - MENU_WIDTH, VIEWPORT_MARGIN), Math.max(maxLeft, VIEWPORT_MARGIN))
      setMenuPos({ top: rect.bottom + 4, left })
    }
    setOpen(v => !v)
  }

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
        onClick={toggleOpen}
        title={`Theme: ${theme}`}
        className={cn(
          'flex items-center gap-1.5 rounded-card text-ink-muted hover:text-ink transition-colors',
          variant === 'floating'
            ? 'w-9 h-9 justify-center border border-border shadow-sm'
            : compact
              ? 'w-8 h-8 justify-center'
              : 'px-2.5 py-1.5 text-xs hover:bg-surface-2',
        )}
        style={variant === 'floating' ? {
          background: 'color-mix(in srgb, var(--color-surface) 90%, transparent)',
          backdropFilter: 'blur(6px)',
        } : undefined}
      >
        <ActiveIcon size={variant === 'floating' ? 15 : 13} />
        {variant === 'inline' && !compact && (
          <ChevronDown size={11} className={cn('transition-transform', open && 'rotate-180')} />
        )}
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          className="fixed card py-1 px-0 z-[999] animate-fade-in"
          style={{ top: menuPos.top, left: menuPos.left, width: MENU_WIDTH }}
        >
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
        </div>,
        document.body,
      )}
    </div>
  )
}
