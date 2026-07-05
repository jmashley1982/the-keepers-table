import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'
import { FlaskConical } from 'lucide-react'

export default function LoginPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
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
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img
            src="/logo.png"
            alt="The Keeper's Table"
            className="h-[154px] w-auto mx-auto mb-2 logo-theme"
          />
          <p className="text-ink-muted text-sm">AI-powered campaign management for GMs</p>
        </div>

        {/* Demo mode CTA */}
        <button
          onClick={() => demo.mutate()}
          disabled={busy}
          className="w-full mb-4 flex items-center justify-center gap-2 px-4 py-3 rounded-card border-2 border-accent/40 bg-accent/5 text-accent font-medium text-sm hover:bg-accent/10 hover:border-accent/60 transition-all disabled:opacity-50"
        >
          <FlaskConical size={16} />
          {demo.isPending ? 'Loading demo…' : 'Try the demo — no sign-up needed'}
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-ink-muted">or sign in</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <div className="card space-y-4">
          <h2 className="text-lg font-semibold text-ink">Sign in</h2>

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
            No account?{' '}
            <Link to="/signup" className="text-accent hover:underline">Create one</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
