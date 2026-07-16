import { useEffect, useRef } from 'react'
import { useUIStore } from '../../store/useUIStore'
import { ktThemeToDungeonGadgets } from '../../lib/toolTheme'

export default function DungeonTrackerPage() {
  const theme = useUIStore(s => s.theme)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const dgTheme = ktThemeToDungeonGadgets(theme)
  const initialSrc = useRef(`/tools/tracker.html${dgTheme ? `?theme=${dgTheme}` : ''}`)
  const mounted = useRef(false)

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    const iframe = iframeRef.current
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'kt-theme', value: dgTheme ?? '' }, '*')
    }
  }, [dgTheme])

  return (
    <div className="relative flex flex-col" style={{ height: '100%' }}>
      <iframe
        ref={iframeRef}
        src={initialSrc.current}
        title="Dungeon Tracker"
        style={{
          flex: 1,
          width: '100%',
          border: 'none',
          display: 'block',
          minHeight: 0,
        }}
        allow="fullscreen"
      />
      <div
        className="shrink-0 flex items-center justify-center py-1.5 text-[11px]"
        style={{
          background: 'var(--color-surface)',
          borderTop: '1px solid var(--color-border)',
          color: 'var(--color-ink-muted)',
        }}
      >
        Powered by&nbsp;
        <a
          href="https://dungeongadgets.com"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--color-ink-muted)', textDecoration: 'underline' }}
        >
          DungeonGadgets.com
        </a>
      </div>
    </div>
  )
}
