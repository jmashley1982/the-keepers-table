import type { UIState } from '../store/useUIStore'

export function themeLogo(theme: UIState['theme']): string {
  return `/logos/${theme}.webp`
}
