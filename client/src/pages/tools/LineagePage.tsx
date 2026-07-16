import { useEffect, useRef } from 'react'
import { useUIStore } from '../../store/useUIStore'
import { ktThemeToDungeonGadgets } from '../../lib/toolTheme'

export default function LineagePage() {
  const theme = useUIStore(s => s.theme)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const dgTheme = ktThemeToDungeonGadgets(theme)
  const src = `/tools/lineage.html${dgTheme ? `?theme=${dgTheme}` : ''}`

  useEffect(() => {
    if (iframeRef.current) {
      iframeRef.current.src = src
    }
  }, [src])

  return (
    <div className="relative flex flex-col" style={{ height: '100%' }}>
      <iframe
        ref={iframeRef}
        src={src}
        title="Lineage — Family Tree Builder"
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
