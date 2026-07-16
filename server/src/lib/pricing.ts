import { readFileSync, statSync } from 'fs'
import { resolve } from 'path'

interface PricingConfig {
  models: Record<string, number>
  defaultCostPerImage: number
  minimumConfirmThreshold: number
  evolinkCreditsPerUsd: number
  artDirectorCostPerCall: number
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
    return { models: {}, defaultCostPerImage: 0.05, minimumConfirmThreshold: 0.05, evolinkCreditsPerUsd: 67, artDirectorCostPerCall: 0.0003 }
  }
}

export function getImageCostEstimate(model: string): number {
  const pricing = loadPricing()
  return pricing.models[model] ?? pricing.defaultCostPerImage
}

export function getMinimumConfirmThreshold(): number {
  return loadPricing().minimumConfirmThreshold ?? 0.05
}

export function getArtDirectorCostPerCall(): number {
  return loadPricing().artDirectorCostPerCall ?? 0.0003
}

export function creditsToUsd(credits: number): number {
  const rate = loadPricing().evolinkCreditsPerUsd ?? 67
  return credits / rate
}

export function getEvolinkCreditsPerUsd(): number {
  return loadPricing().evolinkCreditsPerUsd ?? 67
}

export function getPricingMeta(): {
  minimumConfirmThreshold: number
  defaultCostPerImage: number
  minModelCost: number
  maxModelCost: number
  models: Record<string, number>
  evolinkCreditsPerUsd: number
} {
  const pricing = loadPricing()
  const costs = Object.values(pricing.models)
  return {
    minimumConfirmThreshold: pricing.minimumConfirmThreshold ?? 0.05,
    defaultCostPerImage: pricing.defaultCostPerImage,
    minModelCost: costs.length > 0 ? Math.min(...costs) : 0.01,
    maxModelCost: costs.length > 0 ? Math.max(...costs) : 0.12,
    models: pricing.models,
    evolinkCreditsPerUsd: pricing.evolinkCreditsPerUsd ?? 67,
  }
}
