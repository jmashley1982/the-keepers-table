import { Router } from 'express'
import { requireAuth } from '../middleware/auth.middleware.js'
import { prisma } from '../lib/prisma.js'
import { z } from 'zod'

export const sessionsRouter = Router()
sessionsRouter.use(requireAuth)

async function verifyCampaign(campaignId: string, userId: string) {
  return prisma.campaign.findFirst({ where: { id: campaignId, ownerUserId: userId, deletedAt: null } })
}

// ── Session CRUD ─────────────────────────────────────────────────────────────

sessionsRouter.get('/:campaignId/sessions', async (req, res) => {
  const userId = res.locals.user.id
  const { campaignId } = req.params
  const campaign = await verifyCampaign(campaignId, userId)
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }
  const sessions = await prisma.gameSession.findMany({
    where: { campaignId },
    orderBy: { sessionNumber: 'desc' },
    include: { party: true, _count: { select: { entityTouches: true } } },
  })
  res.json({ sessions })
})

sessionsRouter.post('/:campaignId/sessions', async (req, res) => {
  const userId = res.locals.user.id
  const { campaignId } = req.params
  const campaign = await verifyCampaign(campaignId, userId)
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }
  const schema = z.object({
    title: z.string().optional(),
    partyId: z.string().optional(),
    datePlayed: z.string().optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return }

  const last = await prisma.gameSession.findFirst({
    where: { campaignId },
    orderBy: { sessionNumber: 'desc' },
  })
  const sessionNumber = (last?.sessionNumber ?? 0) + 1
  const session = await prisma.gameSession.create({
    data: {
      campaignId,
      sessionNumber,
      title: parsed.data.title,
      partyId: parsed.data.partyId,
      datePlayed: parsed.data.datePlayed ? new Date(parsed.data.datePlayed) : undefined,
    },
  })
  res.json({ session })
})

sessionsRouter.get('/:campaignId/sessions/:sessionId', async (req, res) => {
  const userId = res.locals.user.id
  const { campaignId, sessionId } = req.params
  const campaign = await verifyCampaign(campaignId, userId)
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }
  const session = await prisma.gameSession.findFirst({
    where: { id: sessionId, campaignId },
    include: {
      party: true,
      encounters: true,
      entityTouches: { orderBy: { touchedAt: 'desc' }, take: 50 },
    },
  })
  if (!session) { res.status(404).json({ error: 'Not found' }); return }
  res.json({ session })
})

sessionsRouter.patch('/:campaignId/sessions/:sessionId', async (req, res) => {
  const userId = res.locals.user.id
  const { campaignId, sessionId } = req.params
  const campaign = await verifyCampaign(campaignId, userId)
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }
  const schema = z.object({
    title: z.string().optional(),
    dmRawNotes: z.string().optional(),
    generatedSummary: z.string().optional(),
    keyEvents: z.array(z.string()).optional(),
    hooksForNext: z.array(z.string()).optional(),
    status: z.enum(['planned', 'in_progress', 'complete']).optional(),
    recapRead: z.boolean().optional(),
    partyId: z.string().optional(),
    datePlayed: z.string().optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return }
  const data: Record<string, unknown> = { ...parsed.data }
  if (parsed.data.datePlayed) data.datePlayed = new Date(parsed.data.datePlayed)
  const session = await prisma.gameSession.update({ where: { id: sessionId }, data })
  res.json({ session })
})

// ── Session actions ──────────────────────────────────────────────────────────

sessionsRouter.post('/:campaignId/sessions/:sessionId/start', async (req, res) => {
  const userId = res.locals.user.id
  const { campaignId, sessionId } = req.params
  const campaign = await verifyCampaign(campaignId, userId)
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }
  const session = await prisma.gameSession.update({
    where: { id: sessionId },
    data: { status: 'in_progress', datePlayed: new Date() },
  })
  res.json({ session })
})

// ── Entity touch logging ─────────────────────────────────────────────────────

sessionsRouter.post('/:campaignId/sessions/:sessionId/touch', async (req, res) => {
  const userId = res.locals.user.id
  const { campaignId, sessionId } = req.params
  const campaign = await verifyCampaign(campaignId, userId)
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }
  const schema = z.object({ entityType: z.string(), entityId: z.string() })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return }
  const touch = await prisma.sessionEntityTouch.create({
    data: { sessionId, entityType: parsed.data.entityType, entityId: parsed.data.entityId },
  })
  res.json({ touch })
})

// ── Session Wrap pipeline ─────────────────────────────────────────────────────

sessionsRouter.post('/:campaignId/sessions/:sessionId/wrap/confirm', async (req, res) => {
  const userId = res.locals.user.id
  const { campaignId, sessionId } = req.params
  const campaign = await verifyCampaign(campaignId, userId)
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }

  const schema = z.object({
    summary: z.string(),
    keyEvents: z.array(z.string()),
    hooksForNext: z.array(z.string()),
    acceptedUpdates: z.array(z.object({
      entityType: z.string(),
      entityId: z.string(),
      field: z.string(),
      newValue: z.unknown(),
    })),
    acceptedNewEntities: z.array(z.object({
      entityType: z.string(),
      fields: z.record(z.unknown()),
    })),
  })

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return }

  const { summary, keyEvents, hooksForNext, acceptedUpdates, acceptedNewEntities } = parsed.data

  // Apply updates transactionally
  await prisma.$transaction(async (tx) => {
    // Update session
    await tx.gameSession.update({
      where: { id: sessionId },
      data: {
        generatedSummary: summary,
        keyEvents,
        hooksForNext,
        status: 'complete',
        recapRead: false,
      },
    })

    // Apply entity field updates
    for (const u of acceptedUpdates) {
      try {
        const modelMap: Record<string, string> = {
          npc: 'nPC', item: 'item', location: 'location',
          faction: 'faction', encounter: 'encounter', plot_thread: 'plotThread',
        }
        const modelName = modelMap[u.entityType]
        if (!modelName) continue
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (tx as any)[modelName].update({
          where: { id: u.entityId },
          data: { [u.field]: u.newValue },
        })
      } catch (_) { /* skip bad updates */ }
    }

    // Create new entities
    for (const e of acceptedNewEntities) {
      try {
        const modelMap: Record<string, string> = {
          npc: 'nPC', item: 'item', location: 'location',
          faction: 'faction', encounter: 'encounter',
        }
        const modelName = modelMap[e.entityType]
        if (!modelName) continue
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (tx as any)[modelName].create({
          data: { ...(e.fields as Record<string, unknown>), campaignId },
        })
      } catch (_) { /* skip bad creates */ }
    }
  })

  res.json({ ok: true })
})
