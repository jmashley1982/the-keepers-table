import { useState, FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { api } from '../../lib/api'
import ThemeSwitcher from '../../components/layout/ThemeSwitcher'

function WelcomeModal({ onClose }: { onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-bg border border-border rounded-xl shadow-xl w-full max-w-md p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-ink-muted hover:text-ink transition-colors"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <div className="text-3xl mb-3 text-center">🔮</div>
        <h2 className="text-lg font-bold text-ink text-center mb-4">Welcome, friend!</h2>

        <div className="space-y-3 text-sm text-ink-muted">
          <p>
            You're using <span className="text-ink font-medium">my API credits</span> to access this app. To keep things fair, guest accounts have a lifetime limit of:
          </p>

          <ul className="list-none space-y-1 pl-1">
            <li className="flex items-center gap-2">
              <span className="text-base">✍️</span>
              <span><span className="text-ink font-medium">24 text generations</span> (NPCs, encounters, dialogue, etc.)</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-base">🎨</span>
              <span><span className="text-ink font-medium">12 image generations</span> (portraits, maps, art)</span>
            </li>
          </ul>

          <p>
            If you'd like a <span className="text-ink font-medium">permanent account with no limits</span>, just ask me — I'm happy to set one up for you.
          </p>

          <p>
            For unlimited image generation, you can subscribe to your own{' '}
            <a
              href="https://evolink.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline hover:opacity-80 transition-opacity"
            >
              Evolink API
            </a>{' '}
            — you set your own budget and add the key in Settings.
          </p>
        </div>

        <button onClick={onClose} className="btn btn-primary w-full mt-5">
          Got it, let's play!
        </button>
      </div>
    </div>,
    document.body
  )
}

export default function FriendsLoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showWelcome, setShowWelcome] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/api/friends/login', { username, password })
      setShowWelcome(true)
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  function handleWelcomeClose() {
    setShowWelcome(false)
    navigate('/campaigns', { replace: true })
  }

  return (
    <>
      {showWelcome && <WelcomeModal onClose={handleWelcomeClose} />}

      <ThemeSwitcher variant="floating" />

      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="text-4xl mb-3">🔮</div>
            <h1 className="text-2xl font-bold text-ink">Friends Only</h1>
            <p className="text-ink-muted text-sm mt-1">Enter your name and the access code to try the app</p>
          </div>

          <form onSubmit={handleSubmit} className="card p-6 flex flex-col gap-4">
            <div>
              <label className="label mb-1">Your first name</label>
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
              <p className="text-[11px] text-ink-muted mt-1">Letters only</p>
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
    </>
  )
}
