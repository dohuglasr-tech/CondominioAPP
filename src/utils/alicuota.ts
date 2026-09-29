/**
 * Utilidades para cálculo, formateo y persistencia de alícuotas en el condominio.
 * 
 * En la base de datos se guarda preferiblemente en formato decimal (ej: 0.015625 para 1.5625% o 0.031250 para 3.1250% de Penthouse).
 * Estas funciones toleran tanto valores decimales (<= 0.5) como porcentajes (> 0.5).
 */

/**
 * Convierte el valor de alícuota a fracción decimal para cálculos matemáticos.
 * Ejemplos:
 *  0.015625 -> 0.015625
 *  1.5625   -> 0.015625
 *  0.03125  -> 0.03125 (Penthouse)
 *  3.125    -> 0.03125 (Penthouse)
 */
export function getAlicuotaDecimal(val: number | string | null | undefined): number {
  if (val === null || val === undefined || val === '') return 0
  const num = typeof val === 'string' ? parseFloat(val.replace(',', '.')) : val
  if (isNaN(num) || num <= 0) return 0
  // Si es mayor a 0.5, se asume que fue ingresado o guardado como porcentaje (ej: 1.5625%)
  if (num > 0.5) return num / 100
  return num
}

/**
 * Retorna el valor numérico en formato porcentaje (ej: 1.5625 o 3.125).
 */
export function getAlicuotaPctNumber(val: number | string | null | undefined): number {
  if (val === null || val === undefined || val === '') return 0
  const num = typeof val === 'string' ? parseFloat(val.replace(',', '.')) : val
  if (isNaN(num) || num <= 0) return 0
  if (num <= 0.5) return Number((num * 100).toFixed(4))
  return Number(num.toFixed(4))
}

/**
 * Formatea la alícuota como texto con símbolo % para mostrar en tablas y recibos.
 * Ej: "1.5625%", "3.125%"
 */
export function formatAlicuotaPct(val: number | string | null | undefined): string {
  const pct = getAlicuotaPctNumber(val)
  return `${pct}%`
}

/**
 * Parsea el texto ingresado por el admin en el formulario (ej: "1.5625" o "3.125" o "0.015625")
 * y retorna el decimal listo para persistir en la base de datos (ej: 0.015625).
 */
export function parseAlicuotaInput(val: number | string): number {
  if (val === null || val === undefined || val === '') return 0
  const num = typeof val === 'string' ? parseFloat(val.replace(',', '.').replace('%', '').trim()) : val
  if (isNaN(num) || num <= 0) return 0
  // Si el admin escribió el porcentaje directamente (ej: 1.5625 o 3.125)
  if (num > 0.5) return Number((num / 100).toFixed(6))
  return Number(num.toFixed(6))
}

/**
 * Ordenamiento natural para números de apartamentos (ej: 501, 502, ..., 5101, 5PH1, 5PH2).
 */
export function compararApartamentos(a: string, b: string): number {
  const esPhA = a.toUpperCase().includes('PH')
  const esPhB = b.toUpperCase().includes('PH')
  if (!esPhA && esPhB) return -1
  if (esPhA && !esPhB) return 1

  const numA = parseInt(a.replace(/\D/g, '')) || 0
  const numB = parseInt(b.replace(/\D/g, '')) || 0
  if (numA !== numB) return numA - numB
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}
