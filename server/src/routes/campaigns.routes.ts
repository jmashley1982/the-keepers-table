import { Router } from 'express'
import { requireAuth } from '../middleware/auth.middleware.js'
import { prisma } from '../lib/prisma.js'
import { z } from 'zod'

export const campaignsRouter = Router()
campaignsRouter.use(requireAuth)

campaignsRouter.get('/', async (req, res) => {
  const userId = res.locals.user.id
  const campaigns = await prisma.campaign.findMany({
    where: { ownerUserId: userId, deletedAt: null },
    include: {
      systemTemplate: { select: { id: true, name: true } },
      parties: { take: 1 },
      _count: { select: { npcs: true, sessions: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })
  res.json({ campaigns })
})

campaignsRouter.post('/', async (req, res) => {
  const schema = z.object({
    name: z.string().min(1).max(120),
    systemTemplateId: z.string(),
    settingNotes: z.string().optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message })
    return
  }
  const userId = res.locals.user.id
  const campaign = await prisma.campaign.create({
    data: { ...parsed.data, ownerUserId: userId },
    include: { systemTemplate: true },
  })
  res.json({ campaign })
})

campaignsRouter.get('/:id', async (req, res) => {
  const userId = res.locals.user.id
  const campaign = await prisma.campaign.findFirst({
    where: { id: req.params.id, ownerUserId: userId, deletedAt: null },
    include: {
      systemTemplate: true,
      parties: true,
      _count: { select: { npcs: true, items: true, locations: true, sessions: true, encounters: true } },
    },
  })
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' })
    return
  }
  res.json({ campaign })
})

campaignsRouter.patch('/:id', async (req, res) => {
  const userId = res.locals.user.id
  const schema = z.object({
    name: z.string().min(1).max(120).optional(),
    settingNotes: z.string().optional(),
    systemTemplateId: z.string().optional(),
    archived: z.boolean().optional(),
    themeId: z.string().optional(),
    aiModel: z.string().optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message })
    return
  }
  const campaign = await prisma.campaign.findFirst({
    where: { id: req.params.id, ownerUserId: userId },
  })
  if (!campaign) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  const updated = await prisma.campaign.update({
    where: { id: req.params.id },
    data: parsed.data,
  })
  res.json({ campaign: updated })
})

campaignsRouter.delete('/:id', async (req, res) => {
  const userId = res.locals.user.id
  await prisma.campaign.updateMany({
    where: { id: req.params.id, ownerUserId: userId },
    data: { deletedAt: new Date() },
  })
  res.json({ ok: true })
})

// ── Parties ──────────────────────────────────────────────────────────────────

campaignsRouter.get('/:id/parties', async (req, res) => {
  const userId = res.locals.user.id
  const campaign = await prisma.campaign.findFirst({
    where: { id: req.params.id, ownerUserId: userId },
  })
  if (!campaign) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  const parties = await prisma.party.findMany({ where: { campaignId: req.params.id } })
  res.json({ parties })
})

campaignsRouter.post('/:id/parties', async (req, res) => {
  const userId = res.locals.user.id
  const campaign = await prisma.campaign.findFirst({
    where: { id: req.params.id, ownerUserId: userId },
  })
  if (!campaign) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  const schema = z.object({
    name: z.string().min(1),
    characters: z.array(z.object({
      name: z.string(),
      class: z.string().optional(),
      level: z.number().optional(),
      playerName: z.string().optional(),
      notes: z.string().optional(),
    })).optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message })
    return
  }
  const party = await prisma.party.create({
    data: { campaignId: req.params.id, name: parsed.data.name, characters: parsed.data.characters ?? [] },
  })
  res.json({ party })
})

campaignsRouter.patch('/:id/parties/:partyId', async (req, res) => {
  const userId = res.locals.user.id
  const campaign = await prisma.campaign.findFirst({ where: { id: req.params.id, ownerUserId: userId } })
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }
  const party = await prisma.party.update({
    where: { id: req.params.partyId },
    data: req.body,
  })
  res.json({ party })
})
