import { prisma } from './lib/prisma.js'

const BUILTIN_TEMPLATES = [
  {
    name: 'D&D 5e',
    description: 'Dungeons & Dragons 5th Edition',
    isBuiltin: true,
    statBlockSchema: [
      { key: 'str', label: 'STR', type: 'number', default: 10 },
      { key: 'dex', label: 'DEX', type: 'number', default: 10 },
      { key: 'con', label: 'CON', type: 'number', default: 10 },
      { key: 'int', label: 'INT', type: 'number', default: 10 },
      { key: 'wis', label: 'WIS', type: 'number', default: 10 },
      { key: 'cha', label: 'CHA', type: 'number', default: 10 },
      { key: 'ac', label: 'AC', type: 'number', default: 10 },
      { key: 'hp', label: 'HP', type: 'text', default: '' },
      { key: 'cr', label: 'CR', type: 'text', default: '1' },
      { key: 'speed', label: 'Speed', type: 'text', default: '30 ft.' },
      { key: 'senses', label: 'Senses', type: 'text', default: '' },
      { key: 'languages', label: 'Languages', type: 'text', default: '' },
      { key: 'skills', label: 'Skills', type: 'text', default: '' },
      { key: 'saves', label: 'Saving Throws', type: 'text', default: '' },
      { key: 'traits', label: 'Traits', type: 'text', default: '' },
      { key: 'actions', label: 'Actions', type: 'text', default: '' },
    ],
    difficultyModel: {
      type: 'cr_budget',
      tiers: ['trivial', 'easy', 'medium', 'hard', 'deadly', 'legendary'],
    },
    currencyAndRarity: {
      currencies: ['cp', 'sp', 'ep', 'gp', 'pp'],
      rarities: ['common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact'],
    },
    promptAddendum: 'Use D&D 5e mechanics and terminology. CR should reflect 5e Monster Manual standards. Include saving throws, spell slots, and action economy where relevant. Default setting is a generic fantasy world unless campaign notes specify otherwise.',
    customEntityFields: [],
  },
  {
    name: 'Pathfinder 2e',
    description: 'Pathfinder Second Edition',
    isBuiltin: true,
    statBlockSchema: [
      { key: 'level', label: 'Level', type: 'number', default: 1 },
      { key: 'perception', label: 'Perception', type: 'number', default: 0 },
      { key: 'ac', label: 'AC', type: 'number', default: 15 },
      { key: 'hp', label: 'HP', type: 'number', default: 20 },
      { key: 'fortitude', label: 'Fortitude', type: 'number', default: 0 },
      { key: 'reflex', label: 'Reflex', type: 'number', default: 0 },
      { key: 'will', label: 'Will', type: 'number', default: 0 },
      { key: 'speed', label: 'Speed', type: 'text', default: '25 ft.' },
      { key: 'str', label: 'STR', type: 'number', default: 0 },
      { key: 'dex', label: 'DEX', type: 'number', default: 0 },
      { key: 'con', label: 'CON', type: 'number', default: 0 },
      { key: 'int', label: 'INT', type: 'number', default: 0 },
      { key: 'wis', label: 'WIS', type: 'number', default: 0 },
      { key: 'cha', label: 'CHA', type: 'number', default: 0 },
      { key: 'actions', label: 'Actions', type: 'text', default: '' },
      { key: 'traits', label: 'Traits', type: 'text', default: '' },
    ],
    difficultyModel: {
      type: 'threat_tags',
      tiers: ['trivial', 'low', 'moderate', 'severe', 'extreme'],
    },
    currencyAndRarity: {
      currencies: ['cp', 'sp', 'gp'],
      rarities: ['common', 'uncommon', 'rare', 'unique'],
    },
    promptAddendum: 'Use Pathfinder 2e mechanics. Use three-action economy terminology (1 action ◆, 2 actions ◆◆, 3 actions ◆◆◆, reaction ↺, free action ◇). Reference item levels rather than rarity tiers for treasure. Use PF2e terminology (degrees of success, trained/expert/master/legendary proficiency).',
    customEntityFields: [],
  },
  {
    name: 'Call of Cthulhu 7e',
    description: 'Call of Cthulhu 7th Edition',
    isBuiltin: true,
    statBlockSchema: [
      { key: 'str', label: 'STR', type: 'number', default: 50 },
      { key: 'con', label: 'CON', type: 'number', default: 50 },
      { key: 'siz', label: 'SIZ', type: 'number', default: 50 },
      { key: 'dex', label: 'DEX', type: 'number', default: 50 },
      { key: 'int', label: 'INT', type: 'number', default: 50 },
      { key: 'pow', label: 'POW', type: 'number', default: 50 },
      { key: 'app', label: 'APP', type: 'number', default: 50 },
      { key: 'edu', label: 'EDU', type: 'number', default: 50 },
      { key: 'luck', label: 'LUCK', type: 'number', default: 50 },
      { key: 'sanity', label: 'Sanity', type: 'number', default: 50 },
      { key: 'hp', label: 'HP', type: 'number', default: 10 },
      { key: 'mp', label: 'MP', type: 'number', default: 10 },
      { key: 'skills', label: 'Key Skills', type: 'text', default: '' },
      { key: 'spells', label: 'Spells/Rituals', type: 'text', default: '' },
    ],
    difficultyModel: {
      type: 'threat_tags',
      tiers: ['background', 'minor', 'moderate', 'major', 'apocalyptic'],
    },
    currencyAndRarity: {
      currencies: ['$', '£'],
      rarities: ['mundane', 'unusual', 'rare', 'unique', 'mythos'],
    },
    promptAddendum: 'Use CoC 7e rules. Stats are percentile (0-100). Characters face cosmic horror they cannot defeat — the goal is survival, not triumph. Emphasize dread, mystery, and the unknown. Sanity loss should be specific (SAN loss X/Y). Default era is 1920s unless campaign notes specify. Monsters from the Mythos should feel genuinely alien and incomprehensible.',
    customEntityFields: [
      { entity: 'npc', key: 'sanityLoss', label: 'Sanity Loss (0/1d4)', type: 'text' },
      { entity: 'npc', key: 'mythosTaint', label: 'Mythos Knowledge', type: 'text' },
    ],
  },
  {
    name: 'Blades in the Dark',
    description: 'Blades in the Dark by John Harper',
    isBuiltin: true,
    statBlockSchema: [
      { key: 'hunt', label: 'Hunt', type: 'number', default: 0 },
      { key: 'prowl', label: 'Prowl', type: 'number', default: 0 },
      { key: 'skirmish', label: 'Skirmish', type: 'number', default: 0 },
      { key: 'finesse', label: 'Finesse', type: 'number', default: 0 },
      { key: 'sway', label: 'Sway', type: 'number', default: 0 },
      { key: 'consort', label: 'Consort', type: 'number', default: 0 },
      { key: 'command', label: 'Command', type: 'number', default: 0 },
      { key: 'study', label: 'Study', type: 'number', default: 0 },
      { key: 'survey', label: 'Survey', type: 'number', default: 0 },
      { key: 'attune', label: 'Attune', type: 'number', default: 0 },
      { key: 'tier', label: 'Tier', type: 'number', default: 0 },
      { key: 'stress', label: 'Max Stress', type: 'number', default: 9 },
      { key: 'special', label: 'Special Abilities', type: 'text', default: '' },
    ],
    difficultyModel: {
      type: 'threat_tags',
      tiers: ['weak', 'moderate', 'dangerous', 'serious', 'formidable', 'elite', 'savage', 'legendary'],
    },
    currencyAndRarity: {
      currencies: ['Coin', 'Rep'],
      rarities: ['common', 'uncommon', 'rare', 'fine', 'masterwork', 'legendary'],
    },
    promptAddendum: 'Use Blades in the Dark terminology. The setting is Doskvol (Duskwall), a gas-lit Victorian-esque city. Focus on heists, scores, and criminal enterprise. Use Blades vocabulary: scores, heat, wanted level, coin, rep, faction standing, flashbacks, position (controlled/risky/desperate), effect (limited/standard/great). NPCs have Tier ratings. No stat blocks — describe NPCs in terms of their role, motivations, and how dangerous they are in the fiction.',
    customEntityFields: [
      { entity: 'faction', key: 'tier', label: 'Tier', type: 'number' },
      { entity: 'faction', key: 'hold', label: 'Hold', type: 'text' },
    ],
  },
  {
    name: 'Generic / Homebrew',
    description: 'System-agnostic template for any game',
    isBuiltin: true,
    statBlockSchema: [
      { key: 'level', label: 'Level/CR/Rank', type: 'text', default: '' },
      { key: 'hp', label: 'HP/Wounds', type: 'text', default: '' },
      { key: 'defense', label: 'Defense', type: 'text', default: '' },
      { key: 'attack', label: 'Attack', type: 'text', default: '' },
      { key: 'abilities', label: 'Key Abilities', type: 'text', default: '' },
    ],
    difficultyModel: { type: 'custom', tiers: ['easy', 'medium', 'hard', 'deadly'] },
    currencyAndRarity: {
      currencies: ['gold'],
      rarities: ['common', 'uncommon', 'rare', 'legendary'],
    },
    promptAddendum: 'This is a system-agnostic campaign. Keep stat blocks descriptive rather than mechanical. Focus on narrative qualities, personality, and story hooks. Adapt tone and terminology to match the campaign setting notes.',
    customEntityFields: [],
  },
]

async function seed() {
  console.log('🌱 Seeding system templates...')
  for (const t of BUILTIN_TEMPLATES) {
    await prisma.systemTemplate.upsert({
      where: {
        id: `builtin-${t.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      },
      update: { ...t },
      create: {
        id: `builtin-${t.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        ...t,
      },
    })
    console.log(`  ✓ ${t.name}`)
  }
  console.log('✅ Seed complete.')
}

seed()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
