import { PgBoss } from 'pg-boss'
import type { Job } from 'pg-boss'
import { prisma } from './prisma.js'
import { StorageService } from './storage.js'
import { decrypt } from './crypto.js'
import sharp from 'sharp'
import Anthropic from '@anthropic-ai/sdk'

let boss: PgBoss | null = null

export async function startWorker(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.warn('⚠️  DATABASE_URL not set — pg-boss worker not started')
    return
  }

  boss = new PgBoss({
    connectionString: databaseUrl,
    max: 8,
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
      finalPrompt = `${userPrompt}, ${styleFragment}`
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
            ? `You are an art director for a tabletop RPG. Generate a detailed image prompt for a PAINTED FANTASY ${scopeLabel} MAP.

Map context: ${JSON.stringify(entityData)}
Art style: ${styleFragment}

STRICT RULES — all must be followed:
- Painterly fantasy cartography style — hand-illustrated, antique, evocative
- Bird's eye geographic overview — NOT photorealistic or orthographic grid
- NO text, NO labels, NO legends, NO compass roses, NO map borders or cartouches
- Show natural terrain: mountains as stylised peaks, forests as clusters of illustrated trees, rivers as winding blue lines, coastlines with surf detail
- Warm parchment or aged tones unless the style preset specifies otherwise
- Settlements shown as small illustrated icons (tiny rooftops or towers), NOT labeled
- ${kind === 'map_region' ? 'Focus on a single region at moderate zoom — roads, villages, rivers, a notable landmark or two clearly visible' : 'Wide view of an entire continent or world — macro geography, biome zones, major mountain ranges, ocean regions'}

Return ONLY valid JSON — no prose, no markdown:
{"prompt":"<detailed painterly ${kind === 'map_world' ? 'world' : 'region'} map description, 40-80 words>","negative_prompt":"<things to avoid>"}`
            : isBattleMap
            ? `You are an art director for a tabletop RPG. Generate a detailed image prompt for a TOP-DOWN ORTHOGRAPHIC battle map.

Map context: ${JSON.stringify(entityData)}
Art style: ${styleFragment}
Image kind: ${kind}

STRICT RULES — all must be followed:
- Strict top-down bird's eye view (camera directly overhead, 90° angle, orthographic)
- NO grid lines or grid overlay on the image
- NO labels, text, numbers, UI elements, or annotations
- Consistent, flat overhead lighting (no dramatic shadows)
- Show terrain, obstacles, furniture, props clearly from above
- Include tactically interesting features: cover objects, pathways, elevation changes, hazards
- Rich, detailed environment textures appropriate to the scene description

Return ONLY valid JSON — no prose, no markdown:
{"prompt":"<detailed top-down map description, 40-80 words>","negative_prompt":"<things to avoid>"}`
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

    // Store crafted prompt on the job for inspection
    await prisma.generationJob.update({
      where: { id: jobId },
      data: { input: { ...input, craftedPrompt: finalPrompt, negativePrompt } },
    })

    // ── 4. Get EvoLink key ─────────────────────────────────────────────────
    const evolinkCred = await prisma.apiCredential.findUnique({
      where: { userId_provider: { userId: genJob.userId, provider: 'evolink' } },
    })
    if (!evolinkCred?.encryptedKey) throw new Error('No EvoLink API key configured')
    const evolinkKey = decrypt(evolinkCred.encryptedKey)

    // ── 5. Resolve model for entity category ──────────────────────────────
    const imageModelByCategory = (userPref?.imageModelByCategory ?? {}) as Record<string, string>
    // Category key must match what the Settings UI stores (npc, location, item, encounter)
    const categoryKey = entityType === 'map' ? 'encounter' : entityType
    const model = input.model ?? imageModelByCategory[categoryKey] ?? userPref?.defaultImageModel ?? 'nano-banana-2-lite'

    const aspectRatio = input.aspectRatio ?? (kind === 'portrait_npc' ? 'portrait' : 'square')
    const width = aspectRatio === 'widescreen' ? 1280 : aspectRatio === 'landscape' ? 1024 : aspectRatio === 'square' ? 1024 : 768
    const height = aspectRatio === 'widescreen' ? 720 : aspectRatio === 'landscape' ? 768 : 1024

    // ── 6. Submit to EvoLink ───────────────────────────────────────────────
    console.log(`[image.generate] Submitting job ${jobId}: model=${model} size=${width}x${height} entityType=${entityType} keyPrefix=${evolinkKey.slice(0, 8)}…`)
    const submitRes = await fetch('https://api.eachlabs.ai/v1/prediction', {
      method: 'POST',
      headers: { 'X-API-Key': evolinkKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: { prompt: finalPrompt, negative_prompt: negativePrompt, width, height } }),
    })

    if (!submitRes.ok) {
      const errText = await submitRes.text()
      throw new Error(`EvoLink submission failed (${submitRes.status}): ${errText.slice(0, 200)}`)
    }

    const submitData = await submitRes.json() as {
      id: string
      status: string
      output?: string | string[]
      error?: string
      cost?: number
      credits?: number
      credits_used?: number
      metrics?: { predict_time?: number; cost?: number }
    }

    await prisma.generationJob.update({ where: { id: jobId }, data: { providerTaskId: submitData.id } })

    // ── 7. Sync result or enqueue poll ────────────────────────────────────
    const syncDone = submitData.status === 'succeeded' || submitData.status === 'completed'
    if (syncDone) {
      const outputUrl = Array.isArray(submitData.output) ? submitData.output[0] : submitData.output
      if (!outputUrl) throw new Error('EvoLink sync succeeded but returned no output URL')

      const syncCostActual = submitData.cost
        ?? submitData.metrics?.cost
        ?? submitData.credits_used
        ?? submitData.credits
        ?? null

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

  // Re-decrypt EvoLink key from DB on each poll — never stored in queue payload
  const genJob = await prisma.generationJob.findUnique({ where: { id: jobId } })
  if (!genJob) return

  const evolinkCred = await prisma.apiCredential.findUnique({
    where: { userId_provider: { userId: genJob.userId, provider: 'evolink' } },
  })
  if (!evolinkCred?.encryptedKey) {
    const credMsg = 'EvoLink credential no longer available'
    await prisma.generationJob.update({ where: { id: jobId }, data: { status: 'failed', error: credMsg, outputRef: { rawError: credMsg } } })
    await notifyJobUpdate(jobId, 'failed')
    return
  }
  const evolinkKey = decrypt(evolinkCred.encryptedKey)

  const reenqueue = async () => {
    const delaySeconds = POLL_DELAYS[Math.min(pollCount, POLL_DELAYS.length - 1)]
    await getBoss().send('image.poll', { jobId, providerTaskId, pollCount: pollCount + 1 } satisfies ImagePollData, { startAfter: delaySeconds })
  }

  try {
    const response = await fetch(`https://api.eachlabs.ai/v1/prediction/${providerTaskId}`, {
      headers: { 'X-API-Key': evolinkKey },
    })

    if (!response.ok) {
      await reenqueue()
      return
    }

    const responseData = await response.json() as {
      status: string
      output?: string | string[]
      error?: string
      cost?: number
      credits?: number
      credits_used?: number
      metrics?: { predict_time?: number; cost?: number }
    }

    if (responseData.status === 'succeeded' || responseData.status === 'completed') {
      const outputUrl = Array.isArray(responseData.output) ? responseData.output[0] : responseData.output
      if (!outputUrl) {
        const noUrlMsg = 'No output URL from provider'
        await prisma.generationJob.update({ where: { id: jobId }, data: { status: 'failed', error: noUrlMsg, outputRef: { rawError: noUrlMsg } } })
        await notifyJobUpdate(jobId, 'failed')
        return
      }

      const costActual = responseData.cost
        ?? responseData.metrics?.cost
        ?? responseData.credits_used
        ?? responseData.credits
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

    } else if (responseData.status === 'failed' || responseData.status === 'error') {
      const errMsg = responseData.error ?? 'Provider reported failure'
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
