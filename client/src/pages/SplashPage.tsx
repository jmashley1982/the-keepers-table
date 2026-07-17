import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../lib/api'
import { useUIStore } from '../store/useUIStore'
import { themeBrandIcon } from '../lib/themeBrandIcon'
import { FlaskConical, Zap, BookOpen, Map, Swords, LogIn, LayoutDashboard, UserPlus, Sparkles, ClipboardList } from 'lucide-react'
import ThemeSwitcher from '../components/layout/ThemeSwitcher'

const FEATURES = [
  {
    icon: ClipboardList,
    title: 'Session Zero Suite',
    desc: 'Build your campaign before the first session: pitch builder, safety tools, table charter, and a world-building canvas with AI expansion.',
  },
  {
    icon: Sparkles,
    title: 'Campaign-Aware AI',
    desc: 'Every generation knows your world — NPCs, factions, plot threads, and recent session notes are automatically woven into Claude\'s context.',
  },
  {
    icon: Zap,
    title: 'Quick Generate',
    desc: 'Spin up NPCs, encounters, locations, and loot mid-session — one prompt, instant results that fit your existing world.',
  },
  {
    icon: Swords,
    title: 'Live Session Tools',
    desc: 'Track notes and entities in real time while you run the table. Wrap a session and get an AI-written player recap and GM debrief.',
  },
  {
    icon: BookOpen,
    title: 'Campaign Library',
    desc: 'Organise every NPC, faction, location, item, and plot thread in one place — with status tags, portraits, and full history.',
  },
  {
    icon: Map,
    title: 'Battle & World Maps',
    desc: 'Generate evocative maps on demand and pin named locations directly to your world.',
  },
]

export default function SplashPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const theme = useUIStore(s => s.theme)

  const { data: authData, isLoading: authLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get('/auth/me').then(r => r.data),
    retry: false,
  })

  const loggedIn = !authLoading && !!authData?.user

  const demo = useMutation({
    mutationFn: () => api.post('/auth/demo/login'),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['me'] })
      navigate(`/campaigns/${res.data.campaignId}`)
    },
  })

  return (
    <div
      className="min-h-screen flex flex-col relative overflow-hidden"
      style={theme === 'haunt' ? {
        backgroundImage: "url('/hero-haunt.webp')",
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
        backgroundAttachment: 'fixed',
      } : theme === 'icarus' ? {
        backgroundImage: "url('/hero-icarus.webp')",
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
        backgroundAttachment: 'fixed',
      } : theme === 'neon' ? {
        backgroundImage: "url('/hero-neon.webp')",
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
        backgroundAttachment: 'fixed',
      } : theme === 'eldritch' ? {
        backgroundImage: "url('/hero-eldritch.webp')",
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
        backgroundAttachment: 'fixed',
      } : theme === 'candlelight' ? {
        backgroundImage: "url('/hero-candlelight.webp')",
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
        backgroundAttachment: 'fixed',
      } : { background: 'var(--color-bg)' }}
    >
      {/* Atmospheric glow / haunt overlay */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: (theme === 'haunt' || theme === 'icarus' || theme === 'neon' || theme === 'eldritch' || theme === 'candlelight')
            ? `linear-gradient(to bottom,
                rgba(0,0,0,0.45) 0%,
                rgba(0,0,0,0.3) 40%,
                rgba(0,0,0,0.65) 100%)`
            : `
              radial-gradient(ellipse 70% 50% at 50% 0%,
                color-mix(in srgb, var(--color-accent) 12%, transparent) 0%,
                transparent 70%),
              radial-gradient(ellipse 100% 100% at 50% 50%,
                transparent 40%,
                rgba(0,0,0,0.5) 100%)
            `,
        }}
      />

      {/* Nav bar */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 max-w-5xl mx-auto w-full">
        <div className="flex items-center gap-2 opacity-80">
          <img
            src={themeBrandIcon(theme)}
            alt=""
            className="h-8 w-8 object-contain"
          />
          <span
            className="display-font font-bold text-sm"
            style={{ color: 'var(--color-ink)' }}
          >
            The Keeper's Table
          </span>
        </div>
        <div className="flex items-center gap-3">
          <ThemeSwitcher variant="inline" />
          {loggedIn ? (
            <button
              className="flex items-center gap-2 text-sm font-medium text-ink-muted hover:text-ink transition-colors"
              onClick={() => navigate('/campaigns')}
            >
              <LayoutDashboard size={15} />
              My Campaigns
            </button>
          ) : (
            <button
              className="flex items-center gap-2 text-sm font-medium text-ink-muted hover:text-ink transition-colors"
              onClick={() => navigate('/login')}
            >
              <LogIn size={15} />
              Sign in
            </button>
          )}
        </div>
      </header>

      {/* Hero */}
      <main className="relative z-10 flex flex-col items-center text-center px-6 pt-16 pb-24 flex-1">
        <img
          src={themeBrandIcon(theme)}
          alt=""
          className="h-32 w-32 mx-auto mb-6 object-contain"
          style={{
            filter: 'drop-shadow(0 0 40px color-mix(in srgb, var(--color-accent) 35%, transparent))',
          }}
        />

        <h1
          className="display-font text-4xl sm:text-5xl font-bold mb-4 leading-tight"
          style={{ color: 'var(--color-ink)' }}
        >
          The Keeper's Table
        </h1>

        <p className="text-ink-muted text-lg max-w-xl mb-10 leading-relaxed">
          The AI-powered command centre for Game Masters.
          Plan your campaign, run your sessions, and generate world-consistent content — all in one place.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center gap-3 mb-20">
          {loggedIn ? (
            <button
              onClick={() => navigate('/campaigns')}
              className="flex items-center gap-2 px-6 py-3 rounded-card font-semibold text-sm transition-all min-w-[220px] justify-center"
              style={{
                background: 'var(--color-accent)',
                color: '#fff',
                boxShadow: '0 0 24px color-mix(in srgb, var(--color-accent) 40%, transparent)',
              }}
              onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.1)')}
              onMouseLeave={e => (e.currentTarget.style.filter = '')}
            >
              <LayoutDashboard size={16} />
              Go to my campaigns
            </button>
          ) : (
            <>
              <button
                onClick={() => demo.mutate()}
                disabled={demo.isPending}
                className="flex items-center gap-2 px-6 py-3 rounded-card font-semibold text-sm transition-all disabled:opacity-50 min-w-[220px] justify-center"
                style={{
                  background: 'var(--color-accent)',
                  color: '#fff',
                  boxShadow: '0 0 24px color-mix(in srgb, var(--color-accent) 40%, transparent)',
                }}
                onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.1)')}
                onMouseLeave={e => (e.currentTarget.style.filter = '')}
              >
                <FlaskConical size={16} />
                {demo.isPending ? 'Loading demo…' : 'Try the demo — no sign‑up needed'}
              </button>

              <button
                onClick={() => navigate('/signup')}
                className="flex items-center gap-2 px-6 py-3 rounded-card font-semibold text-sm transition-all min-w-[160px] justify-center"
                style={{
                  background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
                  color: 'var(--color-accent)',
                  border: '1.5px solid color-mix(in srgb, var(--color-accent) 30%, transparent)',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--color-accent) 18%, transparent)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--color-accent) 10%, transparent)')}
              >
                <UserPlus size={15} />
                Sign up
              </button>

              <button
                onClick={() => navigate('/login')}
                className="flex items-center gap-2 px-4 py-2.5 rounded-card font-medium text-sm transition-all justify-center"
                style={{ color: 'var(--color-ink-muted)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-ink)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-ink-muted)')}
              >
                <LogIn size={14} />
                Sign in
              </button>
            </>
          )}
        </div>

        {demo.isError && (
          <p className="text-danger text-sm -mt-16 mb-4">{apiError(demo.error)}</p>
        )}

        {/* Feature grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl w-full text-left">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="rounded-card p-5 border border-border/60"
              style={{
                background: 'color-mix(in srgb, var(--color-surface) 80%, transparent)',
                backdropFilter: 'blur(8px)',
              }}
            >
              <div className="flex items-center gap-2.5 mb-2">
                <Icon size={16} style={{ color: 'var(--color-accent)' }} />
                <span className="font-semibold text-sm text-ink">{title}</span>
              </div>
              <p className="text-xs text-ink-muted leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 text-center pb-6">
        <p className="text-[11px] text-ink-muted/40">
          © {new Date().getFullYear()} The Keeper's Table
        </p>
      </footer>
    </div>
  )
}
