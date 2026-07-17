import { useEffect, useState } from 'react'
import { useUIStore } from '../../store/useUIStore'

/**
 * Purely decorative "closing the book" flourish shown the instant a GM wraps a
 * session. Self-dismissing, skippable, and fully decoupled from the actual
 * wrap-session save — the caller should fire its mutation independently and
 * never await this component. Falls back to an instant no-op under
 * prefers-reduced-motion / the in-app "Reduce motion" toggle.
 */
export default function SessionWrapCeremony({ onDone }: { onDone: () => void }) {
  const theme = useUIStore(s => s.theme)
  const variant = theme === 'neon' ? 'glitch' : 'seal'
  const [dismissing, setDismissing] = useState(false)

  useEffect(() => {
    const reduced =
      document.documentElement.getAttribute('data-reduce-motion') === 'true' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      onDone()
      return
    }
    const holdMs = variant === 'glitch' ? 500 : 650
    const t = setTimeout(() => setDismissing(true), holdMs)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!dismissing) return
    const t = setTimeout(onDone, 200)
    return () => clearTimeout(t)
  }, [dismissing, onDone])

  return (
    <div
      className={`session-wrap-ceremony ${dismissing ? 'is-dismissing' : ''}`}
      onClick={() => setDismissing(true)}
      role="presentation"
    >
      <div className={`session-wrap-motif--${variant}`} />
    </div>
  )
}
