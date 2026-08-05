// Maps a raw AI-generated entity object (as returned by POST /api/generate/text)
// to a create payload for POST /api/entities/:campaignId/:route.
//
// The server's per-type Zod schemas (server/src/routes/entities.routes.ts) accept
// a fixed set of keys and *silently strip* anything else — so an AI field with no
// matching column (e.g. a Location's `atmosphere`/`notableFeatures`/`hooks`, or a
// Foe's `enemyType`/`size`/`cr` saved as an NPC) would otherwise be lost without
// any error. This keeps them by folding unrecognized keys into `customFields`
// instead of dropping them.
//
// Mirrors the create-schema key lists in entities.routes.ts — keep in sync if
// those schemas change.

export type SaveEntityType = 'npc' | 'location' | 'item' | 'faction' | 'encounter' | 'plot_thread'

const KNOWN_KEYS: Record<SaveEntityType, string[]> = {
  npc: [
    'name', 'role', 'description', 'appearance', 'personality', 'motivations',
    'secrets', 'voiceNotes', 'statBlock', 'customFields', 'status',
    'dispositionToParty', 'locationId', 'factionId', 'tags', 'dmOnlyNotes',
    'imageUrl', 'portraitUrl', 'portraitAssetId', 'bestiaryEntityId', 'bestiaryEntityName',
  ],
  location: [
    'name', 'type', 'description', 'parentLocationId', 'tags', 'dmOnlyNotes',
    'imageUrl', 'imageAssetId', 'mapAssetId', 'ambience', 'customFields',
  ],
  item: [
    'name', 'description', 'category', 'rarity', 'mechanicalEffect',
    'currentOwnerType', 'currentOwnerId', 'tags', 'dmOnlyNotes', 'imageUrl',
    'imageAssetId', 'customFields',
  ],
  faction: [
    'name', 'description', 'goals', 'dispositionToParty', 'headquartersLocationId',
    'tags', 'dmOnlyNotes', 'customFields',
  ],
  encounter: [
    'name', 'type', 'difficulty', 'setup', 'tactics', 'twist', 'scalingNotes',
    'participants', 'locationId', 'sessionId', 'tags', 'dmOnlyNotes',
    'description', 'mapAssetId', 'customFields',
  ],
  // PlotThread has no customFields column — unrecognized keys are just dropped,
  // same as before this helper existed. In practice PLOT_THREAD_SCHEMA only
  // ever emits title/description/status, so this never triggers.
  plot_thread: ['title', 'description', 'status', 'relatedEntities'],
}

/**
 * Convert a raw AI result object into a create payload for the given entity
 * type: fields the server schema recognizes pass through as-is, everything
 * else is folded into `customFields` so nothing the model generated is
 * silently dropped by the server's Zod strip-unknown-keys behavior.
 */
export function entityFromGenerated(
  entityType: SaveEntityType,
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const known = new Set(KNOWN_KEYS[entityType] ?? [])
  const payload: Record<string, unknown> = {}
  const extra: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue
    if (key === 'customFields' && value && typeof value === 'object') {
      Object.assign(extra, value as Record<string, unknown>)
      continue
    }
    if (known.has(key)) payload[key] = value
    else extra[key] = value
  }

  if (Object.keys(extra).length > 0) payload.customFields = extra
  return payload
}
