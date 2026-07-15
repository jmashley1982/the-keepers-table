const BASE = 'https://www.dnd5eapi.co/api'
const TTL_MS = 12 * 60 * 60 * 1000

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

const cache = new Map<string, CacheEntry<unknown>>()

function getCached<T>(key: string): T | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) { cache.delete(key); return null }
  return entry.data as T
}

function setCached<T>(key: string, data: T): void {
  cache.set(key, { data, expiresAt: Date.now() + TTL_MS })
}

async function apiFetch<T>(path: string): Promise<T> {
  const cached = getCached<T>(path)
  if (cached !== null) return cached
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`D&D 5e API error: ${res.status} ${path}`)
  const data = (await res.json()) as T
  setCached(path, data)
  return data
}

export interface SrdListItem {
  index: string
  name: string
  url: string
}

interface SrdListResponse {
  count: number
  results: SrdListItem[]
}

export async function listSpells(): Promise<SrdListItem[]> {
  const data = await apiFetch<SrdListResponse>('/spells')
  return data.results
}

export async function getSpell(index: string): Promise<unknown> {
  return apiFetch<unknown>(`/spells/${index}`)
}

export async function listMonsters(): Promise<SrdListItem[]> {
  const data = await apiFetch<SrdListResponse>('/monsters')
  return data.results
}

export async function getMonster(index: string): Promise<unknown> {
  return apiFetch<unknown>(`/monsters/${index}`)
}

export async function listClasses(): Promise<SrdListItem[]> {
  const data = await apiFetch<SrdListResponse>('/classes')
  return data.results
}

export async function getClassSubclasses(classIndex: string): Promise<SrdListItem[]> {
  const data = await apiFetch<SrdListResponse>(`/classes/${classIndex}/subclasses`)
  return data.results
}

export async function listRaces(): Promise<SrdListItem[]> {
  const data = await apiFetch<SrdListResponse>('/races')
  return data.results
}

export async function listEquipment(): Promise<SrdListItem[]> {
  const data = await apiFetch<SrdListResponse>('/equipment')
  return data.results
}

export async function getEquipment(index: string): Promise<unknown> {
  return apiFetch<unknown>(`/equipment/${index}`)
}

export async function listMagicItems(): Promise<SrdListItem[]> {
  const data = await apiFetch<SrdListResponse>('/magic-items')
  return data.results
}

export async function getMagicItem(index: string): Promise<unknown> {
  return apiFetch<unknown>(`/magic-items/${index}`)
}

export async function getRulesReference(): Promise<{
  conditions: SrdListItem[]
  damageTypes: SrdListItem[]
  skills: SrdListItem[]
  abilityScores: SrdListItem[]
}> {
  const [conditions, damageTypes, skills, abilityScores] = await Promise.all([
    apiFetch<SrdListResponse>('/conditions').then(r => r.results),
    apiFetch<SrdListResponse>('/damage-types').then(r => r.results),
    apiFetch<SrdListResponse>('/skills').then(r => r.results),
    apiFetch<SrdListResponse>('/ability-scores').then(r => r.results),
  ])
  return { conditions, damageTypes, skills, abilityScores }
}

export async function getRulesItem(category: string, index: string): Promise<unknown> {
  return apiFetch<unknown>(`/${category}/${index}`)
}
