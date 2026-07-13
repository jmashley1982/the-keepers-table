import { Router } from 'express'
import { requireAuth } from '../middleware/auth.middleware.js'
import { prisma } from '../lib/prisma.js'
import { z } from 'zod'

export const entitiesRouter = Router()
entitiesRouter.use(requireAuth)

// Helper: verify campaign ownership
async function verifyCampaign(campaignId: string, userId: string) {
  return prisma.campaign.findFirst({
    where: { id: campaignId, ownerUserId: userId, deletedAt: null },
  })
}

// ── Generic entity CRUD factory ──────────────────────────────────────────────

type EntityModel = 'nPC' | 'item' | 'location' | 'faction' | 'encounter' | 'plotThread' | 'entityRelationship' | 'mapAsset'

function entityRoutes(
  entityName: EntityModel,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any,
  createSchema: z.ZodType,
  updateSchema: z.ZodType,
) {
  const router = Router({ mergeParams: true })

  router.get('/', async (req, res) => {
    const userId = res.locals.user.id
    const { campaignId } = req.params as { campaignId: string }
    const campaign = await verifyCampaign(campaignId, userId)
    if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return }
    const q = (req.query.q as string) ?? ''
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { campaignId, deletedAt: null }
    const items = await model.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] })
    if (q) {
      const lower = q.toLowerCase()
      return res.json({ items: items.filter((i: { name: string; description: string }) =>
        i.name.toLowerCase().includes(lower) || i.description?.toLowerCase().includes(lower)
      )})
    }
    res.json({ items })
  })

  router.post('/', async (req, res) => {
    const userId = res.locals.user.id
    const { campaignId } = req.params as { campaignId: string }
    const campaign = await verifyCampaign(campaignId, userId)
    if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return }
    const parsed = createSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: (parsed as { error: z.ZodError }).error.issues[0]?.message }); return
    }
    const maxOrder = await model.aggregate({
      where: { campaignId, deletedAt: null },
      _max: { sortOrder: true },
    })
    const nextSortOrder = (maxOrder._max.sortOrder ?? -1) + 1
    const item = await model.create({ data: { ...(parsed as { data: Record<string, unknown> }).data, campaignId, sortOrder: nextSortOrder } })
    res.json({ item })
  })

  router.get('/:entityId', async (req, res) => {
    const userId = res.locals.user.id
    const { campaignId, entityId } = req.params as { campaignId: string; entityId: string }
    const campaign = await verifyCampaign(campaignId, userId)
    if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return }
    const item = await model.findFirst({ where: { id: entityId, campaignId, deletedAt: null } })
    if (!item) { res.status(404).json({ error: 'Not found' }); return }
    res.json({ item })
  })

  router.patch('/:entityId', async (req, res) => {
    const userId = res.locals.user.id
    const { campaignId, entityId } = req.params as { campaignId: string; entityId: string }
    const campaign = await verifyCampaign(campaignId, userId)
    if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return }
    const parsed = updateSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: (parsed as { error: z.ZodError }).error.issues[0]?.message }); return
    }
    const item = await model.update({ where: { id: entityId }, data: (parsed as { data: Record<string, unknown> }).data })
    res.json({ item })
  })

  router.delete('/:entityId', async (req, res) => {
    const userId = res.locals.user.id
    const { campaignId, entityId } = req.params as { campaignId: string; entityId: string }
    const campaign = await verifyCampaign(campaignId, userId)
    if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return }
    await model.update({ where: { id: entityId }, data: { deletedAt: new Date() } })
    res.json({ ok: true })
  })

  return router
}

// ── NPC routes ───────────────────────────────────────────────────────────────

const npcCreate = z.object({
  name: z.string().min(1),
  role: z.string().optional(),
  description: z.string().optional(),
  appearance: z.string().optional(),
  personality: z.string().optional(),
  motivations: z.string().optional(),
  secrets: z.string().optional(),
  voiceNotes: z.string().optional(),
  statBlock: z.record(z.unknown()).optional(),
  status: z.string().optional(),
  dispositionToParty: z.string().optional(),
  locationId: z.string().optional(),
  factionId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  dmOnlyNotes: z.string().optional(),
  imageUrl: z.string().optional(),
  portraitUrl: z.string().optional(),
  portraitAssetId: z.string().nullable().optional(),
})
// Custom list for NPCs — includes portraitAsset.altText for accessible img alt text
entitiesRouter.get('/:campaignId/npcs', async (req, res) => {
  const userId = res.locals.user.id
  const { campaignId } = req.params as { campaignId: string }
  const campaign = await verifyCampaign(campaignId, userId)
  if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return }
  const q = (req.query.q as string) ?? ''
  const items = await prisma.nPC.findMany({
    where: { campaignId, deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: { portraitAsset: { select: { id: true, altText: true } } },
  })
  const filtered = q
    ? items.filter(i => i.name.toLowerCase().includes(q.toLowerCase()) || i.description?.toLowerCase().includes(q.toLowerCase()))
    : items
  res.json({ items: filtered })
})
entitiesRouter.use('/:campaignId/npcs', entityRoutes('nPC', prisma.nPC, npcCreate, npcCreate.partial()))

// ── Location routes ──────────────────────────────────────────────────────────

const locationCreate = z.object({
  name: z.string().min(1),
  type: z.string().optional(),
  description: z.string().optional(),
  parentLocationId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  dmOnlyNotes: z.string().optional(),
  imageUrl: z.string().optional(),
  imageAssetId: z.string().nullable().optional(),
  mapAssetId: z.string().nullable().optional(),
  ambience: z.record(z.unknown()).optional(),
})

// Custom list for locations — includes attached mapAsset thumbnails and imageAsset.altText
entitiesRouter.get('/:campaignId/locations', async (req, res) => {
  const userId = res.locals.user.id
  const { campaignId } = req.params as { campaignId: string }
  const campaign = await verifyCampaign(campaignId, userId)
  if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return }
  const q = (req.query.q as string) ?? ''
  const items = await prisma.location.findMany({
    where: { campaignId, deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      mapAsset: { include: { imageAsset: true } },
      imageAsset: { select: { id: true, altText: true } },
    },
  })
  const filtered = q
    ? items.filter(i => i.name.toLowerCase().includes(q.toLowerCase()) || i.description?.toLowerCase().includes(q.toLowerCase()))
    : items
  res.json({ items: filtered })
})

entitiesRouter.use('/:campaignId/locations', entityRoutes('location', prisma.location, locationCreate, locationCreate.partial()))

// ── Item routes ──────────────────────────────────────────────────────────────

const itemCreate = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
  rarity: z.string().optional(),
  mechanicalEffect: z.string().optional(),
  currentOwnerType: z.string().optional(),
  currentOwnerId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  dmOnlyNotes: z.string().optional(),
  imageUrl: z.string().optional(),
  imageAssetId: z.string().nullable().optional(),
})
// Custom list for items — includes imageAsset.altText for accessible img alt text
entitiesRouter.get('/:campaignId/items', async (req, res) => {
  const userId = res.locals.user.id
  const { campaignId } = req.params as { campaignId: string }
  const campaign = await verifyCampaign(campaignId, userId)
  if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return }
  const q = (req.query.q as string) ?? ''
  const items = await prisma.item.findMany({
    where: { campaignId, deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: { imageAsset: { select: { id: true, altText: true } } },
  })
  const filtered = q
    ? items.filter(i => i.name.toLowerCase().includes(q.toLowerCase()) || i.description?.toLowerCase().includes(q.toLowerCase()))
    : items
  res.json({ items: filtered })
})
entitiesRouter.use('/:campaignId/items', entityRoutes('item', prisma.item, itemCreate, itemCreate.partial()))

// ── Faction routes ───────────────────────────────────────────────────────────

const factionCreate = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  goals: z.string().optional(),
  dispositionToParty: z.string().optional(),
  headquartersLocationId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  dmOnlyNotes: z.string().optional(),
})
entitiesRouter.use('/:campaignId/factions', entityRoutes('faction', prisma.faction, factionCreate, factionCreate.partial()))

// ── Encounter routes ─────────────────────────────────────────────────────────

const encounterCreate = z.object({
  name: z.string().min(1),
  type: z.string().optional(),
  difficulty: z.string().optional(),
  setup: z.string().optional(),
  tactics: z.string().optional(),
  twist: z.string().optional(),
  scalingNotes: z.string().optional(),
  participants: z.array(z.unknown()).optional(),
  locationId: z.string().optional(),
  sessionId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  dmOnlyNotes: z.string().optional(),
  description: z.string().optional(),
  mapAssetId: z.string().nullable().optional(),
})

// Custom list for encounters — enriches with attached mapAsset so cards can show thumbnails
entitiesRouter.get('/:campaignId/encounters', async (req, res) => {
  const userId = res.locals.user.id
  const { campaignId } = req.params as { campaignId: string }
  const campaign = await verifyCampaign(campaignId, userId)
  if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return }
  const q = (req.query.q as string) ?? ''
  const items = await prisma.encounter.findMany({
    where: { campaignId, deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  })
  const filtered = q
    ? items.filter(i => i.name.toLowerCase().includes(q.toLowerCase()) || i.description?.toLowerCase().includes(q.toLowerCase()))
    : items
  const mapAssetIds = [...new Set(filtered.map(i => i.mapAssetId).filter(Boolean))] as string[]
  const mapAssets = mapAssetIds.length > 0
    ? await prisma.mapAsset.findMany({ where: { id: { in: mapAssetIds } }, include: { imageAsset: true } })
    : []
  const mapAssetMap = Object.fromEntries(mapAssets.map(m => [m.id, m]))
  const enriched = filtered.map(i => ({
    ...i,
    mapAsset: i.mapAssetId ? (mapAssetMap[i.mapAssetId] ?? null) : null,
  }))
  res.json({ items: enriched })
})

entitiesRouter.use('/:campaignId/encounters', entityRoutes('encounter', prisma.encounter, encounterCreate, encounterCreate.partial()))

// ── Plot threads ─────────────────────────────────────────────────────────────

const plotCreate = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.string().optional(),
  relatedEntities: z.array(z.unknown()).optional(),
})
entitiesRouter.use('/:campaignId/plot-threads', entityRoutes('plotThread', prisma.plotThread, plotCreate, plotCreate.partial()))

// ── Relationships ─────────────────────────────────────────────────────────────

entitiesRouter.get('/:campaignId/relationships', async (req, res) => {
  const userId = res.locals.user.id
  const { campaignId } = req.params
  const campaign = await verifyCampaign(campaignId, userId)
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }
  const items = await prisma.entityRelationship.findMany({ where: { campaignId } })
  res.json({ items })
})

entitiesRouter.post('/:campaignId/relationships', async (req, res) => {
  const userId = res.locals.user.id
  const { campaignId } = req.params
  const campaign = await verifyCampaign(campaignId, userId)
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }
  const schema = z.object({
    entityAType: z.string(),
    entityAId: z.string(),
    entityBType: z.string(),
    entityBId: z.string(),
    relationshipType: z.string(),
    notes: z.string().optional(),
    bidirectional: z.boolean().optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return }
  const item = await prisma.entityRelationship.create({ data: { ...parsed.data, campaignId } })
  res.json({ item })
})

entitiesRouter.delete('/:campaignId/relationships/:id', async (req, res) => {
  const userId = res.locals.user.id
  const { campaignId, id } = req.params
  const campaign = await verifyCampaign(campaignId, userId)
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }
  await prisma.entityRelationship.delete({ where: { id } })
  res.json({ ok: true })
})

// ── Map assets ────────────────────────────────────────────────────────────────

entitiesRouter.get('/:campaignId/maps', async (req, res) => {
  const userId = res.locals.user.id
  const { campaignId } = req.params
  const campaign = await verifyCampaign(campaignId, userId)
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }
  const items = await prisma.mapAsset.findMany({ where: { campaignId, deletedAt: null } })
  res.json({ items })
})

entitiesRouter.post('/:campaignId/maps', async (req, res) => {
  const userId = res.locals.user.id
  const { campaignId } = req.params
  const campaign = await verifyCampaign(campaignId, userId)
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }
  const schema = z.object({
    kind: z.string().optional(),
    title: z.string().min(1),
    imageUrl: z.string().optional(),
    source: z.string().optional(),
    linkedLocationId: z.string().optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return }
  const item = await prisma.mapAsset.create({ data: { ...parsed.data, campaignId } })
  res.json({ item })
})

// ── Search ────────────────────────────────────────────────────────────────────

entitiesRouter.get('/:campaignId/search', async (req, res) => {
  const userId = res.locals.user.id
  const { campaignId } = req.params
  const q = (req.query.q as string)?.toLowerCase() ?? ''
  const campaign = await verifyCampaign(campaignId, userId)
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }
  if (!q) { res.json({ results: [] }); return }

  const [npcs, items, locations, factions, encounters, threads] = await Promise.all([
    prisma.nPC.findMany({ where: { campaignId, deletedAt: null }, select: { id: true, name: true, role: true, description: true } }),
    prisma.item.findMany({ where: { campaignId, deletedAt: null }, select: { id: true, name: true, category: true, description: true } }),
    prisma.location.findMany({ where: { campaignId, deletedAt: null }, select: { id: true, name: true, type: true, description: true } }),
    prisma.faction.findMany({ where: { campaignId, deletedAt: null }, select: { id: true, name: true, description: true } }),
    prisma.encounter.findMany({ where: { campaignId, deletedAt: null }, select: { id: true, name: true, type: true, description: true } }),
    prisma.plotThread.findMany({ where: { campaignId, deletedAt: null }, select: { id: true, title: true, description: true } }),
  ])

  function match(text: string) { return text?.toLowerCase().includes(q) }

  const results = [
    ...npcs.filter(n => match(n.name) || match(n.role ?? '') || match(n.description ?? '')).map(n => ({ ...n, entityType: 'npc' })),
    ...items.filter(i => match(i.name) || match(i.description ?? '')).map(i => ({ ...i, entityType: 'item' })),
    ...locations.filter(l => match(l.name) || match(l.description ?? '')).map(l => ({ ...l, entityType: 'location' })),
    ...factions.filter(f => match(f.name) || match(f.description ?? '')).map(f => ({ ...f, entityType: 'faction' })),
    ...encounters.filter(e => match(e.name) || match(e.description ?? '')).map(e => ({ ...e, entityType: 'encounter' })),
    ...threads.filter(t => match(t.title) || match(t.description ?? '')).map(t => ({ ...t, entityType: 'plot_thread', name: t.title })),
  ]

  res.json({ results })
})
