import { NavLink, useParams } from 'react-router-dom'
import { LayoutDashboard, BookOpen, Users, Map, Scroll, Zap } from 'lucide-react'
import { useUIStore } from '../../store/useUIStore'
import { cn } from '../../lib/cn'

export default function MobileNav() {
  const { campaignId } = useParams()
  const { activeCampaignId, setQuickGenerateOpen } = useUIStore()
  const cid = campaignId ?? activeCampaignId

  if (!cid) return null

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

      {/* Center Quick Generate button */}
      <div className="flex flex-col items-center justify-center flex-1 py-1">
        <button
          onClick={() => setQuickGenerateOpen(true)}
          className="flex items-center justify-center w-12 h-12 rounded-full shadow-lg transition-transform active:scale-95 touch-manipulation"
          style={{
            background: 'var(--color-accent)',
            color: 'var(--color-bg)',
          }}
          aria-label="Quick Generate"
        >
          <Zap size={22} />
        </button>
      </div>

      {tab(`/campaign/${cid}/players`, <Users size={20} />, 'Players')}
      {tab(`/campaign/${cid}/maps`, <Map size={20} />, 'Maps')}
      {tab(`/campaign/${cid}/log`, <Scroll size={20} />, 'Log')}
    </div>
  )
}
