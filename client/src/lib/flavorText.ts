// Rotating flavor lines shown while waiting on an AI generation call.
// Edit freely — lines rotate every ~2.4s. `default` lines are mixed in after
// any category-specific lines so every wait always has enough variety.
export const GENERATION_FLAVOR_TEXT: Record<string, string[]> = {
  default: [
    'Consulting the old maps…',
    'Rousing the innkeeper…',
    'Summoning something from the dark…',
    'Sharpening quills and dice…',
    'Flipping through yellowed pages…',
    'Rolling behind the screen…',
    'Chasing down a rumor…',
  ],
  npc: [
    'Giving them a name worth remembering…',
    'Deciding what they want, and what they hide…',
    'Practicing their voice…',
  ],
  encounter: [
    'Setting the trap…',
    'Counting initiative dice…',
    'Choosing which door creaks…',
  ],
  treasure: [
    'Digging through the hoard…',
    'Appraising something suspicious…',
  ],
  creature: [
    'Waking something from the bestiary…',
    'Filing down its claws…',
  ],
  map: [
    'Unrolling the parchment…',
    'Charting unknown territory…',
    'Inking the coastline…',
  ],
  portrait: [
    'Sketching a likeness…',
    'Finding the right expression…',
  ],
  recap: [
    'Reading between the lines of your notes…',
    'Piecing the session back together…',
    "Remembering what happened after the third drink…",
  ],
  prep: [
    'Scanning your hooks and plot threads…',
    'Weighing what the party hasn’t noticed yet…',
  ],
}

export function pickFlavorPool(key?: string): string[] {
  const extra = (key && GENERATION_FLAVOR_TEXT[key]) ?? []
  return [...extra, ...GENERATION_FLAVOR_TEXT.default]
}
