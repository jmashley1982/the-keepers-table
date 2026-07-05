import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import EntityCard from '../../components/entity/EntityCard'
import { ArrowLeft } from 'lucide-react'

const TAB_ENTITY_MAP: Record<string, string> = {
  npcs: 'npc', items: 'item', locations: 'location',
  factions: 'faction', encounters: 'encounter', 'plot-threads': 'plot_thread',
}

export default function EntityDetailPage() {
  const { campaignId, tab, entityId } = useParams<{ campaignId: string; tab: string; entityId: string }>()
  const navigate = useNavigate()

  const entityType = TAB_ENTITY_MAP[tab ?? ''] ?? 'npc'
  const endpoint = tab ?? 'npcs'

  const { data, isLoading } = useQuery({
    queryKey: ['entity', campaignId, entityType, entityId],
    queryFn: () => api.get(`/api/entities/${campaignId}/${endpoint}/${entityId}`).then(r => r.data),
    enabled: !!campaignId && !!entityId,
  })

  const item = data?.item

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <button className="btn-ghost mb-4" onClick={() => navigate(-1)}>
        <ArrowLeft size={16} /> Back
      </button>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : item ? (
        <EntityCard
          entity={item}
          entityType={entityType as Parameters<typeof EntityCard>[0]['entityType']}
          campaignId={campaignId!}
          onSaved={() => navigate(-1)}
        />
      ) : (
        <p className="text-ink-muted">Entity not found.</p>
      )}
    </div>
  )
}
