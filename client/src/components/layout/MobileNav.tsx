import { NavLink, useParams, useLocation } from 'react-router-dom'
import { LayoutDashboard, BookOpen, Users, Map, Scroll, Zap, Swords, Settings, Plus, GitBranch, Timer } from 'lucide-react'
import { useUIStore } from '../../store/useUIStore'
import { cn } from '../../lib/cn'

// Routes where the bottom nav is hidden entirely (full-screen or immersive experiences)
const HIDDEN_NAV_PATTERNS: RegExp[] = [
  /^\/campaign\/[^/]+\/session\/[^/]+/, // live session page
]

// Routes where only the minimal nav (Campaigns + Settings) is shown
const MINIMAL_NAV_PATTERNS: RegExp[] = [
  /^\/campaigns$/,
  /^\/settings/,
  /^\/tools\//,
]

export default function MobileNav() {
  const { campaignId } = useParams()
  const { activeCampaignId, setQuickGenerateOpen } = useUIStore()
  const { pathname } = useLocation()

  const isHidden = HIDDEN_NAV_PATTERNS.some(p => p.test(pathname))
  if (isHidden) return null

  const isMinimalRoute = MINIMAL_NAV_PATTERNS.some(p => p.test(pathname))
  const cid = isMinimalRoute ? null : (campaignId ?? activeCampaignId)

  const tab = (to: string, icon: React.ReactNode, label: string, end?: boolean) => (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex flex-col items-center justify-center gap-0.5 flex-1 py-2 text-[10px] font-medium transition-colors touch-manipulation min-h-[44px]',
          isActive ? 'text-accent' : 'text-ink-muted hover:text-ink',
        )
      }
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  )

  if (!cid) {
    return (
      <div
        className="md:hidden fixed bottom-0 inset-x-0 z-30 flex items-center border-t border-border"
        style={{
          background: 'var(--color-surface)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {tab('/campaigns', <Swords size={20} />, 'Campaigns', true)}
        {tab('/tools/lineage', <GitBranch size={20} />, 'Lineage')}

        {/* Center placeholder — create campaign */}
        <NavLink
          to="/campaigns?create=1"
          className="flex flex-col items-center justify-center flex-1 py-1"
          aria-label="New Campaign"
        >
          <div
            className="flex items-center justify-center w-12 h-12 rounded-full shadow-lg transition-transform active:scale-95 touch-manipulation opacity-70"
            style={{
              background: 'var(--color-accent)',
              color: 'var(--color-bg)',
            }}
          >
            <Plus size={22} />
          </div>
          <span className="text-[10px] font-medium mt-0.5" style={{ color: 'var(--color-ink-muted)' }}>
            New
          </span>
        </NavLink>

        {tab('/tools/tracker', <Timer size={20} />, 'Tracker')}
        {tab('/settings', <Settings size={20} />, 'Settings')}
      </div>
    )
  }

  return (
    <div
      className="md:hidden fixed bottom-0 inset-x-0 z-30 flex items-center border-t border-border"
      style={{
        background: 'var(--color-surface)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {tab(`/campaign/${cid}`, <LayoutDashboard size={20} />, 'Dashboard', true)}
      {tab(`/campaign/${cid}/library`, <BookOpen size={20} />, 'Library')}

      {/* Center Quick Generate button — elevated FAB with label */}
      <div className="flex flex-col items-center justify-end flex-1 pb-1" style={{ marginTop: '-18px' }}>
        <button
          onClick={() => setQuickGenerateOpen(true)}
          className="flex flex-col items-center justify-center gap-0.5 rounded-2xl shadow-xl transition-transform active:scale-95 touch-manipulation"
          style={{
            background: 'var(--color-accent)',
            color: 'var(--color-bg)',
            width: '64px',
            height: '56px',
            boxShadow: '0 4px 16px color-mix(in srgb, var(--color-accent) 50%, transparent)',
          }}
          aria-label="Quick Generate"
        >
          <Zap size={20} fill="currentColor" />
          <span className="text-[9px] font-bold tracking-wide leading-none">Generate</span>
        </button>
      </div>

      {tab(`/campaign/${cid}/players`, <Users size={20} />, 'Players')}
      {tab(`/campaign/${cid}/maps`, <Map size={20} />, 'Maps')}
      {tab(`/campaign/${cid}/log`, <Scroll size={20} />, 'Log')}
    </div>
  )
}
