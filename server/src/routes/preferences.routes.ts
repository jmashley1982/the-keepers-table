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

// ── Full account import ───────────────────────────────────────────────────────

preferencesRouter.post('/import', async (req, res) => {
  const userId = res.locals.user.id
  const body = req.body

  if (!body?.app || body.app !== 'keepers-table' || !body?.accountExport) {
    res.status(400).json({ error: 'Invalid export file — expected a keepers-table accountExport bundle' })
    return
  }

  const templates = await prisma.systemTemplate.findMany({ where: { isBuiltin: true } })
  if (!templates.length) {
    res.status(400).json({ error: 'No system templates available' })
    return
  }

  const importedCampaignIds: string[] = []

  // ── Import each campaign ────────────────────────────────────────────────────
  for (const src of (body.campaigns ?? [])) {
    const idMap: Record<string, string> = {}
    const remap = (id: string | null | undefined) => (id ? (idMap[id] ?? null) : null)

    const matchedTemplate = templates.find((t: any) => t.name === src.systemTemplateName) ?? templates[0]

    const campaign = await prisma.campaign.create({
      data: {
        name:                  src.name ? `${src.name} (imported)` : 'Imported Campaign',
        ownerUserId:           userId,
        systemTemplateId:      matchedTemplate.id,
        settingNotes:          src.settingNotes          ?? '',
        themeId:               src.themeId               ?? null,
        pitchElevator:         src.pitchElevator         ?? '',
        pitchGenre:            src.pitchGenre            ?? '',
        pitchLength:           src.pitchLength           ?? '',
        pitchWhatIsNot:        src.pitchWhatIsNot        ?? '',
        tonGrimHeroic:         src.tonGrimHeroic         ?? 50,
        tonGrittyCinematic:    src.tonGrittyCinematic    ?? 50,
        tonEpisodicSerialized: src.tonEpisodicSerialized ?? 50,
        tonCombatRoleplay:     src.tonCombatRoleplay     ?? 50,
        contentRating:         src.contentRating         ?? '',
        sessionToolsUsed:      src.sessionToolsUsed      ?? '',
        tableCharter:          src.tableCharter          ?? {},
        aiModel:               src.aiModel               ?? '',
      },
    })
    importedCampaignIds.push(campaign.id)

    // Parties
    for (const p of (src.parties ?? [])) {
      const created = await prisma.party.create({
        data: { campaignId: campaign.id, name: p.name ?? 'Party', characters: p.characters ?? [], activeConditions: p.activeConditions ?? '' },
      })
      idMap[p.id] = created.id
    }

    // Map Assets
    for (const m of (src.mapAssets ?? [])) {
      const created = await prisma.mapAsset.create({
        data: {
          campaignId: campaign.id, kind: m.kind ?? 'other', title: m.title ?? 'Untitled Map',
          imageUrl: null, thumbnailUrl: null, imageAssetId: null, altText: m.altText ?? null,
          width: m.width ?? null, height: m.height ?? null, source: m.source ?? 'uploaded',
          generationPrompt: m.generationPrompt ?? null, grid: m.grid ?? null,
        },
      })
      idMap[m.id] = created.id
    }

    // Locations (topo-sorted so parents come first)
    for (const l of topoSortLocations(src.locations ?? [])) {
      const created = await prisma.location.create({
        data: {
          campaignId: campaign.id, name: l.name ?? 'Unknown', description: l.description ?? '',
          imageUrl: null, imageAssetId: null, tags: l.tags ?? [], customFields: l.customFields ?? {},
          pinned: l.pinned ?? false, dmOnlyNotes: l.dmOnlyNotes ?? '', type: l.type ?? 'site',
          parentLocationId: remap(l.parentLocationId), mapAssetId: remap(l.mapAssetId),
          ambience: l.ambience ?? null, sortOrder: l.sortOrder ?? 0,
        },
      })
      idMap[l.id] = created.id
    }

    // Factions
    for (const f of (src.factions ?? [])) {
      const created = await prisma.faction.create({
        data: {
          campaignId: campaign.id, name: f.name ?? 'Unknown', description: f.description ?? '',
          tags: f.tags ?? [], customFields: f.customFields ?? {}, pinned: f.pinned ?? false,
          dmOnlyNotes: f.dmOnlyNotes ?? '', goals: f.goals ?? '', dispositionToParty: f.dispositionToParty ?? 'neutral',
          headquartersLocationId: remap(f.headquartersLocationId), sortOrder: f.sortOrder ?? 0,
        },
      })
      idMap[f.id] = created.id
    }

    // Sessions
    for (const s of (src.sessions ?? [])) {
      const created = await prisma.gameSession.create({
        data: {
          campaignId: campaign.id, partyId: remap(s.partyId), sessionNumber: s.sessionNumber ?? 1,
          title: s.title ?? null, datePlayed: s.datePlayed ? new Date(s.datePlayed) : null,
          status: s.status ?? 'complete', isSessionZero: s.isSessionZero ?? false,
          dmRawNotes: s.dmRawNotes ?? '', generatedSummary: s.generatedSummary ?? null,
          keyEvents: s.keyEvents ?? [], hooksForNext: s.hooksForNext ?? [], recapRead: s.recapRead ?? false,
        },
      })
      idMap[s.id] = created.id
    }

    // NPCs
    for (const n of (src.npcs ?? [])) {
      const created = await prisma.nPC.create({
        data: {
          campaignId: campaign.id, name: n.name ?? 'Unknown', description: n.description ?? '',
          imageUrl: null, portraitUrl: null, portraitAssetId: null, tags: n.tags ?? [],
          customFields: n.customFields ?? {}, pinned: n.pinned ?? false, dmOnlyNotes: n.dmOnlyNotes ?? '',
          role: n.role ?? '', appearance: n.appearance ?? '', personality: n.personality ?? '',
          motivations: n.motivations ?? '', secrets: n.secrets ?? '', voiceNotes: n.voiceNotes ?? '',
          statBlock: n.statBlock ?? {}, status: n.status ?? 'alive', dispositionToParty: n.dispositionToParty ?? 'neutral',
          locationId: remap(n.locationId), factionId: remap(n.factionId),
          firstSessionId: remap(n.firstSessionId), lastSeenSessionId: remap(n.lastSeenSessionId),
          sortOrder: n.sortOrder ?? 0,
        },
      })
      idMap[n.id] = created.id
    }

    // Items
    for (const i of (src.items ?? [])) {
      const created = await prisma.item.create({
        data: {
          campaignId: campaign.id, name: i.name ?? 'Unknown', description: i.description ?? '',
          imageUrl: null, imageAssetId: null, tags: i.tags ?? [], customFields: i.customFields ?? {},
          pinned: i.pinned ?? false, dmOnlyNotes: i.dmOnlyNotes ?? '', category: i.category ?? '',
          rarity: i.rarity ?? 'common', mechanicalEffect: i.mechanicalEffect ?? '',
          currentOwnerType: i.currentOwnerType ?? 'unclaimed', currentOwnerId: null,
          originSessionId: remap(i.originSessionId), sortOrder: i.sortOrder ?? 0,
        },
      })
      idMap[i.id] = created.id
    }

    // Encounters
    for (const e of (src.encounters ?? [])) {
      const created = await prisma.encounter.create({
        data: {
          campaignId: campaign.id, sessionId: remap(e.sessionId), name: e.name ?? 'Unknown',
          description: e.description ?? '', imageUrl: null, tags: e.tags ?? [],
          customFields: e.customFields ?? {}, pinned: e.pinned ?? false, dmOnlyNotes: e.dmOnlyNotes ?? '',
          type: e.type ?? 'combat', difficulty: e.difficulty ?? 'medium', setup: e.setup ?? '',
          tactics: e.tactics ?? '', twist: e.twist ?? '', scalingNotes: e.scalingNotes ?? '',
          participants: e.participants ?? [], locationId: remap(e.locationId), mapAssetId: remap(e.mapAssetId),
          outcome: e.outcome ?? null, sortOrder: e.sortOrder ?? 0,
        },
      })
      idMap[e.id] = created.id
    }

    // Plot Threads
    for (const p of (src.plotThreads ?? [])) {
      const created = await prisma.plotThread.create({
        data: {
          campaignId: campaign.id, title: p.title ?? 'Untitled', description: p.description ?? '',
          status: p.status ?? 'active', relatedEntities: remapRelatedEntities(p.relatedEntities ?? [], idMap),
          lastTouchedSessionId: remap(p.lastTouchedSessionId), sortOrder: p.sortOrder ?? 0,
        },
      })
      idMap[p.id] = created.id
    }

    // Enemies
    for (const e of (src.enemies ?? [])) {
      const created = await prisma.enemy.create({
        data: {
          campaignId: campaign.id, systemTemplateId: matchedTemplate.id,
          name: e.name ?? 'Unknown', description: e.description ?? '',
          enemyType: e.enemyType ?? '', size: e.size ?? '', cr: e.cr ?? null,
          statBlock: e.statBlock ?? {}, source: e.source ?? 'custom', isBuiltin: false, tags: e.tags ?? [],
        },
      })
      idMap[e.id] = created.id
    }

    // Player Characters
    for (const pc of (src.playerCharacters ?? [])) {
      const created = await prisma.playerCharacter.create({
        data: {
          campaignId: campaign.id, name: pc.name ?? 'Unknown', playerName: pc.playerName ?? '',
          race: pc.race ?? '', class: pc.class ?? '', playbook: pc.playbook ?? '',
          subclass: pc.subclass ?? '', level: pc.level ?? 1, background: pc.background ?? '',
          alignment: pc.alignment ?? '', appearance: pc.appearance ?? '', backstory: pc.backstory ?? '',
          notes: pc.notes ?? '', features: pc.features ?? '', bonds: pc.bonds ?? '',
          moves: pc.moves ?? '', abilityScores: pc.abilityScores ?? {}, combatStats: pc.combatStats ?? {},
          skills: pc.skills ?? {}, savingThrows: pc.savingThrows ?? {}, equipment: pc.equipment ?? [],
          xp: pc.xp ?? 0, sortOrder: pc.sortOrder ?? 0, portraitAssetId: null, sheetAssetId: null,
        },
      })
      idMap[pc.id] = created.id
    }

    // Campaign-scoped Custom Generators
    for (const g of (src.customGenerators ?? [])) {
      await prisma.customGenerator.create({
        data: {
          ownerUserId: userId, campaignId: campaign.id, name: g.name ?? 'Generator',
          icon: g.icon ?? '⚙️', description: g.description ?? '',
          outputEntityType: g.outputEntityType ?? 'freeform', promptTemplate: g.promptTemplate ?? '',
          inputFields: g.inputFields ?? [], generatesImage: g.generatesImage ?? false,
          imagePromptTemplate: g.imagePromptTemplate ?? null,
        },
      })
    }

    // World Building Entries
    for (const w of (src.worldBuildingEntries ?? [])) {
      await prisma.worldBuildingEntry.create({
        data: {
          campaignId: campaign.id, category: w.category ?? 'npc', name: w.name ?? 'Unknown',
          summary: w.summary ?? '', detail: w.detail ?? '',
          entityId: remap(w.entityId), entityType: w.entityType ?? null, sortOrder: w.sortOrder ?? 0,
        },
      })
    }

    // Safety Topics
    for (const t of (src.safetyTopics ?? [])) {
      await prisma.safetyTopic.create({
        data: { campaignId: campaign.id, topic: t.topic ?? '', isPreset: t.isPreset ?? false, gmSetting: t.gmSetting ?? null },
      })
    }

    // Entity Relationships
    for (const r of (src.relationships ?? [])) {
      const newA = remap(r.entityAId)
      const newB = remap(r.entityBId)
      if (!newA || !newB) continue
      await prisma.entityRelationship.create({
        data: {
          campaignId: campaign.id, entityAType: r.entityAType ?? '', entityAId: newA,
          entityBType: r.entityBType ?? '', entityBId: newB,
          relationshipType: r.relationshipType ?? '', notes: r.notes ?? '', bidirectional: r.bidirectional ?? true,
        },
      })
    }

    // Map Pins + back-patch map asset links
    for (const m of (src.mapAssets ?? [])) {
      const newMapId = idMap[m.id]
      if (!newMapId) continue
      for (const pin of (m.pins ?? [])) {
        await prisma.mapPin.create({
          data: {
            mapAssetId: newMapId, x: pin.x ?? 0, y: pin.y ?? 0,
            locationId: remap(pin.locationId), label: pin.label ?? '', icon: pin.icon ?? '📍',
            revealed: pin.revealed ?? false,
          },
        })
      }
      const linkedLoc = remap(m.linkedLocationId)
      const linkedEnc = remap(m.linkedEncounterId)
      if (linkedLoc || linkedEnc) {
        await prisma.mapAsset.update({
          where: { id: newMapId },
          data: { linkedLocationId: linkedLoc ?? undefined, linkedEncounterId: linkedEnc ?? undefined },
        })
      }
    }

    // Back-patch Party.currentLocationId
    for (const p of (src.parties ?? [])) {
      const newPartyId = idMap[p.id]
      const newLocId   = remap(p.currentLocationId)
      if (newPartyId && newLocId) {
        await prisma.party.update({ where: { id: newPartyId }, data: { currentLocationId: newLocId } })
      }
    }
  }

  // ── Restore UserPreference ──────────────────────────────────────────────────
  if (body.preference) {
    const {
      defaultTextModel, defaultImageModel, imageStylePreset, contentRating,
      measurementUnits, themePreference, imageModelByCategory, textModelByTask, softCapPerCall,
    } = body.preference
    await prisma.userPreference.upsert({
      where: { userId },
      update: {
        ...(defaultTextModel      !== undefined && { defaultTextModel }),
        ...(defaultImageModel     !== undefined && { defaultImageModel }),
        ...(imageStylePreset      !== undefined && { imageStylePreset }),
        ...(contentRating         !== undefined && { contentRating }),
        ...(measurementUnits      !== undefined && { measurementUnits }),
        ...(themePreference       !== undefined && { themePreference }),
        ...(imageModelByCategory  !== undefined && { imageModelByCategory }),
        ...(textModelByTask       !== undefined && { textModelByTask }),
        ...(softCapPerCall        !== undefined && { softCapPerCall }),
      },
      create: {
        userId,
        ...(defaultTextModel      !== undefined && { defaultTextModel }),
        ...(defaultImageModel     !== undefined && { defaultImageModel }),
        ...(imageStylePreset      !== undefined && { imageStylePreset }),
        ...(contentRating         !== undefined && { contentRating }),
        ...(measurementUnits      !== undefined && { measurementUnits }),
        ...(themePreference       !== undefined && { themePreference }),
        ...(imageModelByCategory  !== undefined && { imageModelByCategory }),
        ...(textModelByTask       !== undefined && { textModelByTask }),
        ...(softCapPerCall        !== undefined && { softCapPerCall }),
      },
    })
  }

  // ── Restore global Custom Generators ───────────────────────────────────────
  for (const g of (body.customGenerators ?? [])) {
    await prisma.customGenerator.create({
      data: {
        ownerUserId: userId, campaignId: null, name: g.name ?? 'Generator',
        icon: g.icon ?? '⚙️', description: g.description ?? '',
        outputEntityType: g.outputEntityType ?? 'freeform', promptTemplate: g.promptTemplate ?? '',
        inputFields: g.inputFields ?? [], generatesImage: g.generatesImage ?? false,
        imagePromptTemplate: g.imagePromptTemplate ?? null,
      },
    })
  }

  // ── Restore Art Style Presets ───────────────────────────────────────────────
  for (const p of (body.stylePresets ?? [])) {
    const name: string = p.name ?? 'Untitled Preset'
    // Skip if the user already has a preset with this name to avoid duplicates
    const existing = await prisma.artStylePreset.findFirst({
      where: { ownerUserId: userId, name },
    })
    if (!existing) {
      await prisma.artStylePreset.create({
        data: {
          ownerUserId:    userId,
          name,
          promptFragment: p.promptFragment ?? '',
          isBuiltin:      false,
          previewAssetId: null,
        },
      })
    }
  }

  res.json({ campaignIds: importedCampaignIds, count: importedCampaignIds.length })
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function topoSortLocations(locations: any[]): any[] {
  const result: any[] = []
  const processed = new Set<string>()
  const noParent = locations.filter(l => !l.parentLocationId)
  result.push(...noParent)
  noParent.forEach(l => processed.add(l.id))
  let remaining = locations.filter(l => l.parentLocationId)
  let guard = 0
  while (remaining.length > 0 && guard < 100) {
    guard++
    const batch = remaining.filter(l => processed.has(l.parentLocationId))
    if (batch.length === 0) { result.push(...remaining); break }
    result.push(...batch)
    batch.forEach(l => processed.add(l.id))
    remaining = remaining.filter(l => !processed.has(l.id))
  }
  return result
}

function remapRelatedEntities(entities: any[], idMap: Record<string, string>): any[] {
  return entities.map((e: any) => ({ ...e, id: e.id ? (idMap[e.id] ?? e.id) : undefined }))
}
