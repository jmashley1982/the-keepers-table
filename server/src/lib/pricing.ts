import { readFileSync } from 'fs'
import { resolve } from 'path'

interface PricingConfig {
  models: Record<string, number>
  defaultCostPerImage: number
}

let cached: PricingConfig | null = null

function loadPricing(): PricingConfig {
  if (cached) return cached
  try {
    const filePath = resolve(process.cwd(), 'config/pricing.json')
    const raw = readFileSync(filePath, 'utf-8')
    cached = JSON.parse(raw) as PricingConfig
    return cached
  } catch {
    return { models: {}, defaultCostPerImage: 0.05 }
  }
}

export function getImageCostEstimate(model: string): number {
  const pricing = loadPricing()
  return pricing.models[model] ?? pricing.defaultCostPerImage
}
