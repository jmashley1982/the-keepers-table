import { Outlet, useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useUIStore } from '../../store/useUIStore'
import { useEffect, useState } from 'react'
import Sidebar from './Sidebar'
import MobileTopBar from './MobileTopBar'
import MobileDrawer from './MobileDrawer'
import MobileNav from './MobileNav'
import QuickGenerate from '../generate/QuickGenerate'
import ScratchTray from '../generate/ScratchTray'
import { FlaskConical, Zap } from 'lucide-react'

export default function AppShell() {
  const { campaignId } = useParams()
  const navigate = useNavigate()
  const { setActiveCampaignId, quickGenerateOpen, setQuickGenerateOpen, activeCampaignId } = useUIStore()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const { data: meData } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get('/auth/me').then(r => r.data),
  })
  const isDemo = meData?.isDemo ?? false

  useEffect(() => {
    setActiveCampaignId(campaignId ?? null)
  }, [campaignId, setActiveCampaignId])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setQuickGenerateOpen(true)
      }
      if (e.key === 'Escape') setQuickGenerateOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setQuickGenerateOpen])

  const cid = campaignId ?? activeCampaignId

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-bg">
      {/* Demo banner */}
      {isDemo && (
        <div className="flex items-center justify-between px-4 py-2 text-sm font-medium shrink-0"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
            borderBottom: '1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)',
            color: 'var(--color-accent)',
          }}>
          <div className="flex items-center gap-2">
            <FlaskConical size={14} />
            <span>Demo mode — data resets each visit. Your changes won't be saved permanently.</span>
          </div>
        </div>
      )}

      {/* Mobile top bar — hidden on desktop */}
      <MobileTopBar onMenuOpen={() => setDrawerOpen(true)} />

      {/* Mobile slide-in drawer */}
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — hidden on mobile */}
        <Sidebar campaignId={campaignId} />

        {/* Main content — full width on mobile, padded bottom for nav bar */}
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <MobileNav />

      {/* Mobile FAB — Quick Generate, above the bottom nav bar */}
      {cid && (
        <button
          onClick={() => setQuickGenerateOpen(true)}
          className="md:hidden fixed bottom-20 right-4 z-20 flex items-center justify-center w-13 h-13 rounded-full shadow-xl transition-transform active:scale-95 touch-manipulation"
          style={{
            background: 'var(--color-accent)',
            color: 'var(--color-bg)',
            width: '52px',
            height: '52px',
            marginBottom: 'env(safe-area-inset-bottom)',
          }}
          aria-label="Quick Generate"
        >
          <Zap size={22} />
        </button>
      )}

      {quickGenerateOpen && (
        <QuickGenerate onClose={() => setQuickGenerateOpen(false)} campaignId={campaignId} />
      )}

      <ScratchTray />
    </div>
  )
}
