/**
 * Helper unificado para determinar la modalidad de cobro / indexación de un recibo.
 * Permite saber si un recibo fue emitido indexado al Dólar Oficial BCV o si es anclado a Bolívares fijos.
 */

export interface ReciboIndexacionCheck {
  es_indexado?: boolean | null
  data_json?: any
  mes_facturado?: string
}

/**
 * Retorna true si el recibo está anclado a Dólares (indexado a tasa BCV diaria).
 * Retorna false si está anclado estrictamente a Bolívares fijos (no indexado).
 */
export function esReciboIndexado(recibo: ReciboIndexacionCheck | null | undefined): boolean {
  if (!recibo) return true

  // 1. Verificación directa si existe la propiedad
  if (recibo.es_indexado !== undefined && recibo.es_indexado !== null) {
    return Boolean(recibo.es_indexado)
  }

  // 2. Verificación dentro de data_json
  if (recibo.data_json?.es_indexado !== undefined && recibo.data_json?.es_indexado !== null) {
    return Boolean(recibo.data_json.es_indexado)
  }

  // 3. Retrocompatibilidad histórica: si es anterior a septiembre 2026 y no tenía marca, se asume no indexado
  if (recibo.mes_facturado && String(recibo.mes_facturado).slice(0, 7) < '2026-09') {
    return false
  }

  return true
}
