import { useRef, useState, useEffect, useCallback, ReactNode } from 'react'
import { cn } from '../../lib/cn'

interface Props {
  assetId: string | null
  className?: string
  children?: ReactNode
  onSizeLoaded?: (w: number, h: number) => void
}

interface Transform {
  x: number
  y: number
  scale: number
}

const MIN_SCALE = 0.05
const MAX_SCALE = 8
const FULL_UPGRADE_THRESHOLD = 1.2

export default function MapViewer({ assetId, className, children, onSizeLoaded }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 })
  const [imgSrc, setImgSrc] = useState<string | null>(null)
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null)
  const [useFull, setUseFull] = useState(false)
  const dragRef = useRef<{ startX: number; startY: number; lastX: number; lastY: number } | null>(null)

  useEffect(() => {
    if (!assetId) {
      setImgSrc(null)
      setNaturalSize(null)
      setUseFull(false)
      setTransform({ x: 0, y: 0, scale: 1 })
      return
    }
    setUseFull(false)
    setImgSrc(`/api/assets/${assetId}?size=preview`)
  }, [assetId])

  useEffect(() => {
    if (!assetId) return
    if (transform.scale > FULL_UPGRADE_THRESHOLD && !useFull) {
      setUseFull(true)
      setImgSrc(`/api/assets/${assetId}?size=full`)
    }
  }, [assetId, transform.scale, useFull])

  const fitToContainer = useCallback(() => {
    const img = imgRef.current
    const container = containerRef.current
    if (!img || !container) return
    const w = img.naturalWidth
    const h = img.naturalHeight
    if (!w || !h) return
    setNaturalSize({ w, h })
    onSizeLoaded?.(w, h)
    const cw = container.clientWidth
    const ch = container.clientHeight
    const fitScale = Math.min(cw / w, ch / h, 1)
    setTransform({
      x: (cw - w * fitScale) / 2,
      y: (ch - h * fitScale) / 2,
      scale: fitScale,
    })
  }, [onSizeLoaded])

  const handleImageLoad = useCallback(() => {
    fitToContainer()
  }, [fitToContainer])

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      lastX: transform.x,
      lastY: transform.y,
    }
  }, [transform.x, transform.y])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    setTransform(prev => ({
      ...prev,
      x: dragRef.current!.lastX + dx,
      y: dragRef.current!.lastY + dy,
    }))
  }, [])

  const onPointerUp = useCallback(() => {
    dragRef.current = null
  }, [])

  const onWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault()
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    const delta = e.deltaY < 0 ? 1.12 : 0.9
    setTransform(prev => {
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev.scale * delta))
      const ratio = newScale / prev.scale
      return {
        scale: newScale,
        x: mouseX - (mouseX - prev.x) * ratio,
        y: mouseY - (mouseY - prev.y) * ratio,
      }
    })
  }, [])

  if (!assetId) {
    return (
      <div className={cn('flex items-center justify-center bg-neutral-900 rounded-card text-ink-muted text-sm', className)}>
        No map loaded
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={cn('relative overflow-hidden bg-neutral-950 cursor-grab active:cursor-grabbing select-none', className)}
      style={{ touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onWheel={onWheel}
    >
      {imgSrc && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: naturalSize?.w ?? 'auto',
            height: naturalSize?.h ?? 'auto',
            transform: `translate(${transform.x}px,${transform.y}px) scale(${transform.scale})`,
            transformOrigin: '0 0',
            willChange: 'transform',
          }}
        >
          <img
            ref={imgRef}
            src={imgSrc}
            alt="Battle map"
            draggable={false}
            onLoad={handleImageLoad}
            style={{
              display: 'block',
              width: naturalSize?.w ?? 'auto',
              height: naturalSize?.h ?? 'auto',
            }}
          />
          {children && (
            <div style={{ position: 'absolute', inset: 0 }}>
              {children}
            </div>
          )}
        </div>
      )}

      <div className="absolute bottom-2 right-2 text-xs text-white/40 pointer-events-none select-none">
        {Math.round(transform.scale * 100)}%
      </div>
    </div>
  )
}
