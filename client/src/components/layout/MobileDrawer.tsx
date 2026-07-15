import { useEffect } from 'react'
import { NavLink, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useUIStore } from '../../store/useUIStore'
import { cn } from '../../lib/cn'
import {
  LayoutDashboard, BookOpen, Map, Scroll,
  Settings, LogOut, ChevronDown, Zap, Users,
  Contrast, Flame, Skull, Rocket, Terminal, X,
} from 'lucide-react'
import { useState } from 'react'
import { themeLogo } from '../../lib/themeLogo'

const THEME_OPTIONS = [
  { id: 'candlelight',    label: 'Candlelight',   icon: Flame },
  { id: 'eldritch',      label: 'Eldritch',       icon: Skull },
  { id: 'icarus',        label: 'Icarus',         icon: Rocket },
  { id: 'neon',          label: 'Neon',           icon: Terminal },
  { id: 'parchment',     label: 'Parchment',      icon: Scroll },
  { id: 'high-contrast', label: 'High Contrast',  icon: Contrast },
] as const

interface Props {
  open: boolean
  onClose: () => void
}

export default function MobileDrawer({ open, onClose }: Props) {
  const { campaignId } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { theme, setTheme, setQuickGenerateOpen } = useUIStore()
  const [themeOpen, setThemeOpen] = useState(false)

  const { data: meData } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get('/auth/me').then(r => r.data),
  })
  const { data: campaignData } = useQuery({
    queryKey: ['campaign', campaignId],
    queryFn: () => api.get(`/api/campaigns/${campaignId}`).then(r => r.data),
    enabled: !!campaignId,
  })

  const logout = useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSuccess: () => { qc.clear(); navigate('/login') },
  })

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  const campaign = campaignData?.campaign
  const user = meData?.user

  const navItem = (to: string, icon: React.ReactNode, label: string, end?: boolean) => (
    <NavLink
      to={to}
      end={end}
      onClick={onClose}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 px-4 py-3 text-sm transition-all rounded-card border-l-2 touch-manipulation',
          isActive
            ? 'border-accent bg-accent/10 text-accent font-semibold'
            : 'border-transparent text-ink-muted hover:text-ink hover:bg-white/5',
        )
      }
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  )

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'md:hidden fixed inset-0 z-40 bg-black/60 transition-opacity duration-300',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        className={cn(
          'md:hidden fixed top-0 left-0 z-50 h-full w-72 flex flex-col overflow-y-auto transition-transform duration-300 ease-out',
        )}
        style={{
          background: 'linear-gradient(180deg, var(--color-surface) 0%, color-mix(in srgb, var(--color-surface) 95%, var(--color-bg)) 100%)',
          borderRight: '1px solid var(--color-border)',
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Header */}
        <div className="px-4 py-4 border-b border-border flex items-center justify-between shrink-0">
          <div className="min-w-0 flex-1">
            <img
              src={themeLogo(theme)}
              alt="The Keeper's Table"
              className="w-32 h-auto logo-theme"
            />
            {user && (
              <p className="text-xs text-ink-muted mt-1 truncate">{user.displayName}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-11 h-11 rounded-card text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors touch-manipulation shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Quick Generate */}
        <div className="px-3 pt-3">
          <button
            onClick={() => { setQuickGenerateOpen(true); onClose() }}
            className="w-full flex items-center gap-2 px-3 py-3 rounded-card text-sm font-semibold transition-colors touch-manipulation"
            style={{
              background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
              color: 'var(--color-accent)',
              border: '1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)',
            }}
          >
            <Zap size={14} />
            Quick Generate
            <span className="ml-auto text-xs opacity-50">⌘K</span>
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 flex flex-col gap-0.5">
          {navItem('/campaigns', <LayoutDashboard size={16} />, 'Campaigns', true)}

          {campaign && (
            <>
              <div className="pt-4 pb-1.5 px-1">
                <p className="display-font text-sm font-semibold truncate leading-tight" title={campaign.name}>
                  {campaign.name}
                </p>
                <div className="mt-1 h-px" style={{ background: 'linear-gradient(to right, var(--color-accent), transparent)', opacity: 0.3 }} />
              </div>
              {navItem(`/campaign/${campaignId}`, <LayoutDashboard size={16} />, 'Dashboard', true)}
              {navItem(`/campaign/${campaignId}/library`, <BookOpen size={16} />, 'Library')}
              {navItem(`/campaign/${campaignId}/players`, <Users size={16} />, 'Players')}
              {navItem(`/campaign/${campaignId}/maps`, <Map size={16} />, 'Maps')}
              {navItem(`/campaign/${campaignId}/log`, <Scroll size={16} />, 'Session Log')}
              {navItem(`/campaign/${campaignId}/settings`, <Settings size={16} />, 'Campaign Settings')}
            </>
          )}

          <div className="pt-4 pb-1 px-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-muted opacity-60">Account</p>
          </div>
          {navItem('/settings', <Settings size={16} />, 'Account Settings', true)}
        </nav>

        {/* Theme picker */}
        <div className="px-3 pb-2">
          <button
            onClick={() => setThemeOpen(v => !v)}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-card text-xs text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors touch-manipulation min-h-[44px]"
          >
            {(() => {
              const CurrentIcon = THEME_OPTIONS.find(o => o.id === theme)?.icon ?? Flame
              return <CurrentIcon size={13} />
            })()}
            <span className="capitalize">{theme}</span>
            <ChevronDown size={12} className={cn('ml-auto transition-transform', themeOpen && 'rotate-180')} />
          </button>
          {themeOpen && (
            <div className="mt-1 card py-1 px-0 animate-fade-in">
              {THEME_OPTIONS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => { setTheme(id); setThemeOpen(false) }}
                  className={cn(
                    'w-full text-left px-3 py-2.5 text-xs rounded flex items-center gap-2 transition-colors touch-manipulation min-h-[44px]',
                    theme === id ? 'text-accent font-semibold' : 'text-ink-muted hover:text-ink hover:bg-surface-2',
                  )}
                >
                  <Icon size={12} />
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Logout */}
        <div className="px-3 pb-4">
          <button
            onClick={() => logout.mutate()}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-card text-xs text-ink-muted hover:text-danger transition-colors touch-manipulation min-h-[44px]"
          >
            <LogOut size={13} />
            Sign out
          </button>
        </div>
      </div>
    </>
  )
}
