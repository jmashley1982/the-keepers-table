import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export function useDnd5eEnabled(systemTemplateId?: string | null): boolean {
  return systemTemplateId === 'builtin-d-d-5e'
}

export interface SrdItem {
  index: string
  name: string
  url?: string
}

export function useDnd5eClasses() {
  return useQuery<SrdItem[]>({
    queryKey: ['dnd5e', 'classes'],
    queryFn: () => api.get('/api/dnd5e/classes').then(r => r.data.results),
    staleTime: 12 * 60 * 60 * 1000,
    retry: 1,
  })
}

export function useDnd5eSubclasses(classIndex: string | null) {
  return useQuery<SrdItem[]>({
    queryKey: ['dnd5e', 'subclasses', classIndex],
    queryFn: () => api.get(`/api/dnd5e/classes/${classIndex}/subclasses`).then(r => r.data.results),
    enabled: !!classIndex,
    staleTime: 12 * 60 * 60 * 1000,
    retry: 1,
  })
}

export function useDnd5eRaces() {
  return useQuery<SrdItem[]>({
    queryKey: ['dnd5e', 'races'],
    queryFn: () => api.get('/api/dnd5e/races').then(r => r.data.results),
    staleTime: 12 * 60 * 60 * 1000,
    retry: 1,
  })
}

export function useDnd5eSpells(q?: string, level?: string, school?: string) {
  return useQuery<SrdItem[]>({
    queryKey: ['dnd5e', 'spells', q, level, school],
    queryFn: () => api.get('/api/dnd5e/spells', {
      params: {
        ...(q ? { q } : {}),
        ...(level !== undefined && level !== '' ? { level } : {}),
        ...(school ? { school } : {}),
      },
    }).then(r => r.data.results),
    staleTime: 12 * 60 * 60 * 1000,
    retry: 1,
  })
}

export function useDnd5eSpell(index: string | null) {
  return useQuery<Record<string, unknown>>({
    queryKey: ['dnd5e', 'spell', index],
    queryFn: () => api.get(`/api/dnd5e/spells/${index}`).then(r => r.data),
    enabled: !!index,
    staleTime: 12 * 60 * 60 * 1000,
    retry: 1,
  })
}

export function useDnd5eMonsters(q?: string) {
  return useQuery<SrdItem[]>({
    queryKey: ['dnd5e', 'monsters', q],
    queryFn: () => api.get('/api/dnd5e/monsters', { params: q ? { q } : {} }).then(r => r.data.results),
    staleTime: 12 * 60 * 60 * 1000,
    retry: 1,
  })
}

export function useDnd5eMonster(index: string | null) {
  return useQuery<Record<string, unknown>>({
    queryKey: ['dnd5e', 'monster', index],
    queryFn: () => api.get(`/api/dnd5e/monsters/${index}`).then(r => r.data),
    enabled: !!index,
    staleTime: 12 * 60 * 60 * 1000,
    retry: 1,
  })
}

export function useDnd5eEquipment(q?: string) {
  return useQuery<SrdItem[]>({
    queryKey: ['dnd5e', 'equipment', q],
    queryFn: () => api.get('/api/dnd5e/equipment', { params: q ? { q } : {} }).then(r => r.data.results),
    staleTime: 12 * 60 * 60 * 1000,
    retry: 1,
  })
}

export function useDnd5eEquipmentDetail(index: string | null) {
  return useQuery<Record<string, unknown>>({
    queryKey: ['dnd5e', 'equipment-detail', index],
    queryFn: () => api.get(`/api/dnd5e/equipment/${index}`).then(r => r.data),
    enabled: !!index,
    staleTime: 12 * 60 * 60 * 1000,
    retry: 1,
  })
}

export function useDnd5eMagicItems(q?: string) {
  return useQuery<SrdItem[]>({
    queryKey: ['dnd5e', 'magic-items', q],
    queryFn: () => api.get('/api/dnd5e/magic-items', { params: q ? { q } : {} }).then(r => r.data.results),
    staleTime: 12 * 60 * 60 * 1000,
    retry: 1,
  })
}

export function useDnd5eMagicItemDetail(index: string | null) {
  return useQuery<Record<string, unknown>>({
    queryKey: ['dnd5e', 'magic-item-detail', index],
    queryFn: () => api.get(`/api/dnd5e/magic-items/${index}`).then(r => r.data),
    enabled: !!index,
    staleTime: 12 * 60 * 60 * 1000,
    retry: 1,
  })
}

export interface RulesReference {
  conditions: SrdItem[]
  damageTypes: SrdItem[]
  skills: SrdItem[]
  abilityScores: SrdItem[]
}

export function useDnd5eRules() {
  return useQuery<RulesReference>({
    queryKey: ['dnd5e', 'rules'],
    queryFn: () => api.get('/api/dnd5e/rules').then(r => r.data),
    staleTime: 12 * 60 * 60 * 1000,
    retry: 1,
  })
}

export function useDnd5eRulesItem(category: string | null, index: string | null) {
  return useQuery<Record<string, unknown>>({
    queryKey: ['dnd5e', 'rules-item', category, index],
    queryFn: () => api.get(`/api/dnd5e/rules/${category}/${index}`).then(r => r.data),
    enabled: !!category && !!index,
    staleTime: 12 * 60 * 60 * 1000,
    retry: 1,
  })
}
