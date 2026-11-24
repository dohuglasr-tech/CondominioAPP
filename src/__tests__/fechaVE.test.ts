import { describe, it, expect } from 'vitest'
import { getHoyVE, getMesActualVE, getAnioActualVE, formatFechaVE } from '../utils/fechaVE'

describe('fechaVE (Zona Horaria Venezuela UTC-4)', () => {
  it('mantiene la fecha local VE incluso de noche en UTC (después de 20:00 VET)', () => {
    // 2026-11-25 02:30 UTC corresponde a 2026-11-24 22:30 VET
    const nocheCaracas = new Date('2026-11-25T02:30:00.000Z')
    expect(getHoyVE(nocheCaracas)).toBe('2026-11-24')

    // 2026-11-25 04:05 UTC corresponde a 2026-11-25 00:05 VET
    const madrugadaCaracas = new Date('2026-11-25T04:05:00.000Z')
    expect(getHoyVE(madrugadaCaracas)).toBe('2026-11-25')
  })

  it('calcula mes y año VE sin desfasarse en víspera de Año Nuevo UTC', () => {
    // 2026-01-01 03:59 UTC corresponde a 2025-12-31 23:59 VET
    const finDeAnioCaracas = new Date('2026-01-01T03:59:00.000Z')
    expect(getHoyVE(finDeAnioCaracas)).toBe('2025-12-31')
    expect(getMesActualVE(finDeAnioCaracas)).toBe('2025-12')
    expect(getAnioActualVE(finDeAnioCaracas)).toBe(2025)
  })

  it('formatea fechas ISO y Date a DD/MM/YYYY correctamente', () => {
    expect(formatFechaVE('2026-11-24')).toBe('24/11/2026')
    expect(formatFechaVE(new Date('2026-05-01T15:00:00.000Z'))).toBe('01/05/2026')
    expect(formatFechaVE('')).toBe('')
  })
})
