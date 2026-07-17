import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useUIStore } from '../../store/useUIStore'
import { cn } from '../../lib/cn'
import {
  LayoutDashboard, BookOpen, Map, Scroll,
  Settings, LogOut, ChevronDown, Zap, Users,
  Contrast, Flame, Skull, Rocket, Terminal, Swords, Shield,
  ChevronLeft, ChevronRight, GitBranch, Timer,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { themeBrandIcon } from '../../lib/themeBrandIcon'
import RulesReferencePanel from '../dnd5e/RulesReferencePanel'
import FriendQuotaBar from './FriendQuotaBar'

const THEME_OPTIONS = [
  { id: 'candlelight',   label: 'Candlelight',   icon: Flame },
  { id: 'eldritch',     label: 'Eldritch',       icon: Skull },
  { id: 'icarus',       label: 'Icarus',         icon: Rocket },
  { id: 'neon',         label: 'Neon',           icon: Terminal },
  { id: 'haunt', label: 'Haunt', icon: Contrast },
] as const

export default function Sidebar({ campaignId }: { campaignId?: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  const qc = useQueryClient()
  const { theme, setTheme, reduceEffects, setReduceEffects, setQuickGenerateOpen, leftSidebarCollapsed, setLeftSidebarCollapsed } = useUIStore()
  const [themeOpen, setThemeOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const navRef = useRef<HTMLElement>(null)
  const [indicator, setIndicator] = useState<{ top: number; height: number } | null>(null)

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
    onSuccess: () => {
      qc.clear()
      navigate('/login')
    },
  })

  const campaign = campaignData?.campaign
  const user = meData?.user
  const isDnd5e = campaign?.systemTemplateId === 'builtin-d-d-5e'
  const collapsed = leftSidebarCollapsed

  useEffect(() => {
    if (collapsed) { setIndicator(null); return }
    const navEl = navRef.current
    if (!navEl) return
    const activeEl = navEl.querySelector('a[aria-current="page"]') as HTMLElement | null
    if (activeEl) {
      const navRect = navEl.getBoundingClientRect()
      const elRect = activeEl.getBoundingClientRect()
      setIndicator({ top: elRect.top - navRect.top, height: elRect.height })
    } else {
      setIndicator(null)
    }
  }, [location.pathname, collapsed, campaign, isDnd5e])

  const navLink = (to: string, icon: React.ReactNode, label: string, end?: boolean) => (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          'flex items-center rounded-card transition-all duration-150 ease-out',
          collapsed ? 'justify-center p-2' : 'gap-2.5 px-3 py-2 text-sm',
          isActive
            ? 'text-accent bg-accent/10 font-semibold'
            : 'text-ink-muted hover:text-ink hover:bg-white/5',
        )
      }
    >
      {icon}
      {!collapsed && <span>{label}</span>}
    </NavLink>
  )

  return (
    <aside
      className={cn(
        'hidden md:flex flex-col h-full overflow-y-auto flex-shrink-0 relative transition-all duration-200',
        collapsed ? 'w-12' : 'w-56',
      )}
      style={{
        background: 'linear-gradient(180deg, var(--color-surface) 0%, color-mix(in srgb, var(--color-surface) 95%, var(--color-bg)) 100%)',
        borderRight: '1px solid var(--color-border)',
      }}
    >
      {/* Toggle button — right edge */}
      <button
        onClick={() => setLeftSidebarCollapsed(!collapsed)}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="absolute -right-3 top-4 w-6 h-6 rounded-full border border-border bg-surface flex items-center justify-center text-ink-muted hover:text-ink transition-colors z-20 shadow-sm"
      >
        {collapsed ? <ChevronRight size={11} /> : <ChevronLeft size={11} />}
      </button>

      {/* Logo */}
      <div className={cn(
        'border-b border-border shrink-0',
        collapsed ? 'px-1 py-3 flex justify-center' : 'px-4 py-4',
      )}>
        {collapsed ? (
          <img
            src={themeBrandIcon(theme)}
            alt="KT"
            className="w-8 h-8 object-contain"
          />
        ) : (
          <>
            <div className="flex flex-col items-center gap-2">
              <img
                src={themeBrandIcon(theme)}
                alt=""
                className="w-14 h-14 object-contain"
              />
              <span
                className="display-font font-bold text-sm text-center leading-tight"
                style={{ color: 'var(--color-ink)' }}
              >
                The Keeper's Table
              </span>
            </div>
            {user && (
              <p className="text-xs text-ink-muted mt-2 text-center truncate">{user.displayName}</p>
            )}
          </>
        )}
      </div>

      {/* Quick Generate */}
      <div className={cn('pt-3', collapsed ? 'px-1 flex justify-center' : 'px-3')}>
        {collapsed ? (
          <button
            onClick={() => setQuickGenerateOpen(true)}
            title="Quick Generate (⌘K)"
            className="w-8 h-8 rounded-card flex items-center justify-center transition-colors"
            style={{
              background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
              color: 'var(--color-accent)',
              border: '1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)',
            }}
          >
            <Zap size={15} />
          </button>
        ) : (
          <button
            onClick={() => setQuickGenerateOpen(true)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-card text-sm font-semibold transition-colors"
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
        )}
      </div>

      {/* Nav */}
      <nav ref={navRef} className={cn('flex-1 py-3 flex flex-col gap-0.5 relative', collapsed ? 'px-1' : 'px-3')}>
        {indicator && (
          <div
            className="nav-indicator absolute left-0 w-0.5 rounded-full transition-transform duration-200 ease-out pointer-events-none"
            style={{
              top: 0,
              height: indicator.height,
              transform: `translateY(${indicator.top}px)`,
              backgroundColor: 'var(--color-accent)',
              boxShadow: '0 0 6px rgba(var(--color-accent-rgb), 0.5)',
            }}
          />
        )}
        {navLink('/campaigns', <LayoutDashboard size={15} />, 'Campaigns', true)}

        {campaign && (
          <>
            {!collapsed && (
              <div className="pt-4 pb-1.5 px-1">
                <p className="display-font text-sm font-semibold truncate leading-tight" title={campaign.name}>
                  {campaign.name}
                </p>
                <div className="mt-1 h-px" style={{ background: 'linear-gradient(to right, var(--color-accent), transparent)', opacity: 0.3 }} />
              </div>
            )}
            {collapsed && <div className="my-2 mx-1 h-px bg-border opacity-40" />}

            {navLink(`/campaign/${campaignId}`, <LayoutDashboard size={15} />, 'Dashboard', true)}
            {navLink(`/campaign/${campaignId}/library`, <BookOpen size={15} />, 'Library')}
            {navLink(`/campaign/${campaignId}/enemies`, <Swords size={15} />, 'Bestiary')}
            {navLink(`/campaign/${campaignId}/players`, <Users size={15} />, 'Players')}
            {navLink(`/campaign/${campaignId}/maps`, <Map size={15} />, 'Maps')}
            {navLink(`/campaign/${campaignId}/log`, <Scroll size={15} />, 'Session Log')}
            {navLink(`/campaign/${campaignId}/settings`, <Settings size={15} />, 'Campaign Settings')}

            {isDnd5e && (
              <button
                onClick={() => setRulesOpen(true)}
                title={collapsed ? '5e Rules' : undefined}
                className={cn(
                  'flex items-center rounded-card transition-all duration-150 border-transparent text-ink-muted hover:text-ink hover:bg-white/5 w-full text-left',
                  collapsed ? 'justify-center p-2' : 'gap-2.5 px-3 py-2 text-sm border-l-2',
                )}
              >
                <Shield size={15} />
                {!collapsed && <span>5e Rules</span>}
              </button>
            )}
          </>
        )}

        <div className={cn('pb-1', collapsed ? 'pt-2' : 'pt-4 px-1')}>
          {!collapsed && (
            <p className="label-caps">Tools</p>
          )}
          {collapsed && <div className="h-px bg-border opacity-40" />}
        </div>
        {navLink('/tools/lineage', <GitBranch size={15} />, 'Lineage')}
        {navLink('/tools/tracker', <Timer size={15} />, 'Dungeon Tracker')}

        <div className={cn('pb-1', collapsed ? 'pt-2' : 'pt-4 px-1')}>
          {!collapsed && (
            <p className="label-caps">Account</p>
          )}
          {collapsed && <div className="h-px bg-border opacity-40" />}
        </div>
        {navLink('/settings', <Settings size={15} />, 'Settings', true)}
      </nav>

      {/* Friend quota */}
      {!collapsed && <FriendQuotaBar />}

      {/* Theme picker */}
      <div className={cn('pb-2', collapsed ? 'px-1 flex justify-center' : 'px-3')}>
        {collapsed ? (
          <button
            onClick={() => setThemeOpen(v => !v)}
            title={`Theme: ${theme}`}
            className="w-8 h-8 rounded-card flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors"
          >
            {(() => { const I = THEME_OPTIONS.find(o => o.id === theme)?.icon ?? Flame; return <I size={13} /> })()}
          </button>
        ) : (
          <button
            onClick={() => setThemeOpen(v => !v)}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-card text-xs text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors"
          >
            {(() => { const I = THEME_OPTIONS.find(o => o.id === theme)?.icon ?? Flame; return <I size={11} /> })()}
            <span className="capitalize">{theme}</span>
            <ChevronDown size={11} className={cn('ml-auto transition-transform', themeOpen && 'rotate-180')} />
          </button>
        )}
        {themeOpen && (
          <div className={cn('mt-1 card py-1 px-0 animate-fade-in', collapsed ? 'absolute left-12 bottom-10 z-30 w-36' : '')}>
            {THEME_OPTIONS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => { setTheme(id); setThemeOpen(false) }}
                className={cn(
                  'w-full text-left px-3 py-1.5 text-xs rounded flex items-center gap-2 transition-colors',
                  theme === id ? 'text-accent font-semibold' : 'text-ink-muted hover:text-ink hover:bg-surface-2',
                )}
              >
                <Icon size={11} />
                {label}
              </button>
            ))}
            <div className="mx-3 my-1 h-px bg-border opacity-40" />
            <button
              onClick={() => setReduceEffects(!reduceEffects)}
              role="switch"
              aria-checked={reduceEffects}
              className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs text-ink-muted hover:text-ink transition-colors"
            >
              <span>Reduce motion</span>
              <span
                className="relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors"
                style={{ background: reduceEffects ? 'var(--color-accent)' : 'var(--color-border)' }}
              >
                <span
                  className="inline-block h-3 w-3 rounded-full bg-white transition-transform"
                  style={{ transform: reduceEffects ? 'translateX(0.875rem)' : 'translateX(0.125rem)' }}
                />
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Logout */}
      <div className={cn('pb-4', collapsed ? 'px-1 flex justify-center' : 'px-3')}>
        <button
          onClick={() => logout.mutate()}
          title={collapsed ? 'Sign out' : undefined}
          className={cn(
            'flex items-center rounded-card text-xs text-ink-muted hover:text-danger transition-colors',
            collapsed ? 'w-8 h-8 justify-center' : 'w-full gap-2 px-3 py-1.5',
          )}
        >
          <LogOut size={collapsed ? 13 : 11} />
          {!collapsed && 'Sign out'}
        </button>
      </div>

      {rulesOpen && <RulesReferencePanel onClose={() => setRulesOpen(false)} />}
    </aside>
  )
}
