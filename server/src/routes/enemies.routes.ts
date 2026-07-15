import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.middleware.js'
import srd5eEnemies from '../data/srd-5e-enemies.json' with { type: 'json' }
import srdDwEnemies from '../data/srd-dw-enemies.json' with { type: 'json' }

export const enemiesRouter = Router()

enemiesRouter.use(requireAuth)

// ── List enemies for a campaign ───────────────────────────────────────────────
// Returns SRD (builtin) enemies for the campaign's system + campaign's custom enemies

enemiesRouter.get('/:campaignId/enemies', async (req, res) => {
  const userId = res.locals.user.id
  const { campaignId } = req.params
  const { q, type, source } = req.query

  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, ownerUserId: userId, deletedAt: null },
    select: { id: true, systemTemplateId: true },
  })
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' })
    return
  }

  // Determine SRD set based on system template
  let srdEnemies: typeof srd5eEnemies = []
  if (campaign.systemTemplateId === 'builtin-d-d-5e') {
    srdEnemies = srd5eEnemies as typeof srd5eEnemies
  } else if (campaign.systemTemplateId === 'builtin-dungeon-world') {
    srdEnemies = srdDwEnemies as unknown as typeof srd5eEnemies
  }

  // Filter SRD enemies
  let filteredSrd = srdEnemies as Array<Record<string, unknown>>
  if (q && typeof q === 'string' && q.trim()) {
    const lower = q.toLowerCase()
    filteredSrd = filteredSrd.filter(e =>
      (e.name as string).toLowerCase().includes(lower) ||
      (e.description as string).toLowerCase().includes(lower) ||
      (e.enemyType as string).toLowerCase().includes(lower) ||
      ((e.tags as string[]) || []).some((t: string) => t.toLowerCase().includes(lower))
    )
  }
  if (type && typeof type === 'string' && type !== 'all') {
    filteredSrd = filteredSrd.filter(e =>
      (e.enemyType as string).toLowerCase().includes(type.toLowerCase())
    )
  }

  // Fetch campaign custom enemies
  const customEnemies = await prisma.enemy.findMany({
    where: {
      campaignId,
      isBuiltin: false,
      deletedAt: null,
      ...(q && typeof q === 'string' && q.trim() ? {
        OR: [
          { name: { contains: q as string, mode: 'insensitive' } },
          { description: { contains: q as string, mode: 'insensitive' } },
          { enemyType: { contains: q as string, mode: 'insensitive' } },
        ],
      } : {}),
      ...(type && typeof type === 'string' && type !== 'all' ? {
        enemyType: { contains: type as string, mode: 'insensitive' },
      } : {}),
    },
    orderBy: { createdAt: 'desc' },
  })

  // Filter by source
  let returnedSrd = filteredSrd
  let returnedCustom = customEnemies
  if (source === 'srd') returnedCustom = []
  if (source === 'custom') returnedSrd = []

  res.json({
    srdEnemies: returnedSrd.map(e => ({ ...e, source: 'srd', isBuiltin: true })),
    customEnemies: returnedCustom,
    systemTemplateId: campaign.systemTemplateId,
  })
})

// ── Save a custom enemy to campaign ──────────────────────────────────────────

enemiesRouter.post('/:campaignId/enemies', async (req, res) => {
  const userId = res.locals.user.id
  const { campaignId } = req.params

  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, ownerUserId: userId, deletedAt: null },
    select: { id: true, systemTemplateId: true },
  })
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' })
    return
  }

  const { name, description, enemyType, size, cr, statBlock, tags, source } = req.body

  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'Name is required' })
    return
  }

  const enemy = await prisma.enemy.create({
    data: {
      name: name.trim(),
      description: description ?? '',
      enemyType: enemyType ?? '',
      size: size ?? '',
      cr: cr ?? null,
      statBlock: statBlock ?? {},
      tags: Array.isArray(tags) ? tags : [],
      source: source ?? 'generated',
      isBuiltin: false,
      campaignId,
      systemTemplateId: campaign.systemTemplateId,
    },
  })

  res.json({ enemy })
})

// ── Update a custom enemy ─────────────────────────────────────────────────────

enemiesRouter.patch('/:campaignId/enemies/:enemyId', async (req, res) => {
  const userId = res.locals.user.id
  const { campaignId, enemyId } = req.params

  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, ownerUserId: userId, deletedAt: null },
    select: { id: true },
  })
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' })
    return
  }

  const existing = await prisma.enemy.findFirst({
    where: { id: enemyId, campaignId, isBuiltin: false, deletedAt: null },
  })
  if (!existing) {
    res.status(404).json({ error: 'Enemy not found' })
    return
  }

  const { name, description, enemyType, size, cr, statBlock, tags } = req.body

  const enemy = await prisma.enemy.update({
    where: { id: enemyId },
    data: {
      ...(name !== undefined ? { name: String(name).trim() } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(enemyType !== undefined ? { enemyType } : {}),
      ...(size !== undefined ? { size } : {}),
      ...(cr !== undefined ? { cr } : {}),
      ...(statBlock !== undefined ? { statBlock } : {}),
      ...(tags !== undefined ? { tags: Array.isArray(tags) ? tags : [] } : {}),
    },
  })

  res.json({ enemy })
})

// ── Delete a custom enemy ─────────────────────────────────────────────────────

enemiesRouter.delete('/:campaignId/enemies/:enemyId', async (req, res) => {
  const userId = res.locals.user.id
  const { campaignId, enemyId } = req.params

  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, ownerUserId: userId, deletedAt: null },
    select: { id: true },
  })
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' })
    return
  }

  await prisma.enemy.updateMany({
    where: { id: enemyId, campaignId, isBuiltin: false },
    data: { deletedAt: new Date() },
  })

  res.json({ ok: true })
})
