import { Router } from 'express'
import { requireAuth } from '../middleware/auth.middleware.js'
import * as dnd5e from '../services/dnd5e-api.service.js'

export const dnd5eRouter = Router()

dnd5eRouter.use(requireAuth)

function searchList(items: dnd5e.SrdListItem[], q?: string): dnd5e.SrdListItem[] {
  if (!q || !q.trim()) return items
  const lower = q.toLowerCase()
  return items.filter(i => i.name.toLowerCase().includes(lower) || i.index.includes(lower))
}

dnd5eRouter.get('/spells', async (req, res) => {
  try {
    const list = await dnd5e.listSpells()
    const { q, level, school } = req.query
    let results = searchList(list, q as string)
    if (level !== undefined || school) {
      const detailed = await Promise.all(results.slice(0, 300).map(s => dnd5e.getSpell(s.index).catch(() => null)))
      results = detailed
        .map((d, i) => ({ detail: d as Record<string, unknown> | null, item: results[i] }))
        .filter(({ detail }) => {
          if (!detail) return false
          if (level !== undefined && String(detail.level) !== String(level)) return false
          if (school && (detail.school as { index?: string } | null)?.index !== school) return false
          return true
        })
        .map(({ item }) => item)
    }
    res.json({ results, count: results.length })
  } catch (err) {
    console.error('[dnd5e] spells error', err)
    res.status(502).json({ error: 'Failed to fetch spell list' })
  }
})

dnd5eRouter.get('/spells/:index', async (req, res) => {
  try {
    const data = await dnd5e.getSpell(req.params.index)
    res.json(data)
  } catch (err) {
    console.error('[dnd5e] spell detail error', err)
    res.status(502).json({ error: 'Failed to fetch spell' })
  }
})

dnd5eRouter.get('/monsters', async (req, res) => {
  try {
    const list = await dnd5e.listMonsters()
    const results = searchList(list, req.query.q as string)
    res.json({ results, count: results.length })
  } catch (err) {
    console.error('[dnd5e] monsters error', err)
    res.status(502).json({ error: 'Failed to fetch monster list' })
  }
})

dnd5eRouter.get('/monsters/:index', async (req, res) => {
  try {
    const data = await dnd5e.getMonster(req.params.index)
    res.json(data)
  } catch (err) {
    console.error('[dnd5e] monster detail error', err)
    res.status(502).json({ error: 'Failed to fetch monster' })
  }
})

dnd5eRouter.get('/classes', async (req, res) => {
  try {
    const results = await dnd5e.listClasses()
    res.json({ results, count: results.length })
  } catch (err) {
    console.error('[dnd5e] classes error', err)
    res.status(502).json({ error: 'Failed to fetch classes' })
  }
})

dnd5eRouter.get('/classes/:index/subclasses', async (req, res) => {
  try {
    const results = await dnd5e.getClassSubclasses(req.params.index)
    res.json({ results, count: results.length })
  } catch (err) {
    console.error('[dnd5e] subclasses error', err)
    res.status(502).json({ error: 'Failed to fetch subclasses' })
  }
})

dnd5eRouter.get('/races', async (req, res) => {
  try {
    const results = await dnd5e.listRaces()
    res.json({ results, count: results.length })
  } catch (err) {
    console.error('[dnd5e] races error', err)
    res.status(502).json({ error: 'Failed to fetch races' })
  }
})

dnd5eRouter.get('/equipment', async (req, res) => {
  try {
    const list = await dnd5e.listEquipment()
    const results = searchList(list, req.query.q as string)
    res.json({ results, count: results.length })
  } catch (err) {
    console.error('[dnd5e] equipment error', err)
    res.status(502).json({ error: 'Failed to fetch equipment list' })
  }
})

dnd5eRouter.get('/equipment/:index', async (req, res) => {
  try {
    const data = await dnd5e.getEquipment(req.params.index)
    res.json(data)
  } catch (err) {
    console.error('[dnd5e] equipment detail error', err)
    res.status(502).json({ error: 'Failed to fetch equipment' })
  }
})

dnd5eRouter.get('/magic-items', async (req, res) => {
  try {
    const list = await dnd5e.listMagicItems()
    const results = searchList(list, req.query.q as string)
    res.json({ results, count: results.length })
  } catch (err) {
    console.error('[dnd5e] magic-items error', err)
    res.status(502).json({ error: 'Failed to fetch magic item list' })
  }
})

dnd5eRouter.get('/magic-items/:index', async (req, res) => {
  try {
    const data = await dnd5e.getMagicItem(req.params.index)
    res.json(data)
  } catch (err) {
    console.error('[dnd5e] magic-item detail error', err)
    res.status(502).json({ error: 'Failed to fetch magic item' })
  }
})

dnd5eRouter.get('/rules', async (req, res) => {
  try {
    const data = await dnd5e.getRulesReference()
    res.json(data)
  } catch (err) {
    console.error('[dnd5e] rules error', err)
    res.status(502).json({ error: 'Failed to fetch rules reference' })
  }
})

dnd5eRouter.get('/rules/:category/:index', async (req, res) => {
  try {
    const { category, index } = req.params
    const allowed = ['conditions', 'damage-types', 'skills', 'ability-scores']
    if (!allowed.includes(category)) {
      res.status(400).json({ error: 'Invalid category' })
      return
    }
    const data = await dnd5e.getRulesItem(category, index)
    res.json(data)
  } catch (err) {
    console.error('[dnd5e] rules item error', err)
    res.status(502).json({ error: 'Failed to fetch rules item' })
  }
})
