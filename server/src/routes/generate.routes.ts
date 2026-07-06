import { Router } from 'express'
import { requireAuth } from '../middleware/auth.middleware.js'
import { prisma } from '../lib/prisma.js'
import { decrypt } from '../lib/crypto.js'
import { z } from 'zod'
import Anthropic from '@anthropic-ai/sdk'
import { getBoss } from '../lib/worker.js'
import { getImageCostEstimate, getMinimumConfirmThreshold, getPricingMeta } from '../lib/pricing.js'

export const generateRouter = Router()
generateRouter.use(requireAuth)

async function getAnthropicClient(userId: string): Promise<Anthropic | null> {
  const anthropicCred = await prisma.apiCredential.findUnique({
    where: { userId_provider: { userId, provider: 'anthropic' } },
  })
  if (anthropicCred?.encryptedKey) {
    try {
      const key = decrypt(anthropicCred.encryptedKey)
      return new Anthropic({ apiKey: key })
    } catch {
      // fall through to Evolink
    }
  }

  const evolinkCred = await prisma.apiCredential.findUnique({
    where: { userId_provider: { userId, provider: 'evolink' } },
  })
  if (evolinkCred?.encryptedKey) {
    try {
      const key = decrypt(evolinkCred.encryptedKey)
      return new Anthropic({ apiKey: key, baseURL: 'https://api.evolink.ai/v1' })
    } catch {
      return null
    }
  }

  return null
}

async function buildCampaignContext(campaignId: string, query: string): Promise<string> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { systemTemplate: true, parties: { take: 1 } },
  })
  if (!campaign) return ''

  const q = query.toLowerCase()

  const [npcs, locations, factions, threads] = await Promise.all([
    prisma.nPC.findMany({ where: { campaignId, deletedAt: null }, select: { id: true, name: true, role: true, status: true, description: true } }),
    prisma.location.findMany({ where: { campaignId, deletedAt: null }, select: { id: true, name: true, type: true, description: true } }),
    prisma.faction.findMany({ where: { campaignId, deletedAt: null }, select: { id: true, name: true, goals: true } }),
    prisma.plotThread.findMany({ where: { campaignId, deletedAt: null, status: 'active' }, select: { id: true, title: true, description: true } }),
  ])

  function score(text: string) {
    return q.split(' ').filter(w => w.length > 3 && text.toLowerCase().includes(w)).length
  }

  const topNpcs = npcs
    .map(n => ({ ...n, _score: score(n.name + ' ' + (n.role ?? '') + ' ' + (n.description ?? '')) }))
    .sort((a, b) => b._score - a._score)
    .slice(0, 15)

  const topLocations = locations
    .map(l => ({ ...l, _score: score(l.name + ' ' + (l.description ?? '')) }))
    .sort((a, b) => b._score - a._score)
    .slice(0, 8)

  const party = campaign.parties[0]
  const partySnap = party
    ? `Party "${party.name}": ${JSON.stringify(party.characters)}`
    : 'No party defined.'

  const templateAddendum = campaign.systemTemplate?.promptAddendum ?? ''

  return `
CAMPAIGN: ${campaign.name}
GAME SYSTEM: ${campaign.systemTemplate?.name ?? 'Generic'}
SETTING NOTES: ${campaign.settingNotes || 'Not specified.'}

ACTIVE PARTY:
${partySnap}

ACTIVE PLOT THREADS:
${threads.map(t => `- [${t.id}] ${t.title}: ${t.description}`).join('\n') || 'None.'}

KEY NPCS (most relevant):
${topNpcs.map(n => `- [${n.id}] ${n.name} (${n.role ?? 'unknown role'}, ${n.status}): ${n.description ?? ''}`).join('\n') || 'None yet.'}

KNOWN LOCATIONS:
${topLocations.map(l => `- [${l.id}] ${l.name} (${l.type}): ${l.description ?? ''}`).join('\n') || 'None yet.'}

FACTIONS:
${factions.map(f => `- [${f.id}] ${f.name}: ${f.goals}`).join('\n') || 'None.'}

${templateAddendum ? `SYSTEM RULES & TONE:\n${templateAddendum}` : ''}
`.trim()
}

// ── NPC Generator ─────────────────────────────────────────────────────────────

const NPC_SCHEMA = `{
  "name": "string",
  "role": "string",
  "description": "string — 1-2 sentences of appearance/vibe",
  "appearance": "string",
  "personality": "string",
  "motivations": "string",
  "secrets": "string",
  "voiceNotes": "string — how they speak, speech patterns, accent",
  "dispositionToParty": "hostile|wary|neutral|friendly|complicated",
  "status": "alive|dead|missing|unknown",
  "statBlock": { "notes": "string — stat block summary appropriate for game system" },
  "tags": ["string"]
}`

// ── Encounter Generator ───────────────────────────────────────────────────────

const ENCOUNTER_SCHEMA = `{
  "name": "string",
  "type": "combat|social|exploration|puzzle",
  "difficulty": "string",
  "description": "string — brief overview",
  "setup": "string — read-aloud opening, 2-3 sentences",
  "tactics": "string — how the opposition behaves",
  "twist": "string — optional surprising element",
  "scalingNotes": "string — how to adjust for more/fewer players or difficulty",
  "participants": [{ "name": "string", "role": "enemy|ally|neutral", "notes": "string" }],
  "tags": ["string"]
}`

// ── Treasure Generator ────────────────────────────────────────────────────────

const TREASURE_SCHEMA = `[{
  "name": "string",
  "description": "string",
  "category": "weapon|armor|potion|scroll|trinket|currency|other",
  "rarity": "common|uncommon|rare|very rare|legendary|artifact",
  "mechanicalEffect": "string — game mechanical benefit, if any",
  "tags": ["string"]
}]`

// ── Dialogue Generator ────────────────────────────────────────────────────────

const DIALOGUE_SCHEMA = `[
  { "tone": "string", "text": "string — what the NPC says (2-4 sentences)" },
  { "tone": "string", "text": "string" },
  { "tone": "string", "text": "string" }
]`

// ── Session Wrap ──────────────────────────────────────────────────────────────

const SESSION_WRAP_SCHEMA = `{
  "generated_summary": "string — 2-4 paragraph narrative recap, read-aloud friendly",
  "key_events": ["string"],
  "state_updates": [
    { "entity_type": "npc|item|location|faction|encounter|plot_thread", "entity_id": "string", "field": "string", "new_value": "any", "evidence": "string — quote from notes" }
  ],
  "new_entities_detected": [
    { "entity_type": "npc|item|location", "fields": {}, "evidence": "string" }
  ],
  "hooks_for_next": ["string"]
}`

const KIND_SCHEMAS: Record<string, string> = {
  npc: NPC_SCHEMA,
  encounter: ENCOUNTER_SCHEMA,
  treasure: TREASURE_SCHEMA,
  dialogue: DIALOGUE_SCHEMA,
  session_wrap: SESSION_WRAP_SCHEMA,
}

// ── Text generation ───────────────────────────────────────────────────────────

generateRouter.post('/text', async (req, res) => {
  const userId = res.locals.user.id
  const schema = z.object({
    kind: z.enum(['npc', 'encounter', 'treasure', 'dialogue', 'session_wrap', 'quick', 'prep_suggestions']),
    campaignId: z.string().optional(),
    prompt: z.string(),
    sessionId: z.string().optional(),
    npcId: z.string().optional(),
    stream: z.boolean().optional().default(false),
    model: z.string().optional(),
  })

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message })
    return
  }

  const client = await getAnthropicClient(userId)
  if (!client) {
    res.status(402).json({ error: 'No API key configured. Add an Anthropic or Evolink key in Settings.' })
    return
  }

  const { kind, campaignId, prompt, sessionId, npcId, stream, model } = parsed.data
  const userPref = await prisma.userPreference.findUnique({ where: { userId } })
  const textModel = model ?? userPref?.defaultTextModel ?? 'claude-opus-4-5'

  let context = ''
  if (campaignId) {
    context = await buildCampaignContext(campaignId, prompt)
  }

  let sessionContext = ''
  if (sessionId) {
    const session = await prisma.gameSession.findUnique({
      where: { id: sessionId },
      select: { dmRawNotes: true, sessionNumber: true, title: true },
    })
    if (session) {
      sessionContext = `\nCURRENT SESSION #${session.sessionNumber}${session.title ? ` — ${session.title}` : ''} NOTES:\n${session.dmRawNotes}`
    }
  }

  let npcContext = ''
  if (npcId && kind === 'dialogue') {
    const npc = await prisma.nPC.findUnique({ where: { id: npcId } })
    if (npc) {
      npcContext = `\nNPC SPEAKING: ${npc.name} (${npc.role})\nPersonality: ${npc.personality}\nMotivations: ${npc.motivations}\nSecrets (DM only): ${npc.secrets}\nVoice: ${npc.voiceNotes}`
    }
  }

  const outputSchema = KIND_SCHEMAS[kind]
  const contentRating = userPref?.contentRating ?? 'standard'

  const systemPrompt = `You are an AI assistant for a tabletop RPG Game Master. You help generate campaign content that integrates seamlessly with existing campaign state.

CONTENT RATING: ${contentRating} — ${contentRating === 'family' ? 'keep content appropriate for all ages' : contentRating === 'grim' ? 'mature themes allowed, gritty and dark tone permitted' : 'standard adventure fare, moderate peril OK'}

Always return valid JSON matching the exact schema provided. Reference existing entities by their [id] when they appear in your output. Never invent entities that contradict established campaign facts.

${outputSchema ? `OUTPUT SCHEMA:\n${outputSchema}` : 'Return a JSON object with your response.'}`

  const userMessage = `${context}${sessionContext}${npcContext}

REQUEST: ${prompt}`

  const job = await prisma.generationJob.create({
    data: {
      userId,
      campaignId: campaignId ?? null,
      provider: 'anthropic',
      kind,
      status: 'running',
      input: { kind, prompt, sessionId: sessionId ?? null },
    },
  })

  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    try {
      const streamResp = await client.messages.stream({
        model: textModel,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      })

      let fullText = ''
      for await (const chunk of streamResp) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          fullText += chunk.delta.text
          res.write(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`)
        }
      }

      const finalMsg = await streamResp.finalMessage()
      await prisma.generationJob.update({
        where: { id: job.id },
        data: {
          status: 'succeeded',
          tokensOrUnits: { input: finalMsg.usage.input_tokens, output: finalMsg.usage.output_tokens },
          outputRef: { text: fullText },
        },
      })
      res.write(`data: ${JSON.stringify({ done: true, jobId: job.id })}\n\n`)
      res.end()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Generation failed'
      await prisma.generationJob.update({ where: { id: job.id }, data: { status: 'failed', error: msg } })
      res.write(`data: ${JSON.stringify({ error: msg })}\n\n`)
      res.end()
    }
  } else {
    try {
      const message = await client.messages.create({
        model: textModel,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      })
      const raw = message.content[0].type === 'text' ? message.content[0].text : ''

      let result: unknown = null
      try {
        const jsonMatch = raw.match(/```json\n?([\s\S]*?)\n?```/) ?? raw.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)
        result = JSON.parse(jsonMatch ? (jsonMatch[1] ?? jsonMatch[0]) : raw)
      } catch {
        result = { text: raw }
      }

      await prisma.generationJob.update({
        where: { id: job.id },
        data: {
          status: 'succeeded',
          tokensOrUnits: { input: message.usage.input_tokens, output: message.usage.output_tokens },
          outputRef: JSON.parse(JSON.stringify({ result })),
        },
      })

      res.json({ result, jobId: job.id })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Generation failed'
      await prisma.generationJob.update({ where: { id: job.id }, data: { status: 'failed', error: msg } })
      res.status(500).json({ error: msg })
    }
  }
})

// ── World / Region map context (Claude summary from campaign locations) ────────

generateRouter.post('/world-map-context', async (req, res) => {
  const userId = res.locals.user.id
  const schema = z.object({
    campaignId: z.string().min(1),
    scope: z.enum(['world', 'region']),
    description: z.string().optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return }

  const { campaignId, scope, description } = parsed.data

  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, ownerUserId: userId, deletedAt: null },
  })
  if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return }

  const client = await getAnthropicClient(userId)
  if (!client) { res.status(402).json({ error: 'No API key configured for text generation.' }); return }

  const locations = await prisma.location.findMany({
    where: { campaignId, deletedAt: null },
    select: { name: true, type: true, description: true },
    take: 30,
  })

  const userPref = await prisma.userPreference.findUnique({ where: { userId } })
  const textModel = userPref?.defaultTextModel ?? 'claude-opus-4-5'

  const locSummary = locations.length > 0
    ? locations.map(l => `- ${l.name} (${l.type}): ${l.description || 'No description'}`).join('\n')
    : 'No locations defined yet.'

  const scopeLabel = scope === 'world' ? 'world' : 'region'
  const prompt = `Campaign: ${campaign.name}
Setting notes: ${campaign.settingNotes || 'Not specified.'}

Known locations:
${locSummary}

${description ? `GM's additional notes: ${description}\n` : ''}
Write a concise geographic description (2-3 sentences) suitable for generating a ${scopeLabel} map image. Describe terrain, major geographic features, biomes, settlements, and atmosphere. Focus on visual elements that would appear in a painted ${scopeLabel} map — mountains, forests, oceans, rivers, roads, settlements. Be evocative and specific. Do not mention game mechanics or rules.`

  try {
    const message = await client.messages.create({
      model: textModel,
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    })
    const summary = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
    res.json({ summary })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to generate context' })
  }
})

// ── Session Wrap trigger ──────────────────────────────────────────────────────

generateRouter.post('/session-wrap/:sessionId', async (req, res) => {
  const userId = res.locals.user.id
  const { sessionId } = req.params

  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: { campaign: { include: { systemTemplate: true, parties: { take: 1 } } }, entityTouches: true },
  })
  if (!session) { res.status(404).json({ error: 'Session not found' }); return }

  const campaign = await prisma.campaign.findFirst({
    where: { id: session.campaignId, ownerUserId: userId },
  })
  if (!campaign) { res.status(403).json({ error: 'Forbidden' }); return }

  const client = await getAnthropicClient(userId)
  if (!client) { res.status(402).json({ error: 'No Anthropic API key' }); return }

  const prevSession = await prisma.gameSession.findFirst({
    where: { campaignId: session.campaignId, sessionNumber: { lt: session.sessionNumber }, status: 'complete' },
    orderBy: { sessionNumber: 'desc' },
    select: { hooksForNext: true },
  })

  const context = await buildCampaignContext(session.campaignId, session.dmRawNotes)
  const userPref = await prisma.userPreference.findUnique({ where: { userId } })
  const textModel = userPref?.defaultTextModel ?? 'claude-opus-4-5'

  const prompt = `${context}

SESSION #${session.sessionNumber}${session.title ? ` — ${session.title}` : ''}
DM NOTES:
${session.dmRawNotes || '(No notes)'}

PREVIOUS SESSION HOOKS:
${prevSession ? JSON.stringify(prevSession.hooksForNext) : '[]'}

Analyze these session notes and return a structured JSON object matching the session wrap schema. For state_updates, only include changes that are clearly evidenced in the notes. For new_entities_detected, only flag entities mentioned in notes that don't exist in the campaign library (they won't have IDs).

SCHEMA:
${SESSION_WRAP_SCHEMA}`

  const job = await prisma.generationJob.create({
    data: { userId, campaignId: session.campaignId, provider: 'anthropic', kind: 'session_wrap', status: 'running', input: { sessionId } },
  })

  try {
    const message = await client.messages.create({
      model: textModel,
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = message.content[0].type === 'text' ? message.content[0].text : ''
    let result: unknown = null
    try {
      const match = raw.match(/```json\n?([\s\S]*?)\n?```/) ?? raw.match(/(\{[\s\S]*\})/)
      result = JSON.parse(match ? (match[1] ?? match[0]) : raw)
    } catch {
      result = { generated_summary: raw, key_events: [], state_updates: [], new_entities_detected: [], hooks_for_next: [] }
    }

    await prisma.generationJob.update({
      where: { id: job.id },
      data: { status: 'succeeded', tokensOrUnits: { input: message.usage.input_tokens, output: message.usage.output_tokens }, outputRef: JSON.parse(JSON.stringify({ result })) },
    })

    res.json({ result, jobId: job.id })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Wrap failed'
    await prisma.generationJob.update({ where: { id: job.id }, data: { status: 'failed', error: msg } })
    res.status(500).json({ error: msg })
  }
})

// ── Prep suggestions ─────────────────────────────────────────────────────────

generateRouter.post('/prep-suggestions/:campaignId', async (req, res) => {
  const userId = res.locals.user.id
  const { campaignId } = req.params

  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, ownerUserId: userId } })
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }

  const client = await getAnthropicClient(userId)
  if (!client) { res.status(402).json({ error: 'No Anthropic API key' }); return }

  const lastSession = await prisma.gameSession.findFirst({
    where: { campaignId, status: 'complete' },
    orderBy: { sessionNumber: 'desc' },
  })
  const threads = await prisma.plotThread.findMany({
    where: { campaignId, status: 'active', deletedAt: null },
    take: 5,
  })

  const context = await buildCampaignContext(campaignId, '')
  const userPref = await prisma.userPreference.findUnique({ where: { userId } })
  const textModel = userPref?.defaultTextModel ?? 'claude-opus-4-5'

  const prompt = `${context}

LAST SESSION HOOKS: ${JSON.stringify(lastSession?.hooksForNext ?? [])}
ACTIVE THREADS: ${JSON.stringify(threads.map(t => ({ id: t.id, title: t.title, description: t.description })))}

Generate 3-4 concrete next-session prep suggestions. Return JSON array:
[{
  "title": "string",
  "description": "string — 2-3 sentences",
  "type": "encounter|npc|location|plot",
  "relatedThreadId": "string|null",
  "suggestedPrompt": "string — a Quick Generate prompt the DM can use to create this"
}]`

  try {
    const message = await client.messages.create({
      model: textModel,
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = message.content[0].type === 'text' ? message.content[0].text : '[]'
    let suggestions: unknown[] = []
    try {
      const match = raw.match(/```json\n?([\s\S]*?)\n?```/) ?? raw.match(/(\[[\s\S]*\])/)
      suggestions = JSON.parse(match ? (match[1] ?? match[0]) : raw)
    } catch {
      suggestions = []
    }
    res.json({ suggestions })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed' })
  }
})

// ── Image generation (pg-boss worker) ────────────────────────────────────────

generateRouter.post('/image', async (req, res) => {
  const userId = res.locals.user.id
  const schema = z.object({
    kind: z.string().min(1),
    entityId: z.string().min(1),
    campaignId: z.string().min(1),
    prompt: z.string().optional(),
    stylePreset: z.string().optional(),
    model: z.string().optional(),
    aspectRatio: z.enum(['portrait', 'square', 'landscape', 'widescreen']).optional(),
    confirmed: z.boolean().optional(),
  })

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' })
    return
  }

  const { kind, entityId, campaignId, prompt, stylePreset, model, aspectRatio, confirmed } = parsed.data

  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, ownerUserId: userId } })
  if (!campaign) {
    res.status(403).json({ error: 'Campaign not found or forbidden' })
    return
  }

  const entityType = kind === 'portrait_npc' ? 'npc'
    : kind === 'location_art' ? 'location'
    : kind === 'item_art' ? 'item'
    : kind.startsWith('map_') ? 'map'
    : kind.split('_')[0] ?? 'unknown'

  if (entityType === 'npc') {
    const ent = await prisma.nPC.findFirst({ where: { id: entityId, campaignId, deletedAt: null } })
    if (!ent) { res.status(404).json({ error: 'NPC not found in this campaign' }); return }
  } else if (entityType === 'location') {
    const ent = await prisma.location.findFirst({ where: { id: entityId, campaignId, deletedAt: null } })
    if (!ent) { res.status(404).json({ error: 'Location not found in this campaign' }); return }
  } else if (entityType === 'item') {
    const ent = await prisma.item.findFirst({ where: { id: entityId, campaignId, deletedAt: null } })
    if (!ent) { res.status(404).json({ error: 'Item not found in this campaign' }); return }
  } else if (entityType === 'map') {
    const ent = await prisma.mapAsset.findFirst({ where: { id: entityId, campaignId, deletedAt: null } })
    if (!ent) { res.status(404).json({ error: 'Map not found in this campaign' }); return }
  }

  // ── Cost estimate + soft-cap confirm ──────────────────────────────────────
  const userPref = await prisma.userPreference.findUnique({ where: { userId } })
  const imageModelByCategory = (userPref?.imageModelByCategory ?? {}) as Record<string, string>
  const categoryKey = entityType === 'npc' ? 'portrait' : entityType
  const resolvedModel = model ?? imageModelByCategory[categoryKey] ?? userPref?.defaultImageModel ?? 'seedream-5'
  const costEstimate = getImageCostEstimate(resolvedModel)
  const minimumThreshold = getMinimumConfirmThreshold()
  const pricingMeta = getPricingMeta()
  const softCap = userPref?.softCapPerCall ?? pricingMeta.defaultCostPerImage

  if (!confirmed && costEstimate > minimumThreshold && costEstimate > softCap) {
    res.status(402).json({ requiresConfirm: true, estimate: costEstimate, softCap })
    return
  }

  const job = await prisma.generationJob.create({
    data: {
      userId,
      campaignId,
      provider: 'evolink',
      kind,
      status: 'queued',
      costEstimate,
      input: { kind, entityId, entityType, prompt: prompt ?? null, stylePreset: stylePreset ?? null, model: model ?? null, aspectRatio: aspectRatio ?? null },
    },
  })

  await getBoss().send('image.generate', { jobId: job.id })

  res.json({ jobId: job.id })
})

// ── Pricing metadata ──────────────────────────────────────────────────────────

generateRouter.get('/pricing', (_req, res) => {
  res.json(getPricingMeta())
})

// ── Art Director prompt preview (pre-submit) ──────────────────────────────────

generateRouter.post('/preview-prompt', async (req, res) => {
  const userId = res.locals.user.id
  const schema = z.object({
    kind: z.string().min(1),
    entityId: z.string().min(1),
    campaignId: z.string().min(1),
    stylePreset: z.string().optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' })
    return
  }
  const { kind, entityId, campaignId, stylePreset } = parsed.data

  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, ownerUserId: userId } })
  if (!campaign) { res.status(403).json({ error: 'Campaign not found or forbidden' }); return }

  const client = await getAnthropicClient(userId)
  if (!client) { res.status(402).json({ error: 'No Anthropic API key configured' }); return }

  const entityType = kind === 'portrait_npc' ? 'npc'
    : kind === 'location_art' ? 'location'
    : kind === 'item_art' ? 'item'
    : null

  let entityData: Record<string, string> = {}
  if (entityType === 'npc') {
    const npc = await prisma.nPC.findFirst({ where: { id: entityId, campaignId, deletedAt: null } })
    if (npc) entityData = { name: npc.name, role: npc.role, appearance: npc.appearance, description: npc.description }
  } else if (entityType === 'location') {
    const loc = await prisma.location.findFirst({ where: { id: entityId, campaignId, deletedAt: null } })
    if (loc) entityData = { name: loc.name, type: loc.type, description: loc.description }
  } else if (entityType === 'item') {
    const item = await prisma.item.findFirst({ where: { id: entityId, campaignId, deletedAt: null } })
    if (item) entityData = { name: item.name, category: item.category, rarity: item.rarity, description: item.description }
  }

  const userPref = await prisma.userPreference.findUnique({ where: { userId } })
  const presetName = stylePreset ?? userPref?.imageStylePreset ?? 'Classic fantasy oil'
  const preset = await prisma.artStylePreset.findFirst({
    where: { name: presetName, OR: [{ isBuiltin: true }, { ownerUserId: userId }] },
  })
  const styleFragment = preset?.promptFragment ?? 'fantasy art, detailed, high quality'

  try {
    const artMsg = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `You are an art director for a tabletop RPG. Given this entity, write a vivid image generation prompt.

Entity JSON: ${JSON.stringify(entityData)}
Art style: ${styleFragment}
Image kind: ${kind}

Return ONLY valid JSON — no prose, no markdown:
{"prompt":"<concise, comma-separated visual description, 30–60 words>","negative_prompt":"<things to avoid>"}`,
      }],
    })
    const raw = artMsg.content[0].type === 'text' ? artMsg.content[0].text : ''
    const match = raw.match(/\{[\s\S]*\}/)
    if (match) {
      const r = JSON.parse(match[0]) as { prompt?: string }
      res.json({ prompt: r.prompt ?? `${entityData.name ?? 'entity'}, ${styleFragment}` })
    } else {
      res.json({ prompt: `${entityData.name ?? 'entity'}, ${styleFragment}` })
    }
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Preview failed' })
  }
})

// ── Usage ────────────────────────────────────────────────────────────────────

generateRouter.get('/usage', async (req, res) => {
  const userId = res.locals.user.id
  const range = (req.query.range as string) ?? '30d'
  const campaignId = req.query.campaignId as string | undefined

  const since = range === '7d'
    ? new Date(Date.now() - 7 * 86400_000)
    : range === '30d'
    ? new Date(Date.now() - 30 * 86400_000)
    : undefined

  const where = {
    userId,
    ...(campaignId ? { campaignId } : {}),
    ...(since ? { createdAt: { gte: since } } : {}),
  }

  const jobs = await prisma.generationJob.findMany({
    where,
    select: {
      id: true, provider: true, kind: true, status: true,
      tokensOrUnits: true, costEstimate: true, costActual: true,
      createdAt: true, campaignId: true, error: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })

  function jobUnits(j: { tokensOrUnits: unknown }): number {
    const t = j.tokensOrUnits as Record<string, number> | null
    if (!t) return 0
    return t.output ?? t.units ?? 0
  }

  // Daily buckets — one row per date+provider combination
  const bucketMap = new Map<string, { count: number; estimatedCost: number; actualCost: number; totalUnits: number }>()
  for (const j of jobs) {
    const date = j.createdAt.toISOString().slice(0, 10)
    const prov = (j.provider as string | null) ?? 'unknown'
    const key = `${date}::${prov}`
    const existing = bucketMap.get(key) ?? { count: 0, estimatedCost: 0, actualCost: 0, totalUnits: 0 }
    existing.count += 1
    existing.estimatedCost += j.costEstimate ?? 0
    existing.actualCost += j.costActual ?? 0
    existing.totalUnits += jobUnits(j)
    bucketMap.set(key, existing)
  }
  const dailyBuckets = Array.from(bucketMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, data]) => {
      const [date, provider] = key.split('::')
      return { date, provider, ...data }
    })

  // Per-provider totals
  const providerMap = new Map<string, { count: number; estimatedCost: number; actualCost: number; totalUnits: number }>()
  for (const j of jobs) {
    const prov = (j.provider as string | null) ?? 'unknown'
    const existing = providerMap.get(prov) ?? { count: 0, estimatedCost: 0, actualCost: 0, totalUnits: 0 }
    existing.count += 1
    existing.estimatedCost += j.costEstimate ?? 0
    existing.actualCost += j.costActual ?? 0
    existing.totalUnits += jobUnits(j)
    providerMap.set(prov, existing)
  }
  const providerTotals = Array.from(providerMap.entries()).map(([provider, data]) => ({ provider, ...data }))

  // Per-campaign totals
  const campaignMap = new Map<string, { count: number; estimatedCost: number }>()
  for (const j of jobs) {
    if (!j.campaignId) continue
    const existing = campaignMap.get(j.campaignId) ?? { count: 0, estimatedCost: 0 }
    existing.count += 1
    existing.estimatedCost += j.costEstimate ?? 0
    campaignMap.set(j.campaignId, existing)
  }
  const campaignIds = Array.from(campaignMap.keys())
  const campaigns = campaignIds.length > 0
    ? await prisma.campaign.findMany({
        where: { id: { in: campaignIds } },
        select: { id: true, name: true },
      })
    : []
  const campaignNameMap = new Map(campaigns.map(c => [c.id, c.name]))
  const campaignTotals = Array.from(campaignMap.entries()).map(([id, data]) => ({
    campaignId: id,
    campaignName: campaignNameMap.get(id) ?? 'Unknown',
    ...data,
  }))

  const totalEstimatedCost = jobs.reduce((s, j) => s + (j.costEstimate ?? 0), 0)
  const totalActualCost = jobs.reduce((s, j) => s + (j.costActual ?? 0), 0)

  res.json({ jobs, dailyBuckets, providerTotals, campaignTotals, totalEstimatedCost, totalActualCost })
})
