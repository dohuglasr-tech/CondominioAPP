// ── Theme Manager Dinámico para Condominio ──
// Permite al Administrador cambiar el color del edificio y sincronizar toda la app

export interface ThemePalette {
  primary: string
  hover: string
  light: string
  glow: string
  border: string
  gradient: string
  heroGradient: string
  shadow: string
}

export interface PresetColor {
  name: string
  hex: string
  accent: string
}

export const PRESET_THEME_COLORS: PresetColor[] = [
  { name: 'Naranja Sunset', hex: '#f97316', accent: 'Cálido y energético (Original)' },
  { name: 'Rojo Rubí', hex: '#ef4444', accent: 'Imponente y corporativo' },
  { name: 'Azul Zafiro', hex: '#2563eb', accent: 'Tecnológico y financiero' },
  { name: 'Verde Esmeralda', hex: '#10b981', accent: 'Sostenible y armónico' },
  { name: 'Púrpura Real', hex: '#8b5cf6', accent: 'Exclusivo y moderno' },
  { name: 'Cian Océano', hex: '#06b6d4', accent: 'Fresco e innovador' },
  { name: 'Ámbar Dorado', hex: '#d97706', accent: 'Prestigioso y sobrio' },
  { name: 'Fucsia Neón', hex: '#ec4899', accent: 'Vibrante y audaz' },
]

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let c = (hex || '#f97316').replace('#', '').trim()
  if (c.length === 3) {
    c = c.split('').map(x => x + x).join('')
  }
  const num = parseInt(c, 16)
  if (isNaN(num)) return { r: 249, g: 115, b: 22 }
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  }
}

export function adjustBrightness(hex: string, percent: number): string {
  const { r, g, b } = hexToRgb(hex)
  const adjust = (val: number) => {
    const res = Math.round(val * (1 + percent / 100))
    return Math.min(255, Math.max(0, res))
  }
  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${toHex(adjust(r))}${toHex(adjust(g))}${toHex(adjust(b))}`
}

export function generateThemePalette(primaryHex?: string | null): ThemePalette {
  let hex = (primaryHex || '#f97316').trim()
  if (!hex.startsWith('#')) hex = `#${hex}`
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) hex = '#f97316'

  const { r, g, b } = hexToRgb(hex)
  const lighter = adjustBrightness(hex, 16)
  const hover = adjustBrightness(hex, -14)
  const darkest = adjustBrightness(hex, -28)

  return {
    primary: hex,
    hover,
    light: `rgba(${r}, ${g}, ${b}, 0.15)`,
    glow: `rgba(${r}, ${g}, ${b}, 0.40)`,
    border: `rgba(${r}, ${g}, ${b}, 0.35)`,
    gradient: `linear-gradient(135deg, ${lighter} 0%, ${hex} 50%, ${hover} 100%)`,
    heroGradient: `linear-gradient(145deg, ${lighter} 0%, ${hex} 45%, ${darkest} 100%)`,
    shadow: `0 4px 20px rgba(${r}, ${g}, ${b}, 0.40)`,
  }
}

export function applyTheme(primaryHex?: string | null): ThemePalette {
  const color = primaryHex || getStoredThemeColor()
  const palette = generateThemePalette(color)

  try {
    localStorage.setItem('domus_primary_color', palette.primary)
  } catch (_) {
    // ignorar si localStorage está restringido
  }

  if (typeof document !== 'undefined') {
    const root = document.documentElement
    root.style.setProperty('--color-accent', palette.primary)
    root.style.setProperty('--color-accent-hover', palette.hover)
    root.style.setProperty('--color-accent-light', palette.light)
    root.style.setProperty('--color-accent-glow', palette.glow)
    root.style.setProperty('--border-accent', palette.border)
    root.style.setProperty('--color-brand-gradient', palette.gradient)
    root.style.setProperty('--color-brand-hero', palette.heroGradient)
    root.style.setProperty('--color-brand-shadow', palette.shadow)
  }

  return palette
}

export function getStoredThemeColor(): string {
  try {
    return localStorage.getItem('domus_primary_color') || '#f97316'
  } catch (_) {
    return '#f97316'
  }
}
