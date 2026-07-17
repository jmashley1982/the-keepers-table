import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { FlaskConical } from 'lucide-react'
import { useUIStore } from '../../store/useUIStore'
import { themeBrandIcon } from '../../lib/themeBrandIcon'
import ThemeSwitcher from '../../components/layout/ThemeSwitcher'

export default function LoginPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const theme = useUIStore(s => s.theme)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const login = useMutation({
    mutationFn: () => api.post('/auth/login', { email, password }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me'] })
      navigate('/campaigns')
    },
    onError: (e) => setError(apiError(e)),
  })

  const demo = useMutation({
    mutationFn: () => api.post('/auth/demo/login'),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['me'] })
      navigate(`/campaigns/${res.data.campaignId}`)
    },
    onError: (e) => setError(apiError(e)),
  })

  const busy = login.isPending || demo.isPending

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
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
      } : {
        background: `radial-gradient(ellipse 80% 60% at 50% 40%,
          color-mix(in srgb, var(--color-accent) 9%, var(--color-bg)) 0%,
          var(--color-bg) 65%)`,
      }}
    >
      {/* Vignette / haunt overlay */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: (theme === 'haunt' || theme === 'icarus' || theme === 'neon' || theme === 'eldritch' || theme === 'candlelight')
            ? 'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.6) 100%)'
            : 'radial-gradient(ellipse 100% 100% at 50% 50%, transparent 40%, rgba(0,0,0,0.55) 100%)',
        }}
      />

      <ThemeSwitcher variant="floating" />

      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-8">
          <img
            src={themeBrandIcon(theme)}
            alt=""
            className="h-28 w-28 mx-auto mb-4 object-contain"
            style={{ filter: 'drop-shadow(0 0 24px color-mix(in srgb, var(--color-accent) 30%, transparent))' }}
          />
          <h1
            className="display-font text-2xl font-bold mb-1"
            style={{ color: 'var(--color-ink)' }}
          >
            The Keeper's Table
          </h1>
          <p className="text-ink-muted text-sm">AI-powered campaign management for GMs</p>
        </div>

        {/* Demo mode CTA */}
        <button
          onClick={() => demo.mutate()}
          disabled={busy}
          className="w-full mb-4 flex items-center justify-center gap-2 px-4 py-3 rounded-card font-semibold text-sm transition-all disabled:opacity-50"
          style={{
            background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
            color: 'var(--color-accent)',
            border: '2px solid color-mix(in srgb, var(--color-accent) 30%, transparent)',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--color-accent) 20%, transparent)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--color-accent) 12%, transparent)')}
        >
          <FlaskConical size={16} />
          {demo.isPending ? 'Loading demo…' : 'Try the demo — no sign-up needed'}
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-ink-muted">or sign in</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <div
          className="rounded-card border border-border p-6 space-y-4"
          style={{
            background: 'var(--color-surface)',
            boxShadow: '0 0 40px rgba(0,0,0,0.6), inset 0 1px 0 color-mix(in srgb, var(--color-accent) 8%, transparent)',
          }}
        >
          <h2 className="display-font text-xl font-bold">Sign in</h2>

          {error && (
            <div className="rounded-card px-3 py-2 text-sm text-danger border border-danger/20"
              style={{ backgroundColor: 'color-mix(in srgb, var(--color-danger) 8%, transparent)' }}>
              {error}
            </div>
          )}

          <div>
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoFocus
            />
          </div>

          <div>
            <label className="label">Password</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              onKeyDown={e => e.key === 'Enter' && login.mutate()}
            />
          </div>

          <button
            className="btn-primary w-full justify-center"
            onClick={() => login.mutate()}
            disabled={busy || !email || !password}
          >
            {login.isPending ? 'Signing in…' : 'Sign in'}
          </button>

          <p className="text-center text-sm text-ink-muted">
            Don't have an account?{' '}
            <a href="/signup" className="text-accent hover:underline">Create one</a>
          </p>

        </div>
      </div>
    </div>
  )
}
