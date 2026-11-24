import { describe, it, expect } from 'vitest'
import { clasificarCuotaExtraordinaria, formatearFechaCortaEs } from '../data/moraService'
import { parsearMontoFlexible } from '../data/calendarioDeudasService'

describe('moraYCuotas (Vigencia y Parseo Monetario VE/US)', () => {
  it('clasifica cuotas extraordinarias como programada, vigente o vencida', () => {
    const hoy = '2026-11-24'

    expect(clasificarCuotaExtraordinaria('2026-12-01', '2026-12-15', hoy)).toBe('programada')
    expect(clasificarCuotaExtraordinaria('2026-11-01', '2026-11-23', hoy)).toBe('vencida')
    expect(clasificarCuotaExtraordinaria('2026-11-01', '2026-11-24', hoy)).toBe('vigente')
    expect(clasificarCuotaExtraordinaria('2026-11-24', '2026-11-30', hoy)).toBe('vigente')
    expect(clasificarCuotaExtraordinaria(undefined, undefined, hoy)).toBe('vigente')
  })

  it('formatea fechas ISO cortas a formato venezolano DD/MM/YYYY', () => {
    expect(formatearFechaCortaEs('2026-11-24')).toBe('24/11/2026')
    expect(formatearFechaCortaEs('2026-03-05T10:30:00Z')).toBe('05/03/2026')
    expect(formatearFechaCortaEs('')).toBe('')
  })

  it('parsea montos flexibles en formatos venezolanos, anglosajones y con símbolos', () => {
    expect(parsearMontoFlexible('14.304,23', 'BS')).toBeCloseTo(14304.23, 2)
    expect(parsearMontoFlexible('Bs. 1.250,50', 'BS')).toBeCloseTo(1250.5, 2)
    expect(parsearMontoFlexible('14.304', 'BS')).toBe(14304)
    expect(parsearMontoFlexible('$1,250.75', 'USD')).toBeCloseTo(1250.75, 2)
    expect(parsearMontoFlexible('25.50 USD', 'USD')).toBeCloseTo(25.5, 2)
    expect(parsearMontoFlexible('1,234,567.89', 'USD')).toBeCloseTo(1234567.89, 2)
    expect(parsearMontoFlexible('', 'BS')).toBe(0)
    expect(parsearMontoFlexible(null, 'USD')).toBe(0)
  })
})
