import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Menu, Zap } from 'lucide-react'
import { api } from '../../lib/api'
import { useUIStore } from '../../store/useUIStore'
import { themeLogo } from '../../lib/themeLogo'

interface Props {
  onMenuOpen: () => void
}

export default function MobileTopBar({ onMenuOpen }: Props) {
  const { campaignId } = useParams()
  const { theme, setQuickGenerateOpen } = useUIStore()

  const { data: campaignData } = useQuery({
    queryKey: ['campaign', campaignId],
    queryFn: () => api.get(`/api/campaigns/${campaignId}`).then(r => r.data),
    enabled: !!campaignId,
  })

  const campaign = campaignData?.campaign

  return (
    <div
      className="flex md:hidden items-center justify-between px-3 py-2 shrink-0 border-b border-border"
      style={{ background: 'var(--color-surface)' }}
    >
      <button
        onClick={onMenuOpen}
        className="flex items-center justify-center w-11 h-11 rounded-card text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors touch-manipulation"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      <div className="flex flex-col items-center min-w-0">
        <img
          src={themeLogo(theme)}
          alt="The Keeper's Table"
          className="h-6 w-auto logo-theme"
        />
        {campaign && (
          <p className="text-[10px] text-ink-muted truncate max-w-[160px]">{campaign.name}</p>
        )}
      </div>

      <button
        onClick={() => setQuickGenerateOpen(true)}
        className="flex items-center justify-center w-11 h-11 rounded-full transition-colors touch-manipulation"
        style={{
          background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)',
          color: 'var(--color-accent)',
        }}
        aria-label="Quick Generate"
      >
        <Zap size={18} />
      </button>
    </div>
  )
}
