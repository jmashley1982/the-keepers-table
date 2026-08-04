import { Router } from 'express'
import { requireAuth } from '../middleware/auth.middleware.js'
import { prisma } from '../lib/prisma.js'
import { z } from 'zod'

export const campaignsRouter = Router()
campaignsRouter.use(requireAuth)

campaignsRouter.get('/', async (req, res) => {
  const userId = res.locals.user.id
  const campaigns = await prisma.campaign.findMany({
    where: { ownerUserId: userId, deletedAt: null },
    include: {
      systemTemplate: { select: { id: true, name: true } },
      parties: { take: 1 },
      _count: { select: { npcs: true, sessions: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })
  res.json({ campaigns })
})

campaignsRouter.post('/', async (req, res) => {
  const schema = z.object({
    name: z.string().min(1).max(120),
    systemTemplateId: z.string(),
    settingNotes: z.string().optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message })
    return
  }
  const userId = res.locals.user.id
  const campaign = await prisma.campaign.create({
    data: { ...parsed.data, ownerUserId: userId },
    include: { systemTemplate: true },
  })
  res.json({ campaign })
})

campaignsRouter.get('/:id', async (req, res) => {
  const userId = res.locals.user.id
  const campaign = await prisma.campaign.findFirst({
    where: { id: req.params.id, ownerUserId: userId, deletedAt: null },
    include: {
      systemTemplate: true,
      parties: true,
      _count: { select: { npcs: true, items: true, locations: true, sessions: true, encounters: true } },
    },
  })
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' })
    return
  }
  res.json({ campaign })
})

campaignsRouter.patch('/:id', async (req, res) => {
  const userId = res.locals.user.id
  const schema = z.object({
    name: z.string().min(1).max(120).optional(),
    settingNotes: z.string().optional(),
    systemTemplateId: z.string().optional(),
    archived: z.boolean().optional(),
    themeId: z.string().optional(),
    aiModel: z.string().optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message })
    return
  }
  const campaign = await prisma.campaign.findFirst({
    where: { id: req.params.id, ownerUserId: userId },
  })
  if (!campaign) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  const updated = await prisma.campaign.update({
    where: { id: req.params.id },
    data: parsed.data,
  })
  res.json({ campaign: updated })
})

campaignsRouter.delete('/:id', async (req, res) => {
  const userId = res.locals.user.id
  await prisma.campaign.updateMany({
    where: { id: req.params.id, ownerUserId: userId },
    data: { deletedAt: new Date() },
  })
  res.json({ ok: true })
})

// ── Export ────────────────────────────────────────────────────────────────────

campaignsRouter.get('/:id/export', async (req, res) => {
  const userId = res.locals.user.id
  const campaign = await prisma.campaign.findFirst({
    where: { id: req.params.id, ownerUserId: userId, deletedAt: null },
    include: {
      systemTemplate: { select: { name: true } },
      npcs:             { where: { deletedAt: null } },
      locations:        { where: { deletedAt: null } },
      items:            { where: { deletedAt: null } },
      factions:         { where: { deletedAt: null } },
      encounters:       { where: { deletedAt: null } },
      plotThreads:      { where: { deletedAt: null } },
      sessions:         true,
      parties:          true,
      playerCharacters: { where: { deletedAt: null } },
      enemies:          { where: { isBuiltin: false } },
      relationships:    true,
      worldBuildingEntries: true,
      safetyTopics:     true,
      mapAssets:        { where: { deletedAt: null }, include: { pins: true } },
    },
  })
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }

  // Keep original IDs so relationships can be reconstructed on import.
  // Strip campaign-/user-scoped fields and binary asset references.
  const stripMeta = ({ campaignId, ownerUserId, createdAt, updatedAt, deletedAt, generationJobId, ...rest }: any) => rest

  const payload = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    app: 'keepers-table',
    campaign: {
      name:              campaign.name,
      settingNotes:      campaign.settingNotes,
      themeId:           campaign.themeId,
      systemTemplateName: (campaign as any).systemTemplate?.name ?? '',
      pitchElevator:     campaign.pitchElevator,
      pitchGenre:        campaign.pitchGenre,
      pitchLength:       campaign.pitchLength,
      pitchWhatIsNot:    campaign.pitchWhatIsNot,
      tonGrimHeroic:     campaign.tonGrimHeroic,
      tonGrittyCinematic: campaign.tonGrittyCinematic,
      tonEpisodicSerialized: campaign.tonEpisodicSerialized,
      tonCombatRoleplay: campaign.tonCombatRoleplay,
      contentRating:     campaign.contentRating,
      sessionToolsUsed:  campaign.sessionToolsUsed,
      tableCharter:      campaign.tableCharter,
      aiModel:           campaign.aiModel,

      parties: campaign.parties.map(p => ({
        ...stripMeta(p),
        currentLocationId: p.currentLocationId, // remapped on import
      })),

      sessions: campaign.sessions.map(s => stripMeta(s)),

      mapAssets: (campaign as any).mapAssets.map((m: any) => {
        const { imageAsset, imageAssetId, pins, ...rest } = stripMeta(m)
        return {
          ...rest,
          imageAssetId: null,
          pins: pins.map(({ mapAssetId, createdAt, updatedAt, ...pin }: any) => pin),
        }
      }),

      locations: campaign.locations.map(l => {
        const { imageAssetId, ...rest } = stripMeta(l)
        return { ...rest, imageAssetId: null }
      }),

      factions: campaign.factions.map(f => stripMeta(f)),

      npcs: campaign.npcs.map(n => {
        const { portraitAssetId, ...rest } = stripMeta(n)
        return { ...rest, portraitAssetId: null }
      }),

      items: campaign.items.map(i => {
        const { imageAssetId, ...rest } = stripMeta(i)
        return { ...rest, imageAssetId: null }
      }),

      encounters: campaign.encounters.map(e => stripMeta(e)),

      plotThreads: campaign.plotThreads.map(p => stripMeta(p)),

      enemies: campaign.enemies.map(e => {
        const { systemTemplateId, ...rest } = stripMeta(e)
        return rest // systemTemplateId resolved from template on import
      }),

      playerCharacters: campaign.playerCharacters.map(pc => {
        const { portraitAssetId, sheetAssetId, ...rest } = stripMeta(pc)
        return { ...rest, portraitAssetId: null, sheetAssetId: null }
      }),

      customGenerators: await prisma.customGenerator.findMany({
        where: { campaignId: campaign.id },
      }).then(gens => gens.map(g => {
        const { ownerUserId, campaignId, createdAt, updatedAt, ...rest } = g
        return rest
      })),

      worldBuildingEntries: campaign.worldBuildingEntries.map(w => stripMeta(w)),

      safetyTopics: campaign.safetyTopics.map(t => {
        const { campaignId, ...rest } = t
        return rest
      }),

      relationships: campaign.relationships.map(r => stripMeta(r)),
    },
  }

  const safeName = campaign.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Content-Disposition', `attachment; filename="kt-${safeName}.json"`)
  res.json(payload)
})

// ── Import ────────────────────────────────────────────────────────────────────

campaignsRouter.post('/import', async (req, res) => {
  const userId = res.locals.user.id

  const body = req.body
  if (!body?.app || body.app !== 'keepers-table' || !body?.campaign) {
    res.status(400).json({ error: 'Invalid export file' })
    return
  }

  const src = body.campaign

  // Resolve system template: match by name, fall back to first available
  const templates = await prisma.systemTemplate.findMany({ where: { isBuiltin: true } })
  const matchedTemplate = templates.find(t => t.name === src.systemTemplateName) ?? templates[0]
  if (!matchedTemplate) {
    res.status(400).json({ error: 'No system templates available' })
    return
  }

  // idMap: exported-id → newly created id
  const idMap: Record<string, string> = {}
  const remap = (id: string | null | undefined) => (id ? (idMap[id] ?? null) : null)

  // ── 1. Create campaign ────────────────────────────────────────────────────
  const campaign = await prisma.campaign.create({
    data: {
      name:              src.name ? `${src.name} (imported)` : 'Imported Campaign',
      ownerUserId:       userId,
      systemTemplateId:  matchedTemplate.id,
      settingNotes:      src.settingNotes      ?? '',
      themeId:           src.themeId           ?? null,
      pitchElevator:     src.pitchElevator     ?? '',
      pitchGenre:        src.pitchGenre        ?? '',
      pitchLength:       src.pitchLength       ?? '',
      pitchWhatIsNot:    src.pitchWhatIsNot    ?? '',
      tonGrimHeroic:     src.tonGrimHeroic     ?? 50,
      tonGrittyCinematic: src.tonGrittyCinematic ?? 50,
      tonEpisodicSerialized: src.tonEpisodicSerialized ?? 50,
      tonCombatRoleplay: src.tonCombatRoleplay ?? 50,
      contentRating:     src.contentRating     ?? '',
      sessionToolsUsed:  src.sessionToolsUsed  ?? '',
      tableCharter:      src.tableCharter      ?? {},
      aiModel:           src.aiModel           ?? '',
    },
  })

  // ── 2. Parties ───────────────────────────────────────────────────────────
  for (const p of (src.parties ?? [])) {
    const created = await prisma.party.create({
      data: {
        campaignId: campaign.id,
        name:       p.name ?? 'Party',
        characters: p.characters ?? [],
        activeConditions: p.activeConditions ?? '',
        // currentLocationId set after locations are created
      },
    })
    idMap[p.id] = created.id
  }

  // ── 3. Map Assets (no images) ─────────────────────────────────────────────
  for (const m of (src.mapAssets ?? [])) {
    const created = await prisma.mapAsset.create({
      data: {
        campaignId:       campaign.id,
        kind:             m.kind    ?? 'other',
        title:            m.title   ?? 'Untitled Map',
        imageUrl:         null,
        thumbnailUrl:     null,
        imageAssetId:     null,
        altText:          m.altText ?? null,
        width:            m.width   ?? null,
        height:           m.height  ?? null,
        source:           m.source  ?? 'uploaded',
        generationPrompt: m.generationPrompt ?? null,
        grid:             m.grid    ?? null,
        // linkedLocationId / linkedEncounterId set after those are created
      },
    })
    idMap[m.id] = created.id
  }

  // ── 4. Locations (topological — parents before children) ─────────────────
  const sortedLocations = topoSortLocations(src.locations ?? [])
  for (const l of sortedLocations) {
    const created = await prisma.location.create({
      data: {
        campaignId:        campaign.id,
        name:              l.name        ?? 'Unknown',
        description:       l.description ?? '',
        imageUrl:          null,
        imageAssetId:      null,
        tags:              l.tags        ?? [],
        customFields:      l.customFields ?? {},
        pinned:            l.pinned      ?? false,
        dmOnlyNotes:       l.dmOnlyNotes ?? '',
        type:              l.type        ?? 'site',
        parentLocationId:  remap(l.parentLocationId),
        mapAssetId:        remap(l.mapAssetId),
        ambience:          l.ambience    ?? null,
        sortOrder:         l.sortOrder   ?? 0,
      },
    })
    idMap[l.id] = created.id
  }

  // ── 5. Factions ───────────────────────────────────────────────────────────
  for (const f of (src.factions ?? [])) {
    const created = await prisma.faction.create({
      data: {
        campaignId:             campaign.id,
        name:                   f.name                 ?? 'Unknown',
        description:            f.description          ?? '',
        tags:                   f.tags                 ?? [],
        customFields:           f.customFields         ?? {},
        pinned:                 f.pinned               ?? false,
        dmOnlyNotes:            f.dmOnlyNotes          ?? '',
        goals:                  f.goals                ?? '',
        dispositionToParty:     f.dispositionToParty   ?? 'neutral',
        headquartersLocationId: remap(f.headquartersLocationId),
        sortOrder:              f.sortOrder            ?? 0,
      },
    })
    idMap[f.id] = created.id
  }

  // ── 6. Game Sessions ──────────────────────────────────────────────────────
  for (const s of (src.sessions ?? [])) {
    const created = await prisma.gameSession.create({
      data: {
        campaignId:       campaign.id,
        partyId:          remap(s.partyId),
        sessionNumber:    s.sessionNumber ?? 1,
        title:            s.title         ?? null,
        datePlayed:       s.datePlayed    ? new Date(s.datePlayed) : null,
        status:           s.status        ?? 'complete',
        isSessionZero:    s.isSessionZero ?? false,
        dmRawNotes:       s.dmRawNotes    ?? '',
        generatedSummary: s.generatedSummary ?? null,
        keyEvents:        s.keyEvents     ?? [],
        hooksForNext:     s.hooksForNext  ?? [],
        recapRead:        s.recapRead     ?? false,
      },
    })
    idMap[s.id] = created.id
  }

  // ── 7. NPCs ───────────────────────────────────────────────────────────────
  for (const n of (src.npcs ?? [])) {
    const created = await prisma.nPC.create({
      data: {
        campaignId:         campaign.id,
        name:               n.name               ?? 'Unknown',
        description:        n.description        ?? '',
        imageUrl:           null,
        portraitUrl:        null,
        portraitAssetId:    null,
        tags:               n.tags               ?? [],
        customFields:       n.customFields       ?? {},
        pinned:             n.pinned             ?? false,
        dmOnlyNotes:        n.dmOnlyNotes        ?? '',
        role:               n.role               ?? '',
        appearance:         n.appearance         ?? '',
        personality:        n.personality        ?? '',
        motivations:        n.motivations        ?? '',
        secrets:            n.secrets            ?? '',
        voiceNotes:         n.voiceNotes         ?? '',
        statBlock:          n.statBlock          ?? {},
        status:             n.status             ?? 'alive',
        dispositionToParty: n.dispositionToParty ?? 'neutral',
        locationId:         remap(n.locationId),
        factionId:          remap(n.factionId),
        firstSessionId:     remap(n.firstSessionId),
        lastSeenSessionId:  remap(n.lastSeenSessionId),
        sortOrder:          n.sortOrder          ?? 0,
      },
    })
    idMap[n.id] = created.id
  }

  // ── 8. Items ──────────────────────────────────────────────────────────────
  for (const i of (src.items ?? [])) {
    const created = await prisma.item.create({
      data: {
        campaignId:       campaign.id,
        name:             i.name             ?? 'Unknown',
        description:      i.description      ?? '',
        imageUrl:         null,
        imageAssetId:     null,
        tags:             i.tags             ?? [],
        customFields:     i.customFields     ?? {},
        pinned:           i.pinned           ?? false,
        dmOnlyNotes:      i.dmOnlyNotes      ?? '',
        category:         i.category         ?? '',
        rarity:           i.rarity           ?? 'common',
        mechanicalEffect: i.mechanicalEffect ?? '',
        currentOwnerType: i.currentOwnerType ?? 'unclaimed',
        currentOwnerId:   null,
        originSessionId:  remap(i.originSessionId),
        sortOrder:        i.sortOrder        ?? 0,
      },
    })
    idMap[i.id] = created.id
  }

  // ── 9. Encounters ─────────────────────────────────────────────────────────
  for (const e of (src.encounters ?? [])) {
    const created = await prisma.encounter.create({
      data: {
        campaignId:    campaign.id,
        sessionId:     remap(e.sessionId),
        name:          e.name          ?? 'Unknown',
        description:   e.description   ?? '',
        imageUrl:      null,
        tags:          e.tags          ?? [],
        customFields:  e.customFields  ?? {},
        pinned:        e.pinned        ?? false,
        dmOnlyNotes:   e.dmOnlyNotes   ?? '',
        type:          e.type          ?? 'combat',
        difficulty:    e.difficulty    ?? 'medium',
        setup:         e.setup         ?? '',
        tactics:       e.tactics       ?? '',
        twist:         e.twist         ?? '',
        scalingNotes:  e.scalingNotes  ?? '',
        participants:  e.participants  ?? [],
        locationId:    remap(e.locationId),
        mapAssetId:    remap(e.mapAssetId),
        outcome:       e.outcome       ?? null,
        sortOrder:     e.sortOrder     ?? 0,
      },
    })
    idMap[e.id] = created.id
  }

  // ── 10. Plot Threads ──────────────────────────────────────────────────────
  for (const p of (src.plotThreads ?? [])) {
    const created = await prisma.plotThread.create({
      data: {
        campaignId:           campaign.id,
        title:                p.title       ?? 'Untitled',
        description:          p.description ?? '',
        status:               p.status      ?? 'active',
        relatedEntities:      remapRelatedEntities(p.relatedEntities ?? [], idMap),
        lastTouchedSessionId: remap(p.lastTouchedSessionId),
        sortOrder:            p.sortOrder   ?? 0,
      },
    })
    idMap[p.id] = created.id
  }

  // ── 11. Enemies (campaign-specific) ──────────────────────────────────────
  for (const e of (src.enemies ?? [])) {
    const created = await prisma.enemy.create({
      data: {
        campaignId:       campaign.id,
        systemTemplateId: matchedTemplate.id,
        name:             e.name        ?? 'Unknown',
        description:      e.description ?? '',
        enemyType:        e.enemyType   ?? '',
        size:             e.size        ?? '',
        cr:               e.cr          ?? null,
        statBlock:        e.statBlock   ?? {},
        source:           e.source      ?? 'custom',
        isBuiltin:        false,
        tags:             e.tags        ?? [],
      },
    })
    idMap[e.id] = created.id
  }

  // ── 12. Player Characters ─────────────────────────────────────────────────
  for (const pc of (src.playerCharacters ?? [])) {
    const created = await prisma.playerCharacter.create({
      data: {
        campaignId:      campaign.id,
        name:            pc.name       ?? 'Unknown',
        playerName:      pc.playerName ?? '',
        race:            pc.race       ?? '',
        class:           pc.class      ?? '',
        playbook:        pc.playbook   ?? '',
        subclass:        pc.subclass   ?? '',
        level:           pc.level      ?? 1,
        background:      pc.background ?? '',
        alignment:       pc.alignment  ?? '',
        appearance:      pc.appearance ?? '',
        backstory:       pc.backstory  ?? '',
        notes:           pc.notes      ?? '',
        features:        pc.features   ?? '',
        bonds:           pc.bonds      ?? '',
        moves:           pc.moves      ?? '',
        abilityScores:   pc.abilityScores  ?? {},
        combatStats:     pc.combatStats    ?? {},
        skills:          pc.skills         ?? {},
        savingThrows:    pc.savingThrows   ?? {},
        equipment:       pc.equipment      ?? [],
        xp:              pc.xp        ?? 0,
        sortOrder:       pc.sortOrder ?? 0,
        portraitAssetId: null,
        sheetAssetId:    null,
      },
    })
    idMap[pc.id] = created.id
  }

  // ── 13. Custom Generators ─────────────────────────────────────────────────
  for (const g of (src.customGenerators ?? [])) {
    await prisma.customGenerator.create({
      data: {
        ownerUserId:          userId,
        campaignId:           campaign.id,
        name:                 g.name                 ?? 'Generator',
        icon:                 g.icon                 ?? '⚙️',
        description:          g.description          ?? '',
        outputEntityType:     g.outputEntityType     ?? 'freeform',
        promptTemplate:       g.promptTemplate       ?? '',
        inputFields:          g.inputFields          ?? [],
        generatesImage:       g.generatesImage       ?? false,
        imagePromptTemplate:  g.imagePromptTemplate  ?? null,
      },
    })
  }

  // ── 14. World Building Entries ────────────────────────────────────────────
  for (const w of (src.worldBuildingEntries ?? [])) {
    await prisma.worldBuildingEntry.create({
      data: {
        campaignId: campaign.id,
        category:   w.category  ?? 'npc',
        name:       w.name      ?? 'Unknown',
        summary:    w.summary   ?? '',
        detail:     w.detail    ?? '',
        entityId:   remap(w.entityId),
        entityType: w.entityType ?? null,
        sortOrder:  w.sortOrder  ?? 0,
      },
    })
  }

  // ── 15. Safety Topics ─────────────────────────────────────────────────────
  for (const t of (src.safetyTopics ?? [])) {
    await prisma.safetyTopic.create({
      data: {
        campaignId: campaign.id,
        topic:      t.topic    ?? '',
        isPreset:   t.isPreset ?? false,
        gmSetting:  t.gmSetting ?? null,
      },
    })
  }

  // ── 16. Entity Relationships ──────────────────────────────────────────────
  for (const r of (src.relationships ?? [])) {
    const newA = remap(r.entityAId)
    const newB = remap(r.entityBId)
    if (!newA || !newB) continue // skip if either entity wasn't imported
    await prisma.entityRelationship.create({
      data: {
        campaignId:       campaign.id,
        entityAType:      r.entityAType      ?? '',
        entityAId:        newA,
        entityBType:      r.entityBType      ?? '',
        entityBId:        newB,
        relationshipType: r.relationshipType ?? '',
        notes:            r.notes            ?? '',
        bidirectional:    r.bidirectional    ?? true,
      },
    })
  }

  // ── 17. Map Pins ──────────────────────────────────────────────────────────
  for (const m of (src.mapAssets ?? [])) {
    const newMapId = idMap[m.id]
    if (!newMapId) continue
    for (const pin of (m.pins ?? [])) {
      await prisma.mapPin.create({
        data: {
          mapAssetId: newMapId,
          x:          pin.x       ?? 0,
          y:          pin.y       ?? 0,
          locationId: remap(pin.locationId),
          label:      pin.label   ?? '',
          icon:       pin.icon    ?? '📍',
          revealed:   pin.revealed ?? false,
        },
      })
    }

    // Patch linkedLocationId / linkedEncounterId now that both exist
    const linkedLoc = remap(m.linkedLocationId)
    const linkedEnc = remap(m.linkedEncounterId)
    if (linkedLoc || linkedEnc) {
      await prisma.mapAsset.update({
        where: { id: newMapId },
        data: {
          linkedLocationId:  linkedLoc  ?? undefined,
          linkedEncounterId: linkedEnc ?? undefined,
        },
      })
    }
  }

  // ── 18. Back-patch Party.currentLocationId ────────────────────────────────
  for (const p of (src.parties ?? [])) {
    const newPartyId = idMap[p.id]
    const newLocId   = remap(p.currentLocationId)
    if (newPartyId && newLocId) {
      await prisma.party.update({
        where: { id: newPartyId },
        data:  { currentLocationId: newLocId },
      })
    }
  }

  res.json({ campaignId: campaign.id })
})

// ── Parties ──────────────────────────────────────────────────────────────────

campaignsRouter.get('/:id/parties', async (req, res) => {
  const userId = res.locals.user.id
  const campaign = await prisma.campaign.findFirst({
    where: { id: req.params.id, ownerUserId: userId },
  })
  if (!campaign) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  const parties = await prisma.party.findMany({ where: { campaignId: req.params.id } })
  res.json({ parties })
})

campaignsRouter.post('/:id/parties', async (req, res) => {
  const userId = res.locals.user.id
  const campaign = await prisma.campaign.findFirst({
    where: { id: req.params.id, ownerUserId: userId },
  })
  if (!campaign) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  const schema = z.object({
    name: z.string().min(1),
    characters: z.array(z.object({
      name: z.string(),
      class: z.string().optional(),
      level: z.number().optional(),
      playerName: z.string().optional(),
      notes: z.string().optional(),
    })).optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message })
    return
  }
  const party = await prisma.party.create({
    data: { campaignId: req.params.id, name: parsed.data.name, characters: parsed.data.characters ?? [] },
  })
  res.json({ party })
})

campaignsRouter.patch('/:id/parties/:partyId', async (req, res) => {
  const userId = res.locals.user.id
  const campaign = await prisma.campaign.findFirst({ where: { id: req.params.id, ownerUserId: userId } })
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }
  const party = await prisma.party.update({
    where: { id: req.params.partyId },
    data: req.body,
  })
  res.json({ party })
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
  return entities.map((e: any) => ({
    ...e,
    id: e.id ? (idMap[e.id] ?? e.id) : undefined,
  }))
}
