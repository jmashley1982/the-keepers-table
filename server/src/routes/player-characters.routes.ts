import { Router } from 'express'
import { requireAuth } from '../middleware/auth.middleware.js'
import { prisma } from '../lib/prisma.js'
import { z } from 'zod'
import { StorageService } from '../lib/storage.js'
import { decrypt } from '../lib/crypto.js'
import Anthropic from '@anthropic-ai/sdk'
import sharp from 'sharp'

export const playerCharactersRouter = Router({ mergeParams: true })
playerCharactersRouter.use(requireAuth)

async function verifyCampaign(campaignId: string, userId: string) {
  return prisma.campaign.findFirst({
    where: { id: campaignId, ownerUserId: userId, deletedAt: null },
  })
}

const pcSchema = z.object({
  name: z.string().min(1),
  playerName: z.string().optional(),
  race: z.string().optional(),
  playbook: z.string().optional(),
  subclass: z.string().optional(),
  level: z.number().int().min(1).max(30).optional(),
  background: z.string().optional(),
  alignment: z.string().optional(),
  appearance: z.string().optional(),
  backstory: z.string().optional(),
  notes: z.string().optional(),
  bonds: z.string().optional(),
  moves: z.string().optional(),
  abilityScores: z.record(z.unknown()).optional(),
  combatStats: z.record(z.unknown()).optional(),
  skills: z.record(z.unknown()).optional(),
  savingThrows: z.record(z.unknown()).optional(),
  equipment: z.array(z.string()).optional(),
  xp: z.number().int().min(0).optional(),
  portraitAssetId: z.string().nullable().optional(),
  sheetAssetId: z.string().nullable().optional(),
})

// LIST
playerCharactersRouter.get('/', async (req, res) => {
  const userId = res.locals.user.id
  const { campaignId } = req.params as { campaignId: string }
  const campaign = await verifyCampaign(campaignId, userId)
  if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return }
  const pcs = await prisma.playerCharacter.findMany({
    where: { campaignId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    include: { portraitAsset: { select: { id: true, altText: true, storageKeyThumb: true } } },
  })
  res.json({ playerCharacters: pcs })
})

// CREATE
playerCharactersRouter.post('/', async (req, res) => {
  const userId = res.locals.user.id
  const { campaignId } = req.params as { campaignId: string }
  const campaign = await verifyCampaign(campaignId, userId)
  if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return }
  const parsed = pcSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return }
  const pc = await prisma.playerCharacter.create({ data: { ...parsed.data, campaignId } })
  res.json({ playerCharacter: pc })
})

// GET ONE
playerCharactersRouter.get('/:pcId', async (req, res) => {
  const userId = res.locals.user.id
  const { campaignId, pcId } = req.params as { campaignId: string; pcId: string }
  const campaign = await verifyCampaign(campaignId, userId)
  if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return }
  const pc = await prisma.playerCharacter.findFirst({
    where: { id: pcId, campaignId, deletedAt: null },
    include: {
      portraitAsset: { select: { id: true, altText: true, storageKeyThumb: true } },
      sheetAsset: { select: { id: true, altText: true, storageKeyThumb: true } },
    },
  })
  if (!pc) { res.status(404).json({ error: 'Player character not found' }); return }
  res.json({ playerCharacter: pc })
})

// UPDATE
playerCharactersRouter.patch('/:pcId', async (req, res) => {
  const userId = res.locals.user.id
  const { campaignId, pcId } = req.params as { campaignId: string; pcId: string }
  const campaign = await verifyCampaign(campaignId, userId)
  if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return }
  const parsed = pcSchema.partial().safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message }); return }
  const pc = await prisma.playerCharacter.update({ where: { id: pcId }, data: parsed.data })
  res.json({ playerCharacter: pc })
})

// DELETE
playerCharactersRouter.delete('/:pcId', async (req, res) => {
  const userId = res.locals.user.id
  const { campaignId, pcId } = req.params as { campaignId: string; pcId: string }
  const campaign = await verifyCampaign(campaignId, userId)
  if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return }
  await prisma.playerCharacter.update({ where: { id: pcId }, data: { deletedAt: new Date() } })
  res.json({ ok: true })
})

// SHEET UPLOAD + CLAUDE VISION EXTRACTION
playerCharactersRouter.post('/:pcId/sheet-upload', async (req, res) => {
  const userId = res.locals.user.id
  const { campaignId, pcId } = req.params as { campaignId: string; pcId: string }
  const campaign = await verifyCampaign(campaignId, userId)
  if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return }
  const pc = await prisma.playerCharacter.findFirst({ where: { id: pcId, campaignId, deletedAt: null } })
  if (!pc) { res.status(404).json({ error: 'Player character not found' }); return }

  const bodySchema = z.object({
    imageData: z.string().min(1),
    mimeType: z.string().default('image/png'),
  })
  const parsed = bodySchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'imageData (base64) and mimeType required' }); return }

  try {
    const { imageData, mimeType } = parsed.data
    const imageBuffer = Buffer.from(imageData, 'base64')

    const asset = await prisma.asset.create({
      data: { campaignId, kind: 'sheet_upload', storageKeyOriginal: '', source: 'uploaded' },
    })
    const ext = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg'
      : mimeType.includes('webp') ? 'webp'
      : 'png'
    const storageKey = StorageService.assetKey(campaignId, asset.id, 'original', ext)
    await StorageService.put(storageKey, imageBuffer)
    await prisma.asset.update({ where: { id: asset.id }, data: { storageKeyOriginal: storageKey } })
    await prisma.playerCharacter.update({ where: { id: pcId }, data: { sheetAssetId: asset.id } })

    // Claude Vision extraction
    const anthropicCred = await prisma.apiCredential.findUnique({
      where: { userId_provider: { userId, provider: 'anthropic' } },
    })
    if (!anthropicCred?.encryptedKey) {
      res.json({ assetId: asset.id, extracted: null, warning: 'No Anthropic key — sheet saved but data not auto-extracted.' })
      return
    }

    const anthKey = decrypt(anthropicCred.encryptedKey)
    const client = new Anthropic({ apiKey: anthKey })

    const thumbBuffer = await sharp(imageBuffer)
      .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer()

    const extractMsg = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: thumbBuffer.toString('base64') },
          },
          {
            type: 'text',
            text: `You are extracting data from a TTRPG character sheet image. Extract every piece of information visible.

Return ONLY a valid JSON object (no markdown, no explanation):
{
  "name": "character name or null",
  "playerName": "player real name or null",
  "race": "race/ancestry/species or null",
  "playbook": "class/playbook/archetype or null",
  "subclass": "subclass/specialization or null",
  "level": integer or null,
  "background": "background/origin or null",
  "alignment": "alignment or null",
  "xp": integer or null,
  "appearance": "physical description or null",
  "backstory": "backstory/history or null",
  "bonds": "bonds/ideals/flaws/drives or null",
  "moves": "class features/moves/abilities/spells as text block or null",
  "equipment": ["item1", "item2"],
  "notes": "any other notable info or null",
  "abilityScores": {"str": int|null, "dex": int|null, "con": int|null, "int": int|null, "wis": int|null, "cha": int|null},
  "combatStats": {"hp": int|null, "maxHp": int|null, "tempHp": int|null, "ac": int|null, "armor": int|null, "initiative": int|null, "speed": "string or null", "proficiencyBonus": int|null, "damage": "dice string or null"},
  "skills": {},
  "savingThrows": {}
}`,
          },
        ],
      }],
    })

    const rawText = extractMsg.content[0].type === 'text' ? extractMsg.content[0].text.trim() : '{}'
    let extracted: Record<string, unknown> = {}
    try {
      const clean = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
      extracted = JSON.parse(clean)
    } catch {
      extracted = {}
    }

    res.json({ assetId: asset.id, extracted })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to process sheet'
    res.status(500).json({ error: msg })
  }
})
