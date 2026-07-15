import { PgBoss } from 'pg-boss'
import type { Job } from 'pg-boss'
import { prisma } from './prisma.js'
import { StorageService } from './storage.js'
import { decrypt } from './crypto.js'
import sharp from 'sharp'
import Anthropic from '@anthropic-ai/sdk'

let boss: PgBoss | null = null

// Friendly model names (stored in prefs/UI) → actual EvoLink model IDs
const EVOLINK_MODEL_MAP: Record<string, string> = {
  'gpt2':             'gpt-image-2',
  'gpt-image-2':      'gpt-image-2',
  'gpt-image-2-ultra': 'gpt-image-2',
  'krea-2-turbo':     'krea-2-turbo',
  'z-image':          'z-image-turbo',
  'nano-banana-2-lite': 'gemini-3.1-flash-lite-image',
  'nano-banana-2':    'gemini-3.1-flash-image-preview',
  'nano-banana-pro':  'gemini-3-pro-image-preview',
  'seedream-4.5':     'doubao-seedream-4.5',
  'seedream-4':       'doubao-seedream-4.0',
  'seedream-5':       'doubao-seedream-5.0-lite',
}

// Aspect-ratio token → EvoLink size string
const ASPECT_SIZE_MAP: Record<string, string> = {
  widescreen: '16:9',
  landscape:  '4:3',
  square:     '1:1',
  portrait:   '2:3',
  '16:9':     '16:9',
  '9:16':     '9:16',
  '4:3':      '4:3',
  '1:1':      '1:1',
  '2:3':      '2:3',
  '3:4':      '3:4',
  '5:4':      '5:4',
  '4:5':      '4:5',
}

export async function startWorker(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.warn('⚠️  DATABASE_URL not set — pg-boss worker not started')
    return
  }

  boss = new PgBoss({
    connectionString: databaseUrl,
    max: 4,
    connectionTimeoutMillis: 10000,
  })

  boss.on('error', (err: unknown) => console.error('[pg-boss] error:', err))

  await boss.start()
  console.log('🔧 pg-boss worker started')

  // In pg-boss v12, queues must exist before workers can poll them
  await boss.createQueue('image.generate')
  await boss.createQueue('image.poll')
  await boss.createQueue('image.postprocess')

  // Register queue handlers
  await boss.work('image.generate', { localConcurrency: 2 }, handleImageGenerate)
  await boss.work('image.poll', { localConcurrency: 4 }, handleImagePoll)
  await boss.work('image.postprocess', { localConcurrency: 2 }, handleImagePostprocess)

  console.log('🔧 Queues registered: image.generate, image.poll, image.postprocess')
}

export async function stopWorker(): Promise<void> {
  if (boss) {
    await boss.stop()
    console.log('🔧 pg-boss worker stopped')
  }
}

export function getBoss(): PgBoss {
  if (!boss) throw new Error('pg-boss not started — call startWorker() first')
  return boss
}

// ── Job data interfaces ───────────────────────────────────────────────────────

interface ImageGenerateData {
  jobId: string
}

interface ImagePollData {
  jobId: string
  providerTaskId: string
  pollCount?: number
}

interface ImagePostprocessData {
  jobId: string
  assetId: string
  sourceUrl?: string
  campaignId: string
  entityType: string
  entityId: string
  kind: string
}

// ── Handlers ─────────────────────────────────────────────────────────────────

async function handleImageGenerate(jobs: Job<ImageGenerateData>[]): Promise<void> {
  for (const job of jobs) {
    await processImageGenerate(job.data.jobId)
  }
}

async function processImageGenerate(jobId: string): Promise<void> {
  const genJob = await prisma.generationJob.findUnique({ where: { id: jobId } })
  if (!genJob) {
    console.error(`[image.generate] GenerationJob ${jobId} not found`)
    return
  }

  await prisma.generationJob.update({ where: { id: jobId }, data: { status: 'running' } })
  console.log(`[image.generate] Processing job ${jobId}`)

  try {
    const input = genJob.input as { kind: string; entityId: string; entityType: string; prompt?: string; stylePreset?: string; model?: string; aspectRatio?: string }
    const { kind, entityId, entityType } = input
    const userPrompt = input.prompt ?? null

    // ── 1. Load entity data ────────────────────────────────────────────────
    let entityData: Record<string, string> = {}
    if (entityType === 'npc' || kind === 'portrait_npc') {
      const npc = await prisma.nPC.findUnique({ where: { id: entityId } })
      if (npc) {
        entityData = {
          name: npc.name,
          role: npc.role,
          appearance: npc.appearance,
          personality: npc.personality,
          description: npc.description,
        }
      }
    } else if (entityType === 'pc' || kind === 'portrait_pc') {
      const pc = await prisma.playerCharacter.findUnique({ where: { id: entityId } })
      if (pc) {
        entityData = {
          name: pc.name,
          class: pc.class,
          race: pc.race,
          subclass: pc.subclass,
          appearance: pc.appearance,
          level: String(pc.level),
        }
      }
    } else if (entityType === 'location' || kind === 'location_art') {
      const loc = await prisma.location.findUnique({ where: { id: entityId } })
      if (loc) entityData = { name: loc.name, type: loc.type, description: loc.description }
    } else if (entityType === 'item' || kind === 'item_art') {
      const item = await prisma.item.findUnique({ where: { id: entityId } })
      if (item) entityData = { name: item.name, category: item.category, rarity: item.rarity, description: item.description }
    } else if (entityType === 'map' || kind.startsWith('map_')) {
      const mapAsset = await prisma.mapAsset.findUnique({ where: { id: entityId } })
      if (mapAsset) {
        entityData = {
          title: mapAsset.title,
          scene_description: mapAsset.generationPrompt ?? '',
        }
        if (mapAsset.linkedEncounterId) {
          const enc = await prisma.encounter.findUnique({ where: { id: mapAsset.linkedEncounterId } })
          if (enc) {
            entityData.encounter_name = enc.name
            entityData.encounter_type = enc.type
            entityData.encounter_description = enc.description
            entityData.encounter_setup = enc.setup
          }
        }
        if (mapAsset.linkedLocationId) {
          const loc = await prisma.location.findUnique({ where: { id: mapAsset.linkedLocationId } })
          if (loc) {
            entityData.location_name = loc.name
            entityData.location_type = loc.type
            entityData.location_description = loc.description
          }
        }
      }
    }

    // ── 2. Load style preset ──────────────────────────────────────────────
    const userPref = await prisma.userPreference.findUnique({ where: { userId: genJob.userId } })
    const presetName = input.stylePreset ?? userPref?.imageStylePreset ?? 'Classic fantasy oil'
    const preset = await prisma.artStylePreset.findFirst({
      where: { name: presetName, OR: [{ isBuiltin: true }, { ownerUserId: genJob.userId }] },
    })
    const styleFragment = preset?.promptFragment ?? 'fantasy art, detailed, high quality'

    // ── 3. Art Director: Claude Haiku crafts image prompt ─────────────────
    let finalPrompt: string
    let negativePrompt = 'watermark, text, signature, blurry, low quality, distorted, deformed, duplicate, extra limbs'

    if (userPrompt) {
      // Quietly enrich the user's prompt with Claude Sonnet: deeper visual
      // detail only — never changes the subject or intent. Falls back to the
      // original prompt on any failure or if no Anthropic key is configured.
      let enrichedPrompt = userPrompt
      const promptCred = await prisma.apiCredential.findUnique({
        where: { userId_provider: { userId: genJob.userId, provider: 'anthropic' } },
      })
      if (promptCred?.encryptedKey) {
        try {
          const anthroClient = new Anthropic({ apiKey: decrypt(promptCred.encryptedKey) })
          const enrichMsg = await anthroClient.messages.create({
            model: 'claude-sonnet-4-5',
            max_tokens: 300,
            messages: [{
              role: 'user',
              content: `You refine image-generation prompts. Rewrite the prompt below with a deeper level of concrete visual detail (lighting, texture, atmosphere, composition).

Rules — all must be followed:
- NEVER change the subject, setting, or goal of the prompt
- Do not add new objects, characters, locations, or style directions the prompt didn't imply
- Keep it subtle and natural — an enhancement, not a rewrite
- Stay concise: 60 words maximum
- Return ONLY the rewritten prompt text — no quotes, no commentary, no markdown

Prompt: ${userPrompt}`,
            }],
          })
          const out = enrichMsg.content[0].type === 'text' ? enrichMsg.content[0].text.trim() : ''
          if (out.length >= 10 && out.length <= 1200) enrichedPrompt = out
        } catch {
          // keep the original prompt untouched
        }
      }
      finalPrompt = `${enrichedPrompt}, ${styleFragment}`
    } else {
      const anthropicCred = await prisma.apiCredential.findUnique({
        where: { userId_provider: { userId: genJob.userId, provider: 'anthropic' } },
      })

      if (anthropicCred?.encryptedKey) {
        try {
          const anthroKey = decrypt(anthropicCred.encryptedKey)
          const anthroClient = new Anthropic({ apiKey: anthroKey })
          const isBattleMap = kind === 'map_battle'
          const isWorldOrRegionMap = kind === 'map_world' || kind === 'map_region'
          const scopeLabel = kind === 'map_world' ? 'WORLD' : 'REGION'
          const artDirectorContent = isWorldOrRegionMap
            ? `You are an art director for a tabletop RPG. Generate an image prompt for a PAINTED FANTASY ${scopeLabel} MAP.

Map context: ${JSON.stringify(entityData)}
Art style: ${styleFragment}

ABSOLUTE RULES — every single one must be obeyed:
- FLAT 2D TOP-DOWN overhead view ONLY — strictly NO isometric, NO 3D perspective, NO angled camera, NO horizon line, NO sky
- Hand-painted fantasy cartography — like Tolkien's Middle-earth map or old illustrated atlases; flat illustrated symbols, NOT photorealistic terrain
- Mountains shown as small flat triangular ink sketches; forests as round cluster icons; deserts as stippled texture; rivers as thin winding lines — ALL 2D SYMBOLS
- COMPLETELY INVENTED fictional geography — create entirely original, asymmetric landmass shapes with irregular coastlines, bays, peninsulas; ABSOLUTELY NO resemblance to Earth, Europe, Africa, Britain, the Mediterranean, or any real continent or sea
- ${kind === 'map_world' ? 'One or two large fictional continents with ocean around them; varied biomes visible as flat illustrated zones' : 'A single inland region at moderate zoom — roads, villages, rivers, a notable landmark clearly visible as flat 2D icons'}
- Aged parchment background tone unless style specifies otherwise
- NO text, NO labels, NO compass rose, NO legend, NO grid, NO border, NO cartouche

Return ONLY valid JSON — no prose, no markdown:
{"prompt":"<flat 2D overhead painted cartography, 60-100 words, describe invented landmass shape and biomes>","negative_prompt":"isometric, 3D, perspective view, angled, horizon, sky, photorealistic terrain, earth continents, europe, africa, real world geography, recognizable coastlines, text, labels, compass, grid, border"}`
            : isBattleMap
            ? `You are an art director for a tabletop RPG. Generate an image prompt for a TOP-DOWN ORTHOGRAPHIC battle map.

Map context: ${JSON.stringify(entityData)}
Art style: ${styleFragment}

ABSOLUTE RULES — every single one must be obeyed:
- STRICT 90° OVERHEAD view ONLY — camera points STRAIGHT DOWN, filling the entire frame with the ground plane; zero horizon line, zero sky, zero vanishing points
- NO isometric, NO 3D perspective, NO angled camera, NO diagonal view whatsoever
- Objects as seen from directly above: trees are circular canopy blobs, walls are straight lines, furniture is flat rectangular shapes — all 2D silhouettes
- Consistent flat overhead lighting — no dramatic raking shadows
- Rich textures for floor/terrain materials (stone, wood, dirt, grass) readable from above
- Include tactically interesting features: doorways, cover objects, barriers, elevation shifts shown by color/texture only
- NO grid lines, NO hex cells, NO tile borders, NO UI, NO labels, NO text, NO coordinates anywhere

Return ONLY valid JSON — no prose, no markdown:
{"prompt":"<strict overhead 90° top-down orthographic view, 50-80 words>","negative_prompt":"isometric, 3D perspective, angled view, diagonal camera, vanishing point, horizon line, sky, grid lines, hex grid, tile borders, game UI, labels, text, watermark"}`
            : `You are an art director for a tabletop RPG. Given this entity, write a vivid image generation prompt.

Entity JSON: ${JSON.stringify(entityData)}
Art style: ${styleFragment}
Image kind: ${kind}

Return ONLY valid JSON — no prose, no markdown:
{"prompt":"<concise, comma-separated visual description, 30–60 words>","negative_prompt":"<things to avoid>"}`
          const artMsg = await anthroClient.messages.create({
            model: 'claude-haiku-4-5',
            max_tokens: 512,
            messages: [{
              role: 'user',
              content: artDirectorContent,
            }],
          })
          const raw = artMsg.content[0].type === 'text' ? artMsg.content[0].text : ''
          const match = raw.match(/\{[\s\S]*\}/)
          if (match) {
            const parsed = JSON.parse(match[0]) as { prompt?: string; negative_prompt?: string }
            finalPrompt = parsed.prompt ?? `${entityData.name ?? 'character'}, ${styleFragment}`
            negativePrompt = parsed.negative_prompt ?? negativePrompt
          } else {
            finalPrompt = `${entityData.name ?? 'character'}, ${styleFragment}`
          }
        } catch {
          finalPrompt = `${entityData.name ?? 'character'}, ${styleFragment}`
        }
      } else {
        finalPrompt = `${entityData.name ?? 'character'}, ${styleFragment}`
      }
    }

    // ── 3b. Hard constraints for map kinds (applies to BOTH user prompts and
    // art-director prompts — image models drift toward isometric views and
    // real-world Earth geography without explicit framing) ─────────────────
    if (kind === 'map_battle') {
      finalPrompt = `Strict top-down orthographic tabletop RPG battle map, bird's-eye view from directly overhead (90-degree camera angle, flat 2D floor plan perspective, like an architectural blueprint rendered as painted terrain). ${finalPrompt}. Flat overhead view only — absolutely no isometric angle, no 3D tilt, no perspective depth, no walls shown from the side, no grid lines, no text or labels.`
      negativePrompt = `isometric, isometric view, 3/4 view, angled perspective, oblique projection, side view, 3D render perspective, tilted camera, horizon line, vanishing point, walls in elevation, grid lines, hex grid, text, labels, ${negativePrompt}`
    } else if (kind === 'map_world' || kind === 'map_region') {
      const scopeWord = kind === 'map_world' ? 'world with entirely fictional continents' : 'region with entirely fictional geography'
      finalPrompt = `Hand-painted fantasy cartography of a completely fictional, invented ${scopeWord} — original imaginary landmasses that must NOT resemble Earth or any real-world continents. ${finalPrompt}. Invented coastlines and landmass shapes only, no recognizable real-world geography, no text or labels.`
      negativePrompt = `Earth, world map of Earth, real-world continents, Africa, Europe, Asia, North America, South America, Australia, Antarctica, Greenland, recognizable geography, satellite photo, globe, text, labels, legends, compass rose, ${negativePrompt}`
    }

    // Store crafted prompt on the job for inspection
    await prisma.generationJob.update({
      where: { id: jobId },
      data: { input: { ...input, craftedPrompt: finalPrompt, negativePrompt } },
    })

    // ── 4. Get EvoLink key ─────────────────────────────────────────────────
    const jobUser = await prisma.user.findUnique({ where: { id: genJob.userId }, select: { email: true } })
    const isFriendJobUser = Boolean(jobUser?.email.startsWith('friend_') && jobUser.email.endsWith('@keeper.internal'))

    const evolinkCred = await prisma.apiCredential.findUnique({
      where: { userId_provider: { userId: genJob.userId, provider: 'evolink' } },
    })
    let evolinkKey: string
    if (evolinkCred?.encryptedKey) {
      evolinkKey = decrypt(evolinkCred.encryptedKey).trim()
    } else if (isFriendJobUser) {
      const envKey = process.env.EVOLINK_API_KEY?.trim()
      if (!envKey) throw new Error('No EvoLink API key configured')
      evolinkKey = envKey
    } else {
      throw new Error('No EvoLink API key configured')
    }
    if (!/^[\x21-\x7E]+$/.test(evolinkKey)) {
      throw new Error('Saved EvoLink key contains invalid characters — please re-copy it from the EvoLink dashboard and save it again in Settings')
    }

    // ── Friend quota check (defense-in-depth before Evolink submit) ────────
    // Only enforce if the friend has no stored Evolink credential of their own
    if (isFriendJobUser && !evolinkCred?.encryptedKey) {
      const imageJobCount = await prisma.generationJob.count({
        where: { userId: genJob.userId, provider: 'evolink', status: { not: 'failed' }, id: { not: jobId } },
      })
      if (imageJobCount >= 12) {
        throw new Error('Image generation quota reached (12 images). Thanks for trying the app!')
      }
    }

    // ── 5. Resolve model for entity category ──────────────────────────────
    const imageModelByCategory = (userPref?.imageModelByCategory ?? {}) as Record<string, string>
    // Category key must match what the Settings UI stores (npc, location, item, encounter)
    const categoryKey = entityType === 'map' ? 'encounter' : entityType
    const model = input.model ?? imageModelByCategory[categoryKey] ?? userPref?.defaultImageModel ?? 'gpt-image-2'
    // Strict allow-list: friendly names map to EvoLink IDs; already-valid EvoLink IDs
    // pass through; anything else (legacy flux/SD values, typos) falls back to default.
    const evolinkModel = EVOLINK_MODEL_MAP[model]
      ?? (Object.values(EVOLINK_MODEL_MAP).includes(model) ? model : EVOLINK_MODEL_MAP['gpt-image-2'])

    const aspectRatio = input.aspectRatio ?? (kind === 'portrait_npc' || kind === 'portrait_pc' ? 'portrait' : 'square')
    const size = ASPECT_SIZE_MAP[aspectRatio] ?? '1:1'

    // EvoLink prompt limit is 2000 chars; fold the negative prompt in as guidance.
    // Trim the body first so the "Avoid:" constraints are never clipped.
    const avoidSection = negativePrompt ? `\n\nAvoid: ${negativePrompt.slice(0, 600)}` : ''
    const bodyBudget = 2000 - avoidSection.length
    const promptBody = finalPrompt.length > bodyBudget ? finalPrompt.slice(0, bodyBudget) : finalPrompt
    const promptWithNegative = `${promptBody}${avoidSection}`

    // ── 6. Submit to EvoLink ───────────────────────────────────────────────
    console.log(`[image.generate] Submitting job ${jobId}: model=${evolinkModel} size=${size} entityType=${entityType}`)
    const submitBody: Record<string, unknown> = { model: evolinkModel, prompt: promptWithNegative, size }
    if (evolinkModel === 'gpt-image-2') {
      submitBody.resolution = '1K'
      // Ultra High uses medium quality; everything else pins to low.
      submitBody.quality = model === 'gpt-image-2-ultra' ? 'medium' : 'low'
    } else if (evolinkModel === 'krea-2-turbo') {
      submitBody.resolution = '1K'
    }
    const submitRes = await fetch('https://api.evolink.ai/v1/images/generations', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${evolinkKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(submitBody),
    })

    if (!submitRes.ok) {
      const errText = await submitRes.text()
      throw new Error(`EvoLink submission failed (${submitRes.status}): ${errText.slice(0, 200)}`)
    }

    const submitData = await submitRes.json() as {
      id: string
      status: string
      results?: string[]
      error?: { message?: string } | null
      usage?: { credits_reserved?: number }
    }

    await prisma.generationJob.update({ where: { id: jobId }, data: { providerTaskId: submitData.id } })

    // ── 7. Sync result or enqueue poll ────────────────────────────────────
    const syncDone = submitData.status === 'completed'
    if (syncDone) {
      const outputUrl = submitData.results?.[0]
      if (!outputUrl) throw new Error('EvoLink sync succeeded but returned no output URL')

      const syncCostActual = submitData.usage?.credits_reserved ?? null

      if (syncCostActual !== null) {
        await prisma.generationJob.update({ where: { id: jobId }, data: { costActual: syncCostActual } })
      }

      const asset = await prisma.asset.create({
        data: { campaignId: genJob.campaignId!, kind, storageKeyOriginal: '', source: 'generated', generationJobId: jobId },
      })
      await getBoss().send('image.postprocess', {
        jobId, assetId: asset.id, sourceUrl: outputUrl,
        campaignId: genJob.campaignId!, entityType, entityId, kind,
      } satisfies ImagePostprocessData)
    } else {
      await getBoss().send(
        'image.poll',
        { jobId, providerTaskId: submitData.id, pollCount: 0 } satisfies ImagePollData,
        { startAfter: 5 },
      )
      await notifyJobUpdate(jobId, 'running')
    }

    console.log(`[image.generate] Job ${jobId} submitted to EvoLink (sync=${syncDone})`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Image generation failed'
    console.error(`[image.generate] Error for job ${jobId}:`, msg)
    await prisma.generationJob.update({ where: { id: jobId }, data: { status: 'failed', error: msg, outputRef: { rawError: msg } } })
    await notifyJobUpdate(jobId, 'failed')
  }
}

async function handleImagePoll(jobs: Job<ImagePollData>[]): Promise<void> {
  for (const job of jobs) {
    await processImagePoll(job.data)
  }
}

async function processImagePoll(data: ImagePollData): Promise<void> {
  const { jobId, providerTaskId, pollCount = 0 } = data
  console.log(`[image.poll] Polling job ${jobId}, task ${providerTaskId}, attempt ${pollCount + 1}`)

  const MAX_POLL_ATTEMPTS = 24
  const POLL_DELAYS = [5, 10, 20, 30, 30, 30]

  if (pollCount >= MAX_POLL_ATTEMPTS) {
    const timeoutMsg = 'Image generation timed out after 10 minutes'
    await prisma.generationJob.update({
      where: { id: jobId },
      data: { status: 'failed', error: timeoutMsg, outputRef: { rawError: timeoutMsg } },
    })
    await notifyJobUpdate(jobId, 'failed')
    return
  }

  // Re-fetch EvoLink key from DB on each poll — never stored in queue payload
  const genJob = await prisma.generationJob.findUnique({ where: { id: jobId } })
  if (!genJob) return

  const evolinkCred = await prisma.apiCredential.findUnique({
    where: { userId_provider: { userId: genJob.userId, provider: 'evolink' } },
  })
  const pollUser = await prisma.user.findUnique({ where: { id: genJob.userId }, select: { email: true } })
  const isFriendPollUser = Boolean(pollUser?.email.startsWith('friend_') && pollUser.email.endsWith('@keeper.internal'))

  let evolinkKey: string
  if (evolinkCred?.encryptedKey) {
    evolinkKey = decrypt(evolinkCred.encryptedKey)
  } else if (isFriendPollUser) {
    const envKey = process.env.EVOLINK_API_KEY?.trim()
    if (!envKey) {
      const credMsg = 'EvoLink credential no longer available'
      await prisma.generationJob.update({ where: { id: jobId }, data: { status: 'failed', error: credMsg, outputRef: { rawError: credMsg } } })
      await notifyJobUpdate(jobId, 'failed')
      return
    }
    evolinkKey = envKey
  } else {
    const credMsg = 'EvoLink credential no longer available'
    await prisma.generationJob.update({ where: { id: jobId }, data: { status: 'failed', error: credMsg, outputRef: { rawError: credMsg } } })
    await notifyJobUpdate(jobId, 'failed')
    return
  }

  const reenqueue = async () => {
    const delaySeconds = POLL_DELAYS[Math.min(pollCount, POLL_DELAYS.length - 1)]
    await getBoss().send('image.poll', { jobId, providerTaskId, pollCount: pollCount + 1 } satisfies ImagePollData, { startAfter: delaySeconds })
  }

  try {
    const response = await fetch(`https://api.evolink.ai/v1/tasks/${providerTaskId}`, {
      headers: { 'Authorization': `Bearer ${evolinkKey}` },
    })

    if (!response.ok) {
      await reenqueue()
      return
    }

    const responseData = await response.json() as {
      status: string
      results?: string[]
      error?: { message?: string } | null
      usage?: { credits_reserved?: number; credits_used?: number }
    }

    if (responseData.status === 'completed') {
      const outputUrl = responseData.results?.[0]
      if (!outputUrl) {
        const noUrlMsg = 'No output URL from provider'
        await prisma.generationJob.update({ where: { id: jobId }, data: { status: 'failed', error: noUrlMsg, outputRef: { rawError: noUrlMsg } } })
        await notifyJobUpdate(jobId, 'failed')
        return
      }

      const costActual = responseData.usage?.credits_used
        ?? responseData.usage?.credits_reserved
        ?? null

      if (costActual !== null) {
        await prisma.generationJob.update({ where: { id: jobId }, data: { costActual } })
      }

      const input = genJob.input as Record<string, string>

      const asset = await prisma.asset.create({
        data: {
          campaignId: genJob.campaignId!,
          kind: genJob.kind,
          storageKeyOriginal: '',
          source: 'generated',
          generationJobId: jobId,
        },
      })

      await getBoss().send('image.postprocess', {
        jobId,
        assetId: asset.id,
        sourceUrl: outputUrl,
        campaignId: genJob.campaignId!,
        entityType: input.entityType ?? '',
        entityId: input.entityId ?? '',
        kind: genJob.kind,
      } satisfies ImagePostprocessData)

    } else if (responseData.status === 'failed' || responseData.status === 'error' || responseData.status === 'cancelled') {
      const errMsg = responseData.error?.message ?? 'Provider reported failure'
      await prisma.generationJob.update({ where: { id: jobId }, data: { status: 'failed', error: errMsg, outputRef: { rawError: errMsg, providerStatus: responseData.status } } })
      await notifyJobUpdate(jobId, 'failed')

    } else {
      await reenqueue()
    }

  } catch (err) {
    await reenqueue()
    console.error(`[image.poll] Error polling ${providerTaskId}:`, err instanceof Error ? err.message : err)
  }
}

async function handleImagePostprocess(jobs: Job<ImagePostprocessData>[]): Promise<void> {
  for (const job of jobs) {
    await processImagePostprocess(job.data)
  }
}

async function processImagePostprocess(data: ImagePostprocessData): Promise<void> {
  const { jobId, assetId, sourceUrl, campaignId, entityType, entityId, kind } = data
  console.log(`[image.postprocess] Processing asset ${assetId} for job ${jobId}`)

  try {
    let imageBuffer: Buffer

    if (sourceUrl) {
      const response = await fetch(sourceUrl)
      if (!response.ok) throw new Error(`Failed to download image: ${response.statusText}`)
      imageBuffer = Buffer.from(await response.arrayBuffer())
    } else {
      // For uploads: read the key stored on the Asset row (avoids guessing extension)
      const assetRow = await prisma.asset.findUnique({ where: { id: assetId }, select: { storageKeyOriginal: true } })
      const existingKey = assetRow?.storageKeyOriginal
      if (!existingKey) throw new Error(`Asset ${assetId} has no storageKeyOriginal and no sourceUrl`)
      const existing = await StorageService.get(existingKey)
      if (!existing) throw new Error(`No data at storage key "${existingKey}" for asset ${assetId}`)
      imageBuffer = existing
    }

    const metadata = await sharp(imageBuffer).metadata()
    const width = metadata.width ?? 0
    const height = metadata.height ?? 0

    const ext = (metadata.format ?? 'png') as string
    const originalKey = StorageService.assetKey(campaignId, assetId, 'original', ext)
    await StorageService.put(originalKey, imageBuffer)

    const thumbBuffer = await sharp(imageBuffer)
      .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer()

    const thumbKey = StorageService.assetKey(campaignId, assetId, 'thumb')
    await StorageService.put(thumbKey, thumbBuffer)

    const isMap = kind.startsWith('map_')
    let previewKey: string | undefined

    if (isMap) {
      const previewBuffer = await sharp(imageBuffer)
        .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer()
      previewKey = StorageService.assetKey(campaignId, assetId, 'preview')
      await StorageService.put(previewKey, previewBuffer)
    }

    // ── Alt-text (Claude Haiku vision; fallback to kind label on failure) ──────
    let altText: string = kind.replace(/_/g, ' ')
    let altTextRawError: string | undefined
    try {
      const genJob2 = await prisma.generationJob.findUnique({ where: { id: jobId }, select: { userId: true } })
      const userId2 = genJob2?.userId
      if (userId2) {
        const anthCred = await prisma.apiCredential.findUnique({
          where: { userId_provider: { userId: userId2, provider: 'anthropic' } },
        })
        if (anthCred?.encryptedKey) {
          const anthKey = decrypt(anthCred.encryptedKey)
          const anthClient = new Anthropic({ apiKey: anthKey })
          const base64Thumb = thumbBuffer.toString('base64')
          const altMsg = await anthClient.messages.create({
            model: 'claude-haiku-4-5',
            max_tokens: 80,
            messages: [{
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: 'image/webp', data: base64Thumb } },
                { type: 'text', text: 'Describe this image in exactly one sentence for use as HTML alt text. Be concise and factual.' },
              ],
            }],
          })
          const raw2 = altMsg.content[0].type === 'text' ? altMsg.content[0].text.trim() : ''
          if (raw2) altText = raw2
        }
      }
    } catch (altErr) {
      altTextRawError = altErr instanceof Error ? altErr.message : String(altErr)
      console.warn(`[alt-text] Failed for asset ${assetId}, using fallback: ${altTextRawError}`)
    }

    await prisma.asset.update({
      where: { id: assetId },
      data: {
        storageKeyOriginal: originalKey,
        storageKeyThumb: thumbKey,
        storageKeyPreview: previewKey,
        width,
        height,
        altText,
      },
    })

    await attachAssetToEntity(assetId, entityType, entityId, kind)

    await prisma.generationJob.update({
      where: { id: jobId },
      data: { status: 'succeeded', outputRef: { assetId } },
    })

    await notifyJobUpdate(jobId, 'succeeded', assetId)
    console.log(`[image.postprocess] Done — asset ${assetId}`)

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Postprocess failed'
    console.error(`[image.postprocess] Error for job ${jobId}:`, msg)
    await prisma.generationJob.update({ where: { id: jobId }, data: { status: 'failed', error: msg, outputRef: { rawError: msg } } })
    await notifyJobUpdate(jobId, 'failed')
  }
}

async function attachAssetToEntity(assetId: string, entityType: string, entityId: string, kind: string): Promise<void> {
  if (!entityId || !entityType) return
  try {
    if (entityType === 'npc' || kind === 'portrait_npc') {
      await prisma.nPC.update({ where: { id: entityId }, data: { portraitAssetId: assetId } })
    } else if (entityType === 'pc' || kind === 'portrait_pc') {
      await prisma.playerCharacter.update({ where: { id: entityId }, data: { portraitAssetId: assetId } })
    } else if (entityType === 'location' || kind === 'location_art') {
      await prisma.location.update({ where: { id: entityId }, data: { imageAssetId: assetId } })
    } else if (entityType === 'item' || kind === 'item_art') {
      await prisma.item.update({ where: { id: entityId }, data: { imageAssetId: assetId } })
    } else if (kind.startsWith('map_')) {
      await prisma.mapAsset.update({ where: { id: entityId }, data: { imageAssetId: assetId } })
    }
    console.log(`[attach] Linked asset ${assetId} → ${entityType}/${entityId}`)
  } catch (err) {
    // Best-effort: the asset was saved successfully; only the back-link failed.
    // Log and continue so the job is marked succeeded rather than failed.
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[attach] Could not link asset ${assetId} to ${entityType}/${entityId} — ${msg}`)
  }
}

// ── SSE notification store ────────────────────────────────────────────────────

type SseClient = { userId: string; res: { write: (data: string) => void; writableEnded: boolean } }
const sseClients: SseClient[] = []

export function registerSseClient(userId: string, res: SseClient['res']): () => void {
  const client: SseClient = { userId, res }
  sseClients.push(client)
  return () => {
    const idx = sseClients.indexOf(client)
    if (idx !== -1) sseClients.splice(idx, 1)
  }
}

async function notifyJobUpdate(jobId: string, status: string, assetId?: string): Promise<void> {
  const job = await prisma.generationJob.findUnique({ where: { id: jobId }, select: { userId: true } })
  if (!job) return

  const payload = JSON.stringify({ jobId, status, assetId })
  const data = `event: job_update\ndata: ${payload}\n\n`

  for (const client of sseClients) {
    if (client.userId === job.userId && !client.res.writableEnded) {
      try {
        client.res.write(data)
      } catch {
        // Client disconnected
      }
    }
  }
}
