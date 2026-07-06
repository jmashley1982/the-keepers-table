import { useRef, useState, useEffect, useCallback, ReactNode } from 'react'
import { cn } from '../../lib/cn'

interface Props {
  assetId: string | null
  className?: string
  children?: ReactNode
  onSizeLoaded?: (w: number, h: number) => void
  onGridDrag?: (dx: number, dy: number) => void
  onImageClick?: (nx: number, ny: number) => void
  onScaleChange?: (scale: number) => void
}

interface Transform {
  x: number
  y: number
  scale: number
}

const MIN_SCALE = 0.05
const MAX_SCALE = 8
const FULL_UPGRADE_THRESHOLD = 1.2

export default function MapViewer({ assetId, className, children, onSizeLoaded, onGridDrag, onImageClick, onScaleChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 })
  const [imgSrc, setImgSrc] = useState<string | null>(null)
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null)
  const [useFull, setUseFull] = useState(false)

  const transformRef = useRef(transform)
  transformRef.current = transform

  const naturalSizeRef = useRef(naturalSize)
  naturalSizeRef.current = naturalSize

  const clickStartRef = useRef<{ x: number; y: number; pointerId: number } | null>(null)

  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    lastX: number
    lastY: number
  } | null>(null)

  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map())
  const pinchDistRef = useRef<number | null>(null)

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

  useEffect(() => {
    onScaleChange?.(transform.scale)
  }, [transform.scale, onScaleChange])

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

  function getPinchDistance(): number {
    const pts = [...activePointersRef.current.values()]
    if (pts.length < 2) return 0
    const dx = pts[0].x - pts[1].x
    const dy = pts[0].y - pts[1].y
    return Math.sqrt(dx * dx + dy * dy)
  }

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (activePointersRef.current.size >= 2) {
      pinchDistRef.current = getPinchDistance()
      dragRef.current = null
      clickStartRef.current = null
    } else if (e.button === 0) {
      pinchDistRef.current = null
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        lastX: transformRef.current.x,
        lastY: transformRef.current.y,
      }
      clickStartRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId }
    }
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (activePointersRef.current.size >= 2 && pinchDistRef.current !== null) {
      const newDist = getPinchDistance()
      const ratio = newDist / pinchDistRef.current
      pinchDistRef.current = newDist

      const pts = [...activePointersRef.current.values()]
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const cx = (pts[0].x + pts[1].x) / 2 - rect.left
      const cy = (pts[0].y + pts[1].y) / 2 - rect.top

      setTransform(prev => {
        const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev.scale * ratio))
        const r = newScale / prev.scale
        return {
          scale: newScale,
          x: cx - (cx - prev.x) * r,
          y: cy - (cy - prev.y) * r,
        }
      })
      return
    }

    if (!dragRef.current || activePointersRef.current.size > 1) return

    const screenDx = e.clientX - dragRef.current.startX
    const screenDy = e.clientY - dragRef.current.startY

    if (e.shiftKey && onGridDrag) {
      const scale = transformRef.current.scale
      onGridDrag(screenDx / scale, screenDy / scale)
      dragRef.current.startX = e.clientX
      dragRef.current.startY = e.clientY
      dragRef.current.lastX = transformRef.current.x
      dragRef.current.lastY = transformRef.current.y
    } else {
      setTransform(prev => ({
        ...prev,
        x: dragRef.current!.lastX + screenDx,
        y: dragRef.current!.lastY + screenDy,
      }))
    }
  }, [onGridDrag])

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (clickStartRef.current?.pointerId === e.pointerId && onImageClick && naturalSizeRef.current && containerRef.current) {
      const cs = clickStartRef.current
      const dx = e.clientX - cs.x
      const dy = e.clientY - cs.y
      if (Math.sqrt(dx * dx + dy * dy) < 5 && activePointersRef.current.size <= 1) {
        const rect = containerRef.current.getBoundingClientRect()
        const t = transformRef.current
        const ns = naturalSizeRef.current
        const imageX = (e.clientX - rect.left - t.x) / t.scale
        const imageY = (e.clientY - rect.top - t.y) / t.scale
        const nx = imageX / ns.w
        const ny = imageY / ns.h
        if (nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1) {
          onImageClick(nx, ny)
        }
      }
    }
    clickStartRef.current = null

    activePointersRef.current.delete(e.pointerId)
    if (dragRef.current?.pointerId === e.pointerId) {
      dragRef.current = null
    }
    if (activePointersRef.current.size < 2) {
      pinchDistRef.current = null
    }
    if (activePointersRef.current.size === 1) {
      const [[id, pos]] = [...activePointersRef.current.entries()]
      dragRef.current = {
        pointerId: id,
        startX: pos.x,
        startY: pos.y,
        lastX: transformRef.current.x,
        lastY: transformRef.current.y,
      }
    }
  }, [onImageClick])

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
      className={cn(
        'relative overflow-hidden bg-neutral-950 select-none',
        onGridDrag ? 'cursor-crosshair' : onImageClick ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing',
        className,
      )}
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
            alt="Map"
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
        {onGridDrag && <span className="ml-2 text-white/30">Shift+drag = offset grid</span>}
      </div>
    </div>
  )
}
