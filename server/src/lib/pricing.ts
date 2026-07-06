import { readFileSync, statSync } from 'fs'
import { resolve } from 'path'

interface PricingConfig {
  models: Record<string, number>
  defaultCostPerImage: number
  minimumConfirmThreshold: number
}

const PRICING_PATH = resolve(process.cwd(), 'config/pricing.json')
let cache: { config: PricingConfig; mtime: number } | null = null

function loadPricing(): PricingConfig {
  try {
    const mtime = statSync(PRICING_PATH).mtimeMs
    if (cache && cache.mtime === mtime) return cache.config
    const raw = readFileSync(PRICING_PATH, 'utf-8')
    const config = JSON.parse(raw) as PricingConfig
    cache = { config, mtime }
    return config
  } catch {
    return { models: {}, defaultCostPerImage: 0.05, minimumConfirmThreshold: 0.05 }
  }
}

export function getImageCostEstimate(model: string): number {
  const pricing = loadPricing()
  return pricing.models[model] ?? pricing.defaultCostPerImage
}

export function getMinimumConfirmThreshold(): number {
  return loadPricing().minimumConfirmThreshold ?? 0.05
}

export function getPricingMeta(): {
  minimumConfirmThreshold: number
  defaultCostPerImage: number
  minModelCost: number
  maxModelCost: number
  models: Record<string, number>
} {
  const pricing = loadPricing()
  const costs = Object.values(pricing.models)
  return {
    minimumConfirmThreshold: pricing.minimumConfirmThreshold ?? 0.05,
    defaultCostPerImage: pricing.defaultCostPerImage,
    minModelCost: costs.length > 0 ? Math.min(...costs) : 0.01,
    maxModelCost: costs.length > 0 ? Math.max(...costs) : 0.12,
    models: pricing.models,
  }
}
