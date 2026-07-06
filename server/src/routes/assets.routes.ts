import { Router } from 'express'
import multer from 'multer'
import { requireAuth } from '../middleware/auth.middleware.js'
import { prisma } from '../lib/prisma.js'
import { StorageService } from '../lib/storage.js'
import { getBoss } from '../lib/worker.js'
import { randomUUID } from 'crypto'

export const assetsRouter = Router()
assetsRouter.use(requireAuth)

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
    cb(null, allowed.includes(file.mimetype))
  },
})

// ── GET /api/assets/:assetId?size=thumb|preview|full ─────────────────────────

assetsRouter.get('/:assetId', async (req, res) => {
  const userId = res.locals.user.id
  const { assetId } = req.params
  const size = (req.query.size as string) ?? 'thumb'

  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    include: { campaign: { select: { ownerUserId: true } } },
  })

  if (!asset) {
    res.status(404).json({ error: 'Asset not found' })
    return
  }

  if (asset.campaign.ownerUserId !== userId) {
    res.status(403).json({ error: 'Forbidden' })
    return
  }

  let storageKey: string | null = null

  if (size === 'full') {
    storageKey = asset.storageKeyOriginal
  } else if (size === 'preview') {
    storageKey = asset.storageKeyPreview ?? asset.storageKeyThumb ?? asset.storageKeyOriginal
  } else {
    storageKey = asset.storageKeyThumb ?? asset.storageKeyOriginal
  }

  if (!storageKey) {
    res.status(404).json({ error: 'Requested rendition not available' })
    return
  }

  try {
    const buffer = await StorageService.get(storageKey)
    if (!buffer) {
      res.status(404).json({ error: 'Asset data not found in storage' })
      return
    }

    const contentType = storageKey.endsWith('.webp') ? 'image/webp' :
      storageKey.endsWith('.png') ? 'image/png' :
      storageKey.endsWith('.jpg') || storageKey.endsWith('.jpeg') ? 'image/jpeg' : 'image/png'

    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'private, max-age=3600')
    res.setHeader('Content-Length', buffer.length)
    res.end(buffer)
  } catch (err) {
    console.error('[GET /api/assets/:id] storage error:', err)
    res.status(500).json({ error: 'Failed to retrieve asset' })
  }
})

// ── DELETE /api/assets/:assetId ───────────────────────────────────────────────

assetsRouter.delete('/:assetId', async (req, res) => {
  const userId = res.locals.user.id
  const { assetId } = req.params

  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    include: { campaign: { select: { ownerUserId: true } } },
  })

  if (!asset || asset.campaign.ownerUserId !== userId) {
    res.status(404).json({ error: 'Asset not found or forbidden' })
    return
  }

  const keysToDelete = [
    asset.storageKeyOriginal,
    asset.storageKeyThumb,
    asset.storageKeyPreview,
  ].filter(Boolean) as string[]

  await Promise.allSettled(keysToDelete.map(k => StorageService.delete(k)))
  await prisma.asset.delete({ where: { id: assetId } })

  res.json({ ok: true })
})

// ── POST /api/campaigns/:campaignId/assets/upload ─────────────────────────────
// Mounted via app.use('/api/campaigns', campaignAssetsRouter)

export const campaignAssetsRouter = Router({ mergeParams: true })
campaignAssetsRouter.use(requireAuth)

campaignAssetsRouter.post('/:campaignId/assets/upload', upload.single('file'), async (req, res) => {
  const userId = res.locals.user.id
  const { campaignId } = req.params as { campaignId: string }

  const cId = campaignId
  const campaign = await prisma.campaign.findFirst({
    where: { id: cId, ownerUserId: userId },
  })
  if (!campaign) {
    res.status(403).json({ error: 'Campaign not found or forbidden' })
    return
  }

  if (!req.file) {
    res.status(400).json({ error: 'No file provided' })
    return
  }

  const assetId = randomUUID()
  const ext = req.file.mimetype.split('/')[1] ?? 'png'
  const entityType = (req.body.entityType as string) ?? 'upload'
  const entityId = (req.body.entityId as string) ?? ''
  const kind = (req.body.kind as string) ?? 'upload'

  const originalKey = StorageService.assetKey(cId, assetId, 'original', ext)
  await StorageService.put(originalKey, req.file.buffer, req.file.mimetype)

  const genJob = await prisma.generationJob.create({
    data: {
      userId,
      campaignId: cId,
      provider: 'upload',
      kind,
      status: 'queued',
      input: { entityType, entityId, kind },
    },
  })

  const asset = await prisma.asset.create({
    data: {
      id: assetId,
      campaignId: cId,
      kind,
      storageKeyOriginal: originalKey,
      source: 'uploaded',
      generationJobId: genJob.id,
    },
  })

  await getBoss().send('image.postprocess', {
    jobId: genJob.id,
    assetId: asset.id,
    campaignId: cId,
    entityType,
    entityId,
    kind,
  })

  res.json({ assetId: asset.id, jobId: genJob.id })
})
