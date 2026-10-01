/**
 * Helper unificado para determinar la modalidad de cobro / indexación de un recibo
 * y el período de administración (Anterior vs Actual).
 */

export interface ReciboIndexacionCheck {
  es_indexado?: boolean | null
  data_json?: any
  mes_facturado?: string
}

/**
 * Retorna true si el mes indicado pertenece a la administración anterior
 * (es decir, es estrictamente anterior a la fecha de entrada de la administración actual).
 */
export function esMesAdministracionAnterior(
  mesStr: string | null | undefined,
  fechaInicioGestion?: string | null
): boolean {
  if (!mesStr) return false
  const fechaCorte = (fechaInicioGestion || '2026-09-01').slice(0, 7)
  return mesStr.slice(0, 7) < fechaCorte
}

/**
 * Retorna true si el recibo está anclado a Dólares (indexado a tasa BCV diaria).
 * Retorna false si está anclado estrictamente a Bolívares fijos (no indexado).
 */
export function esReciboIndexado(
  recibo: ReciboIndexacionCheck | null | undefined,
  fechaInicioGestion?: string | null
): boolean {
  if (!recibo) return true

  // 1. Verificación explícita en data_json (si el administrador tildó o destildó al emitir)
  if (recibo.data_json?.es_indexado !== undefined && recibo.data_json?.es_indexado !== null) {
    return Boolean(recibo.data_json.es_indexado)
  }

  // 2. Verificación directa si existe la columna en el registro
  if (recibo.es_indexado !== undefined && recibo.es_indexado !== null) {
    return Boolean(recibo.es_indexado)
  }

  // 3. Verificación de período de administración dinámica
  const fechaCorte = (fechaInicioGestion || '2026-09-01').slice(0, 7)
  if (recibo.mes_facturado && String(recibo.mes_facturado).slice(0, 7) < fechaCorte) {
    return false
  }

  return true
}
