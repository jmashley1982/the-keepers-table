import { useState, useEffect, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import ThemedLoader from '../../components/ui/Loader'

interface FriendData {
  username: string
  claudeUsed: number
  imageUsed: number
}

const CLAUDE_QUOTA = 24
const IMAGE_QUOTA = 12

function QuotaBar({ used, total, label }: { used: number; total: number; label: string }) {
  const pct = Math.min((used / total) * 100, 100)
  const remaining = total - used
  const color = remaining === 0 ? 'bg-red-400' : remaining <= 3 ? 'bg-orange-400' : 'bg-accent'
  return (
    <div className="flex items-center gap-2 text-xs text-ink-muted">
      <span className="w-20 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-surface-2 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-16 text-right shrink-0">
        {remaining === 0 ? (
          <span className="text-red-400 font-medium">Used up</span>
        ) : (
          <span>{remaining} / {total} left</span>
        )}
      </span>
    </div>
  )
}

export default function FriendsPortalPage() {
  const navigate = useNavigate()
  const [friend, setFriend] = useState<FriendData | null>(null)
  const [tab, setTab] = useState<'text' | 'image'>('text')

  const [textPrompt, setTextPrompt] = useState('')
  const [textResult, setTextResult] = useState('')
  const [textLoading, setTextLoading] = useState(false)
  const [textError, setTextError] = useState('')

  const [imagePrompt, setImagePrompt] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [imageLoading, setImageLoading] = useState(false)
  const [imageError, setImageError] = useState('')

  useEffect(() => {
    api.get('/api/friends/me')
      .then(r => setFriend(r.data))
      .catch(() => navigate('/friends', { replace: true }))
  }, [navigate])

  async function handleLogout() {
    await api.post('/api/friends/logout').catch(() => {})
    navigate('/friends', { replace: true })
  }

  async function handleText(e: FormEvent) {
    e.preventDefault()
    setTextError('')
    setTextResult('')
    setTextLoading(true)
    try {
      const { data } = await api.post('/api/friends/generate/text', { prompt: textPrompt })
      setTextResult(data.text)
      setFriend(f => f ? { ...f, claudeUsed: data.claudeUsed, imageUsed: data.imageUsed } : f)
    } catch (err: any) {
      setTextError(err.response?.data?.error ?? 'Something went wrong')
    } finally {
      setTextLoading(false)
    }
  }

  async function handleImage(e: FormEvent) {
    e.preventDefault()
    setImageError('')
    setImageUrl('')
    setImageLoading(true)
    try {
      const { data } = await api.post('/api/friends/generate/image', { prompt: imagePrompt })
      setImageUrl(data.imageUrl)
      setFriend(f => f ? { ...f, claudeUsed: data.claudeUsed, imageUsed: data.imageUsed } : f)
    } catch (err: any) {
      setImageError(err.response?.data?.error ?? 'Something went wrong')
    } finally {
      setImageLoading(false)
    }
  }

  if (!friend) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <ThemedLoader />
      </div>
    )
  }

  const textExhausted = friend.claudeUsed >= CLAUDE_QUOTA
  const imageExhausted = friend.imageUsed >= IMAGE_QUOTA

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Header */}
      <header className="border-b border-surface-2 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">🔮</span>
          <span className="font-semibold text-ink">Friends Only</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-ink-muted">Hey, <span className="text-ink font-medium">{friend.username}</span></span>
          <button onClick={handleLogout} className="btn btn-ghost text-xs px-2 py-1">Sign out</button>
        </div>
      </header>

      <div className="flex-1 max-w-2xl w-full mx-auto p-4 flex flex-col gap-4">
        {/* Quota bars */}
        <div className="card p-4 flex flex-col gap-2">
          <p className="text-xs font-medium text-ink-muted uppercase tracking-wider mb-1">Your quota</p>
          <QuotaBar used={friend.claudeUsed} total={CLAUDE_QUOTA} label="Text (Haiku)" />
          <QuotaBar used={friend.imageUsed} total={IMAGE_QUOTA} label="Image" />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-surface-2 rounded-lg">
          {(['text', 'image'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-1.5 text-sm rounded-md font-medium transition-colors ${
                tab === t ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {t === 'text' ? '✍️ Text' : '🖼 Image'}
            </button>
          ))}
        </div>

        {/* Text tab */}
        {tab === 'text' && (
          <div className="flex flex-col gap-3">
            {textExhausted ? (
              <div className="card p-6 text-center text-ink-muted">
                <div className="text-3xl mb-2">🪫</div>
                <p className="font-medium text-ink">Text quota used up</p>
                <p className="text-sm mt-1">You've used all {CLAUDE_QUOTA} text generations.</p>
              </div>
            ) : (
              <form onSubmit={handleText} className="flex flex-col gap-3">
                <textarea
                  className="input w-full min-h-[120px] resize-y"
                  placeholder="Ask anything…"
                  value={textPrompt}
                  onChange={e => setTextPrompt(e.target.value)}
                  maxLength={2000}
                  required
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-ink-muted">{textPrompt.length}/2000</span>
                  <button
                    type="submit"
                    disabled={textLoading || !textPrompt.trim()}
                    className="btn btn-primary"
                  >
                    {textLoading ? 'Generating…' : 'Generate'}
                  </button>
                </div>
              </form>
            )}

            {textError && (
              <p className="text-sm text-red-400 bg-red-400/10 rounded px-3 py-2">{textError}</p>
            )}

            {textLoading && (
              <div className="card p-6 flex items-center gap-3 text-ink-muted">
                <ThemedLoader flavor="default" />
              </div>
            )}

            {textResult && !textLoading && (
              <div className="card p-4">
                <p className="text-xs font-medium text-ink-muted uppercase tracking-wider mb-2">Response</p>
                <pre className="text-sm text-ink whitespace-pre-wrap font-sans leading-relaxed">{textResult}</pre>
              </div>
            )}
          </div>
        )}

        {/* Image tab */}
        {tab === 'image' && (
          <div className="flex flex-col gap-3">
            {imageExhausted ? (
              <div className="card p-6 text-center text-ink-muted">
                <div className="text-3xl mb-2">🪫</div>
                <p className="font-medium text-ink">Image quota used up</p>
                <p className="text-sm mt-1">You've used all {IMAGE_QUOTA} image generations.</p>
              </div>
            ) : (
              <form onSubmit={handleImage} className="flex flex-col gap-3">
                <textarea
                  className="input w-full min-h-[100px] resize-y"
                  placeholder="Describe the image…"
                  value={imagePrompt}
                  onChange={e => setImagePrompt(e.target.value)}
                  maxLength={1000}
                  required
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-ink-muted">{imagePrompt.length}/1000</span>
                  <button
                    type="submit"
                    disabled={imageLoading || !imagePrompt.trim()}
                    className="btn btn-primary"
                  >
                    {imageLoading ? 'Generating…' : 'Generate'}
                  </button>
                </div>
              </form>
            )}

            {imageError && (
              <p className="text-sm text-red-400 bg-red-400/10 rounded px-3 py-2">{imageError}</p>
            )}

            {imageLoading && (
              <div className="card p-6 flex flex-col items-center gap-3 text-ink-muted">
                <ThemedLoader flavor="portrait" label="Rendering your image… (up to ~60s)" />
              </div>
            )}

            {imageUrl && !imageLoading && (
              <div className="card p-4 flex flex-col gap-3">
                <p className="text-xs font-medium text-ink-muted uppercase tracking-wider">Result</p>
                <img
                  src={imageUrl}
                  alt="Generated"
                  className="w-full rounded-lg object-contain max-h-[512px]"
                />
                <a
                  href={imageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-ghost text-xs self-start"
                >
                  Open full size ↗
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
