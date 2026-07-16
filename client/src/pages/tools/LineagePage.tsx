import { useEffect, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useUIStore } from '../../store/useUIStore'
import { ktThemeToDungeonGadgets } from '../../lib/toolTheme'

export default function LineagePage() {
  const theme = useUIStore(s => s.theme)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const dgTheme = ktThemeToDungeonGadgets(theme)
  const initialSrc = useRef(`/tools/lineage.html${dgTheme ? `?theme=${dgTheme}` : ''}`)
  const mounted = useRef(false)
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const from = searchParams.get('from')

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

  function handleLoad() {
    const iframe = iframeRef.current
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'kt-theme', value: dgTheme ?? '' }, '*')
    }
  }

  return (
    <div className="relative flex flex-col" style={{ height: '100%' }}>
      {from && (
        <div
          className="shrink-0 flex items-center px-3 py-1.5"
          style={{
            background: 'var(--color-surface)',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <button
            onClick={() => navigate(from)}
            className="flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink transition-colors"
          >
            <ArrowLeft size={13} />
            Back to Campaign
          </button>
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={initialSrc.current}
        title="Lineage — Family Tree Builder"
        onLoad={handleLoad}
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
