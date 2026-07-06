import { Router } from 'express'
import { requireAuth } from '../middleware/auth.middleware.js'
import { prisma } from '../lib/prisma.js'
import { StorageService } from '../lib/storage.js'
import { z } from 'zod'
import sharp from 'sharp'

export const mapsRouter = Router({ mergeParams: true })
mapsRouter.use(requireAuth)

async function verifyCampaign(campaignId: string, userId: string) {
  return prisma.campaign.findFirst({ where: { id: campaignId, ownerUserId: userId, deletedAt: null } })
}

interface GridSettings {
  cellSize: number
  offsetX?: number
  offsetY?: number
  color?: string
  opacity?: number
}

function buildGridSvg(width: number, height: number, grid: GridSettings): Buffer {
  const { cellSize, offsetX = 0, offsetY = 0, color = '#ffffff', opacity = 0.4 } = grid
  const safeOpacity = Math.max(0, Math.min(1, opacity))
  const safeX = ((offsetX % cellSize) + cellSize) % cellSize
  const safeY = ((offsetY % cellSize) + cellSize) % cellSize
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <pattern id="grid" x="${safeX}" y="${safeY}" width="${cellSize}" height="${cellSize}" patternUnits="userSpaceOnUse">
      <path d="M ${cellSize} 0 L 0 0 0 ${cellSize}" fill="none" stroke="${color}" stroke-width="1" stroke-opacity="${safeOpacity}"/>
    </pattern>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#grid)"/>
</svg>`
  return Buffer.from(svg)
}

// GET /api/campaigns/:campaignId/maps
mapsRouter.get('/', async (req, res) => {
  const userId = res.locals.user.id
  const { campaignId } = req.params as { campaignId: string }
  const kind = req.query.kind as string | undefined

  const campaign = await verifyCampaign(campaignId, userId)
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }

  const items = await prisma.mapAsset.findMany({
    where: { campaignId, deletedAt: null, ...(kind ? { kind } : {}) },
    include: {
      imageAsset: { select: { id: true, storageKeyThumb: true, storageKeyPreview: true, width: true, height: true } },
      _count: { select: { pins: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  res.json({ items })
})

// GET /api/campaigns/:campaignId/maps/:mapId
mapsRouter.get('/:mapId', async (req, res) => {
  const userId = res.locals.user.id
  const { campaignId, mapId } = req.params as { campaignId: string; mapId: string }

  const campaign = await verifyCampaign(campaignId, userId)
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }

  const map = await prisma.mapAsset.findFirst({
    where: { id: mapId, campaignId, deletedAt: null },
    include: {
      imageAsset: { select: { id: true, storageKeyThumb: true, storageKeyPreview: true, width: true, height: true } },
      _count: { select: { pins: true } },
    },
  })
  if (!map) { res.status(404).json({ error: 'Map not found' }); return }
  res.json({ map })
})

// POST /api/campaigns/:campaignId/maps
mapsRouter.post('/', async (req, res) => {
  const userId = res.locals.user.id
  const { campaignId } = req.params as { campaignId: string }

  const campaign = await verifyCampaign(campaignId, userId)
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }

  const schema = z.object({
    title: z.string().min(1),
    kind: z.enum(['battle', 'region', 'world', 'other']).default('battle'),
    source: z.enum(['generated', 'uploaded']).default('generated'),
    generationPrompt: z.string().optional(),
    linkedLocationId: z.string().optional(),
    linkedEncounterId: z.string().optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return }

  const map = await prisma.mapAsset.create({ data: { ...parsed.data, campaignId } })
  res.json({ map })
})

// PATCH /api/campaigns/:campaignId/maps/:mapId
mapsRouter.patch('/:mapId', async (req, res) => {
  const userId = res.locals.user.id
  const { campaignId, mapId } = req.params as { campaignId: string; mapId: string }

  const campaign = await verifyCampaign(campaignId, userId)
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }

  const schema = z.object({
    title: z.string().min(1).optional(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    grid: z.any().optional(),
    linkedLocationId: z.string().nullable().optional(),
    linkedEncounterId: z.string().nullable().optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return }

  const existing = await prisma.mapAsset.findFirst({ where: { id: mapId, campaignId, deletedAt: null } })
  if (!existing) { res.status(404).json({ error: 'Map not found' }); return }

  const map = await prisma.mapAsset.update({ where: { id: mapId }, data: parsed.data })
  res.json({ map })
})

// DELETE /api/campaigns/:campaignId/maps/:mapId
mapsRouter.delete('/:mapId', async (req, res) => {
  const userId = res.locals.user.id
  const { campaignId, mapId } = req.params as { campaignId: string; mapId: string }

  const campaign = await verifyCampaign(campaignId, userId)
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }

  const existing = await prisma.mapAsset.findFirst({ where: { id: mapId, campaignId, deletedAt: null } })
  if (!existing) { res.status(404).json({ error: 'Map not found' }); return }

  await prisma.mapAsset.update({ where: { id: mapId }, data: { deletedAt: new Date() } })
  res.json({ ok: true })
})

// POST /api/campaigns/:campaignId/maps/:mapId/bake-grid
mapsRouter.post('/:mapId/bake-grid', async (req, res) => {
  const userId = res.locals.user.id
  const { campaignId, mapId } = req.params as { campaignId: string; mapId: string }

  const campaign = await verifyCampaign(campaignId, userId)
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }

  const schema = z.object({
    grid: z.object({
      cellSize: z.number().min(5).max(500),
      offsetX: z.number().default(0),
      offsetY: z.number().default(0),
      color: z.string().default('#ffffff'),
      opacity: z.number().min(0).max(1).default(0.4),
    }),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return }

  const map = await prisma.mapAsset.findFirst({
    where: { id: mapId, campaignId, deletedAt: null },
    include: { imageAsset: true },
  })
  if (!map?.imageAsset) { res.status(404).json({ error: 'Map has no image to bake' }); return }

  try {
    const imageBuffer = await StorageService.get(map.imageAsset.storageKeyOriginal)
    if (!imageBuffer) { res.status(404).json({ error: 'Image data not found in storage' }); return }

    const metadata = await sharp(imageBuffer).metadata()
    const width = metadata.width ?? 1024
    const height = metadata.height ?? 1024

    const svgBuffer = buildGridSvg(width, height, parsed.data.grid)
    const outBuffer = await sharp(imageBuffer)
      .composite([{ input: svgBuffer, blend: 'over' }])
      .png()
      .toBuffer()

    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Content-Disposition', `attachment; filename="${map.title.replace(/[^a-z0-9]/gi, '_')}_grid.png"`)
    res.end(outBuffer)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Bake failed'
    res.status(500).json({ error: msg })
  }
})

// ── Pin endpoints ─────────────────────────────────────────────────────────────

// GET /api/campaigns/:campaignId/maps/:mapId/pins
mapsRouter.get('/:mapId/pins', async (req, res) => {
  const userId = res.locals.user.id
  const { campaignId, mapId } = req.params as { campaignId: string; mapId: string }

  const campaign = await verifyCampaign(campaignId, userId)
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }

  const map = await prisma.mapAsset.findFirst({ where: { id: mapId, campaignId, deletedAt: null } })
  if (!map) { res.status(404).json({ error: 'Map not found' }); return }

  const pins = await prisma.mapPin.findMany({
    where: { mapAssetId: mapId },
    include: {
      location: { select: { id: true, name: true, type: true, description: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
  res.json({ pins })
})

// POST /api/campaigns/:campaignId/maps/:mapId/pins
mapsRouter.post('/:mapId/pins', async (req, res) => {
  const userId = res.locals.user.id
  const { campaignId, mapId } = req.params as { campaignId: string; mapId: string }

  const campaign = await verifyCampaign(campaignId, userId)
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }

  const map = await prisma.mapAsset.findFirst({ where: { id: mapId, campaignId, deletedAt: null } })
  if (!map) { res.status(404).json({ error: 'Map not found' }); return }

  const schema = z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    locationId: z.string().optional().nullable(),
    label: z.string().default(''),
    icon: z.string().default('📍'),
    revealed: z.boolean().default(false),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return }

  if (parsed.data.locationId) {
    const loc = await prisma.location.findFirst({
      where: { id: parsed.data.locationId, campaignId, deletedAt: null },
    })
    if (!loc) { res.status(400).json({ error: 'Location not found in this campaign' }); return }
  }

  const pin = await prisma.mapPin.create({
    data: { ...parsed.data, mapAssetId: mapId },
    include: { location: { select: { id: true, name: true, type: true, description: true } } },
  })
  res.json({ pin })
})

// PATCH /api/campaigns/:campaignId/maps/:mapId/pins/:pinId
mapsRouter.patch('/:mapId/pins/:pinId', async (req, res) => {
  const userId = res.locals.user.id
  const { campaignId, mapId, pinId } = req.params as { campaignId: string; mapId: string; pinId: string }

  const campaign = await verifyCampaign(campaignId, userId)
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }

  const existing = await prisma.mapPin.findFirst({
    where: { id: pinId, mapAsset: { id: mapId, campaignId } },
  })
  if (!existing) { res.status(404).json({ error: 'Pin not found' }); return }

  const schema = z.object({
    x: z.number().min(0).max(1).optional(),
    y: z.number().min(0).max(1).optional(),
    locationId: z.string().nullable().optional(),
    label: z.string().optional(),
    icon: z.string().optional(),
    revealed: z.boolean().optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return }

  if (parsed.data.locationId) {
    const loc = await prisma.location.findFirst({
      where: { id: parsed.data.locationId, campaignId, deletedAt: null },
    })
    if (!loc) { res.status(400).json({ error: 'Location not found in this campaign' }); return }
  }

  const pin = await prisma.mapPin.update({
    where: { id: pinId },
    data: parsed.data,
    include: { location: { select: { id: true, name: true, type: true, description: true } } },
  })
  res.json({ pin })
})

// DELETE /api/campaigns/:campaignId/maps/:mapId/pins/:pinId
mapsRouter.delete('/:mapId/pins/:pinId', async (req, res) => {
  const userId = res.locals.user.id
  const { campaignId, mapId, pinId } = req.params as { campaignId: string; mapId: string; pinId: string }

  const campaign = await verifyCampaign(campaignId, userId)
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }

  const existing = await prisma.mapPin.findFirst({
    where: { id: pinId, mapAsset: { id: mapId, campaignId } },
  })
  if (!existing) { res.status(404).json({ error: 'Pin not found' }); return }

  await prisma.mapPin.delete({ where: { id: pinId } })
  res.json({ ok: true })
})
