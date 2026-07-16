import { Router } from 'express'
import { requireAuth } from '../middleware/auth.middleware.js'
import { prisma } from '../lib/prisma.js'
import { z } from 'zod'
import Anthropic from '@anthropic-ai/sdk'

export const sessionZeroRouter = Router()

// ── Helper: verify campaign ownership ────────────────────────────────────────
async function ownedCampaign(campaignId: string, userId: string) {
  return prisma.campaign.findFirst({ where: { id: campaignId, ownerUserId: userId, deletedAt: null } })
}

// ════════════════════════════════════════════════════════════════════════════
// MODULE 1 — CAMPAIGN PITCH
// ════════════════════════════════════════════════════════════════════════════

const pitchSchema = z.object({
  pitchElevator:         z.string().optional(),
  pitchGenre:            z.string().optional(),
  pitchLength:           z.string().optional(),
  pitchWhatIsNot:        z.string().optional(),
  tonGrimHeroic:         z.number().min(0).max(100).optional(),
  tonGrittyCinematic:    z.number().min(0).max(100).optional(),
  tonEpisodicSerialized: z.number().min(0).max(100).optional(),
  tonCombatRoleplay:     z.number().min(0).max(100).optional(),
})

sessionZeroRouter.patch('/:id/session-zero/pitch', requireAuth, async (req, res) => {
  const userId = res.locals.user.id
  const campaign = await ownedCampaign(req.params.id, userId)
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }

  const parsed = pitchSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return }

  const updated = await prisma.campaign.update({ where: { id: req.params.id }, data: parsed.data })
  res.json({ campaign: updated })
})

// AI pitch assist — streaming SSE
sessionZeroRouter.post('/:id/session-zero/pitch/assist', requireAuth, async (req, res) => {
  const userId = res.locals.user.id
  const campaign = await ownedCampaign(req.params.id, userId)
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }

  const { draft } = req.body as { draft?: string }

  const userPrefs = await prisma.userPreference.findUnique({ where: { userId } })
  const modelId = userPrefs?.defaultTextModel ?? 'claude-opus-4-5'

  const toneDesc = [
    `${campaign.tonGrimHeroic < 40 ? 'grim' : campaign.tonGrimHeroic > 60 ? 'heroic' : 'balanced grim-heroic'} tone`,
    `${campaign.tonGrittyCinematic < 40 ? 'gritty' : campaign.tonGrittyCinematic > 60 ? 'cinematic' : 'grounded-cinematic'} feel`,
    `${campaign.tonEpisodicSerialized < 40 ? 'episodic' : campaign.tonEpisodicSerialized > 60 ? 'serialized' : 'mixed episode/serial'} pacing`,
    `${campaign.tonCombatRoleplay < 40 ? 'combat-heavy' : campaign.tonCombatRoleplay > 60 ? 'roleplay-heavy' : 'balanced combat/roleplay'}`,
  ].join(', ')

  const systemPrompt = `You are helping a Game Master craft a compelling campaign pitch for their TTRPG players.
Return a polished 2–3 sentence elevator pitch that captures the genre, tone, and central hook.
Write in present tense, second person ("Your players will…" or use evocative third-person).
Do not add headers, bullet points, or extra explanation. Just the pitch text.`

  const userMessage = `Campaign name: ${campaign.name}
Genre: ${campaign.pitchGenre || '(not specified)'}
Expected length: ${campaign.pitchLength || '(not specified)'}
Tone: ${toneDesc}
What it is NOT: ${campaign.pitchWhatIsNot || '(not specified)'}
GM's draft: ${draft || campaign.pitchElevator || '(none yet)'}

Write or refine the elevator pitch for this campaign.`

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  try {
    const client = new Anthropic()
    const stream = await client.messages.stream({
      model: modelId,
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    })

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        res.write(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`)
      }
    }
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'AI generation failed'
    res.write(`data: ${JSON.stringify({ error: msg })}\n\n`)
  } finally {
    res.end()
  }
})

// ════════════════════════════════════════════════════════════════════════════
// MODULE 2 — SAFETY TOOLS
// ════════════════════════════════════════════════════════════════════════════

const PRESET_TOPICS = [
  'Violence against children',
  'Sexual content',
  'Torture / extended suffering',
  'Harm to animals',
  'Body horror / grotesque imagery',
  'Spiders / insects (phobia)',
  'Drowning / suffocation (phobia)',
  'Real-world religion',
  'Real-world politics',
  'Suicide / self-harm',
  'Racism / bigotry depicted in detail',
  'Sexual violence',
  'Clowns / dolls (phobia)',
  'Claustrophobia',
  'Jump scares',
]

sessionZeroRouter.get('/:id/session-zero/safety', requireAuth, async (req, res) => {
  const userId = res.locals.user.id
  const campaign = await ownedCampaign(req.params.id, userId)
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }

  // Ensure preset topics exist for this campaign (idempotent seed)
  const existing = await prisma.safetyTopic.findMany({ where: { campaignId: req.params.id } })
  const existingTopics = new Set(existing.map(t => t.topic))
  const toCreate = PRESET_TOPICS.filter(t => !existingTopics.has(t))
  if (toCreate.length > 0) {
    await prisma.safetyTopic.createMany({
      data: toCreate.map(topic => ({ campaignId: req.params.id, topic, isPreset: true })),
      skipDuplicates: true,
    })
  }

  const topics = await prisma.safetyTopic.findMany({
    where: { campaignId: req.params.id },
    orderBy: [{ isPreset: 'desc' }, { topic: 'asc' }],
  })

  const shareLink = await prisma.safetyShareLink.findUnique({ where: { campaignId: req.params.id } })
  const submissionCount = shareLink
    ? await prisma.anonymousSafetySubmission.count({ where: { campaignId: req.params.id } })
    : 0

  res.json({
    topics,
    contentRating: campaign.contentRating,
    sessionToolsUsed: campaign.sessionToolsUsed,
    shareLink: shareLink ? { token: shareLink.token, active: shareLink.active } : null,
    submissionCount,
  })
})

// Bulk upsert topics + update safety meta fields
sessionZeroRouter.put('/:id/session-zero/safety', requireAuth, async (req, res) => {
  const userId = res.locals.user.id
  const campaign = await ownedCampaign(req.params.id, userId)
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }

  const schema = z.object({
    topics: z.array(z.object({
      topic: z.string().min(1),
      isPreset: z.boolean().optional(),
      gmSetting: z.string().nullable().optional(),
    })).optional(),
    contentRating: z.string().optional(),
    sessionToolsUsed: z.string().optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return }

  if (parsed.data.topics) {
    for (const t of parsed.data.topics) {
      await prisma.safetyTopic.upsert({
        where: { campaignId_topic: { campaignId: req.params.id, topic: t.topic } },
        create: { campaignId: req.params.id, topic: t.topic, isPreset: t.isPreset ?? false, gmSetting: t.gmSetting ?? null },
        update: { gmSetting: t.gmSetting ?? null },
      })
    }
  }

  if (parsed.data.contentRating !== undefined || parsed.data.sessionToolsUsed !== undefined) {
    await prisma.campaign.update({
      where: { id: req.params.id },
      data: {
        ...(parsed.data.contentRating !== undefined && { contentRating: parsed.data.contentRating }),
        ...(parsed.data.sessionToolsUsed !== undefined && { sessionToolsUsed: parsed.data.sessionToolsUsed }),
      },
    })
  }

  res.json({ ok: true })
})

// Delete a custom topic
sessionZeroRouter.delete('/:id/session-zero/safety/topic', requireAuth, async (req, res) => {
  const userId = res.locals.user.id
  const campaign = await ownedCampaign(req.params.id, userId)
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }

  const { topic } = req.body as { topic: string }
  if (!topic) { res.status(400).json({ error: 'topic required' }); return }

  await prisma.safetyTopic.deleteMany({
    where: { campaignId: req.params.id, topic, isPreset: false },
  })
  res.json({ ok: true })
})

// Create or get share link
sessionZeroRouter.post('/:id/session-zero/safety/share', requireAuth, async (req, res) => {
  const userId = res.locals.user.id
  const campaign = await ownedCampaign(req.params.id, userId)
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }

  const link = await prisma.safetyShareLink.upsert({
    where: { campaignId: req.params.id },
    create: { campaignId: req.params.id },
    update: { active: true },
  })
  res.json({ token: link.token, active: link.active })
})

// Deactivate share link
sessionZeroRouter.delete('/:id/session-zero/safety/share', requireAuth, async (req, res) => {
  const userId = res.locals.user.id
  const campaign = await ownedCampaign(req.params.id, userId)
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }

  await prisma.safetyShareLink.updateMany({
    where: { campaignId: req.params.id },
    data: { active: false },
  })
  res.json({ ok: true })
})

// Get merged submission summary (strictest setting per topic)
sessionZeroRouter.get('/:id/session-zero/safety/submissions', requireAuth, async (req, res) => {
  const userId = res.locals.user.id
  const campaign = await ownedCampaign(req.params.id, userId)
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }

  const submissions = await prisma.anonymousSafetySubmission.findMany({
    where: { campaignId: req.params.id },
    orderBy: { createdAt: 'desc' },
  })

  // Merge: strictest wins. Order: line > veil > ok
  const PRIORITY: Record<string, number> = { line: 3, veil: 2, ok: 1 }
  const merged: Record<string, string> = {}
  for (const sub of submissions) {
    const topicMap = sub.topics as Record<string, string>
    for (const [topic, setting] of Object.entries(topicMap)) {
      const current = merged[topic]
      if (!current || (PRIORITY[setting] ?? 0) > (PRIORITY[current] ?? 0)) {
        merged[topic] = setting
      }
    }
  }

  res.json({ merged, count: submissions.length })
})

// ════════════════════════════════════════════════════════════════════════════
// ANONYMOUS SUBMISSION — no auth required, public via token
// ════════════════════════════════════════════════════════════════════════════

sessionZeroRouter.get('/safety/submit/:token', async (req, res) => {
  const link = await prisma.safetyShareLink.findUnique({
    where: { token: req.params.token },
    include: { campaign: { select: { name: true } } },
  })
  if (!link || !link.active) { res.status(404).json({ error: 'Link not found or no longer active' }); return }

  // Return preset topics so the player form can render them
  res.json({ campaignName: link.campaign.name, presetTopics: PRESET_TOPICS })
})

sessionZeroRouter.post('/safety/submit/:token', async (req, res) => {
  const link = await prisma.safetyShareLink.findUnique({ where: { token: req.params.token } })
  if (!link || !link.active) { res.status(404).json({ error: 'Link not found or no longer active' }); return }

  const schema = z.object({
    topics: z.record(z.string(), z.enum(['line', 'veil', 'ok'])),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'Invalid submission' }); return }

  await prisma.anonymousSafetySubmission.create({
    data: { campaignId: link.campaignId, shareLinkId: link.id, topics: parsed.data.topics },
  })
  res.json({ ok: true })
})

// ════════════════════════════════════════════════════════════════════════════
// MODULE 3 — TABLE CHARTER
// ════════════════════════════════════════════════════════════════════════════

// GET charter (campaign already returned by existing campaign GET — this is a convenience alias)
sessionZeroRouter.patch('/:campaignId/session-zero/charter', requireAuth, async (req, res) => {
  const user = (req as any).user
  const campaign = await ownedCampaign(req.params.campaignId, user.id)
  if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return }

  const schema = z.object({
    tableCharter: z.record(z.string(), z.string()),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'Invalid payload' }); return }

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { tableCharter: parsed.data.tableCharter },
  })
  res.json({ ok: true })
})

// ════════════════════════════════════════════════════════════════════════════
// MODULE 4 — WORLD-BUILDING CANVAS
// ════════════════════════════════════════════════════════════════════════════

const WB_CATEGORIES = ['faction', 'region', 'npc', 'pantheon', 'conflict', 'secret'] as const

// GET all entries for a campaign
sessionZeroRouter.get('/:campaignId/session-zero/world-building', requireAuth, async (req, res) => {
  const user = (req as any).user
  const campaign = await ownedCampaign(req.params.campaignId, user.id)
  if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return }

  const entries = await prisma.worldBuildingEntry.findMany({
    where: { campaignId: campaign.id },
    orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
  })
  res.json({ entries })
})

// POST create entry
sessionZeroRouter.post('/:campaignId/session-zero/world-building', requireAuth, async (req, res) => {
  const user = (req as any).user
  const campaign = await ownedCampaign(req.params.campaignId, user.id)
  if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return }

  const schema = z.object({
    name:     z.string().min(1).max(200),
    category: z.enum(WB_CATEGORIES),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'Invalid payload' }); return }

  const entry = await prisma.worldBuildingEntry.create({
    data: { campaignId: campaign.id, name: parsed.data.name, category: parsed.data.category },
  })
  res.json({ entry })
})

// PATCH update entry fields
sessionZeroRouter.patch('/:campaignId/session-zero/world-building/:entryId', requireAuth, async (req, res) => {
  const user = (req as any).user
  const campaign = await ownedCampaign(req.params.campaignId, user.id)
  if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return }

  const schema = z.object({
    name:    z.string().min(1).max(200).optional(),
    summary: z.string().max(500).optional(),
    detail:  z.string().optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'Invalid payload' }); return }

  const entry = await prisma.worldBuildingEntry.updateMany({
    where: { id: req.params.entryId, campaignId: campaign.id },
    data: parsed.data,
  })
  res.json({ ok: true, count: entry.count })
})

// DELETE entry
sessionZeroRouter.delete('/:campaignId/session-zero/world-building/:entryId', requireAuth, async (req, res) => {
  const user = (req as any).user
  const campaign = await ownedCampaign(req.params.campaignId, user.id)
  if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return }

  await prisma.worldBuildingEntry.deleteMany({
    where: { id: req.params.entryId, campaignId: campaign.id },
  })
  res.json({ ok: true })
})

// POST expand with AI (SSE)
sessionZeroRouter.post('/:campaignId/session-zero/world-building/:entryId/expand', requireAuth, async (req, res) => {
  const user = (req as any).user
  const campaign = await ownedCampaign(req.params.campaignId, user.id)
  if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return }

  const entry = await prisma.worldBuildingEntry.findFirst({
    where: { id: req.params.entryId, campaignId: campaign.id },
  })
  if (!entry) { res.status(404).json({ error: 'Entry not found' }); return }

  const categoryLabels: Record<string, string> = {
    faction: 'faction/organization', region: 'region or location', npc: 'major NPC',
    pantheon: 'deity or powerful entity', conflict: 'central conflict or plot', secret: 'secret or mystery',
  }

  const systemPrompt = `You are an expert TTRPG worldbuilding assistant. Expand the given entry into a rich, evocative description suitable for a GM's campaign bible. Write 2-4 paragraphs covering history, current state, hooks, and secrets. Prose style: vivid but concise. No bullet points.`

  const userPrompt = `Campaign: "${campaign.name}"
Entry type: ${categoryLabels[entry.category] ?? entry.category}
Name: ${entry.name}
One-line summary: ${entry.summary || '(none provided)'}
Existing notes: ${entry.detail || '(none)'}

Write a full expanded description for this entry.`

  const anthropic = new Anthropic()
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  let fullText = ''
  try {
    const stream = anthropic.messages.stream({
      model: 'claude-opus-4-5',
      max_tokens: 800,
      messages: [{ role: 'user', content: userPrompt }],
      system: systemPrompt,
    })
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        const text = chunk.delta.text
        fullText += text
        res.write(`data: ${JSON.stringify({ text })}\n\n`)
      }
    }
    // Save expanded text
    await prisma.worldBuildingEntry.updateMany({
      where: { id: entry.id, campaignId: campaign.id },
      data: { detail: fullText },
    })
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`)
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: 'AI expand failed' })}\n\n`)
  }
  res.end()
})

// POST promote to Library
sessionZeroRouter.post('/:campaignId/session-zero/world-building/:entryId/promote', requireAuth, async (req, res) => {
  const user = (req as any).user
  const campaign = await ownedCampaign(req.params.campaignId, user.id)
  if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return }

  const entry = await prisma.worldBuildingEntry.findFirst({
    where: { id: req.params.entryId, campaignId: campaign.id },
  })
  if (!entry) { res.status(404).json({ error: 'Entry not found' }); return }
  if (entry.entityId) { res.status(400).json({ error: 'Already promoted to Library' }); return }

  const description = [entry.summary, entry.detail].filter(Boolean).join('\n\n')
  let entityId: string
  let entityType: string

  if (entry.category === 'npc') {
    const npc = await prisma.nPC.create({
      data: { campaignId: campaign.id, name: entry.name, description },
    })
    entityId = npc.id
    entityType = 'npc'
  } else if (entry.category === 'region') {
    const loc = await prisma.location.create({
      data: { campaignId: campaign.id, name: entry.name, description, type: 'region' },
    })
    entityId = loc.id
    entityType = 'location'
  } else if (entry.category === 'faction') {
    const faction = await prisma.faction.create({
      data: { campaignId: campaign.id, name: entry.name, description },
    })
    entityId = faction.id
    entityType = 'faction'
  } else {
    res.status(400).json({ error: 'This category cannot be promoted to Library' }); return
  }

  await prisma.worldBuildingEntry.update({
    where: { id: entry.id },
    data: { entityId, entityType },
  })

  res.json({ ok: true, entry: { ...entry, entityId, entityType } })
})
