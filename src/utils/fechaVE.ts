/**
 * Utilidades centralizadas de fecha en zona horaria oficial de Venezuela (America/Caracas, UTC-4).
 * Evita que operaciones realizadas después de las 8:00 PM VET salten al día o mes siguiente en UTC.
 */

const VE_TIMEZONE = 'America/Caracas'

const veYmdFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: VE_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * Devuelve la fecha actual (o la de un Date dado) en formato YYYY-MM-DD usando hora de Venezuela (UTC-4).
 */
export function getHoyVE(date: Date = new Date()): string {
  const safeDate = date instanceof Date && !isNaN(date.getTime()) ? date : new Date()
  const parts = veYmdFormatter.formatToParts(safeDate)
  const y = parts.find(p => p.type === 'year')?.value
  const m = parts.find(p => p.type === 'month')?.value
  const d = parts.find(p => p.type === 'day')?.value
  if (y && m && d) return `${y}-${m}-${d}`
  return safeDate.toISOString().slice(0, 10)
}

/**
 * Devuelve el mes actual (o el de un Date dado) en formato YYYY-MM usando hora de Venezuela (UTC-4).
 */
export function getMesActualVE(date: Date = new Date()): string {
  return getHoyVE(date).slice(0, 7)
}

/**
 * Devuelve el año calendario actual (o el de un Date dado) en hora de Venezuela (UTC-4).
 */
export function getAnioActualVE(date: Date = new Date()): number {
  return Number(getHoyVE(date).slice(0, 4)) || new Date().getFullYear()
}

/**
 * Formatea una fecha ISO (YYYY-MM-DD / timestamp) o Date a DD/MM/YYYY en contexto Venezuela.
 */
export function formatFechaVE(isoOrDate: string | Date): string {
  if (!isoOrDate) return ''
  if (typeof isoOrDate === 'string') {
    const clean = isoOrDate.trim().slice(0, 10)
    const match = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (match) return `${match[3]}/${match[2]}/${match[1]}`
    const parsed = new Date(isoOrDate)
    if (!isNaN(parsed.getTime())) {
      const ymd = getHoyVE(parsed)
      const [y, m, d] = ymd.split('-')
      return `${d}/${m}/${y}`
    }
    return isoOrDate
  }
  const ymd = getHoyVE(isoOrDate)
  const [y, m, d] = ymd.split('-')
  return `${d}/${m}/${y}`
}
