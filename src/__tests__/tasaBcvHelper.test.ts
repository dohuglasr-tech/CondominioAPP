import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  FALLBACK_TASA_BCV_ULTIMO_RECURSO,
  esTasaBcvValida,
  guardarUltimaTasaBcvConocida,
  obtenerUltimaTasaBcvCache,
  obtenerTasaBcvConfiable,
  getTasaBcvNumerica
} from '../utils/tasaBcvHelper'

function installLocalStorageMock() {
  const store = new Map<string, string>()
  ;(globalThis as unknown as { window?: unknown; localStorage?: unknown }).window = globalThis
  ;(globalThis as unknown as { localStorage?: Storage }).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => { store.clear() },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size }
  } as Storage
}

describe('tasaBcvHelper (Fuente Única BCV)', () => {
  const origWindow = (globalThis as unknown as { window?: unknown }).window
  const origLS = (globalThis as unknown as { localStorage?: unknown }).localStorage

  beforeEach(() => {
    installLocalStorageMock()
  })

  afterEach(() => {
    ;(globalThis as unknown as { window?: unknown }).window = origWindow
    ;(globalThis as unknown as { localStorage?: unknown }).localStorage = origLS
  })

  it('valida tasas BCV positivas mayores a 1', () => {
    expect(esTasaBcvValida(null)).toBe(false)
    expect(esTasaBcvValida(undefined)).toBe(false)
    expect(esTasaBcvValida(0)).toBe(false)
    expect(esTasaBcvValida(1)).toBe(false)
    expect(esTasaBcvValida(Number.NaN)).toBe(false)
    expect(esTasaBcvValida(862.45)).toBe(true)
  })

  it('respeta prioridad estricta: config > param > cache > fallback', () => {
    guardarUltimaTasaBcvConocida(840.5)
    expect(obtenerUltimaTasaBcvCache()).toBe(840.5)

    const r1 = obtenerTasaBcvConfiable(900.1, 880.2)
    expect(r1).toEqual({ tasa: 900.1, esRespaldo: false, fuente: 'config' })

    const r2 = obtenerTasaBcvConfiable(null, 880.2)
    expect(r2).toEqual({ tasa: 880.2, esRespaldo: false, fuente: 'param' })

    const r3 = obtenerTasaBcvConfiable(null, 0)
    expect(r3).toEqual({ tasa: 840.5, esRespaldo: true, fuente: 'cache' })
  })

  it('usa el respaldo centralizado cuando no hay caché ni parámetro válido', () => {
    const r = obtenerTasaBcvConfiable(undefined, null)
    expect(r).toEqual({
      tasa: FALLBACK_TASA_BCV_ULTIMO_RECURSO,
      esRespaldo: true,
      fuente: 'fallback'
    })
    expect(getTasaBcvNumerica(null, '0', '875.125')).toBe(875.125)
  })
})
