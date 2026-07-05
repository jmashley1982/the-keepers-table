import { Router } from 'express'
import { prisma } from '../lib/prisma.js'

export const demoRouter = Router()

const DEMO_EMAIL = 'demo@keeperstable.app'
const DEMO_DISPLAY_NAME = 'Demo GM'
const DND_TEMPLATE_ID = 'builtin-d-d-5e'

demoRouter.post('/login', async (req, res) => {
  try {
    // Find or create demo user
    let user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } })
    if (!user) {
      user = await prisma.user.create({
        data: { email: DEMO_EMAIL, displayName: DEMO_DISPLAY_NAME, passwordHash: null },
      })
      await prisma.userPreference.create({ data: { userId: user.id } })
    }

    // Wipe existing demo campaign data for a fresh start
    await prisma.campaign.deleteMany({ where: { ownerUserId: user.id } })

    // ── Create demo campaign ──────────────────────────────────────────────
    const campaign = await prisma.campaign.create({
      data: {
        name: 'The Shattered Crown',
        ownerUserId: user.id,
        systemTemplateId: DND_TEMPLATE_ID,
        settingNotes:
          'A dark fantasy kingdom fractured after the king was assassinated. ' +
          'Three noble houses vie for the empty throne while an ancient evil stirs beneath the capital city. ' +
          'The party has been hired by the merchant guild to investigate strange disappearances in the harbor district.',
      },
    })

    // ── Party ─────────────────────────────────────────────────────────────
    const party = await prisma.party.create({
      data: {
        campaignId: campaign.id,
        name: 'The Wayward Company',
        characters: [
          { name: 'Seraphina Duskmantle', class: 'Rogue 5', player: 'Demo Player' },
          { name: 'Brother Aldric', class: 'Cleric 5', player: 'Demo Player' },
          { name: 'Vex', class: 'Warlock 5', player: 'Demo Player' },
          { name: 'Torrin Ironback', class: 'Fighter 5', player: 'Demo Player' },
        ],
      },
    })

    // ── Locations ─────────────────────────────────────────────────────────
    const locationTavern = await prisma.location.create({
      data: {
        campaignId: campaign.id,
        name: 'The Rusted Flagon',
        type: 'site',
        description:
          'A weathered tavern near the harbor docks, frequented by sailors, smugglers, and those who prefer not to be found. ' +
          'The owner, Marta, keeps an ear to the ground for the right price.',
        tags: ['tavern', 'harbor', 'neutral-ground'],
        dmOnlyNotes: 'Marta is secretly an informant for the Merchant Guild. She knows about the tunnel system under the docks.',
      },
    })

    const locationCastle = await prisma.location.create({
      data: {
        campaignId: campaign.id,
        name: "Castle Varenthis (The Shattered Keep)",
        type: 'region',
        description:
          'The once-grand royal castle now sits partially ruined after the assassination. ' +
          'The central spire collapsed during a mysterious magical explosion on the night of the king\'s death. ' +
          'Three noble factions occupy different wings, each claiming legitimate rule.',
        tags: ['castle', 'ruin', 'political', 'dangerous'],
        dmOnlyNotes: 'The collapsed spire hides the entrance to the Sunken Vault — the real source of the corruption.',
      },
    })

    const locationDocks = await prisma.location.create({
      data: {
        campaignId: campaign.id,
        name: 'The Sunken Tunnels',
        type: 'site',
        description:
          'An ancient network of tunnels beneath the harbor district, predating the city by centuries. ' +
          'Recently they have been cleared out and are being used for something sinister.',
        tags: ['dungeon', 'underground', 'cult', 'ancient'],
        dmOnlyNotes: 'The Iron Conclave is performing ritual sacrifices here to resurrect the Pale King. Session 3 should culminate here.',
      },
    })

    // ── Factions ──────────────────────────────────────────────────────────
    const factionConclave = await prisma.faction.create({
      data: {
        campaignId: campaign.id,
        name: 'The Iron Conclave',
        description:
          'A secretive cult of former court mages who believe the current age of kings is a corruption of the natural order. ' +
          'They worship the Pale King, an ancient undead warlord, and are engineering his resurrection.',
        goals: 'Resurrect the Pale King. Collapse all three noble houses. Establish a theocratic undead empire.',
        dispositionToParty: 'hostile',
        tags: ['cult', 'undead', 'mages', 'main-villain'],
        dmOnlyNotes:
          'Lord Aldenmere is their secret leader. They have informants in all three noble houses. ' +
          'Their symbol is an iron crown encircling a cracked skull.',
      },
    })

    await prisma.faction.create({
      data: {
        campaignId: campaign.id,
        name: 'The Merchant Compact',
        description:
          'The powerful guild of merchants who actually hired the party. ' +
          'They care more about stability and profit than which noble sits the throne — ' +
          'but the disappearances are hurting business.',
        goals: 'Restore order. Protect trade routes. Keep the harbor open.',
        dispositionToParty: 'friendly',
        tags: ['guild', 'neutral', 'employer'],
      },
    })

    // ── NPCs ──────────────────────────────────────────────────────────────
    await prisma.nPC.create({
      data: {
        campaignId: campaign.id,
        name: 'Marta Holloway',
        role: 'Innkeeper / Informant',
        description: 'A stout woman in her 50s with a sharp wit and sharper memory for faces. She runs the Rusted Flagon with iron efficiency.',
        personality: 'Brusque but fair. Doesn\'t give information for free but won\'t lie to a paying customer.',
        motivations: 'Keep her tavern profitable. Keep her head attached to her neck.',
        appearance: 'Heavyset, grey-streaked brown hair in a severe bun. Always wearing a stained apron. Missing the tip of her left index finger.',
        voiceNotes: 'Dry, flat accent. Speaks in short sentences. Barely looks up from what she\'s doing.',
        secrets: 'Guild informant. Knows the tunnel entrance is behind the fish market. Her nephew is missing — one of the disappearances.',
        dispositionToParty: 'neutral',
        locationId: locationTavern.id,
        tags: ['innkeeper', 'informant', 'harbor'],
        status: 'alive',
        statBlock: { ac: 10, hp: '18', cr: '1/8', str: 10, dex: 10, con: 12, int: 13, wis: 14, cha: 11 },
        dmOnlyNotes: 'She will help the party if they find her nephew, alive or dead. This is a good emotional hook for Session 2.',
      },
    })

    await prisma.nPC.create({
      data: {
        campaignId: campaign.id,
        name: 'Lord Cassius Aldenmere',
        role: 'Court Advisor / Secret Villain',
        description:
          'The king\'s former chief advisor, now nominally serving House Varenthos. ' +
          'Elegant, silver-tongued, and utterly without mercy.',
        personality: 'Polished, intellectual, unhurried. Never raises his voice. Makes everything sound reasonable.',
        motivations: 'Resurrect the Pale King. Has been planning this for 20 years.',
        appearance:
          'Tall and gaunt, silver hair swept back from a sharp widow\'s peak. ' +
          'Always wears deep charcoal grey. Iron ring on his right hand — the Conclave signet, disguised as a family heirloom.',
        voiceNotes: 'Measured, precise. Never uses contractions in formal settings. Slight pause before answering questions.',
        secrets:
          'Leader of the Iron Conclave. Personally killed the king. The assassination was the first ritual component of the Pale King\'s resurrection.',
        dispositionToParty: 'deceptive',
        factionId: factionConclave.id,
        tags: ['villain', 'noble', 'mage', 'cult-leader'],
        status: 'alive',
        statBlock: { ac: 13, hp: '99', cr: '9', str: 9, dex: 14, con: 12, int: 19, wis: 15, cha: 16 },
        dmOnlyNotes:
          'The party should suspect him by session 2 but can\'t prove it until they find the Conclave seal in the tunnels. ' +
          'He should appear helpful and concerned in early sessions.',
      },
    })

    await prisma.nPC.create({
      data: {
        campaignId: campaign.id,
        name: 'Zynara "Ash" Voss',
        role: 'Rogue Spy / Reluctant Ally',
        description:
          'A former Iron Conclave operative who had a crisis of conscience when she witnessed a child sacrifice. ' +
          'Now she\'s feeding information to anyone who might stop them — for a price.',
        personality: 'Paranoid, mercenary, but genuinely haunted. Black humour is a defence mechanism.',
        motivations: 'Survive. Atone (she won\'t admit this). See the Conclave burn.',
        appearance: 'Wiry, mid-30s. Close-cropped dark hair, light ash-grey skin (half-elf). Always dressed in nondescript grey.',
        voiceNotes: 'Talks fast when nervous, which is always. Deflects personal questions with sarcasm.',
        secrets:
          'She still has access to Conclave safe houses. She knows the location of the Sunken Tunnels. ' +
          'She participated in three earlier rituals before she turned.',
        dispositionToParty: 'neutral',
        tags: ['ally', 'spy', 'half-elf', 'informant', 'morally-grey'],
        status: 'alive',
        statBlock: { ac: 15, hp: '52', cr: '4', str: 10, dex: 18, con: 12, int: 14, wis: 13, cha: 12 },
        dmOnlyNotes:
          'Great recurring NPC for tension. She knows more than she lets on. ' +
          'If the party treats her well, she becomes a genuine ally by Act 2. If they push too hard, she ghosts them.',
      },
    })

    await prisma.nPC.create({
      data: {
        campaignId: campaign.id,
        name: 'Captain Doren Fael',
        role: 'City Guard Captain / Obstacle',
        description:
          'The no-nonsense captain of the harbor district watch. ' +
          'Deeply suspicious of adventurers, especially ones poking around disappearances he was told to ignore.',
        personality: 'By-the-book, irritable, but honest. Hates the political situation as much as anyone.',
        motivations: 'Keep order. Protect his people. Avoid getting reassigned somewhere worse.',
        appearance: 'Broad-shouldered dwarf, mid-50s. Greying beard, dented armour he refuses to replace. Perpetually tired eyes.',
        voiceNotes: 'Gruff, clipped. Every sentence sounds like it\'s costing him something.',
        secrets: 'He was told by a noble contact to drop the disappearances investigation. He\'s furious about it and looking for a loophole.',
        dispositionToParty: 'unfriendly',
        tags: ['guard', 'dwarf', 'authority', 'potential-ally'],
        status: 'alive',
        statBlock: { ac: 18, hp: '65', cr: '3', str: 16, dex: 10, con: 16, int: 11, wis: 14, cha: 10 },
        dmOnlyNotes:
          'Starts hostile — the party looks like trouble. ' +
          'Once they prove the Conclave connection, he becomes their most useful official ally. Don\'t rush this.',
      },
    })

    // ── Plot Threads ──────────────────────────────────────────────────────
    await prisma.plotThread.create({
      data: {
        campaignId: campaign.id,
        title: 'The Harbor Disappearances',
        status: 'active',
        description:
          'Seventeen people have vanished from the harbor district over six weeks. ' +
          'No bodies, no ransom notes. The city watch has been told to stand down. ' +
          'The Merchant Compact hired the party to find out why.',
        relatedEntities: [
          { type: 'npc', id: 'marta', name: 'Marta Holloway' },
          { type: 'location', id: 'tunnels', name: 'The Sunken Tunnels' },
          { type: 'faction', id: 'conclave', name: 'The Iron Conclave' },
        ],
      },
    })

    await prisma.plotThread.create({
      data: {
        campaignId: campaign.id,
        title: "The Pale King's Resurrection",
        status: 'active',
        description:
          'The Iron Conclave requires 21 ritual sacrifices to complete the resurrection. ' +
          'They have 17. The disappearances are the last four. ' +
          'The party doesn\'t know this yet — but the clues are there.',
        relatedEntities: [
          { type: 'npc', id: 'aldenmere', name: 'Lord Aldenmere' },
          { type: 'faction', id: 'conclave', name: 'The Iron Conclave' },
          { type: 'location', id: 'vault', name: 'The Sunken Vault' },
        ],
      },
    })

    await prisma.plotThread.create({
      data: {
        campaignId: campaign.id,
        title: 'The Three Houses',
        status: 'dormant',
        description:
          'Houses Varenthos, Mireth, and Dawnhollow are all maneuvering for the throne. ' +
          'Each has offered the party employment. The political web will become more relevant in Act 2 ' +
          'when the party needs official backing to access the castle.',
        relatedEntities: [],
      },
    })

    // ── Sessions ──────────────────────────────────────────────────────────
    const session1 = await prisma.gameSession.create({
      data: {
        campaignId: campaign.id,
        partyId: party.id,
        sessionNumber: 1,
        title: 'Arrivals and Disappearances',
        datePlayed: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
        status: 'complete',
        dmRawNotes:
          'Party arrived in Varenthis by ship. Met Guildmaster Harlow at the Compact offices. ' +
          'Got the briefing on the disappearances — 17 people, 6 weeks, all from the harbor district. ' +
          'Explored the docks, found burn marks near the fish market (Vex identified as necrotic energy). ' +
          'Met Marta at the Rusted Flagon — she confirmed the disappearances, mentioned her nephew. ' +
          'Captain Fael showed up and tried to run them off. Seraphina pickpocketed his notebook — address: 14 Anchor Row. ' +
          'Session ended with them watching a cloaked figure enter the fish market after closing.',
        generatedSummary:
          'The Wayward Company arrived in Varenthis and were briefed by Guildmaster Harlow on seventeen harbor ' +
          'disappearances over six weeks. Investigating the docks, Vex detected traces of necrotic magic near the ' +
          'fish market. A tense encounter with Captain Fael of the harbor watch ended with Seraphina lifting his ' +
          'personal notebook — containing an address that may prove significant. The session closed on an ominous ' +
          'note as the party observed a cloaked figure entering the fish market after hours.',
        keyEvents: [
          'Party hired by the Merchant Compact',
          'Necrotic burn marks found near fish market',
          'Met Marta Holloway; her nephew is among the missing',
          'Hostile encounter with Captain Fael',
          "Seraphina stole Fael's notebook (address: 14 Anchor Row)",
          'Mysterious cloaked figure spotted at fish market',
        ],
        hooksForNext: [
          'Investigate 14 Anchor Row',
          'Follow the cloaked figure',
          "Find Marta's nephew (alive or dead?)",
          'Research the necrotic signature — Vex knows a contact',
        ],
        recapRead: false,
      },
    })

    await prisma.gameSession.create({
      data: {
        campaignId: campaign.id,
        partyId: party.id,
        sessionNumber: 2,
        title: 'Into the Fish Market',
        datePlayed: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        status: 'complete',
        dmRawNotes:
          'Party staked out the fish market. Saw two Conclave operatives (grey robes, iron pin). ' +
          'Followed them inside — found trapdoor under the main counter. ' +
          'Short fight with 3 cultists. One escaped into the tunnels. ' +
          'Found three missing persons alive in a holding cell (not Marta\'s nephew). ' +
          'Ash appeared and helped — said she was also after the Conclave. Party doesn\'t fully trust her. ' +
          'Grabbed some ritual notes before leaving — the ritual requires 21 lives. They have 17 so far. ' +
          'Returned missing persons to the Compact. Harlow paid them and told them to go deeper.',
        generatedSummary:
          'Surveilling the fish market, the party intercepted Iron Conclave operatives and discovered a trapdoor ' +
          'leading to the tunnels below. A skirmish dispatched two cultists though one fled deeper into the tunnels. ' +
          'The party rescued three captives and made a cryptic first contact with the rogue operative known as Ash, ' +
          'who claims to oppose the Conclave. Recovered ritual documents reveal a chilling detail: the Conclave ' +
          'requires 21 ritual sacrifices, and they already have seventeen.',
        keyEvents: [
          'Discovered tunnel entrance in the fish market',
          'Defeated 2 of 3 cultists; one escaped',
          'Rescued three captives (not the nephew)',
          "First contact with 'Ash' Voss",
          'Recovered ritual notes: 17/21 sacrifices complete',
          'Returned to Compact; Harlow authorised deeper investigation',
        ],
        hooksForNext: [
          'Go deeper into the Sunken Tunnels',
          "Find the remaining 4 captives (including Marta's nephew)",
          'Decide how much to trust Ash',
          'The ritual notes mention a Lord "A" — who is it?',
        ],
        recapRead: false,
      },
    })

    await prisma.gameSession.create({
      data: {
        campaignId: campaign.id,
        partyId: party.id,
        sessionNumber: 3,
        title: 'The Sunken Vault',
        status: 'planned',
        dmRawNotes: '',
        keyEvents: [],
        hooksForNext: [],
      },
    })

    req.session.userId = user.id
    req.session.isDemo = true

    res.json({
      ok: true,
      user: { id: user.id, email: user.email, displayName: user.displayName },
      campaignId: campaign.id,
    })
  } catch (err) {
    console.error('Demo login error:', err)
    res.status(500).json({ error: 'Failed to start demo' })
  }
})
