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
