import { Router } from 'express'
import { requireAuth } from '../middleware/auth.middleware.js'
import { prisma } from '../lib/prisma.js'
import { z } from 'zod'
import { assertStaticRoutesFirst } from '../lib/assertStaticRoutesFirst.js'

export const sessionsRouter = Router()
sessionsRouter.use(requireAuth)

async function verifyCampaign(campaignId: string, userId: string) {
  return prisma.campaign.findFirst({ where: { id: campaignId, ownerUserId: userId, deletedAt: null } })
}

// ── Route-order convention ────────────────────────────────────────────────────
//
//  IMPORTANT: Express matches routes in declaration order.
//  Any static keyword route under /:campaignId/sessions/<keyword> MUST be
//  registered BEFORE the wildcard /:campaignId/sessions/:sessionId route,
//  otherwise Express captures the keyword as a sessionId and the static
//  route becomes unreachable (silently shadowed).
//
//  Rule: add all new static keyword routes to STATIC_SESSION_KEYWORDS and
//  declare them in the "Static keyword routes" section below.  The dynamic
//  /:sessionId routes must always come last.
//
//  A runtime assertion at the bottom of this file verifies this invariant
//  every time the server starts so the bug cannot survive a deploy.
// ─────────────────────────────────────────────────────────────────────────────

/** Every static path segment used directly under …/sessions/<keyword>. */
const STATIC_SESSION_KEYWORDS = ['active', 'session-zero'] as const

// ── Session collection routes ─────────────────────────────────────────────────

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
    where: { campaignId, isSessionZero: false, sessionNumber: { gt: 0 } },
    orderBy: { sessionNumber: 'desc' },
  })
  const sessionNumber = (last?.sessionNumber ?? 0) + 1
  const session = await prisma.gameSession.create({
    data: {
      campaignId,
      sessionNumber,
      title: parsed.data.title,
      partyId: parsed.data.partyId,
      status: 'in_progress',
      datePlayed: parsed.data.datePlayed ? new Date(parsed.data.datePlayed) : new Date(),
    },
  })
  res.json({ session })
})

sessionsRouter.post('/:campaignId/sessions/session-zero', async (req, res) => {
  const userId = res.locals.user.id
  const { campaignId } = req.params
  const campaign = await verifyCampaign(campaignId, userId)
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }
  const existing = await prisma.gameSession.findFirst({
    where: { campaignId, isSessionZero: true },
  })
  if (existing) { res.json({ session: existing }); return }
  const session = await prisma.gameSession.create({
    data: {
      campaignId,
      sessionNumber: 0,
      isSessionZero: true,
      title: 'Session Zero — Campaign Planning',
      status: 'in_progress',
      datePlayed: new Date(),
    },
  })
  res.json({ session })
})

// ── Static keyword routes (MUST stay above /:sessionId wildcard) ──────────────

sessionsRouter.get('/:campaignId/sessions/active', async (req, res) => {
  const userId = res.locals.user.id
  const { campaignId } = req.params
  const campaign = await verifyCampaign(campaignId, userId)
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }
  const session = await prisma.gameSession.findFirst({
    where: { campaignId, status: { in: ['in_progress', 'planned'] }, isSessionZero: false },
    orderBy: { createdAt: 'desc' },
  })
  if (!session) { res.status(404).json({ error: 'No active session' }); return }
  res.json({ session })
})

// ── Dynamic :sessionId routes (MUST stay below static keyword routes) ─────────

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

sessionsRouter.post('/:campaignId/sessions/:sessionId/notes/append', async (req, res) => {
  const userId = res.locals.user.id
  const { campaignId, sessionId } = req.params
  const campaign = await verifyCampaign(campaignId, userId)
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }
  const schema = z.object({ text: z.string().min(1) })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'Text is required' }); return }

  const existing = await prisma.gameSession.findUnique({ where: { id: sessionId } })
  if (!existing || existing.campaignId !== campaignId) { res.status(404).json({ error: 'Session not found' }); return }

  const now = new Date()
  const ts = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const prefix = `\n\n[${ts}] `
  const newNotes = (existing.dmRawNotes ?? '') + prefix + parsed.data.text

  const session = await prisma.gameSession.update({
    where: { id: sessionId },
    data: { dmRawNotes: newNotes },
  })
  res.json({ session })
})

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

// ── Route-order runtime assertion ─────────────────────────────────────────────
//
//  Runs once at module load time via the shared assertStaticRoutesFirst utility.
//  Confirms that every static keyword path is registered before the dynamic
//  /:sessionId wildcard.  Throws at startup (not silently at request time) if
//  the invariant is violated.
//
//  To add a new static keyword route:
//    1. Add the full path string to the staticPaths array below.
//    2. Register the route handler in the "Static keyword routes" section above.
//    3. The assertion will immediately flag it if placed in the wrong order.
// ─────────────────────────────────────────────────────────────────────────────
assertStaticRoutesFirst(sessionsRouter, {
  routerName: 'sessions.routes',
  staticPaths: STATIC_SESSION_KEYWORDS.map((k) => `/:campaignId/sessions/${k}`),
  dynamicPath: '/:campaignId/sessions/:sessionId',
})
