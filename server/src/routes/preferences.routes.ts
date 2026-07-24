import { Router } from 'express'
import { requireAuth } from '../middleware/auth.middleware.js'
import { prisma } from '../lib/prisma.js'
import { z } from 'zod'

export const preferencesRouter = Router()
preferencesRouter.use(requireAuth)

preferencesRouter.patch('/', async (req, res) => {
  const userId = res.locals.user.id
  const schema = z.object({
    defaultTextModel: z.string().optional(),
    defaultImageModel: z.string().optional(),
    imageStylePreset: z.string().optional(),
    contentRating: z.enum(['family', 'standard', 'grim']).optional(),
    measurementUnits: z.enum(['imperial', 'metric']).optional(),
    themePreference: z.string().optional(),
    imageModelByCategory: z.record(z.string()).optional(),
    textModelByTask: z.record(z.string()).optional(),
    softCapPerCall: z.number().min(0.01).max(50).optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message })
    return
  }
  const pref = await prisma.userPreference.upsert({
    where: { userId },
    update: parsed.data,
    create: { userId, ...parsed.data },
  })
  res.json({ preference: pref })
})

preferencesRouter.get('/', async (req, res) => {
  const userId = res.locals.user.id
  const pref = await prisma.userPreference.findUnique({ where: { userId } })
  res.json({ preference: pref })
})

// ── Full account export ───────────────────────────────────────────────────────

preferencesRouter.get('/export', async (req, res) => {
  const userId = res.locals.user.id

  const stripMeta = ({ campaignId, ownerUserId, createdAt, updatedAt, deletedAt, generationJobId, ...rest }: any) => rest

  const campaigns = await prisma.campaign.findMany({
    where: { ownerUserId: userId, deletedAt: null },
    include: {
      systemTemplate:       { select: { name: true } },
      npcs:                 { where: { deletedAt: null } },
      locations:            { where: { deletedAt: null } },
      items:                { where: { deletedAt: null } },
      factions:             { where: { deletedAt: null } },
      encounters:           { where: { deletedAt: null } },
      plotThreads:          { where: { deletedAt: null } },
      sessions:             true,
      parties:              true,
      playerCharacters:     { where: { deletedAt: null } },
      enemies:              { where: { isBuiltin: false } },
      relationships:        true,
      worldBuildingEntries: true,
      safetyTopics:         true,
      mapAssets:            { where: { deletedAt: null }, include: { pins: true } },
    },
  })

  const preference       = await prisma.userPreference.findUnique({ where: { userId } })
  const stylePresets     = await prisma.artStylePreset.findMany({ where: { ownerUserId: userId, isBuiltin: false } })
  const globalGenerators = await prisma.customGenerator.findMany({ where: { ownerUserId: userId, campaignId: null } })

  const exportedCampaigns = await Promise.all(campaigns.map(async (campaign) => {
    const campaignGenerators = await prisma.customGenerator.findMany({ where: { campaignId: campaign.id } })
    return {
      name:                  campaign.name,
      settingNotes:          campaign.settingNotes,
      themeId:               campaign.themeId,
      systemTemplateName:    (campaign as any).systemTemplate?.name ?? '',
      pitchElevator:         campaign.pitchElevator,
      pitchGenre:            campaign.pitchGenre,
      pitchLength:           campaign.pitchLength,
      pitchWhatIsNot:        campaign.pitchWhatIsNot,
      tonGrimHeroic:         campaign.tonGrimHeroic,
      tonGrittyCinematic:    campaign.tonGrittyCinematic,
      tonEpisodicSerialized: campaign.tonEpisodicSerialized,
      tonCombatRoleplay:     campaign.tonCombatRoleplay,
      contentRating:         campaign.contentRating,
      sessionToolsUsed:      campaign.sessionToolsUsed,
      tableCharter:          campaign.tableCharter,
      aiModel:               campaign.aiModel,

      parties:  campaign.parties.map((p: any) => stripMeta(p)),
      sessions: campaign.sessions.map((s: any) => stripMeta(s)),

      mapAssets: (campaign as any).mapAssets.map((m: any) => {
        const { imageAsset, imageAssetId, pins, ...rest } = stripMeta(m)
        return { ...rest, imageAssetId: null, pins: pins.map(({ mapAssetId, createdAt, updatedAt, ...pin }: any) => pin) }
      }),

      locations:    campaign.locations.map((l: any) => { const { imageAssetId, ...rest } = stripMeta(l); return { ...rest, imageAssetId: null } }),
      factions:     campaign.factions.map((f: any) => stripMeta(f)),
      npcs:         campaign.npcs.map((n: any) => { const { portraitAssetId, ...rest } = stripMeta(n); return { ...rest, portraitAssetId: null } }),
      items:        campaign.items.map((i: any) => { const { imageAssetId, ...rest } = stripMeta(i); return { ...rest, imageAssetId: null } }),
      encounters:   campaign.encounters.map((e: any) => stripMeta(e)),
      plotThreads:  campaign.plotThreads.map((p: any) => stripMeta(p)),
      enemies:      campaign.enemies.map((e: any) => { const { systemTemplateId, ...rest } = stripMeta(e); return rest }),
      playerCharacters: campaign.playerCharacters.map((pc: any) => {
        const { portraitAssetId, sheetAssetId, ...rest } = stripMeta(pc)
        return { ...rest, portraitAssetId: null, sheetAssetId: null }
      }),
      relationships:        campaign.relationships.map((r: any) => stripMeta(r)),
      worldBuildingEntries: campaign.worldBuildingEntries.map((w: any) => stripMeta(w)),
      safetyTopics:         campaign.safetyTopics.map((s: any) => stripMeta(s)),
      customGenerators:     campaignGenerators.map(({ ownerUserId, campaignId, createdAt, updatedAt, ...rest }: any) => rest),
    }
  }))

  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Content-Disposition', `attachment; filename="kt-account-export.json"`)
  res.json({
    version:          '1.0',
    exportedAt:       new Date().toISOString(),
    app:              'keepers-table',
    accountExport:    true,
    campaigns:        exportedCampaigns,
    preference:       preference ? (() => { const { userId, createdAt, updatedAt, id, ...rest } = preference as any; return rest })() : null,
    stylePresets:     stylePresets.map(({ ownerUserId, createdAt, updatedAt, previewAssetId, ...rest }: any) => rest),
    customGenerators: globalGenerators.map(({ ownerUserId, campaignId, createdAt, updatedAt, ...rest }: any) => rest),
  })
})
