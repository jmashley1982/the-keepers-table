import { Outlet, useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useUIStore } from '../../store/useUIStore'
import { useEffect } from 'react'
import Sidebar from './Sidebar'
import QuickGenerate from '../generate/QuickGenerate'
import ScratchTray from '../generate/ScratchTray'
import { FlaskConical, X } from 'lucide-react'

export default function AppShell() {
  const { campaignId } = useParams()
  const navigate = useNavigate()
  const { setActiveCampaignId, quickGenerateOpen, setQuickGenerateOpen } = useUIStore()

  const { data: meData } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get('/auth/me').then(r => r.data),
  })
  const isDemo = meData?.isDemo ?? false

  useEffect(() => {
    setActiveCampaignId(campaignId ?? null)
  }, [campaignId, setActiveCampaignId])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setQuickGenerateOpen(true)
      }
      if (e.key === 'Escape') setQuickGenerateOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setQuickGenerateOpen])

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-bg">
      {/* Demo banner */}
      {isDemo && (
        <div className="flex items-center justify-between px-4 py-2 text-sm font-medium shrink-0"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
            borderBottom: '1px solid color-mix(in srgb, var(--color-accent) 25%, transparent)',
            color: 'var(--color-accent)',
          }}>
          <div className="flex items-center gap-2">
            <FlaskConical size={14} />
            <span>Demo mode — data resets each visit. Your changes won't be saved permanently.</span>
          </div>
          <button
            onClick={() => navigate('/signup')}
            className="ml-4 px-3 py-1 rounded-card text-xs font-semibold transition-all"
            style={{
              backgroundColor: 'var(--color-accent)',
              color: '#fff',
            }}
          >
            Create free account →
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <Sidebar campaignId={campaignId} />

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {quickGenerateOpen && (
        <QuickGenerate onClose={() => setQuickGenerateOpen(false)} campaignId={campaignId} />
      )}

      <ScratchTray />
    </div>
  )
}
