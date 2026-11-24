import { describe, it, expect, beforeEach } from 'vitest'
import {
  setActiveEdificioId,
  getActiveEdificioId,
  setActiveEdificioConfig,
  getActiveEdificioConfig,
  getActiveEdificioNombre,
  withEdificioId,
} from '../data/tenantContext'

describe('tenantContext', () => {
  beforeEach(() => {
    setActiveEdificioId(null)
    setActiveEdificioConfig(null)
  })

  it('normaliza espacios y valores vacíos en setActiveEdificioId', () => {
    setActiveEdificioId('  ed-123  ')
    expect(getActiveEdificioId()).toBe('ed-123')

    setActiveEdificioId('   ')
    expect(getActiveEdificioId()).toBeNull()

    setActiveEdificioId(undefined)
    expect(getActiveEdificioId()).toBeNull()
  })

  it('sincroniza edificio_id al establecer configuración y devuelve nombre o fallback genérico', () => {
    expect(getActiveEdificioNombre()).toBe('Condominio Domus')
    expect(getActiveEdificioNombre('Mi Edificio')).toBe('Mi Edificio')

    setActiveEdificioConfig({
      id: 'ed-abc',
      nombre_edificio: '  Residencias Ávila  ',
    })
    expect(getActiveEdificioId()).toBe('ed-abc')
    expect(getActiveEdificioConfig()?.nombre_edificio).toBe('  Residencias Ávila  ')
    expect(getActiveEdificioNombre()).toBe('Residencias Ávila')

    setActiveEdificioConfig(null)
    expect(getActiveEdificioConfig()).toBeNull()
  })

  it('inyecta edificio_id en payloads cuando falta y respeta valores explícitos', () => {
    setActiveEdificioId('ed-tenant-1')

    expect(withEdificioId({ monto_usd: 25 })).toEqual({
      monto_usd: 25,
      edificio_id: 'ed-tenant-1',
    })

    expect(withEdificioId({ monto_usd: 25, edificio_id: 'ed-custom' })).toEqual({
      monto_usd: 25,
      edificio_id: 'ed-custom',
    })

    setActiveEdificioId(null)
    expect(withEdificioId({ monto_usd: 25 })).toEqual({ monto_usd: 25 })
  })
})
