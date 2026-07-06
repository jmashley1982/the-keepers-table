import { Eye, EyeOff, Grid } from 'lucide-react'

export interface GridSettings {
  cellSize: number
  offsetX: number
  offsetY: number
  color: string
  opacity: number
  visible: boolean
}

export const DEFAULT_GRID: GridSettings = {
  cellSize: 50,
  offsetX: 0,
  offsetY: 0,
  color: '#ffffff',
  opacity: 0.35,
  visible: false,
}

interface OverlayProps {
  settings: GridSettings
  imageWidth: number
  imageHeight: number
}

export function GridOverlay({ settings, imageWidth, imageHeight }: OverlayProps) {
  if (!settings.visible || !imageWidth || !imageHeight) return null
  const { cellSize, offsetX, offsetY, color, opacity } = settings
  const safeX = ((offsetX % cellSize) + cellSize) % cellSize
  const safeY = ((offsetY % cellSize) + cellSize) % cellSize
  const patternId = `grid-${cellSize}`

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={imageWidth}
      height={imageHeight}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      <defs>
        <pattern
          id={patternId}
          x={safeX}
          y={safeY}
          width={cellSize}
          height={cellSize}
          patternUnits="userSpaceOnUse"
        >
          <path
            d={`M ${cellSize} 0 L 0 0 0 ${cellSize}`}
            fill="none"
            stroke={color}
            strokeWidth="1"
            strokeOpacity={opacity}
          />
        </pattern>
      </defs>
      <rect width={imageWidth} height={imageHeight} fill={`url(#${patternId})`} />
    </svg>
  )
}

interface EditorProps {
  settings: GridSettings
  onChange: (s: GridSettings) => void
}

export function GridEditor({ settings, onChange }: EditorProps) {
  const set = (partial: Partial<GridSettings>) => onChange({ ...settings, ...partial })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-ink flex items-center gap-2">
          <Grid size={14} />
          Grid Overlay
        </span>
        <button
          onClick={() => set({ visible: !settings.visible })}
          className="btn-ghost text-xs gap-1"
        >
          {settings.visible
            ? <><EyeOff size={12} /> Hide</>
            : <><Eye size={12} /> Show</>}
        </button>
      </div>

      {settings.visible && (
        <>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label text-xs mb-0">Cell size</label>
              <span className="text-xs text-ink-muted">{settings.cellSize}px</span>
            </div>
            <input
              type="range" min={5} max={200} step={1}
              value={settings.cellSize}
              onChange={e => set({ cellSize: parseInt(e.target.value), offsetX: 0, offsetY: 0 })}
              className="w-full accent-accent"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label text-xs mb-0">Offset X</label>
                <span className="text-xs text-ink-muted">{settings.offsetX}px</span>
              </div>
              <input
                type="range" min={0} max={settings.cellSize - 1} step={1}
                value={settings.offsetX}
                onChange={e => set({ offsetX: parseInt(e.target.value) })}
                className="w-full accent-accent"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label text-xs mb-0">Offset Y</label>
                <span className="text-xs text-ink-muted">{settings.offsetY}px</span>
              </div>
              <input
                type="range" min={0} max={settings.cellSize - 1} step={1}
                value={settings.offsetY}
                onChange={e => set({ offsetY: parseInt(e.target.value) })}
                className="w-full accent-accent"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label text-xs">Color</label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="color"
                  value={settings.color}
                  onChange={e => set({ color: e.target.value })}
                  className="w-8 h-8 rounded cursor-pointer border border-border"
                />
                <span className="text-xs text-ink-muted font-mono">{settings.color}</span>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label text-xs mb-0">Opacity</label>
                <span className="text-xs text-ink-muted">{Math.round(settings.opacity * 100)}%</span>
              </div>
              <input
                type="range" min={0.05} max={1} step={0.05}
                value={settings.opacity}
                onChange={e => set({ opacity: parseFloat(e.target.value) })}
                className="w-full accent-accent"
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
