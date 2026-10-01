import { supabase } from './supabase'
import { registrarEventoAuditoria, obtenerHistorialAuditoria } from './auditoriaService'
import { appCache } from './cacheService'

export interface SaldoApartamento {
  apartamento_id: string
  saldo_a_favor_usd: number
  saldo_a_favor_bs: number
  total_pagado_usd: number
  total_facturado_usd: number
  total_retirado_usd: number
}

/**
 * Calcula el saldo a favor real de un apartamento comparando
 * todos los pagos aprobados frente a los recibos emitidos,
 * deduciendo cualquier retiro registrado por la administración en auditoría.
 * Protegido con caché de 3 min e invalidación automática ante cambios.
 */
export async function obtenerSaldoAFavorApartamento(
  apartamento_id: string,
  tasaBcv: number = 859.06,
  forceRefresh: boolean = false
): Promise<SaldoApartamento> {
  if (!apartamento_id) {
    return {
      apartamento_id: '',
      saldo_a_favor_usd: 0,
      saldo_a_favor_bs: 0,
      total_pagado_usd: 0,
      total_facturado_usd: 0,
      total_retirado_usd: 0,
    }
  }

  return appCache.fetch(
    `saldo_favor_${apartamento_id}_${tasaBcv}`,
    async () => {
      try {
        const [pagosRes, recibosRes, logsAuditoria, moraRes] = await Promise.all([
          supabase
            .from('pagos_reportados')
            .select('monto_usd, monto_bs')
            .eq('apartamento_id', apartamento_id)
            .eq('estado', 'aprobado'),
          supabase
            .from('recibos_generados')
            .select('total_usd, total_bs, estado, data_json')
            .eq('apartamento_id', apartamento_id),
          obtenerHistorialAuditoria().catch(() => []),
          supabase
            .from('deudas_mora')
            .select('monto_usd, monto_bs, estado')
            .eq('apartamento_id', apartamento_id)
            .maybeSingle(),
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

        // Calcular total facturado en USD (usando montos originales de recibos para no distorsionar ante abonos)
        const recibos = recibosRes.data || []
        let totalFacturadoUsd = recibos.reduce((sum, r) => {
          const originalUsd = Number(r.data_json?.monto_original_usd || r.total_usd || 0)
          return sum + originalUsd
        }, 0)

        // Si hay recibos pendientes, no puede haber saldo a favor hasta liquidarlos
        const tienePendientes = recibos.some(r => r.estado === 'pendiente')

        // Consultar retiros previos de saldo a favor registrados en auditoría
        const logs = logsAuditoria || []
        const retirosApto = logs.filter(
          (l) => l.tipo_accion === 'RETIRO_SALDO_A_FAVOR' && l.apartamento_id === apartamento_id
        )
        const totalRetiradoUsd = retirosApto.reduce((sum, l) => sum + (Number(l.monto_usd) || 0), 0)

        // Saldo a favor = (Pagado - Facturado) - Retirado por Admin (solo si no tiene recibos pendientes)
        const diffBruto = totalPagadoUsd - totalFacturadoUsd
        const saldoNetoUsd = (!tienePendientes && diffBruto > 0.05)
          ? Math.max(0, parseFloat((diffBruto - totalRetiradoUsd).toFixed(2)))
          : 0
        const saldoNetoBs = saldoNetoUsd > 0 ? parseFloat((saldoNetoUsd * tasaBcv).toFixed(2)) : 0

        return {
          apartamento_id,
          saldo_a_favor_usd: saldoNetoUsd,
          saldo_a_favor_bs: saldoNetoBs,
          total_pagado_usd: parseFloat(totalPagadoUsd.toFixed(2)),
          total_facturado_usd: parseFloat(totalFacturadoUsd.toFixed(2)),
          total_retirado_usd: parseFloat(totalRetiradoUsd.toFixed(2)),
        }
      } catch (err) {
        console.warn('[SaldoFavorService] Error calculando saldo:', err)
        return {
          apartamento_id,
          saldo_a_favor_usd: 0,
          saldo_a_favor_bs: 0,
          total_pagado_usd: 0,
          total_facturado_usd: 0,
          total_retirado_usd: 0,
        }
      }
    },
    { ttlMs: 3 * 60 * 1000, tags: ['saldos', `saldo_${apartamento_id}`], forceRefresh }
  )
}

/**
 * Obtiene el mapa completo de saldos a favor para todos los apartamentos
 * en una sola consulta rápida y paralela (con caché de 3 min).
 */
export async function obtenerTodosLosSaldosAFavor(
  tasaBcv: number = 859.06,
  forceRefresh: boolean = false
): Promise<Map<string, SaldoApartamento>> {
  return appCache.fetch(
    `todos_los_saldos_a_favor_${tasaBcv}`,
    async () => {
      const mapaSaldos = new Map<string, SaldoApartamento>()

      try {
        const [pagosRes, recibosRes, logsAuditoria] = await Promise.all([
          supabase
            .from('pagos_reportados')
            .select('apartamento_id, monto_usd, monto_bs')
            .eq('estado', 'aprobado'),
          supabase
            .from('recibos_generados')
            .select('apartamento_id, total_usd'),
          obtenerHistorialAuditoria().catch(() => []),
        ])

        const pagosPorApto = new Map<string, number>()
        ;(pagosRes.data || []).forEach((p: any) => {
          const aptoId = p.apartamento_id
          if (!aptoId) return
          let monto = 0
          if (p.monto_usd && Number(p.monto_usd) > 0) {
            monto = Number(p.monto_usd)
          } else if (p.monto_bs && Number(p.monto_bs) > 0 && tasaBcv > 0) {
            monto = Number(p.monto_bs) / tasaBcv
          }
          pagosPorApto.set(aptoId, (pagosPorApto.get(aptoId) || 0) + monto)
        })

        const facturadoPorApto = new Map<string, number>()
        ;(recibosRes.data || []).forEach((r: any) => {
          const aptoId = r.apartamento_id
          if (!aptoId) return
          const total = Number(r.total_usd || 0)
          facturadoPorApto.set(aptoId, (facturadoPorApto.get(aptoId) || 0) + total)
        })

        const retiradoPorApto = new Map<string, number>()
        ;(logsAuditoria || []).forEach((l) => {
          if (l.tipo_accion === 'RETIRO_SALDO_A_FAVOR' && l.apartamento_id) {
            const monto = Number(l.monto_usd || 0)
            retiradoPorApto.set(l.apartamento_id, (retiradoPorApto.get(l.apartamento_id) || 0) + monto)
          }
        })

        // Construir conjunto de todos los apartamentos con movimientos
        const todosAptosIds = new Set<string>([
          ...pagosPorApto.keys(),
          ...facturadoPorApto.keys(),
          ...retiradoPorApto.keys(),
        ])

        todosAptosIds.forEach((aptoId) => {
          const pagado = pagosPorApto.get(aptoId) || 0
          const facturado = facturadoPorApto.get(aptoId) || 0
          const retirado = retiradoPorApto.get(aptoId) || 0

          const diff = pagado - facturado
          const saldoNeto = diff > 0.05 ? Math.max(0, parseFloat((diff - retirado).toFixed(2))) : 0
          const saldoBs = saldoNeto > 0 ? parseFloat((saldoNeto * tasaBcv).toFixed(2)) : 0

          mapaSaldos.set(aptoId, {
            apartamento_id: aptoId,
            saldo_a_favor_usd: saldoNeto,
            saldo_a_favor_bs: saldoBs,
            total_pagado_usd: parseFloat(pagado.toFixed(2)),
            total_facturado_usd: parseFloat(facturado.toFixed(2)),
            total_retirado_usd: parseFloat(retirado.toFixed(2)),
          })
        })

        return mapaSaldos
      } catch (err) {
        console.warn('[SaldoFavorService] Error obteniendo todos los saldos:', err)
        return mapaSaldos
      }
    },
    { ttlMs: 3 * 60 * 1000, tags: ['saldos'], forceRefresh }
  )
}

/**
 * Retira o anula saldo a favor de un apartamento por decisión administrativa,
 * registrando automáticamente un evento inmutable en el Historial de Auditoría
 * y purgando la caché de saldos.
 */
export async function retirarSaldoAFavorApartamento(params: {
  apartamento_id: string
  apartamento_numero: string
  monto_usd: number
  motivo: string
  autor_nombre: string
  autor_email?: string | null
  tasaBcv?: number
}): Promise<{ success: boolean; error?: string }> {
  try {
    const monto = parseFloat(Number(params.monto_usd).toFixed(2))
    if (isNaN(monto) || monto <= 0) {
      return { success: false, error: 'El monto a retirar debe ser mayor a 0.' }
    }

    if (!params.motivo || params.motivo.trim().length < 4) {
      return { success: false, error: 'Debes indicar un motivo válido para la auditoría (mínimo 4 caracteres).' }
    }

    const tasa = params.tasaBcv && params.tasaBcv > 1 ? params.tasaBcv : 859.06
    const montoBs = parseFloat((monto * tasa).toFixed(2))

    // Registrar en Historial de Auditoría
    const res = await registrarEventoAuditoria({
      tipo_accion: 'RETIRO_SALDO_A_FAVOR',
      titulo: `Retiro de Saldo a Favor - Apto ${params.apartamento_numero}`,
      descripcion: `Se retiró saldo a favor de $${monto.toFixed(2)} USD (≈ Bs. ${montoBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}) del Apto ${params.apartamento_numero}. Motivo: ${params.motivo.trim()}`,
      apartamento_id: params.apartamento_id,
      apartamento_numero: params.apartamento_numero,
      monto_usd: monto,
      monto_bs: montoBs,
      motivo: params.motivo.trim(),
      autor_nombre: params.autor_nombre || 'Administrador',
      autor_email: params.autor_email || null,
      datos_anteriores: null,
      datos_nuevos: {
        apartamento_id: params.apartamento_id,
        apartamento_numero: params.apartamento_numero,
        monto_retirado_usd: monto,
        monto_retirado_bs: montoBs,
        motivo: params.motivo.trim(),
      },
    })

    if (!res.success) {
      return { success: false, error: res.error || 'No se pudo guardar el registro de auditoría.' }
    }

    // Invalidar inmediatamente la caché de saldos
    appCache.invalidateTags(['saldos', `saldo_${params.apartamento_id}`])

    return { success: true }
  } catch (err: any) {
    console.error('[SaldoFavorService] Error retirando saldo:', err)
    return { success: false, error: err.message || 'Error inesperado al retirar saldo.' }
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

/**
 * Agrega saldo positivo (a favor) a la cuenta del residente con motivo obligatorio.
 * Permite opcionalmente aplicar dicho saldo de inmediato para restar/liquidar la deuda pendiente.
 */
export async function abonarSaldoAFavorApartamento(params: {
  apartamento_id: string
  apartamento_numero: string
  propietario_nombre?: string | null
  monto_usd: number
  monto_bs?: number
  motivo: string
  aplicar_a_deuda?: boolean
  autor_nombre: string
  autor_email?: string | null
  tasaBcv?: number
}): Promise<{ success: boolean; error?: string; amortizadoUsd?: number }> {
  try {
    const montoUsd = parseFloat(Number(params.monto_usd).toFixed(2))
    if (isNaN(montoUsd) || montoUsd <= 0) {
      return { success: false, error: 'El monto a abonar debe ser mayor a 0.' }
    }

    if (!params.motivo || params.motivo.trim().length < 4) {
      return { success: false, error: 'Debes indicar un motivo descriptivo para el abono (mínimo 4 caracteres).' }
    }

    const tasa = params.tasaBcv && params.tasaBcv > 1 ? params.tasaBcv : 859.06
    const montoBs = params.monto_bs && params.monto_bs > 0
      ? parseFloat(Number(params.monto_bs).toFixed(2))
      : parseFloat((montoUsd * tasa).toFixed(2))

    const refCodigo = `ABONO-${Date.now().toString(36).toUpperCase()}`

    // 1. Asentar el pago acreditado en pagos_reportados
    const { error: errPago } = await supabase.from('pagos_reportados').insert({
      apartamento_id: params.apartamento_id,
      monto_usd: montoUsd,
      monto_bs: montoBs,
      tasa_bcv: tasa,
      metodo_pago: 'abono_saldo_favor',
      referencia: refCodigo,
      banco_origen: 'Administración',
      banco_destino: 'Billetera Comunitaria',
      fecha_pago: new Date().toISOString().slice(0, 10),
      fecha_revision: new Date().toISOString(),
      estado: 'aprobado',
      notas_admin: `Abono de Saldo a Favor por administración. Motivo: ${params.motivo.trim()}`
    })

    if (errPago) {
      console.warn('[SaldoFavorService] Error registrando pago de abono:', errPago.message)
    }

    // 2. Registrar evento inmutable en el Historial de Auditoría
    await registrarEventoAuditoria({
      tipo_accion: 'ABONO_SALDO_A_FAVOR',
      titulo: `Abono de Saldo a Favor - Apto ${params.apartamento_numero}`,
      descripcion: `Se acreditó saldo a favor de $${montoUsd.toFixed(2)} USD (≈ Bs. ${montoBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}) al Apto ${params.apartamento_numero}. Motivo: ${params.motivo.trim()}`,
      apartamento_id: params.apartamento_id,
      apartamento_numero: params.apartamento_numero,
      monto_usd: montoUsd,
      monto_bs: montoBs,
      motivo: params.motivo.trim(),
      autor_nombre: params.autor_nombre || 'Administrador',
      autor_email: params.autor_email || null,
      datos_anteriores: null,
      datos_nuevos: {
        apartamento_id: params.apartamento_id,
        apartamento_numero: params.apartamento_numero,
        monto_usd: montoUsd,
        monto_bs: montoBs,
        motivo: params.motivo.trim(),
        referencia: refCodigo,
        aplicar_a_deuda: Boolean(params.aplicar_a_deuda)
      }
    })

    let amortizadoUsd = 0

    // 3. Si se marcó aplicar directamente a la deuda pendiente
    if (params.aplicar_a_deuda) {
      let remanente = montoUsd

      // A) Consultar recibos pendientes del apartamento
      const { data: recibosPendientes } = await supabase
        .from('recibos_generados')
        .select('*')
        .eq('apartamento_id', params.apartamento_id)
        .eq('estado', 'pendiente')
        .order('mes_facturado', { ascending: true })

      if (recibosPendientes && recibosPendientes.length > 0) {
        for (const r of recibosPendientes) {
          if (remanente <= 0.05) break
          const rTotal = Number(r.total_usd || 0)

          if (remanente >= rTotal) {
            // Liquidar completamente el recibo
            await supabase
              .from('recibos_generados')
              .update({
                estado: 'pagado',
                data_json: {
                  ...(r.data_json || {}),
                  pagado_con_saldo_favor: true,
                  fecha_pago_saldo: new Date().toISOString(),
                  referencia_abono: refCodigo
                }
              })
              .eq('id', r.id)

            remanente -= rTotal
            amortizadoUsd += rTotal
          }
        }
      }

      // B) Si queda remanente o no había recibos pero hay deuda en deudas_mora
      if (remanente > 0.05) {
        const { data: moraRow } = await supabase
          .from('deudas_mora')
          .select('*')
          .eq('apartamento_id', params.apartamento_id)
          .eq('estado', 'activo')
          .maybeSingle()

        if (moraRow) {
          const deudaMoraUsd = Number(moraRow.monto_usd || 0)
          if (deudaMoraUsd > 0) {
            const descuentoMora = Math.min(deudaMoraUsd, remanente)
            const nuevoSaldoMora = Math.max(0, deudaMoraUsd - descuentoMora)
            const nuevoEstado = nuevoSaldoMora <= 0.05 ? 'solventado' : 'activo'

            await supabase
              .from('deudas_mora')
              .update({
                monto_usd: nuevoSaldoMora,
                monto_bs: Math.max(0, Number(moraRow.monto_bs || 0) - (descuentoMora * tasa)),
                estado: nuevoEstado,
                observaciones: `Amortizado $${descuentoMora.toFixed(2)} con Saldo a Favor (${refCodigo}). ${moraRow.observaciones || ''}`,
                updated_at: new Date().toISOString()
              })
              .eq('id', moraRow.id)

            remanente -= descuentoMora
            amortizadoUsd += descuentoMora
          }
        }
      }

      // C) Si se amortizó algo, asentar evento de compensación en auditoría
      if (amortizadoUsd > 0) {
        await registrarEventoAuditoria({
          tipo_accion: 'APLICAR_SALDO_A_DEUDA',
          titulo: `Aplicación de Saldo a Deuda - Apto ${params.apartamento_numero}`,
          descripcion: `Se amortizó un total de $${amortizadoUsd.toFixed(2)} USD de la deuda pendiente del Apto ${params.apartamento_numero} usando el abono realizado.`,
          apartamento_id: params.apartamento_id,
          apartamento_numero: params.apartamento_numero,
          monto_usd: amortizadoUsd,
          monto_bs: parseFloat((amortizadoUsd * tasa).toFixed(2)),
          motivo: `Compensación directa al abonar: ${params.motivo.trim()}`,
          autor_nombre: params.autor_nombre || 'Administrador',
          autor_email: params.autor_email || null,
          datos_anteriores: null,
          datos_nuevos: {
            apartamento_id: params.apartamento_id,
            monto_amortizado_usd: amortizadoUsd,
            remanente_a_favor_usd: Math.max(0, montoUsd - amortizadoUsd)
          }
        })
      }
    }

    // Invalidar caches
    appCache.invalidateTags(['saldos', 'recibos', 'pagos', 'mora', 'apartamentos', `saldo_${params.apartamento_id}`])

    return { success: true, amortizadoUsd }
  } catch (err: any) {
    console.error('[SaldoFavorService] Error abonando saldo a favor:', err)
    return { success: false, error: err.message || 'Error inesperado al abonar saldo.' }
  }
}

/**
 * Aplica saldo a favor existente de un residente para pagar o reducir su deuda pendiente.
 */
export async function aplicarSaldoAFavorADeuda(params: {
  apartamento_id: string
  apartamento_numero: string
  monto_usd_a_aplicar: number
  motivo?: string
  autor_nombre: string
  autor_email?: string | null
  tasaBcv?: number
}): Promise<{ success: boolean; error?: string; amortizadoUsd?: number }> {
  try {
    const monto = parseFloat(Number(params.monto_usd_a_aplicar).toFixed(2))
    if (isNaN(monto) || monto <= 0) {
      return { success: false, error: 'El monto a aplicar debe ser mayor a 0.' }
    }

    const tasa = params.tasaBcv && params.tasaBcv > 1 ? params.tasaBcv : 859.06
    let remanente = monto
    let amortizadoUsd = 0
    const refCompensacion = `COMP-${Date.now().toString(36).toUpperCase()}`

    // 1. Liquidar recibos pendientes
    const { data: recibosPendientes } = await supabase
      .from('recibos_generados')
      .select('*')
      .eq('apartamento_id', params.apartamento_id)
      .eq('estado', 'pendiente')
      .order('mes_facturado', { ascending: true })

    if (recibosPendientes && recibosPendientes.length > 0) {
      for (const r of recibosPendientes) {
        if (remanente <= 0.05) break
        const rTotal = Number(r.total_usd || 0)

        if (remanente >= rTotal) {
          await supabase
            .from('recibos_generados')
            .update({
              estado: 'pagado',
              data_json: {
                ...(r.data_json || {}),
                pagado_con_saldo_favor: true,
                fecha_pago_saldo: new Date().toISOString(),
                referencia_abono: refCompensacion
              }
            })
            .eq('id', r.id)

          remanente -= rTotal
          amortizadoUsd += rTotal
        }
      }
    }

    // 2. Liquidar deudas_mora si aún hay saldo
    if (remanente > 0.05) {
      const { data: moraRow } = await supabase
        .from('deudas_mora')
        .select('*')
        .eq('apartamento_id', params.apartamento_id)
        .eq('estado', 'activo')
        .maybeSingle()

      if (moraRow) {
        const deudaMoraUsd = Number(moraRow.monto_usd || 0)
        if (deudaMoraUsd > 0) {
          const desc = Math.min(deudaMoraUsd, remanente)
          const nuevoSaldo = Math.max(0, deudaMoraUsd - desc)

          await supabase
            .from('deudas_mora')
            .update({
              monto_usd: nuevoSaldo,
              monto_bs: Math.max(0, Number(moraRow.monto_bs || 0) - (desc * tasa)),
              estado: nuevoSaldo <= 0.05 ? 'solventado' : 'activo',
              observaciones: `Compensado $${desc.toFixed(2)} con Saldo a Favor (${refCompensacion}). ${moraRow.observaciones || ''}`,
              updated_at: new Date().toISOString()
            })
            .eq('id', moraRow.id)

          remanente -= desc
          amortizadoUsd += desc
        }
      }
    }

    // 3. Registrar en auditoría
    await registrarEventoAuditoria({
      tipo_accion: 'APLICAR_SALDO_A_DEUDA',
      titulo: `Compensación de Deuda con Saldo a Favor - Apto ${params.apartamento_numero}`,
      descripcion: `Se aplicaron $${amortizadoUsd.toFixed(2)} USD de Saldo a Favor para amortizar la deuda del Apto ${params.apartamento_numero}. Motivo: ${params.motivo || 'Compensación de deuda autorizada por administración'}`,
      apartamento_id: params.apartamento_id,
      apartamento_numero: params.apartamento_numero,
      monto_usd: amortizadoUsd,
      monto_bs: parseFloat((amortizadoUsd * tasa).toFixed(2)),
      motivo: params.motivo || 'Compensación de deuda autorizada por administración',
      autor_nombre: params.autor_nombre || 'Administrador',
      autor_email: params.autor_email || null,
      datos_anteriores: null,
      datos_nuevos: {
        apartamento_id: params.apartamento_id,
        monto_aplicado_usd: amortizadoUsd,
        referencia: refCompensacion
      }
    })

    // Invalidar caches
    appCache.invalidateTags(['saldos', 'recibos', 'pagos', 'mora', 'apartamentos', `saldo_${params.apartamento_id}`])

    return { success: true, amortizadoUsd }
  } catch (err: any) {
    console.error('[SaldoFavorService] Error aplicando saldo a deuda:', err)
    return { success: false, error: err.message || 'Error inesperado al aplicar saldo a la deuda.' }
  }
}

