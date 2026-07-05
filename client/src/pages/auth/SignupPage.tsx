import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, apiError } from '../../lib/api'

export default function SignupPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [form, setForm] = useState({ email: '', password: '', displayName: '' })
  const [error, setError] = useState('')

  const signup = useMutation({
    mutationFn: () => api.post('/auth/signup', form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me'] })
      navigate('/onboarding')
    },
    onError: (e) => setError(apiError(e)),
  })

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img
            src="/logo.png"
            alt="The Keeper's Table"
            className="h-32 w-auto mx-auto mb-2 logo-theme"
          />
          <p className="text-ink-muted text-sm">Your campaign memory starts here</p>
        </div>

        <div className="card space-y-4">
          <h2 className="text-lg font-semibold text-ink">Create account</h2>

          {error && (
            <div className="bg-danger/10 border border-danger/20 text-danger text-sm rounded-card px-3 py-2">
              {error}
            </div>
          )}

          <div>
            <label className="label">Display name</label>
            <input className="input" value={form.displayName} onChange={set('displayName')} placeholder="Your GM name" autoFocus />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" />
          </div>
          <div>
            <label className="label">Password</label>
            <input className="input" type="password" value={form.password} onChange={set('password')} placeholder="8+ characters" />
          </div>

          <button
            className="btn-primary w-full justify-center"
            onClick={() => signup.mutate()}
            disabled={signup.isPending || !form.email || !form.password || !form.displayName}
          >
            {signup.isPending ? 'Creating account…' : 'Create account'}
          </button>

          <p className="text-center text-sm text-ink-muted">
            Already have an account?{' '}
            <Link to="/login" className="text-accent hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
