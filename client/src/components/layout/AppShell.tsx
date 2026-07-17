import { Outlet, useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useUIStore } from '../../store/useUIStore'
import { useEffect, useState } from 'react'
import Sidebar from './Sidebar'
import RightSidebar from './RightSidebar'
import MobileTopBar from './MobileTopBar'
import MobileDrawer from './MobileDrawer'
import MobileNav from './MobileNav'
import QuickGenerate from '../generate/QuickGenerate'
import ScratchTray from '../generate/ScratchTray'
import { FlaskConical } from 'lucide-react'

export default function AppShell() {
  const { campaignId } = useParams()
  const navigate = useNavigate()
  const { setActiveCampaignId, quickGenerateOpen, setQuickGenerateOpen } = useUIStore()
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
        {/* Left sidebar — hidden on mobile */}
        <Sidebar campaignId={campaignId} />

        {/* Main content — full width on mobile, padded bottom for nav bar */}
        <div className="relative flex-1 min-w-0 main-vignette">
          <main className="h-full overflow-y-auto pb-20 md:pb-0">
            <Outlet />
          </main>
        </div>

        {/* Right Quick-Gen sidebar — desktop only, campaign-scoped */}
        <RightSidebar campaignId={campaignId} />
      </div>

      {/* Mobile bottom navigation */}
      <MobileNav />

      {quickGenerateOpen && (
        <QuickGenerate onClose={() => setQuickGenerateOpen(false)} campaignId={campaignId} />
      )}

      <ScratchTray />
    </div>
  )
}
