import type { UIState } from '../store/useUIStore'

const THEME_MAP: Record<UIState['theme'], string> = {
  candlelight:    '',
  eldritch:       'castlevania',
  neon:           'castlevania',
  icarus:         'dungeon',
  'high-contrast': 'escape',
}

export function ktThemeToDungeonGadgets(kt: UIState['theme']): string {
  return THEME_MAP[kt] ?? ''
}
