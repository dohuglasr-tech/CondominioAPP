import { describe, it, expect } from 'vitest'
import {
  getAlicuotaDecimal,
  getAlicuotaPctNumber,
  formatAlicuotaPct,
  parseAlicuotaInput,
  compararApartamentos
} from '../utils/alicuota'
import { esMesAdministracionAnterior, esReciboIndexado } from '../utils/indexacionHelper'

describe('alicuota e indexacionHelper', () => {
  it('normaliza alícuotas decimales y porcentuales con precisión', () => {
    expect(getAlicuotaDecimal(0.0159)).toBeCloseTo(0.0159, 6)
    expect(getAlicuotaDecimal(1.59)).toBeCloseTo(0.0159, 6)
    expect(getAlicuotaDecimal('2,59')).toBeCloseTo(0.0259, 6)

    expect(getAlicuotaPctNumber(0.015625)).toBe(1.5625)
    expect(formatAlicuotaPct(0.03125)).toBe('3.125%')
    expect(parseAlicuotaInput('1,5625%')).toBe(0.015625)
  })

  it('ordena naturalmente apartamentos numéricos y PH al final', () => {
    const ordenados = ['5PH2', '502', '5101', '5PH1', '501'].sort(compararApartamentos)
    expect(ordenados).toEqual(['501', '502', '5101', '5PH1', '5PH2'])
  })

  it('determina correctamente si un recibo es de administración anterior o indexado', () => {
    expect(esMesAdministracionAnterior('2026-08-01', '2026-09-01')).toBe(true)
    expect(esMesAdministracionAnterior('2026-09-01', '2026-09-01')).toBe(false)

    // Prioridad 1: data_json.es_indexado
    expect(esReciboIndexado({ es_indexado: false, data_json: { es_indexado: true }, mes_facturado: '2026-07-01' }, '2026-09-01')).toBe(true)
    // Prioridad 2: columna es_indexado
    expect(esReciboIndexado({ es_indexado: false, mes_facturado: '2026-10-01' }, '2026-09-01')).toBe(false)
    // Prioridad 3: fecha de gestión
    expect(esReciboIndexado({ mes_facturado: '2026-08-01' }, '2026-09-01')).toBe(false)
    expect(esReciboIndexado({ mes_facturado: '2026-10-01' }, '2026-09-01')).toBe(true)
  })
})
