/**
 * Fuente única centralizada para la Tasa Oficial BCV en toda la aplicación.
 * Elimina constantes mágicas dispersas y distingue tasas activas vs. respaldo.
 */

export const FALLBACK_TASA_BCV_ULTIMO_RECURSO = 859.06
const STORAGE_KEY_LAST_BCV = 'domus_last_valid_bcv_rate'

export interface TasaBcvResolution {
  tasa: number
  esRespaldo: boolean
  fuente: 'config' | 'param' | 'cache' | 'fallback'
}

export function esTasaBcvValida(tasa?: number | null): tasa is number {
  return typeof tasa === 'number' && Number.isFinite(tasa) && tasa > 1
}

export function guardarUltimaTasaBcvConocida(tasa: number): void {
  if (!esTasaBcvValida(tasa) || typeof window === 'undefined') return
  try {
    localStorage.setItem(
      STORAGE_KEY_LAST_BCV,
      JSON.stringify({ tasa: Number(tasa.toFixed(4)), updatedAt: Date.now() })
    )
  } catch {
    // Ignorar errores de cuota/modo privado en localStorage
  }
}

export function obtenerUltimaTasaBcvCache(): number | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LAST_BCV)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const num = Number(parsed?.tasa)
    return esTasaBcvValida(num) ? num : null
  } catch {
    return null
  }
}

/**
 * Resuelve la tasa BCV siguiendo prioridad estricta:
 * 1. Tasa oficial cargada en configuración del edificio (`tasaConfig`)
 * 2. Tasa explícita del parámetro/movimiento (`tasaParam`)
 * 3. Última tasa real persistida en localStorage (`cache`, marca `esRespaldo = true`)
 * 4. Último recurso centralizado (`fallback`, marca `esRespaldo = true`)
 */
export function obtenerTasaBcvConfiable(
  tasaConfig?: number | null,
  tasaParam?: number | null
): TasaBcvResolution {
  const cfgNum = tasaConfig !== null && tasaConfig !== undefined ? Number(tasaConfig) : null
  if (esTasaBcvValida(cfgNum)) {
    return { tasa: cfgNum, esRespaldo: false, fuente: 'config' }
  }

  const paramNum = tasaParam !== null && tasaParam !== undefined ? Number(tasaParam) : null
  if (esTasaBcvValida(paramNum)) {
    return { tasa: paramNum, esRespaldo: false, fuente: 'param' }
  }

  const cached = obtenerUltimaTasaBcvCache()
  if (esTasaBcvValida(cached)) {
    return { tasa: cached, esRespaldo: true, fuente: 'cache' }
  }

  return {
    tasa: FALLBACK_TASA_BCV_ULTIMO_RECURSO,
    esRespaldo: true,
    fuente: 'fallback',
  }
}

export function getTasaBcvNumerica(
  ...candidatas: Array<number | string | null | undefined>
): number {
  for (const candidata of candidatas) {
    if (candidata !== null && candidata !== undefined) {
      const num = Number(candidata)
      if (esTasaBcvValida(num)) return num
    }
  }
  return obtenerTasaBcvConfiable().tasa
}
