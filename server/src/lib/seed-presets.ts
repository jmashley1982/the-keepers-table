import { prisma } from './prisma.js'

const BUILTIN_PRESETS = [
  {
    name: 'Classic fantasy oil',
    promptFragment: 'fantasy oil painting, detailed, warm lighting, classical composition, RPG illustration style',
  },
  {
    name: 'Ink sketch',
    promptFragment: 'black ink sketch, pen and ink, detailed linework, cross-hatching, fantasy illustration',
  },
  {
    name: 'Pixel art',
    promptFragment: 'pixel art, 16-bit retro RPG style, clean pixel work, vibrant colors, game sprite aesthetic',
  },
  {
    name: 'Watercolor',
    promptFragment: 'watercolor illustration, soft edges, vibrant colors, flowing paint, fantasy art book style',
  },
  {
    name: 'Gritty realism',
    promptFragment: 'gritty realistic painting, dark fantasy, weathered textures, cinematic lighting, highly detailed',
  },
  {
    name: 'Anime',
    promptFragment: 'anime art style, vibrant colors, sharp clean lines, studio quality, fantasy RPG character design',
  },
]

export async function seedBuiltinPresets(): Promise<void> {
  const existingCount = await prisma.artStylePreset.count({ where: { isBuiltin: true } })
  if (existingCount >= BUILTIN_PRESETS.length) return

  const existing = await prisma.artStylePreset.findMany({
    where: { isBuiltin: true },
    select: { name: true },
  })
  const existingNames = new Set(existing.map(p => p.name))

  const toCreate = BUILTIN_PRESETS.filter(p => !existingNames.has(p.name))
  if (toCreate.length > 0) {
    await prisma.artStylePreset.createMany({
      data: toCreate.map(p => ({ ...p, isBuiltin: true })),
    })
    console.log(`🎨 Seeded ${toCreate.length} built-in art style preset(s)`)
  }
}
