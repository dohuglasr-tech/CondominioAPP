export interface PagoGasItemMeta {
  campanaId: string
  titulo: string
  mes: string
  montoBs: number
  montoUsd: number
  moneda: 'BS' | 'USD'
  esDeudaAnterior?: boolean
}

export interface PagoCuotaEspecialMeta {
  columnaId: string
  titulo: string
  anio: number
  monto: number
  moneda: 'BS' | 'USD'
  esAdelantado?: boolean
  esAbonoParcial?: boolean
  fechaEmision?: string
  montoOriginal?: number
  saldoRestanteEstimado?: number
}

export interface PagoDomusMeta {
  tipoServicio: 'gas' | 'condominio' | 'mixto'
  gasItems?: PagoGasItemMeta[]
  cuotasEspeciales?: PagoCuotaEspecialMeta[]
  gasMontoBs?: number
  gasMontoUsd?: number
  condominioMontoBs?: number
  condominioMontoUsd?: number
  origenAdmin?: boolean
  campanaIdUnico?: string
  esAdelantoCuotaFutura?: boolean
  esAbonoParcialAdelanto?: boolean
  soloCuotasEspeciales?: boolean
}

const DOMUS_META_PREFIX = '[DOMUS_META:'

export function stripPagoMeta(notasAdmin?: string | null): string {
  if (!notasAdmin) return ''
  const idx = notasAdmin.indexOf(DOMUS_META_PREFIX)
  if (idx === -1) return notasAdmin.trim()
  const before = notasAdmin.slice(0, idx).trim()
  const rest = notasAdmin.slice(idx)
  const endBracket = rest.indexOf(']')
  // Si había texto adicional después (ej. "| Nota Admin: ..."), preservarlo
  const after = endBracket >= 0 ? rest.slice(endBracket + 1).trim() : ''
  if (before && after) return `${before} ${after.startsWith('|') ? after : `· ${after}`}`.trim()
  return (before || after).trim()
}

export function encodePagoMeta(notasVisibles: string, meta: PagoDomusMeta): string {
  const cleanNotes = stripPagoMeta(notasVisibles)
  const payload = `${DOMUS_META_PREFIX}${JSON.stringify(meta)}]`
  return cleanNotes ? `${cleanNotes}\n${payload}` : payload
}

export function parsePagoMeta(notasAdmin?: string | null): PagoDomusMeta | null {
  if (!notasAdmin) return null
  const idx = notasAdmin.lastIndexOf(DOMUS_META_PREFIX)
  if (idx !== -1) {
    const startJson = idx + DOMUS_META_PREFIX.length
    const endBracket = notasAdmin.lastIndexOf(']')
    if (endBracket > startJson) {
      try {
        const parsed = JSON.parse(notasAdmin.slice(startJson, endBracket)) as PagoDomusMeta
        if (parsed && parsed.tipoServicio) return parsed
      } catch {
        // Fallback abajo si el JSON estuviese truncado
      }
    }
  }

  // Respaldo heurístico para pagos legacy sin bloque DOMUS_META
  const lower = notasAdmin.toLowerCase()
  const mencionaGas = lower.includes('cuota de gas') || lower.includes('cuota especial gas') || lower.includes('[gas]') || lower.includes('servicio de gas') || lower.includes('deuda anterior de gas')
  if (!mencionaGas) return null

  const mencionaCondominio = lower.includes('recibo ') || lower.includes('deuda pasada') || lower.includes('cable viajero') || lower.includes('guaya') || lower.includes('condominio')
  return {
    tipoServicio: mencionaCondominio ? 'mixto' : 'gas'
  }
}
