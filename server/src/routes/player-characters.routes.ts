import { Router } from 'express'
import { requireAuth } from '../middleware/auth.middleware.js'
import { prisma } from '../lib/prisma.js'
import { z } from 'zod'
import multer from 'multer'
import Anthropic from '@anthropic-ai/sdk'
import { decrypt } from '../lib/crypto.js'
import { StorageService } from '../lib/storage.js'
import type { Prisma } from '@prisma/client'

export const playerCharactersRouter = Router()
playerCharactersRouter.use(requireAuth)

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

async function verifyCampaign(campaignId: string, userId: string) {
  return prisma.campaign.findFirst({
    where: { id: campaignId, ownerUserId: userId, deletedAt: null },
  })
}

async function getAnthropicClient(userId: string): Promise<Anthropic | null> {
  const anthropicCred = await prisma.apiCredential.findUnique({
    where: { userId_provider: { userId, provider: 'anthropic' } },
  })
  if (anthropicCred?.encryptedKey) {
    try {
      const key = decrypt(anthropicCred.encryptedKey)
      return new Anthropic({ apiKey: key })
    } catch { /* fall through */ }
  }
  const evolinkCred = await prisma.apiCredential.findUnique({
    where: { userId_provider: { userId, provider: 'evolink' } },
  })
  if (evolinkCred?.encryptedKey) {
    try {
      const key = decrypt(evolinkCred.encryptedKey)
      return new Anthropic({ apiKey: key, baseURL: 'https://api.evolink.ai/v1' })
    } catch { return null }
  }
  return null
}

const pcCreateSchema = z.object({
  name: z.string().min(1),
  playerName: z.string().optional(),
  race: z.string().optional(),
  class: z.string().optional(),
  subclass: z.string().optional(),
  level: z.number().int().min(1).max(20).optional(),

  background: z.string().optional(),
  alignment: z.string().optional(),
  appearance: z.string().optional(),
  backstory: z.string().optional(),
  notes: z.string().optional(),
  features: z.string().optional(),

  abilityScores: z.record(z.unknown()).optional(),
  combatStats: z.record(z.unknown()).optional(),
  skills: z.record(z.unknown()).optional(),
  savingThrows: z.record(z.unknown()).optional(),
  equipment: z.array(z.string()).optional(),
  portraitAssetId: z.string().nullable().optional(),
  sheetAssetId: z.string().nullable().optional(),
})

const pcUpdateSchema = pcCreateSchema.partial()

// ── GET list ──────────────────────────────────────────────────────────────────

playerCharactersRouter.get('/:campaignId/player-characters', async (req, res) => {
  const userId = res.locals.user.id
  const campaignId = req.params.campaignId as string
  const campaign = await verifyCampaign(campaignId, userId)
  if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return }

  const items = await prisma.playerCharacter.findMany({
    where: { campaignId, deletedAt: null },
    orderBy: { updatedAt: 'desc' },
    include: {
      portraitAsset: { select: { id: true, altText: true } },
    },
  })
  res.json({ items })
})

// ── POST create ───────────────────────────────────────────────────────────────

playerCharactersRouter.post('/:campaignId/player-characters', async (req, res) => {
  const userId = res.locals.user.id
  const campaignId = req.params.campaignId as string
  const campaign = await verifyCampaign(campaignId, userId)
  if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return }

  const parsed = pcCreateSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return }

  const { abilityScores, combatStats, skills, savingThrows, equipment, ...rest } = parsed.data

  const item = await prisma.playerCharacter.create({
    data: {
      ...rest,
      campaignId,
      ...(abilityScores !== undefined ? { abilityScores: abilityScores as Prisma.InputJsonValue } : {}),
      ...(combatStats !== undefined ? { combatStats: combatStats as Prisma.InputJsonValue } : {}),
      ...(skills !== undefined ? { skills: skills as Prisma.InputJsonValue } : {}),
      ...(savingThrows !== undefined ? { savingThrows: savingThrows as Prisma.InputJsonValue } : {}),
      ...(equipment !== undefined ? { equipment: equipment as Prisma.InputJsonValue } : {}),
    },
  })
  res.json({ item })
})

// ── GET single ────────────────────────────────────────────────────────────────

playerCharactersRouter.get('/:campaignId/player-characters/:pcId', async (req, res) => {
  const userId = res.locals.user.id
  const campaignId = req.params.campaignId as string
  const pcId = req.params.pcId as string
  const campaign = await verifyCampaign(campaignId, userId)
  if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return }

  const item = await prisma.playerCharacter.findFirst({
    where: { id: pcId, campaignId, deletedAt: null },
    include: {
      portraitAsset: { select: { id: true, altText: true } },
      sheetAsset: { select: { id: true } },
    },
  })
  if (!item) { res.status(404).json({ error: 'Not found' }); return }
  res.json({ item })
})

// ── PATCH update ──────────────────────────────────────────────────────────────

playerCharactersRouter.patch('/:campaignId/player-characters/:pcId', async (req, res) => {
  const userId = res.locals.user.id
  const campaignId = req.params.campaignId as string
  const pcId = req.params.pcId as string
  const campaign = await verifyCampaign(campaignId, userId)
  if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return }

  const existing = await prisma.playerCharacter.findFirst({ where: { id: pcId, campaignId, deletedAt: null } })
  if (!existing) { res.status(404).json({ error: 'Player character not found' }); return }

  const parsed = pcUpdateSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return }

  const { abilityScores, combatStats, skills, savingThrows, equipment, portraitAssetId, sheetAssetId, ...rest } = parsed.data

  const item = await prisma.playerCharacter.update({
    where: { id: pcId },
    data: {
      ...rest,
      ...(portraitAssetId !== undefined ? { portraitAssetId } : {}),
      ...(sheetAssetId !== undefined ? { sheetAssetId } : {}),
      ...(abilityScores !== undefined ? { abilityScores: abilityScores as Prisma.InputJsonValue } : {}),
      ...(combatStats !== undefined ? { combatStats: combatStats as Prisma.InputJsonValue } : {}),
      ...(skills !== undefined ? { skills: skills as Prisma.InputJsonValue } : {}),
      ...(savingThrows !== undefined ? { savingThrows: savingThrows as Prisma.InputJsonValue } : {}),
      ...(equipment !== undefined ? { equipment: equipment as Prisma.InputJsonValue } : {}),
    },
  })
  res.json({ item })
})

// ── DELETE (soft) ─────────────────────────────────────────────────────────────

playerCharactersRouter.delete('/:campaignId/player-characters/:pcId', async (req, res) => {
  const userId = res.locals.user.id
  const campaignId = req.params.campaignId as string
  const pcId = req.params.pcId as string
  const campaign = await verifyCampaign(campaignId, userId)
  if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return }

  const existing = await prisma.playerCharacter.findFirst({ where: { id: pcId, campaignId, deletedAt: null } })
  if (!existing) { res.status(404).json({ error: 'Player character not found' }); return }

  await prisma.playerCharacter.update({ where: { id: pcId }, data: { deletedAt: new Date() } })
  res.json({ ok: true })
})

// ── POST sheet upload + Claude Vision extraction ──────────────────────────────

const SHEET_EXTRACT_PROMPT = `You are a D&D character sheet parser. Analyze this character sheet image and extract all available information. Return ONLY valid JSON with no prose or markdown.

Extract these fields (omit fields you cannot find, use null for missing numbers):
{
  "name": "character name",
  "playerName": "player name if visible",
  "race": "race/species",
  "class": "class",
  "subclass": "subclass if visible",
  "level": <number or null>,
  "background": "background",
  "alignment": "alignment",
  "appearance": "physical description if visible",
  "backstory": "backstory/personality if visible",
  "abilityScores": { "str": <num>, "dex": <num>, "con": <num>, "int": <num>, "wis": <num>, "cha": <num> },
  "combatStats": {
    "hp": <num>,
    "maxHp": <num>,
    "tempHp": <num>,
    "ac": <num>,
    "initiative": <num>,
    "speed": <num>,
    "proficiencyBonus": <num>,
    "inspiration": <boolean>
  },
  "savingThrows": { "str": <num>, "dex": <num>, "con": <num>, "int": <num>, "wis": <num>, "cha": <num> },
  "skills": { "acrobatics": <num>, "animalHandling": <num>, "arcana": <num>, "athletics": <num>, "deception": <num>, "history": <num>, "insight": <num>, "intimidation": <num>, "investigation": <num>, "medicine": <num>, "nature": <num>, "perception": <num>, "performance": <num>, "persuasion": <num>, "religion": <num>, "sleightOfHand": <num>, "stealth": <num>, "survival": <num> },
  "equipment": ["item1", "item2"],
  "features": "features and traits text",
  "notes": "any other notes"
}`

playerCharactersRouter.post(
  '/:campaignId/player-characters/:pcId/sheet-upload',
  upload.single('sheet'),
  async (req, res) => {
    const userId = res.locals.user.id
    const campaignId = req.params.campaignId as string
    const pcId = req.params.pcId as string
    const campaign = await verifyCampaign(campaignId, userId)
    if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return }

    const pc = await prisma.playerCharacter.findFirst({ where: { id: pcId, campaignId, deletedAt: null } })
    if (!pc) { res.status(404).json({ error: 'Player character not found' }); return }

    if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return }

    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp']
    if (!allowedTypes.includes(req.file.mimetype)) {
      res.status(400).json({ error: 'Only PNG, JPEG, or WebP images are allowed' }); return
    }

    const client = await getAnthropicClient(userId)
    if (!client) { res.status(402).json({ error: 'No Anthropic or Evolink API key configured' }); return }

    const asset = await prisma.asset.create({
      data: {
        campaignId,
        kind: 'sheet_upload',
        storageKeyOriginal: '',
        source: 'uploaded',
      },
    })

    const ext = req.file.mimetype === 'image/png' ? 'png' : req.file.mimetype === 'image/webp' ? 'webp' : 'jpg'
    const storageKey = StorageService.uploadKey(campaignId, asset.id, `sheet.${ext}`)
    await StorageService.put(storageKey, req.file.buffer, req.file.mimetype)
    await prisma.asset.update({ where: { id: asset.id }, data: { storageKeyOriginal: storageKey } })

    const mediaType = req.file.mimetype as 'image/png' | 'image/jpeg' | 'image/webp'
    const base64 = req.file.buffer.toString('base64')

    let extracted: Record<string, unknown> = {}
    let extractionFailed = false
    try {
      const msg = await client.messages.create({
        model: 'claude-opus-4-5',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: SHEET_EXTRACT_PROMPT },
          ],
        }],
      })
      const raw = msg.content[0].type === 'text' ? msg.content[0].text : ''
      const match = raw.match(/\{[\s\S]*\}/)
      if (match) {
        extracted = JSON.parse(match[0]) as Record<string, unknown>
      }
    } catch (err) {
      console.error('[sheet-upload] Vision extraction failed:', err instanceof Error ? err.message : err)
      extractionFailed = true
    }

    const meaningfulKeys = Object.keys(extracted).filter(k => {
      const v = extracted[k]
      if (v === null || v === undefined || v === '') return false
      if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0) return false
      if (Array.isArray(v) && (v as unknown[]).length === 0) return false
      return true
    })
    if (!extractionFailed && meaningfulKeys.length === 0) {
      extractionFailed = true
    }

    res.json({ assetId: asset.id, extracted, extractionFailed })
  }
)

