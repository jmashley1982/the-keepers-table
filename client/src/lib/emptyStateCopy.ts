// Centralized empty-state copy — edit freely, one place for every section.
export interface EmptyStateCopy {
  icon: string
  title: string
  description: string
}

export const EMPTY_STATE_COPY: Record<string, EmptyStateCopy> = {
  campaigns: {
    icon: '📖',
    title: 'No campaigns yet',
    description: 'Every legend starts on a blank page. Start your first campaign.',
  },
  npcs: {
    icon: '🧙',
    title: 'No NPCs yet',
    description: 'The tavern is quiet — conjure someone worth remembering.',
  },
  items: {
    icon: '⚔️',
    title: 'No items yet',
    description: 'The vault stands empty. Forge something worth finding.',
  },
  locations: {
    icon: '🗺️',
    title: 'No locations yet',
    description: 'The map is blank beyond the borders you’ve drawn.',
  },
  factions: {
    icon: '⚜️',
    title: 'No factions yet',
    description: 'No banners fly yet. Someone should claim this ground.',
  },
  encounters: {
    icon: '💀',
    title: 'No encounters yet',
    description: 'The dice are still. Nothing lurks here — yet.',
  },
  'plot-threads': {
    icon: '📜',
    title: 'No plot threads yet',
    description: 'The pages await your first entry.',
  },
  sessions: {
    icon: '📅',
    title: 'No sessions yet',
    description: 'The story hasn’t started. Log your first session when you’re ready.',
  },
  players: {
    icon: '🧝',
    title: 'No player characters yet',
    description: 'An empty table. Add the heroes who’ll sit at it.',
  },
  maps: {
    icon: '🗺️',
    title: 'No maps yet',
    description: 'Uncharted. Sketch out where the party will tread.',
  },
  creatures: {
    icon: '💀',
    title: 'No creatures found',
    description: 'The bestiary is bare. Generate a threat or two.',
  },
  equipment: {
    icon: '🎒',
    title: 'No equipment yet',
    description: 'An empty pack — nothing to weigh them down.',
  },
}
