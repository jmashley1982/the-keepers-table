import candlelight from '@assets/candlelight_1784234226151.png'
import eldritch from '@assets/eldritch_1784234226151.png'
import icarus from '@assets/icarus_1784234226151.png'
import neon from '@assets/neon_1784234226151.png'
import contrast from '@assets/contrast_1784234226151.png'

const ICONS: Record<string, string> = {
  candlelight,
  eldritch,
  icarus,
  neon,
  'high-contrast': contrast,
}

export function themeBrandIcon(theme: string): string {
  return ICONS[theme] ?? candlelight
}
