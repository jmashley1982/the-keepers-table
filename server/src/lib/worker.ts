import { PgBoss } from 'pg-boss'
import type { Job } from 'pg-boss'
import { prisma } from './prisma.js'
import { StorageService } from './storage.js'
import sharp from 'sharp'

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
  evolinkKey: string
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
    const { jobId } = job.data
    console.log(`[image.generate] Processing job ${jobId}`)

    const genJob = await prisma.generationJob.findUnique({ where: { id: jobId } })
    if (!genJob) {
      console.error(`[image.generate] GenerationJob ${jobId} not found`)
      continue
    }

    await prisma.generationJob.update({
      where: { id: jobId },
      data: { status: 'running' },
    })
  }
}

async function handleImagePoll(jobs: Job<ImagePollData>[]): Promise<void> {
  for (const job of jobs) {
    await processImagePoll(job.data)
  }
}

async function processImagePoll(data: ImagePollData): Promise<void> {
  const { jobId, providerTaskId, evolinkKey, pollCount = 0 } = data
  console.log(`[image.poll] Polling job ${jobId}, task ${providerTaskId}, attempt ${pollCount + 1}`)

  const MAX_POLL_ATTEMPTS = 24
  const POLL_DELAYS = [5, 10, 20, 30, 30, 30]

  if (pollCount >= MAX_POLL_ATTEMPTS) {
    await prisma.generationJob.update({
      where: { id: jobId },
      data: { status: 'failed', error: 'Image generation timed out after 10 minutes' },
    })
    await notifyJobUpdate(jobId, 'failed')
    return
  }

  try {
    const response = await fetch(`https://api.eachlabs.ai/v1/prediction/${providerTaskId}`, {
      headers: { 'X-API-Key': evolinkKey },
    })

    if (!response.ok) {
      const delaySeconds = POLL_DELAYS[Math.min(pollCount, POLL_DELAYS.length - 1)]
      await getBoss().send('image.poll', { jobId, providerTaskId, evolinkKey, pollCount: pollCount + 1 }, { startAfter: delaySeconds })
      return
    }

    const responseData = await response.json() as { status: string; output?: string | string[]; error?: string }

    if (responseData.status === 'succeeded' || responseData.status === 'completed') {
      const outputUrl = Array.isArray(responseData.output) ? responseData.output[0] : responseData.output
      if (!outputUrl) {
        await prisma.generationJob.update({ where: { id: jobId }, data: { status: 'failed', error: 'No output URL from provider' } })
        await notifyJobUpdate(jobId, 'failed')
        return
      }

      const genJob = await prisma.generationJob.findUnique({ where: { id: jobId } })
      if (!genJob) return

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
      await prisma.generationJob.update({ where: { id: jobId }, data: { status: 'failed', error: errMsg } })
      await notifyJobUpdate(jobId, 'failed')

    } else {
      const delaySeconds = POLL_DELAYS[Math.min(pollCount, POLL_DELAYS.length - 1)]
      await getBoss().send('image.poll', { jobId, providerTaskId, evolinkKey, pollCount: pollCount + 1 }, { startAfter: delaySeconds })
    }

  } catch (err) {
    const delaySeconds = POLL_DELAYS[Math.min(pollCount, POLL_DELAYS.length - 1)]
    await getBoss().send('image.poll', { jobId, providerTaskId, evolinkKey, pollCount: pollCount + 1 }, { startAfter: delaySeconds })
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

    await prisma.asset.update({
      where: { id: assetId },
      data: {
        storageKeyOriginal: originalKey,
        storageKeyThumb: thumbKey,
        storageKeyPreview: previewKey,
        width,
        height,
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
    await prisma.generationJob.update({ where: { id: jobId }, data: { status: 'failed', error: msg } })
    await notifyJobUpdate(jobId, 'failed')
  }
}

async function attachAssetToEntity(assetId: string, entityType: string, entityId: string, kind: string): Promise<void> {
  if (!entityId || !entityType) return

  if (entityType === 'npc' || kind === 'portrait_npc') {
    await prisma.nPC.update({ where: { id: entityId }, data: { portraitAssetId: assetId } }).catch(() => {})
  } else if (entityType === 'location' || kind === 'location_art') {
    await prisma.location.update({ where: { id: entityId }, data: { imageAssetId: assetId } }).catch(() => {})
  } else if (entityType === 'item' || kind === 'item_art') {
    await prisma.item.update({ where: { id: entityId }, data: { imageAssetId: assetId } }).catch(() => {})
  } else if (kind.startsWith('map_') && entityId) {
    await prisma.mapAsset.update({ where: { id: entityId }, data: { imageAssetId: assetId } }).catch(() => {})
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
