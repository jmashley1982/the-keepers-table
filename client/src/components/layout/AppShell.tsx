import { Outlet, useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useUIStore } from '../../store/useUIStore'
import { useEffect } from 'react'
import Sidebar from './Sidebar'
import QuickGenerate from '../generate/QuickGenerate'
import ScratchTray from '../generate/ScratchTray'
import { Keyboard } from 'lucide-react'

export default function AppShell() {
  const { campaignId } = useParams()
  const { setActiveCampaignId, quickGenerateOpen, setQuickGenerateOpen } = useUIStore()

  useEffect(() => {
    setActiveCampaignId(campaignId ?? null)
  }, [campaignId, setActiveCampaignId])

  // Keyboard shortcut ⌘K / Ctrl+K
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
    <div className="flex h-screen overflow-hidden bg-bg">
      <Sidebar campaignId={campaignId} />

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>

      {quickGenerateOpen && (
        <QuickGenerate onClose={() => setQuickGenerateOpen(false)} campaignId={campaignId} />
      )}

      <ScratchTray />
    </div>
  )
}
