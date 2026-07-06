import { useState, useCallback, useRef } from 'react'
import { api } from '../../lib/api'
import { MapPin as PinIcon, X } from 'lucide-react'

export interface MapPin {
  id: string
  x: number
  y: number
  locationId?: string | null
  label: string
  icon: string
  revealed: boolean
  location?: { id: string; name: string; type: string; description: string } | null
}

interface PinLayerProps {
  mapId: string
  campaignId: string
  pins: MapPin[]
  imageWidth: number
  imageHeight: number
  scale: number
  editMode: boolean
  onPinsChange: () => void
}

export default function PinLayer({
  mapId,
  campaignId,
  pins,
  imageWidth,
  imageHeight,
  scale,
  editMode,
  onPinsChange,
}: PinLayerProps) {
  const [dragging, setDragging] = useState<{ id: string; x: number; y: number } | null>(null)
  const [activePopover, setActivePopover] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const savingRef = useRef(false)

  const displayPins = dragging
    ? pins.map(p => (p.id === dragging.id ? { ...p, x: dragging.x, y: dragging.y } : p))
    : pins

  const handleBgClick = useCallback(
    async (e: React.MouseEvent<HTMLDivElement>) => {
      if (!editMode || creating || savingRef.current) return
      if ((e.target as HTMLElement).closest('[data-pin]')) return
      const x = Math.max(0, Math.min(1, e.nativeEvent.offsetX / imageWidth))
      const y = Math.max(0, Math.min(1, e.nativeEvent.offsetY / imageHeight))
      setCreating(true)
      try {
        await api.post(`/api/campaigns/${campaignId}/maps/${mapId}/pins`, {
          x, y, label: '', icon: '📍',
        })
        onPinsChange()
      } catch {
        // ignore
      } finally {
        setCreating(false)
      }
    },
    [editMode, creating, imageWidth, imageHeight, campaignId, mapId, onPinsChange],
  )

  const handlePinPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, pin: MapPin) => {
      if (!editMode) return
      e.stopPropagation()
      e.currentTarget.setPointerCapture(e.pointerId)
      setDragging({ id: pin.id, x: pin.x, y: pin.y })
      setActivePopover(null)
    },
    [editMode],
  )

  const handlePinPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return
      const dx = e.movementX / (imageWidth * scale)
      const dy = e.movementY / (imageHeight * scale)
      setDragging(prev =>
        prev
          ? { ...prev, x: Math.max(0, Math.min(1, prev.x + dx)), y: Math.max(0, Math.min(1, prev.y + dy)) }
          : null,
      )
    },
    [dragging, imageWidth, imageHeight, scale],
  )

  const handlePinPointerUp = useCallback(
    async (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging || savingRef.current) return
      e.currentTarget.releasePointerCapture(e.pointerId)
      const { id, x, y } = dragging
      setDragging(null)
      savingRef.current = true
      try {
        await api.patch(`/api/campaigns/${campaignId}/maps/${mapId}/pins/${id}`, { x, y })
        onPinsChange()
      } catch {
        // ignore — optimistic update already reflected locally
      } finally {
        savingRef.current = false
      }
    },
    [dragging, campaignId, mapId, onPinsChange],
  )

  const handlePinClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, pinId: string) => {
      e.stopPropagation()
      if (dragging) return
      setActivePopover(prev => (prev === pinId ? null : pinId))
    },
    [dragging],
  )

  const handleDeletePin = useCallback(
    async (pinId: string) => {
      try {
        await api.delete(`/api/campaigns/${campaignId}/maps/${mapId}/pins/${pinId}`)
        setActivePopover(null)
        onPinsChange()
      } catch {
        // ignore
      }
    },
    [campaignId, mapId, onPinsChange],
  )

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        cursor: editMode ? (creating ? 'wait' : 'crosshair') : 'default',
        userSelect: 'none',
      }}
      onClick={handleBgClick}
    >
      {displayPins.map(pin => {
        const isPopoverOpen = activePopover === pin.id
        const isDraggingThis = dragging?.id === pin.id
        return (
          <div
            key={pin.id}
            data-pin={pin.id}
            style={{
              position: 'absolute',
              left: `${pin.x * 100}%`,
              top: `${pin.y * 100}%`,
              transform: 'translate(-50%, -100%)',
              zIndex: isDraggingThis ? 50 : isPopoverOpen ? 40 : 10,
              cursor: editMode ? 'grab' : 'pointer',
            }}
            onPointerDown={editMode ? e => handlePinPointerDown(e, pin) : undefined}
            onPointerMove={isDraggingThis ? handlePinPointerMove : undefined}
            onPointerUp={isDraggingThis ? handlePinPointerUp : undefined}
            onClick={e => handlePinClick(e, pin.id)}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                filter: isDraggingThis ? 'drop-shadow(0 4px 8px rgba(0,0,0,0.8))' : 'drop-shadow(0 2px 4px rgba(0,0,0,0.6))',
                transition: isDraggingThis ? 'none' : 'filter 0.15s',
                pointerEvents: 'none',
              }}
            >
              <span style={{ fontSize: 22, lineHeight: 1 }}>{pin.icon || '📍'}</span>
              {pin.label && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: '#fff',
                    background: 'rgba(0,0,0,0.7)',
                    borderRadius: 3,
                    padding: '1px 4px',
                    marginTop: 1,
                    whiteSpace: 'nowrap',
                    maxWidth: 100,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {pin.label}
                </span>
              )}
            </div>

            {isPopoverOpen && !isDraggingThis && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '110%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: '#1a1a2e',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 8,
                  padding: '10px 12px',
                  minWidth: 180,
                  maxWidth: 240,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                  pointerEvents: 'all',
                }}
                onClick={e => e.stopPropagation()}
              >
                {pin.location ? (
                  <>
                    <p style={{ color: '#e2d9c8', fontWeight: 600, fontSize: 13, margin: '0 0 4px' }}>
                      {pin.location.name}
                    </p>
                    <p style={{ color: '#a09080', fontSize: 11, textTransform: 'capitalize', margin: '0 0 6px' }}>
                      {pin.location.type}
                    </p>
                    {pin.location.description && (
                      <p style={{ color: '#c8bfb0', fontSize: 11, lineHeight: 1.5, margin: '0 0 8px', WebkitLineClamp: 3, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {pin.location.description}
                      </p>
                    )}
                  </>
                ) : pin.label ? (
                  <p style={{ color: '#e2d9c8', fontWeight: 600, fontSize: 13, margin: '0 0 8px' }}>{pin.label}</p>
                ) : (
                  <p style={{ color: '#a09080', fontSize: 12, margin: '0 0 8px' }}>Unnamed pin</p>
                )}
                {editMode && (
                  <button
                    onClick={() => handleDeletePin(pin.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      background: 'rgba(220,50,50,0.15)', border: '1px solid rgba(220,50,50,0.3)',
                      borderRadius: 4, padding: '3px 8px', cursor: 'pointer',
                      color: '#e06060', fontSize: 11, width: '100%', justifyContent: 'center',
                    }}
                  >
                    <X size={10} /> Remove pin
                  </button>
                )}
                {!editMode && (
                  <button
                    onClick={() => setActivePopover(null)}
                    style={{
                      position: 'absolute', top: 6, right: 6,
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      color: '#a09080', padding: 2,
                    }}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}

      {editMode && pins.length === 0 && !creating && (
        <div
          style={{
            position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 8, padding: '8px 14px',
            color: 'rgba(255,255,255,0.5)', fontSize: 12, whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          <PinIcon size={12} style={{ display: 'inline', marginRight: 6 }} />
          Click anywhere on the map to place a pin
        </div>
      )}
    </div>
  )
}
