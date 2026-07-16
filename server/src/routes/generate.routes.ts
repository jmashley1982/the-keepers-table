import { Router, type Request, type Response } from 'express'
import { requireAuth } from '../middleware/auth.middleware.js'
import { prisma } from '../lib/prisma.js'
import { z } from 'zod'
import { getBoss } from '../lib/worker.js'
import { getImageCostEstimate, getMinimumConfirmThreshold, getPricingMeta, getArtDirectorCostPerCall } from '../lib/pricing.js'
import { getAnthropicClient } from '../lib/anthropic.js'

export const generateRouter = Router()
generateRouter.use(requireAuth)

// ── Friend-account helpers ────────────────────────────────────────────────────

const FRIEND_TEXT_QUOTA = 24
const FRIEND_IMAGE_QUOTA = 12

async function isFriendAccount(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
  return Boolean(user?.email.startsWith('friend_') && user.email.endsWith('@keeper.internal'))
}


async function userHasOwnCredentials(userId: string): Promise<boolean> {
  const count = await prisma.apiCredential.count({ where: { userId, encryptedKey: { not: null } } })
  return count > 0
}

async function recordAnthropicUsageForFriend(userId: string, kind: string, campaignId?: string | null): Promise<void> {
  if (!(await isFriendAccount(userId))) return
  if (await userHasOwnCredentials(userId)) return
  await prisma.generationJob.create({
    data: { userId, campaignId: campaignId ?? null, provider: 'anthropic', kind, status: 'succeeded', input: {} },
  })
}

async function checkFriendTextQuota(userId: string): Promise<{ allowed: boolean; error?: string }> {
  if (!(await isFriendAccount(userId))) return { allowed: true }
  if (await userHasOwnCredentials(userId)) return { allowed: true }
  const used = await prisma.generationJob.count({
    where: { userId, provider: 'anthropic', status: { not: 'failed' } },
  })
  if (used >= FRIEND_TEXT_QUOTA) {
    return { allowed: false, error: `You've reached the limit of ${FRIEND_TEXT_QUOTA} text generations. Thanks for trying the app!` }
  }
  return { allowed: true }
}

async function checkFriendImageQuota(userId: string): Promise<{ allowed: boolean; error?: string }> {
  if (!(await isFriendAccount(userId))) return { allowed: true }
  if (await userHasOwnCredentials(userId)) return { allowed: true }
  const used = await prisma.generationJob.count({
    where: { userId, provider: 'evolink', status: { not: 'failed' } },
  })
  if (used >= FRIEND_IMAGE_QUOTA) {
    return { allowed: false, error: `You've reached the limit of ${FRIEND_IMAGE_QUOTA} image generations. Thanks for trying the app!` }
  }
  return { allowed: true }
}

const CONTEXT_CHAR_LIMIT = 12000

interface BuildContextOptions {
  maxEntities?: number   // default 25 per type
  includeSessionNotes?: boolean  // default true
  query?: string
}

async function buildCampaignContext(campaignId: string, query: string, opts: BuildContextOptions = {}): Promise<string> {
  const { maxEntities = 25, includeSessionNotes = true } = opts
  const q = (query ?? '').toLowerCase()

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { systemTemplate: true, parties: { take: 1 } },
  })
  if (!campaign) return ''

  const [npcs, locations, factions, threads, recentSessions, playerCharacters] = await Promise.all([
    prisma.nPC.findMany({ where: { campaignId, deletedAt: null }, select: { id: true, name: true, role: true, status: true, description: true, updatedAt: true } }),
    prisma.location.findMany({ where: { campaignId, deletedAt: null }, select: { id: true, name: true, type: true, description: true } }),
    prisma.faction.findMany({ where: { campaignId, deletedAt: null }, select: { id: true, name: true, goals: true, description: true, dispositionToParty: true } }),
    prisma.plotThread.findMany({ where: { campaignId, deletedAt: null }, select: { id: true, title: true, description: true, status: true }, orderBy: { updatedAt: 'desc' } }),
    includeSessionNotes
      ? prisma.gameSession.findMany({
          where: { campaignId, status: { in: ['complete', 'active'] } },
          select: { id: true, sessionNumber: true, title: true, dmRawNotes: true, status: true, datePlayed: true },
          orderBy: { sessionNumber: 'desc' },
          take: 4,
        })
      : Promise.resolve([]),
    prisma.playerCharacter.findMany({ where: { campaignId, deletedAt: null }, select: { name: true, class: true, level: true } }),
  ])

  // Score by query relevance — exact name mentions score highest
  function score(text: string, name?: string) {
    let s = q.split(' ').filter(w => w.length > 3 && text.toLowerCase().includes(w)).length
    if (name && q.includes(name.toLowerCase())) s += 10
    return s
  }

  const sortedNpcs = npcs
    .map(n => ({ ...n, _score: score(n.name + ' ' + (n.role ?? '') + ' ' + (n.description ?? ''), n.name) }))
    .sort((a, b) => b._score - a._score)

  // Entities directly mentioned get full description; others get one-liner
  const topNpcs = sortedNpcs.slice(0, maxEntities)
  const topLocations = locations
    .map(l => ({ ...l, _score: score(l.name + ' ' + (l.description ?? ''), l.name) }))
    .sort((a, b) => b._score - a._score)
    .slice(0, maxEntities)

  // Party
  const party = campaign.parties[0]
  type Character = { name?: string; class?: string; level?: number; player?: string }
  const pcs: Character[] = playerCharacters.length > 0
    ? playerCharacters.map(pc => ({ name: pc.name, class: pc.class, level: pc.level }))
    : party ? (party.characters as Character[]) : []
  const partySnap = pcs.length > 0
    ? pcs.map(c => `${c.name ?? '?'} (${c.class ?? '?'}, Lv ${c.level ?? '?'}${c.player ? `, player: ${c.player}` : ''})`).join('; ')
    : 'No party defined.'

  // Session Zero pitch / tone
  const pitchLines: string[] = []
  if (campaign.pitchElevator) pitchLines.push(`Pitch: ${campaign.pitchElevator}`)
  if (campaign.pitchGenre) pitchLines.push(`Genre: ${campaign.pitchGenre}`)
  const toneEntries: string[] = []
  if (campaign.tonGrimHeroic !== 50) toneEntries.push(campaign.tonGrimHeroic > 50 ? `Heroic (${campaign.tonGrimHeroic})` : `Grim (${100 - campaign.tonGrimHeroic})`)
  if (campaign.tonGrittyCinematic !== 50) toneEntries.push(campaign.tonGrittyCinematic > 50 ? `Cinematic (${campaign.tonGrittyCinematic})` : `Gritty (${100 - campaign.tonGrittyCinematic})`)
  if (campaign.tonCombatRoleplay !== 50) toneEntries.push(campaign.tonCombatRoleplay > 50 ? `Roleplay-heavy (${campaign.tonCombatRoleplay})` : `Combat-heavy (${100 - campaign.tonCombatRoleplay})`)
  if (toneEntries.length) pitchLines.push(`Tone: ${toneEntries.join(', ')}`)
  if (campaign.pitchWhatIsNot) pitchLines.push(`NOT: ${campaign.pitchWhatIsNot}`)

  const templateAddendum = campaign.systemTemplate?.promptAddendum ?? ''

  // Build core context (no session notes yet)
  const coreLines = [
    `--- CAMPAIGN CONTEXT ---`,
    `Campaign: ${campaign.name} | System: ${campaign.systemTemplate?.name ?? 'Generic'}`,
    campaign.settingNotes ? `Setting: ${campaign.settingNotes}` : '',
    pitchLines.length ? pitchLines.join('\n') : '',
    ``,
    `PARTY: ${partySnap}`,
    ``,
    `PLOT THREADS:`,
    threads.length
      ? threads.map(t => `- [${t.status?.toUpperCase()}] ${t.title}: ${t.description ?? ''}`).join('\n')
      : 'None.',
    ``,
    `KEY NPCs:`,
    topNpcs.length
      ? topNpcs.map(n => {
          const base = `- ${n.name} (${n.role ?? 'role unknown'}, ${n.status})`
          const desc = n.description ? `: ${n.description.slice(0, 200)}` : ''
          return base + desc
        }).join('\n')
      : 'None yet.',
    ``,
    `LOCATIONS:`,
    topLocations.length
      ? topLocations.map(l => `- ${l.name} (${l.type})${l.description ? ': ' + l.description.slice(0, 150) : ''}`).join('\n')
      : 'None yet.',
    ``,
    `FACTIONS:`,
    factions.length
      ? factions.map(f => `- ${f.name} [${f.dispositionToParty}]: ${f.goals || f.description || ''}`.slice(0, 200)).join('\n')
      : 'None.',
    templateAddendum ? `\nSYSTEM RULES:\n${templateAddendum}` : '',
    `--- END CONTEXT ---`,
  ].filter(l => l !== undefined).join('\n')

  // Add session notes, trimming if over budget
  if (!includeSessionNotes || recentSessions.length === 0) {
    return coreLines.length > CONTEXT_CHAR_LIMIT ? coreLines.slice(0, CONTEXT_CHAR_LIMIT) : coreLines
  }

  const currentSession = recentSessions.find(s => s.status === 'active')
  const wrappedSessions = recentSessions.filter(s => s.status === 'complete').slice(0, 2)
  const allForNotes = [...(currentSession ? [currentSession] : []), ...wrappedSessions]

  let result = coreLines
  for (const sess of allForNotes) {
    if (!sess.dmRawNotes?.trim()) continue
    const label = sess.status === 'active' ? 'CURRENT SESSION' : `SESSION #${sess.sessionNumber}`
    const noteBlock = `\n\n${label}${sess.title ? ` — ${sess.title}` : ''}:\n${sess.dmRawNotes}`
    if ((result + noteBlock).length <= CONTEXT_CHAR_LIMIT) {
      result += noteBlock
    } else {
      // Truncate note to fit budget
      const budget = CONTEXT_CHAR_LIMIT - result.length - 100
      if (budget > 200) {
        result += `\n\n${label} NOTES (truncated):\n${sess.dmRawNotes.slice(0, budget)}…`
      }
      break
    }
  }

  return result
}

// ── Resolve the best Claude model for a campaign+user combination ─────────────
async function resolveTextModel(opts: {
  requestModel?: string
  campaignId?: string
  taskKey: string
  userId: string
}): Promise<string> {
  const { requestModel, campaignId, taskKey, userId } = opts
  if (requestModel) return requestModel

  const [userPref, campaign] = await Promise.all([
    prisma.userPreference.findUnique({ where: { userId } }),
    campaignId ? prisma.campaign.findUnique({ where: { id: campaignId }, select: { aiModel: true } }) : Promise.resolve(null),
  ])

  const taskModelMap = (userPref?.textModelByTask ?? {}) as Record<string, string>
  return campaign?.aiModel || taskModelMap[taskKey] || userPref?.defaultTextModel || 'claude-sonnet-4-5'
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

// ── Faction Generator ─────────────────────────────────────────────────────────

const FACTION_SCHEMA = `{
  "name": "string — faction name",
  "description": "string — 1-2 sentences describing who they are and what they do",
  "goals": "string — what they want and why, their driving agenda",
  "dispositionToParty": "hostile|wary|neutral|friendly|complicated",
  "dmOnlyNotes": "string — secrets, hidden agendas, vulnerabilities the players don't know",
  "tags": ["string"]
}`

// ── Plot Thread Generator ─────────────────────────────────────────────────────

const PLOT_THREAD_SCHEMA = `{
  "title": "string — short evocative name for this plot thread",
  "description": "string — 2-3 sentences describing what this thread involves, who's behind it, and what's at stake",
  "status": "active|dormant|resolved|unknown"
}`

// ── Enemy Generator ───────────────────────────────────────────────────────────

const ENEMY_SCHEMA = `{
  "name": "string — creature name",
  "description": "string — 1-2 sentences of appearance and typical behavior",
  "enemyType": "string — creature type (beast, undead, humanoid, fiend, construct, dragon, etc.)",
  "size": "string — tiny|small|medium|large|huge|gargantuan (omit if system doesn't use this)",
  "cr": "string — challenge rating (5e) or rough power level; omit if system doesn't use CR",
  "tags": ["string — relevant tags e.g. undead, flying, spellcaster, horde, regeneration"],
  "statBlock": {}
}`

const ENEMY_SCHEMA_5E = `{
  "name": "string",
  "description": "string — 1-2 sentences",
  "enemyType": "string — e.g. humanoid (goblinoid), undead, beast, fiend (devil)",
  "size": "tiny|small|medium|large|huge|gargantuan",
  "cr": "string — e.g. 1/4, 1, 5, 17",
  "tags": ["string"],
  "statBlock": {
    "str": "number", "dex": "number", "con": "number",
    "int": "number", "wis": "number", "cha": "number",
    "ac": "number",
    "hp": "string — dice notation e.g. '5d8+10 (32)'",
    "speed": "string — e.g. '30 ft., fly 60 ft.'",
    "saves": "string — e.g. 'Dex +4, Wis +2'",
    "skills": "string — e.g. 'Stealth +5, Perception +3'",
    "senses": "string — e.g. 'Darkvision 60 ft., passive Perception 13'",
    "languages": "string",
    "traits": "string — special traits, each on its own line",
    "actions": "string — attack actions and special abilities, each on its own line"
  }
}`

const ENEMY_SCHEMA_DW = `{
  "name": "string",
  "description": "string — 1-2 sentences",
  "enemyType": "string — broad type e.g. beast, humanoid, undead, construct",
  "size": "string — optional size descriptor",
  "cr": null,
  "tags": ["string"],
  "statBlock": {
    "hp": "number",
    "armor": "number — 0 to 4",
    "damage": "string — dice notation e.g. 'd6', 'd8+1', '2d6'",
    "instinct": "string — what drives the creature without thinking",
    "moves": "string — 2-5 GM-triggered moves, each on its own line",
    "tags": "string — Dungeon World tags e.g. Horde, Group, Solitary, Stealthy, Magical, Terrifying"
  }
}`

// ── Location Generator ────────────────────────────────────────────────────────

const LOCATION_SCHEMA = `{
  "name": "string — evocative location name",
  "type": "string — settlement|dungeon|wilderness|building|ruins|landmark|other",
  "description": "string — 2-3 sentences describing the look, feel, and atmosphere",
  "atmosphere": "string — the mood or tone in 1 sentence",
  "notableFeatures": ["string — distinct details a visitor would notice"],
  "hooks": ["string — potential adventure hooks or points of interest"],
  "dmOnlyNotes": "string — secrets, hidden dangers, or GM-facing info",
  "tags": ["string"]
}`

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
  faction: FACTION_SCHEMA,
  plot_thread: PLOT_THREAD_SCHEMA,
  location: LOCATION_SCHEMA,
  session_wrap: SESSION_WRAP_SCHEMA,
  enemy: ENEMY_SCHEMA,
}

// ── Text generation ───────────────────────────────────────────────────────────

async function handleTextGenerate(req: Request, res: Response): Promise<void> {
  const userId = res.locals.user.id
  const schema = z.object({
    kind: z.enum(['npc', 'encounter', 'treasure', 'dialogue', 'faction', 'plot_thread', 'location', 'session_wrap', 'quick', 'prep_suggestions', 'enemy']),
    campaignId: z.string().optional(),
    prompt: z.string(),
    sessionId: z.string().optional(),
    npcId: z.string().optional(),
    stream: z.boolean().optional().default(false),
    model: z.string().optional(),
    useCampaignContext: z.boolean().optional().default(true),
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

  const textQuota = await checkFriendTextQuota(userId)
  if (!textQuota.allowed) {
    res.status(429).json({ error: textQuota.error })
    return
  }

  const { kind, campaignId, prompt, sessionId, npcId, stream, model, useCampaignContext } = parsed.data
  const taskKey = kind === 'dialogue' ? 'dialogue' : kind === 'session_wrap' ? 'sessionWrap' : 'entityGen'
  const textModel = await resolveTextModel({ requestModel: model, campaignId, taskKey, userId })

  // Ownership checks — verify every caller-supplied ID belongs to this user
  if (campaignId) {
    const ownedCampaign = await prisma.campaign.findFirst({ where: { id: campaignId, ownerUserId: userId } })
    if (!ownedCampaign) {
      res.status(403).json({ error: 'Access denied.' })
      return
    }
  }

  if (sessionId) {
    const ownedSession = await prisma.gameSession.findFirst({
      where: { id: sessionId, campaign: { ownerUserId: userId } },
      select: { id: true },
    })
    if (!ownedSession) {
      res.status(403).json({ error: 'Access denied.' })
      return
    }
  }

  if (npcId) {
    const ownedNpc = await prisma.nPC.findFirst({
      where: { id: npcId, campaign: { ownerUserId: userId } },
      select: { id: true },
    })
    if (!ownedNpc) {
      res.status(403).json({ error: 'Access denied.' })
      return
    }
  }

  let context = ''
  if (campaignId && useCampaignContext !== false) {
    context = await buildCampaignContext(campaignId, prompt)
  }

  const contextUsed = !!context

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

  // For enemy generation, pick a system-specific schema
  let outputSchema = KIND_SCHEMAS[kind]
  if (kind === 'enemy' && campaignId) {
    const campaignForSystem = await prisma.campaign.findFirst({
      where: { id: campaignId, ownerUserId: userId },
      select: { systemTemplateId: true },
    })
    if (campaignForSystem?.systemTemplateId === 'builtin-d-d-5e') {
      outputSchema = ENEMY_SCHEMA_5E
    } else if (campaignForSystem?.systemTemplateId === 'builtin-dungeon-world') {
      outputSchema = ENEMY_SCHEMA_DW
    }
  }
  const userPref = await prisma.userPreference.findUnique({ where: { userId } })
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

      // Parse the accumulated text the same way the non-streaming path does,
      // so the client receives a structured result rather than raw prose.
      let streamResult: unknown = null
      try {
        const jsonMatch = fullText.match(/```json\n?([\s\S]*?)\n?```/) ?? fullText.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)
        streamResult = JSON.parse(jsonMatch ? (jsonMatch[1] ?? jsonMatch[0]) : fullText)
      } catch {
        streamResult = { text: fullText }
      }

      await prisma.generationJob.update({
        where: { id: job.id },
        data: {
          status: 'succeeded',
          tokensOrUnits: { input: finalMsg.usage.input_tokens, output: finalMsg.usage.output_tokens },
          outputRef: JSON.parse(JSON.stringify({ result: streamResult })),
        },
      })
      res.write(`data: ${JSON.stringify({ result: streamResult, jobId: job.id, contextUsed })}\n\n`)
      res.write(`data: ${JSON.stringify({ done: true, jobId: job.id, contextUsed })}\n\n`)
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
      res.json({ result, jobId: job.id, contextUsed })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Generation failed'
      await prisma.generationJob.update({ where: { id: job.id }, data: { status: 'failed', error: msg } })
      res.status(500).json({ error: msg })
    }
  }
}

generateRouter.post('/text', handleTextGenerate)

// POST /api/generate/enemy — dedicated SSE endpoint for enemy generation
generateRouter.post('/enemy', (req: Request, res: Response) => {
  req.body = { ...req.body, kind: 'enemy', stream: req.body.stream ?? true }
  return handleTextGenerate(req, res)
})

// ── Context preview (dev/debug) ───────────────────────────────────────────────
generateRouter.get('/context-preview/:campaignId', async (req, res) => {
  const userId = res.locals.user.id
  const { campaignId } = req.params
  const query = String(req.query.q ?? '')
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, ownerUserId: userId } })
  if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return }
  const context = await buildCampaignContext(campaignId, query)
  res.json({ charCount: context.length, limit: CONTEXT_CHAR_LIMIT, context })
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

  const worldMapQuota = await checkFriendTextQuota(userId)
  if (!worldMapQuota.allowed) { res.status(429).json({ error: worldMapQuota.error }); return }

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
    await recordAnthropicUsageForFriend(userId, 'world_map_context', campaignId)
    res.json({ summary })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to generate context' })
  }
})

// ── Prompt expander ───────────────────────────────────────────────────────────

generateRouter.post('/expand-prompt', async (req, res) => {
  const userId = res.locals.user.id
  const schema = z.object({
    prompt: z.string().min(1).max(1000),
    context: z.enum(['battle_map', 'world_map', 'general']).optional().default('general'),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return }

  const client = await getAnthropicClient(userId)
  if (!client) { res.status(402).json({ error: 'No API key configured' }); return }

  const expandQuota = await checkFriendTextQuota(userId)
  if (!expandQuota.allowed) { res.status(429).json({ error: expandQuota.error }); return }

  const { prompt, context } = parsed.data
  const contextHint =
    context === 'battle_map' ? 'a tactical battle map scene for a tabletop RPG (specific terrain, obstacles, atmosphere, encounter feel)' :
    context === 'world_map'  ? 'a fantasy world or region geography (terrain types, biomes, landmarks, atmosphere)' :
    'a tabletop RPG content generation prompt'

  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 600,
      system: `You are a creative writing assistant for a tabletop RPG GM. The user has written a brief prompt for ${contextHint}. Expand it into 3 richer, more evocative alternatives that add specific sensory detail, atmosphere, and interesting features while staying true to the original intent. Each suggestion should be 1–3 vivid sentences.

Return ONLY a JSON array of exactly 3 strings, no markdown wrapper, no prose:
["suggestion 1", "suggestion 2", "suggestion 3"]`,
      messages: [{ role: 'user', content: `Prompt: ${prompt}` }],
    })
    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '[]'
    let suggestions: string[] = []
    try {
      const match = raw.match(/\[[\s\S]*\]/)
      suggestions = JSON.parse(match ? match[0] : raw)
      if (!Array.isArray(suggestions)) suggestions = []
    } catch { suggestions = [] }
    await recordAnthropicUsageForFriend(userId, 'expand_prompt')
    res.json({ suggestions: suggestions.slice(0, 3).filter((s): s is string => typeof s === 'string') })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to expand prompt' })
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
  if (!client) { res.status(402).json({ error: 'No API key configured. Add an Anthropic or Evolink key in Settings.' }); return }

  const sessionWrapQuota = await checkFriendTextQuota(userId)
  if (!sessionWrapQuota.allowed) { res.status(429).json({ error: sessionWrapQuota.error }); return }

  const prevSession = await prisma.gameSession.findFirst({
    where: { campaignId: session.campaignId, sessionNumber: { lt: session.sessionNumber }, status: 'complete' },
    orderBy: { sessionNumber: 'desc' },
    select: { hooksForNext: true },
  })

  const context = await buildCampaignContext(session.campaignId, session.dmRawNotes)
  const userPref = await prisma.userPreference.findUnique({ where: { userId } })
  const taskModelMap2 = (userPref?.textModelByTask ?? {}) as Record<string, string>
  const textModel = taskModelMap2['sessionWrap'] ?? userPref?.defaultTextModel ?? 'claude-opus-4-5'

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
  if (!client) { res.status(402).json({ error: 'No API key configured. Add an Anthropic or Evolink key in Settings.' }); return }

  const prepQuota = await checkFriendTextQuota(userId)
  if (!prepQuota.allowed) { res.status(429).json({ error: prepQuota.error }); return }

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
  const taskModelMap3 = (userPref?.textModelByTask ?? {}) as Record<string, string>
  const textModel = taskModelMap3['sessionWrap'] ?? userPref?.defaultTextModel ?? 'claude-opus-4-5'

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
    await recordAnthropicUsageForFriend(userId, 'prep_suggestions', campaignId)
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
    aspectRatio: z.enum(['portrait', 'square', 'landscape', 'widescreen', '16:9', '9:16', '4:3', '3:4', '1:1', '2:3', '5:4', '4:5']).optional(),
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
    : kind === 'portrait_pc' ? 'pc'
    : kind === 'location_art' ? 'location'
    : kind === 'item_art' ? 'item'
    : kind.startsWith('map_') ? 'map'
    : kind.split('_')[0] ?? 'unknown'

  if (entityType === 'npc') {
    const ent = await prisma.nPC.findFirst({ where: { id: entityId, campaignId, deletedAt: null } })
    if (!ent) { res.status(404).json({ error: 'NPC not found in this campaign' }); return }
  } else if (entityType === 'pc') {
    const ent = await prisma.playerCharacter.findFirst({ where: { id: entityId, campaignId, deletedAt: null } })
    if (!ent) { res.status(404).json({ error: 'Player character not found in this campaign' }); return }
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

  const imageQuota = await checkFriendImageQuota(userId)
  if (!imageQuota.allowed) {
    res.status(429).json({ error: imageQuota.error })
    return
  }

  // ── Cost estimate + soft-cap confirm ──────────────────────────────────────
  const userPref = await prisma.userPreference.findUnique({ where: { userId } })
  const imageModelByCategory = (userPref?.imageModelByCategory ?? {}) as Record<string, string>
  const categoryKey = entityType === 'map' ? 'encounter' : entityType
  const resolvedModel = model ?? imageModelByCategory[categoryKey] ?? userPref?.defaultImageModel ?? 'nano-banana-2-lite'
  const costEstimate = getImageCostEstimate(resolvedModel) + getArtDirectorCostPerCall()
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

  try {
    await getBoss().send('image.generate', { jobId: job.id })
  } catch (enqueueErr) {
    const msg = enqueueErr instanceof Error ? enqueueErr.message : 'Failed to enqueue job'
    console.error('[generate/image] enqueue error:', msg)
    await prisma.generationJob.update({ where: { id: job.id }, data: { status: 'failed', error: msg } })
    res.status(503).json({ error: `Image queue unavailable: ${msg}` })
    return
  }

  res.json({ jobId: job.id })
})

// ── Quick Image generation (prompt-only, no entity attachment) ───────────────

generateRouter.post('/quick-image', async (req, res) => {
  const userId = res.locals.user.id
  const schema = z.object({
    prompt:     z.string().min(1),
    campaignId: z.string().min(1),
    model:      z.string().optional(),
  })

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' })
    return
  }

  const { prompt, campaignId, model } = parsed.data

  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, ownerUserId: userId } })
  if (!campaign) {
    res.status(403).json({ error: 'Campaign not found or forbidden' })
    return
  }

  const imageQuota = await checkFriendImageQuota(userId)
  if (!imageQuota.allowed) {
    res.status(429).json({ error: imageQuota.error })
    return
  }

  const resolvedModel  = model ?? 'nano-banana-2'
  const costEstimate   = getImageCostEstimate(resolvedModel) + getArtDirectorCostPerCall()

  const job = await prisma.generationJob.create({
    data: {
      userId,
      campaignId,
      provider:      'evolink',
      kind:          'quick_image',
      status:        'queued',
      costEstimate,
      input: {
        kind:       'quick_image',
        entityId:   '',
        entityType: '',
        prompt,
        model:      resolvedModel,
      },
    },
  })

  try {
    await getBoss().send('image.generate', { jobId: job.id })
  } catch (enqueueErr) {
    const msg = enqueueErr instanceof Error ? enqueueErr.message : 'Failed to enqueue job'
    await prisma.generationJob.update({ where: { id: job.id }, data: { status: 'failed', error: msg } })
    res.status(503).json({ error: `Image queue unavailable: ${msg}` })
    return
  }

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

  const previewQuota = await checkFriendTextQuota(userId)
  if (!previewQuota.allowed) { res.status(429).json({ error: previewQuota.error }); return }

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
      await recordAnthropicUsageForFriend(userId, 'preview_prompt', campaignId)
      res.json({ prompt: r.prompt ?? `${entityData.name ?? 'entity'}, ${styleFragment}` })
    } else {
      await recordAnthropicUsageForFriend(userId, 'preview_prompt', campaignId)
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
