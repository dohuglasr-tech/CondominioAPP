import { supabase } from './supabase'

export interface SaldoApartamento {
  apartamento_id: string
  saldo_a_favor_usd: number
  saldo_a_favor_bs: number
  total_pagado_usd: number
  total_facturado_usd: number
}

/**
 * Calcula el saldo a favor real de un apartamento comparando
 * todos los pagos aprobados frente a los recibos emitidos.
 */
export async function obtenerSaldoAFavorApartamento(
  apartamento_id: string,
  tasaBcv: number = 859.06
): Promise<SaldoApartamento> {
  if (!apartamento_id) {
    return {
      apartamento_id: '',
      saldo_a_favor_usd: 0,
      saldo_a_favor_bs: 0,
      total_pagado_usd: 0,
      total_facturado_usd: 0,
    }
  }

  try {
    const [pagosRes, recibosRes] = await Promise.all([
      supabase
        .from('pagos_reportados')
        .select('monto_usd, monto_bs')
        .eq('apartamento_id', apartamento_id)
        .eq('estado', 'aprobado'),
      supabase
        .from('recibos_generados')
        .select('total_usd, total_bs, estado')
        .eq('apartamento_id', apartamento_id),
    ])

    // Calcular total pagado en USD
    const pagos = pagosRes.data || []
    const totalPagadoUsd = pagos.reduce((sum, p) => {
      if (p.monto_usd && Number(p.monto_usd) > 0) {
        return sum + Number(p.monto_usd)
      }
      if (p.monto_bs && Number(p.monto_bs) > 0 && tasaBcv > 0) {
        return sum + Number(p.monto_bs) / tasaBcv
      }
      return sum
    }, 0)

    // Calcular total facturado en USD (todos los recibos)
    const recibos = recibosRes.data || []
    const totalFacturadoUsd = recibos.reduce((sum, r) => sum + Number(r.total_usd || 0), 0)

    // Si pagó más de lo facturado históricamente, la diferencia es saldo a favor
    const diff = totalPagadoUsd - totalFacturadoUsd
    const saldoUsd = diff > 0.1 ? parseFloat(diff.toFixed(2)) : 0
    const saldoBs = saldoUsd > 0 ? parseFloat((saldoUsd * tasaBcv).toFixed(2)) : 0

    return {
      apartamento_id,
      saldo_a_favor_usd: saldoUsd,
      saldo_a_favor_bs: saldoBs,
      total_pagado_usd: parseFloat(totalPagadoUsd.toFixed(2)),
      total_facturado_usd: parseFloat(totalFacturadoUsd.toFixed(2)),
    }
  } catch (err) {
    console.warn('[SaldoFavorService] Error calculando saldo:', err)
    return {
      apartamento_id,
      saldo_a_favor_usd: 0,
      saldo_a_favor_bs: 0,
      total_pagado_usd: 0,
      total_facturado_usd: 0,
    }
  }
}

/**
 * Descuenta el saldo a favor del monto de un recibo.
 */
export function aplicarSaldoAFavor(
  montoReciboUsd: number,
  saldoAFavorUsd: number
): {
  montoAPagarUsd: number
  descuentoAplicadoUsd: number
  saldoRestanteUsd: number
} {
  const descuento = Math.min(montoReciboUsd, Math.max(0, saldoAFavorUsd))
  const pagar = Math.max(0, montoReciboUsd - descuento)
  const restante = Math.max(0, saldoAFavorUsd - descuento)

  return {
    montoAPagarUsd: parseFloat(pagar.toFixed(2)),
    descuentoAplicadoUsd: parseFloat(descuento.toFixed(2)),
    saldoRestanteUsd: parseFloat(restante.toFixed(2)),
  }
}
