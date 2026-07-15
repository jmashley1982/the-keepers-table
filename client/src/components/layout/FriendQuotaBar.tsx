import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { Zap, Image } from 'lucide-react'

interface QuotaRowProps {
  icon: React.ReactNode
  label: string
  used: number
  limit: number
}

function QuotaRow({ icon, label, used, limit }: QuotaRowProps) {
  const remaining = Math.max(0, limit - used)
  const pct = Math.min(100, (used / limit) * 100)
  const low = remaining <= Math.ceil(limit * 0.25)

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between text-[10px]">
        <span className="flex items-center gap-1 text-ink-muted">
          {icon}
          {label}
        </span>
        <span
          className="font-semibold tabular-nums"
          style={{ color: low ? 'var(--color-danger, #e05252)' : 'var(--color-ink-muted)' }}
        >
          {remaining} left
        </span>
      </div>
      <div className="h-1 rounded-full overflow-hidden" style={{ background: 'color-mix(in srgb, var(--color-border) 60%, transparent)' }}>
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${pct}%`,
            background: low
              ? 'var(--color-danger, #e05252)'
              : 'color-mix(in srgb, var(--color-accent) 70%, transparent)',
          }}
        />
      </div>
    </div>
  )
}

export default function FriendQuotaBar() {
  const { data, isError } = useQuery({
    queryKey: ['friends-me'],
    queryFn: () => api.get('/api/friends/me').then(r => r.data),
    retry: false,
    staleTime: 30_000,
  })

  if (isError || !data?.isFriend || !data?.quota) return null

  const { textUsed, textLimit, imageUsed, imageLimit } = data.quota

  return (
    <div
      className="mx-3 mb-2 px-3 py-2.5 rounded-card flex flex-col gap-2"
      style={{
        background: 'color-mix(in srgb, var(--color-surface-2, var(--color-surface)) 80%, transparent)',
        border: '1px solid var(--color-border)',
      }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-muted opacity-60">
        Your quota
      </p>
      <QuotaRow
        icon={<Zap size={9} />}
        label="Text"
        used={textUsed}
        limit={textLimit}
      />
      <QuotaRow
        icon={<Image size={9} />}
        label="Images"
        used={imageUsed}
        limit={imageLimit}
      />
    </div>
  )
}
