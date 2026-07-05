import { NavLink, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useUIStore } from '../../store/useUIStore'
import { cn } from '../../lib/cn'
import {
  LayoutDashboard, BookOpen, Map, Calendar, Scroll,
  Settings, LogOut, ChevronDown, Sword, Zap, Users,
  Sun, Moon, Contrast
} from 'lucide-react'
import { useState } from 'react'

const THEME_OPTIONS = [
  { id: 'parchment', label: 'Parchment', icon: Sun },
  { id: 'candlelight', label: 'Candlelight', icon: Moon },
  { id: 'slate', label: 'Slate', icon: Moon },
  { id: 'high-contrast', label: 'High Contrast', icon: Contrast },
] as const

export default function Sidebar({ campaignId }: { campaignId?: string }) {
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
    onSuccess: () => {
      qc.clear()
      navigate('/login')
    },
  })

  const campaign = campaignData?.campaign
  const user = meData?.user

  const navLink = (to: string, icon: React.ReactNode, label: string) => (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn('flex items-center gap-2.5 px-3 py-2 rounded-card text-sm transition-colors',
          isActive
            ? 'bg-accent text-white font-medium'
            : 'text-ink-muted hover:text-ink hover:bg-surface-2')
      }
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  )

  return (
    <aside className="w-56 flex flex-col bg-surface border-r border-border h-full overflow-y-auto flex-shrink-0">
      {/* Logo */}
      <div className="px-4 py-3 border-b border-border">
        <img
          src="/logo.png"
          alt="The Keeper's Table"
          className="h-12 w-auto logo-theme"
        />
        {user && (
          <p className="text-xs text-ink-muted mt-1 truncate">{user.displayName}</p>
        )}
      </div>

      {/* Quick Generate */}
      <div className="px-3 pt-3">
        <button
          onClick={() => setQuickGenerateOpen(true)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-card bg-accent/10 text-accent text-sm font-medium hover:bg-accent/20 transition-colors border border-accent/20"
        >
          <Zap size={14} />
          Quick Generate
          <span className="ml-auto text-xs opacity-60">⌘K</span>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 flex flex-col gap-1">
        {navLink('/campaigns', <LayoutDashboard size={16} />, 'Campaigns')}

        {campaign && (
          <>
            <div className="pt-3 pb-1">
              <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider px-1 truncate" title={campaign.name}>
                {campaign.name}
              </p>
            </div>
            {navLink(`/campaign/${campaignId}`, <LayoutDashboard size={16} />, 'Dashboard')}
            {navLink(`/campaign/${campaignId}/library`, <BookOpen size={16} />, 'Library')}
            {navLink(`/campaign/${campaignId}/maps`, <Map size={16} />, 'Maps')}
            {navLink(`/campaign/${campaignId}/log`, <Scroll size={16} />, 'Session Log')}
            {navLink(`/campaign/${campaignId}/settings`, <Settings size={16} />, 'Campaign')}
          </>
        )}

        <div className="pt-3 pb-1">
          <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider px-1">Account</p>
        </div>
        {navLink('/settings', <Settings size={16} />, 'Settings')}
      </nav>

      {/* Theme picker */}
      <div className="px-3 pb-2">
        <button
          onClick={() => setThemeOpen(v => !v)}
          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-card text-xs text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors"
        >
          <Sun size={12} />
          <span className="capitalize">{theme}</span>
          <ChevronDown size={12} className={cn('ml-auto transition-transform', themeOpen && 'rotate-180')} />
        </button>
        {themeOpen && (
          <div className="mt-1 card py-1 px-0 animate-fade-in">
            {THEME_OPTIONS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => { setTheme(id); setThemeOpen(false) }}
                className={cn(
                  'w-full text-left px-3 py-1.5 text-xs rounded hover:bg-surface-2 transition-colors',
                  theme === id ? 'text-accent font-medium' : 'text-ink-muted'
                )}
              >
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
          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-card text-xs text-ink-muted hover:text-danger hover:bg-surface-2 transition-colors"
        >
          <LogOut size={12} />
          Sign out
        </button>
      </div>
    </aside>
  )
}
