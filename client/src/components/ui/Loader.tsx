import { useEffect, useState } from 'react'
import { pickFlavorPool } from '../../lib/flavorText'

const SIZE_PX: Record<'sm' | 'md' | 'lg', number> = { sm: 22, md: 32, lg: 44 }

interface LoaderProps {
  size?: 'sm' | 'md' | 'lg'
  /** Category key into GENERATION_FLAVOR_TEXT — rotates flavor lines while shown. */
  flavor?: string
  /** Static label. Takes priority over flavor rotation if both are given. */
  label?: string
  className?: string
}

export default function Loader({ size = 'md', flavor, label, className }: LoaderProps) {
  const px = SIZE_PX[size]
  const lines = !label && flavor ? pickFlavorPool(flavor) : null
  const [lineIdx, setLineIdx] = useState(0)

  useEffect(() => {
    if (!lines || lines.length < 2) return
    const id = setInterval(() => setLineIdx(i => (i + 1) % lines.length), 2400)
    return () => clearInterval(id)
  }, [lines])

  return (
    <div className={`flex flex-col items-center gap-3 ${className ?? ''}`}>
      <div className="relative shrink-0" style={{ width: px, height: px }}>
        <div
          className="loader-glow absolute inset-0 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(var(--color-accent-rgb), 0.35), transparent 70%)' }}
        />
        <div
          className="loader-ring absolute inset-0 rounded-full border-2"
          style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }}
        />
      </div>
      {(label || lines) && (
        <p className="text-sm text-ink-muted text-center min-h-[1.25rem]">
          {label ?? lines![lineIdx]}
        </p>
      )}
    </div>
  )
}
