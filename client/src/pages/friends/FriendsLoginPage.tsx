import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'

export default function FriendsLoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/api/friends/login', { username, password })
      navigate('/campaigns', { replace: true })
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🔮</div>
          <h1 className="text-2xl font-bold text-ink">Friends Only</h1>
          <p className="text-ink-muted text-sm mt-1">Enter your name and the access code to try the app</p>
        </div>

        <form onSubmit={handleSubmit} className="card p-6 flex flex-col gap-4">
          <div>
            <label className="label mb-1">Your name</label>
            <input
              className="input w-full"
              type="text"
              placeholder="e.g. tavian"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
            <p className="text-[11px] text-ink-muted mt-1">Letters, numbers, - and _ only</p>
          </div>

          <div>
            <label className="label mb-1">Access code</label>
            <input
              className="input w-full"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-400/10 rounded px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !username || !password}
            className="btn btn-primary w-full"
          >
            {loading ? 'Entering…' : 'Enter'}
          </button>
        </form>
      </div>
    </div>
  )
}
