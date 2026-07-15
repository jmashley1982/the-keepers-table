import { NavLink, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useUIStore } from '../../store/useUIStore'
import { cn } from '../../lib/cn'
import {
  LayoutDashboard, BookOpen, Map, Scroll,
  Settings, LogOut, ChevronDown, Zap, Users,
  Contrast, Flame, Skull, Rocket, Terminal, Swords, Shield,
} from 'lucide-react'
import { useState } from 'react'
import { themeLogo } from '../../lib/themeLogo'
import RulesReferencePanel from '../dnd5e/RulesReferencePanel'

const THEME_OPTIONS = [
  { id: 'candlelight',  label: 'Candlelight',   icon: Flame },
  { id: 'eldritch',    label: 'Eldritch',       icon: Skull },
  { id: 'icarus',      label: 'Icarus',         icon: Rocket },
  { id: 'neon',        label: 'Neon',           icon: Terminal },
  { id: 'parchment',   label: 'Parchment',      icon: Scroll },
  { id: 'high-contrast', label: 'High Contrast', icon: Contrast },
] as const

export default function Sidebar({ campaignId }: { campaignId?: string }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { theme, setTheme, setQuickGenerateOpen } = useUIStore()
  const [themeOpen, setThemeOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)

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

  const navLink = (to: string, icon: React.ReactNode, label: string, end?: boolean) => (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 px-3 py-2 text-sm transition-all duration-150 rounded-card border-l-2',
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
    <aside className="hidden md:flex w-56 flex-col h-full overflow-y-auto flex-shrink-0"
      style={{ background: 'linear-gradient(180deg, var(--color-surface) 0%, color-mix(in srgb, var(--color-surface) 95%, var(--color-bg)) 100%)', borderRight: '1px solid var(--color-border)' }}
    >
      {/* Logo */}
      <div className="px-4 py-4 border-b border-border">
        <img
          src={themeLogo(theme)}
          alt="The Keeper's Table"
          className="w-full h-auto logo-theme"
        />
        {user && (
          <p className="text-xs text-ink-muted mt-1.5 truncate">{user.displayName}</p>
        )}
      </div>

      {/* Quick Generate */}
      <div className="px-3 pt-3">
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
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 flex flex-col gap-0.5">
        {navLink('/campaigns', <LayoutDashboard size={15} />, 'Campaigns', true)}

        {campaign && (
          <>
            <div className="pt-4 pb-1.5 px-1">
              <p className="display-font text-sm font-semibold truncate leading-tight" title={campaign.name}>
                {campaign.name}
              </p>
              <div className="mt-1 h-px" style={{ background: 'linear-gradient(to right, var(--color-accent), transparent)', opacity: 0.3 }} />
            </div>
            {navLink(`/campaign/${campaignId}`, <LayoutDashboard size={15} />, 'Dashboard', true)}
            {navLink(`/campaign/${campaignId}/library`, <BookOpen size={15} />, 'Library')}
            {navLink(`/campaign/${campaignId}/enemies`, <Swords size={15} />, 'Enemies')}
            {navLink(`/campaign/${campaignId}/players`, <Users size={15} />, 'Players')}
            {navLink(`/campaign/${campaignId}/maps`, <Map size={15} />, 'Maps')}
            {navLink(`/campaign/${campaignId}/log`, <Scroll size={15} />, 'Session Log')}
            {navLink(`/campaign/${campaignId}/settings`, <Settings size={15} />, 'Campaign Settings')}

            {isDnd5e && (
              <button
                onClick={() => setRulesOpen(true)}
                className="flex items-center gap-2.5 px-3 py-2 text-sm transition-all duration-150 rounded-card border-l-2 border-transparent text-ink-muted hover:text-ink hover:bg-white/5 w-full text-left"
              >
                <Shield size={15} />
                <span>5e Rules</span>
              </button>
            )}
          </>
        )}

        <div className="pt-4 pb-1 px-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-muted opacity-60">Account</p>
        </div>
        {navLink('/settings', <Settings size={15} />, 'Settings', true)}
      </nav>

      {/* Theme picker */}
      <div className="px-3 pb-2">
        <button
          onClick={() => setThemeOpen(v => !v)}
          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-card text-xs text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors"
        >
          {(() => {
            const CurrentIcon = THEME_OPTIONS.find(o => o.id === theme)?.icon ?? Flame
            return <CurrentIcon size={11} />
          })()}
          <span className="capitalize">{theme}</span>
          <ChevronDown size={11} className={cn('ml-auto transition-transform', themeOpen && 'rotate-180')} />
        </button>
        {themeOpen && (
          <div className="mt-1 card py-1 px-0 animate-fade-in">
            {THEME_OPTIONS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => { setTheme(id); setThemeOpen(false) }}
                className={cn(
                  'w-full text-left px-3 py-1.5 text-xs rounded flex items-center gap-2 transition-colors',
                  theme === id ? 'text-accent font-semibold' : 'text-ink-muted hover:text-ink hover:bg-surface-2'
                )}
              >
                <Icon size={11} />
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
          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-card text-xs text-ink-muted hover:text-danger transition-colors"
        >
          <LogOut size={11} />
          Sign out
        </button>
      </div>

      {rulesOpen && <RulesReferencePanel onClose={() => setRulesOpen(false)} />}
    </aside>
  )
}
