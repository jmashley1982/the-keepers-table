import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'

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

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="display-font text-4xl font-bold text-ink mb-2">The Keeper's Table</h1>
          <p className="text-ink-muted text-sm">AI-powered campaign management for GMs</p>
        </div>

        <div className="card space-y-4">
          <h2 className="text-lg font-semibold text-ink">Sign in</h2>

          {error && (
            <div className="bg-danger/10 border border-danger/20 text-danger text-sm rounded-card px-3 py-2">
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
            disabled={login.isPending || !email || !password}
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
