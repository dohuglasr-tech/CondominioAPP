import { supabase } from './supabase'
import { esReciboIndexado } from '../utils/indexacionHelper'
import { registrarEventoAuditoria } from './auditoriaService'
import { appCache } from './cacheService'
import { limpiarCacheMora } from './moraService'

export interface DatosPagoAprobado {
  id: string
  apartamento_id: string
  monto_bs: number
  monto_usd?: number | null
  referencia?: string
  banco_origen?: string
  fecha_pago?: string
  tasa_bcv?: number | null
}

export interface ResultadoPrelacion {
  success: boolean
  montoPagoBs: number
  descontadoMoraBs: number
  descontadoRecibosNoIndexadosBs: number
  descontadoRecibosIndexadosBs: number
  descontadoRecibosIndexadosUsd: number
  saldoRestanteBs: number
  saldoRestanteUsd: number
  esSaldoAFavor: boolean
  recibosLiquidados: string[]
  recibosAbonados: Array<{
    id: string
    mesFacturado?: string
    abonoBs: number
    abonoUsd?: number
    saldoRestanteUsd?: number
    saldoRestanteBs?: number
  }>
  moraSolventada: boolean
  error?: string
}

/**
 * Aplica un pago aprobado siguiendo la cascada de prelación estricta:
 * 
 * 1. PRIMERA PRIORIDAD: Deudas ancladas a Bolívares fijos.
 *    - Deuda atrasada manual (deudas_mora con monto_bs > 0).
 *    - Recibos NO indexados (en Bolívares fijos), del más antiguo al más reciente.
 * 
 * 2. SEGUNDA PRIORIDAD: Recibos Indexados (anclados al Dólar Oficial BCV).
 *    - Si el pago es mayor al monto anclado al Bolívar, el remanente descuenta del recibo indexado.
 *    - El descuento se procesa en Bolívares (su equivalente en USD según la tasa).
 *    - El saldo adeudado restante sigue indexado al Dólar sin importar su valor.
 * 
 * 3. TERCERA PRIORIDAD: Saldo Positivo (Saldo a Favor).
 *    - De no tener deuda indexada pendiente (o si el pago cubre todo), el saldo pasa a positivo.
 */
export async function aplicarPagoConPrelacion(
  pago: DatosPagoAprobado,
  tasaBcvActual: number = 859.06,
  fechaInicioGestion?: string | null
): Promise<ResultadoPrelacion> {
  const aptoId = pago.apartamento_id
  let remanenteBs = Number(pago.monto_bs || 0)
  const tasa = Number(pago.tasa_bcv && pago.tasa_bcv > 1 ? pago.tasa_bcv : (tasaBcvActual > 1 ? tasaBcvActual : 859.06))

  const resultado: ResultadoPrelacion = {
    success: true,
    montoPagoBs: remanenteBs,
    descontadoMoraBs: 0,
    descontadoRecibosNoIndexadosBs: 0,
    descontadoRecibosIndexadosBs: 0,
    descontadoRecibosIndexadosUsd: 0,
    saldoRestanteBs: 0,
    saldoRestanteUsd: 0,
    esSaldoAFavor: false,
    recibosLiquidados: [],
    recibosAbonados: [],
    moraSolventada: false,
  }

  if (!aptoId || remanenteBs <= 0) {
    return resultado
  }

  try {
    // 1. Consultar deudas activas en deudas_mora
    const { data: moraRow } = await supabase
      .from('deudas_mora')
      .select('*')
      .eq('apartamento_id', aptoId)
      .eq('estado', 'activo')
      .maybeSingle()

    // 2. Consultar recibos pendientes ordenados por mes_facturado ASC (más antiguos primero)
    const { data: recibosPendientes } = await supabase
      .from('recibos_generados')
      .select('*')
      .eq('apartamento_id', aptoId)
      .eq('estado', 'pendiente')
      .order('mes_facturado', { ascending: true })

    const recibos = recibosPendientes || []

    // Separar recibos en: No Indexados (fijos en Bs) vs Indexados (en USD)
    const recibosNoIndexados = recibos.filter(r => !esReciboIndexado(r, fechaInicioGestion))
    const recibosIndexados = recibos.filter(r => esReciboIndexado(r, fechaInicioGestion))

    // ─────────────────────────────────────────────────────────────────────────────
    // FASE 1: DESCONTAR DEUDAS ANCLADAS AL BOLÍVAR FIJO (PRIMERA PRIORIDAD)
    // ─────────────────────────────────────────────────────────────────────────────

    // A. Deuda atrasada manual (deudas_mora en Bolívares)
    if (moraRow && Number(moraRow.monto_bs || 0) > 0.05 && remanenteBs > 0) {
      const moraBs = Number(moraRow.monto_bs)
      if (remanenteBs >= moraBs - 0.05) {
        // Liquidar por completo la porción en Bolívares
        const tieneUsd = Number(moraRow.monto_usd || 0) > 0.05
        const nuevoEstado = tieneUsd ? 'activo' : 'solventado'

        await supabase
          .from('deudas_mora')
          .update({
            monto_bs: 0,
            estado: nuevoEstado,
            observaciones: `Deuda Bs (Bs. ${moraBs.toFixed(2)}) cancelada con pago Ref: ${pago.referencia || 'S/R'}. ${moraRow.observaciones || ''}`.trim(),
            updated_at: new Date().toISOString()
          })
          .eq('id', moraRow.id)

        remanenteBs = Math.max(0, remanenteBs - moraBs)
        resultado.descontadoMoraBs += moraBs
        if (!tieneUsd) resultado.moraSolventada = true
      } else {
        // Abono parcial a la deuda en Bs de la mora
        const saldoRestanteBs = Number((moraBs - remanenteBs).toFixed(2))
        await supabase
          .from('deudas_mora')
          .update({
            monto_bs: saldoRestanteBs,
            estado: 'activo',
            observaciones: `Abono parcial Bs. ${remanenteBs.toFixed(2)} con pago Ref: ${pago.referencia || 'S/R'}. Saldo rest: Bs. ${saldoRestanteBs}. ${moraRow.observaciones || ''}`.trim(),
            updated_at: new Date().toISOString()
          })
          .eq('id', moraRow.id)

        resultado.descontadoMoraBs += remanenteBs
        remanenteBs = 0
      }
    }

    // B. Recibos NO indexados (en Bolívares fijos)
    if (remanenteBs > 0 && recibosNoIndexados.length > 0) {
      for (const r of recibosNoIndexados) {
        if (remanenteBs <= 0.05) break
        const montoReciboBs = Number(r.total_bs || 0)

        if (remanenteBs >= montoReciboBs - 0.05) {
          // Liquidar recibo no indexado
          await supabase
            .from('recibos_generados')
            .update({
              estado: 'pagado',
              data_json: {
                ...(r.data_json || {}),
                pago_info: {
                  pago_id: pago.id,
                  fecha_pago: pago.fecha_pago || new Date().toISOString().slice(0, 10),
                  referencia: pago.referencia || 'S/R',
                  banco: pago.banco_origen || 'Transferencia',
                  monto_bs: montoReciboBs,
                  monto_usd: r.total_usd
                }
              }
            })
            .eq('id', r.id)

          remanenteBs = Math.max(0, remanenteBs - montoReciboBs)
          resultado.descontadoRecibosNoIndexadosBs += montoReciboBs
          resultado.recibosLiquidados.push(r.id)
        } else {
          // Abono parcial a recibo no indexado
          const saldoRestanteBs = Number((montoReciboBs - remanenteBs).toFixed(2))
          const abonosPrevios = r.data_json?.abonos || []
          const nuevoAbono = {
            pago_id: pago.id,
            fecha: pago.fecha_pago || new Date().toISOString().slice(0, 10),
            referencia: pago.referencia || 'S/R',
            monto_bs: Number(remanenteBs.toFixed(2)),
            banco: pago.banco_origen || 'Transferencia'
          }

          await supabase
            .from('recibos_generados')
            .update({
              total_bs: saldoRestanteBs,
              estado: 'pendiente',
              data_json: {
                ...(r.data_json || {}),
                monto_original_bs: r.data_json?.monto_original_bs || montoReciboBs,
                abonos: [...abonosPrevios, nuevoAbono]
              }
            })
            .eq('id', r.id)

          resultado.descontadoRecibosNoIndexadosBs += remanenteBs
          resultado.recibosAbonados.push({
            id: r.id,
            mesFacturado: r.mes_facturado,
            abonoBs: remanenteBs,
            saldoRestanteBs
          })
          remanenteBs = 0
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // FASE 2: DESCONTAR RECIBOS INDEXADOS AL DÓLAR (SEGUNDA PRIORIDAD)
    // "si el monto reportado es mayor al monto anclado al bolivar, pasa a descontar
    // del recibo indexado, el descuento es en bolivares y el saldo adeudado seguira
    // indexado sin importar su valor."
    // ─────────────────────────────────────────────────────────────────────────────
    if (remanenteBs > 0 && recibosIndexados.length > 0) {
      for (const r of recibosIndexados) {
        if (remanenteBs <= 0.05) break
        const totalUsd = Number(r.total_usd || 0)
        const valorBs = totalUsd * tasa

        if (remanenteBs >= valorBs - 0.05) {
          // Liquidar recibo indexado completamente
          await supabase
            .from('recibos_generados')
            .update({
              estado: 'pagado',
              data_json: {
                ...(r.data_json || {}),
                pago_info: {
                  pago_id: pago.id,
                  fecha_pago: pago.fecha_pago || new Date().toISOString().slice(0, 10),
                  referencia: pago.referencia || 'S/R',
                  banco: pago.banco_origen || 'Transferencia',
                  monto_bs: valorBs,
                  monto_usd: totalUsd
                }
              }
            })
            .eq('id', r.id)

          remanenteBs = Math.max(0, remanenteBs - valorBs)
          resultado.descontadoRecibosIndexadosBs += valorBs
          resultado.descontadoRecibosIndexadosUsd += totalUsd
          resultado.recibosLiquidados.push(r.id)
        } else {
          // Abono parcial al recibo indexado
          // El descuento es en bolívares y el saldo adeudado seguirá indexado
          const abonoBs = remanenteBs
          const abonoUsd = Number((abonoBs / tasa).toFixed(2))
          const saldoRestanteUsd = Number(Math.max(0, totalUsd - abonoUsd).toFixed(2))
          const saldoRestanteBs = Number((saldoRestanteUsd * tasa).toFixed(2))

          const abonosPrevios = r.data_json?.abonos || []
          const nuevoAbono = {
            pago_id: pago.id,
            fecha: pago.fecha_pago || new Date().toISOString().slice(0, 10),
            referencia: pago.referencia || 'S/R',
            monto_bs: Number(abonoBs.toFixed(2)),
            monto_usd: abonoUsd,
            tasa_bcv: tasa,
            banco: pago.banco_origen || 'Transferencia'
          }

          await supabase
            .from('recibos_generados')
            .update({
              total_usd: saldoRestanteUsd,
              total_bs: saldoRestanteBs,
              estado: 'pendiente', // Sigue pendiente con el saldo adeudado indexado
              data_json: {
                ...(r.data_json || {}),
                monto_original_usd: r.data_json?.monto_original_usd || totalUsd,
                monto_original_bs: r.data_json?.monto_original_bs || (totalUsd * tasa),
                abonos: [...abonosPrevios, nuevoAbono]
              }
            })
            .eq('id', r.id)

          resultado.descontadoRecibosIndexadosBs += abonoBs
          resultado.descontadoRecibosIndexadosUsd += abonoUsd
          resultado.recibosAbonados.push({
            id: r.id,
            mesFacturado: r.mes_facturado,
            abonoBs,
            abonoUsd,
            saldoRestanteUsd,
            saldoRestanteBs
          })
          remanenteBs = 0
        }
      }
    }

    // C. Si aún queda dinero y hay deuda atrasada manual en Dólares (deudas_mora en USD)
    if (remanenteBs > 0 && moraRow && Number(moraRow.monto_usd || 0) > 0.05) {
      const moraUsd = Number(moraRow.monto_usd)
      const moraValorBs = moraUsd * tasa

      if (remanenteBs >= moraValorBs - 0.05) {
        await supabase
          .from('deudas_mora')
          .update({
            monto_usd: 0,
            monto_bs: 0,
            estado: 'solventado',
            observaciones: `Deuda USD ($${moraUsd.toFixed(2)}) cancelada con pago Ref: ${pago.referencia || 'S/R'}. ${moraRow.observaciones || ''}`.trim(),
            updated_at: new Date().toISOString()
          })
          .eq('id', moraRow.id)

        remanenteBs = Math.max(0, remanenteBs - moraValorBs)
        resultado.moraSolventada = true
      } else {
        const abonoUsd = Number((remanenteBs / tasa).toFixed(2))
        const nuevoMoraUsd = Number(Math.max(0, moraUsd - abonoUsd).toFixed(2))
        await supabase
          .from('deudas_mora')
          .update({
            monto_usd: nuevoMoraUsd,
            monto_bs: 0,
            estado: 'activo',
            observaciones: `Abono parcial $${abonoUsd.toFixed(2)} (Bs. ${remanenteBs.toFixed(2)}) con pago Ref: ${pago.referencia || 'S/R'}. ${moraRow.observaciones || ''}`.trim(),
            updated_at: new Date().toISOString()
          })
          .eq('id', moraRow.id)

        remanenteBs = 0
      }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // FASE 3: SALDO POSITIVO / SALDO A FAVOR
    // "De no tener deuda indexada, el saldo pasara a positivo para el usuario."
    // ─────────────────────────────────────────────────────────────────────────────
    if (remanenteBs > 0.05) {
      resultado.saldoRestanteBs = Number(remanenteBs.toFixed(2))
      resultado.saldoRestanteUsd = Number((remanenteBs / tasa).toFixed(2))
      resultado.esSaldoAFavor = true
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // AUDITORÍA Y REGISTRO DEL MOVIMIENTO
    // ─────────────────────────────────────────────────────────────────────────────
    try {
      await registrarEventoAuditoria({
        tipo_accion: 'PAGO_CONCILIADO_PRELACION',
        titulo: `Pago Conciliado con Prelación - Ref: ${pago.referencia || 'S/R'}`,
        descripcion: `Monto pagado: Bs. ${resultado.montoPagoBs.toFixed(2)}. ` +
          (resultado.descontadoMoraBs > 0 ? `Descontado Deuda Mora: Bs. ${resultado.descontadoMoraBs.toFixed(2)}. ` : '') +
          (resultado.descontadoRecibosNoIndexadosBs > 0 ? `Descontado Recibos No Indexados: Bs. ${resultado.descontadoRecibosNoIndexadosBs.toFixed(2)}. ` : '') +
          (resultado.descontadoRecibosIndexadosBs > 0 ? `Descontado Recibos Indexados: $${resultado.descontadoRecibosIndexadosUsd.toFixed(2)} USD (Bs. ${resultado.descontadoRecibosIndexadosBs.toFixed(2)}). ` : '') +
          (resultado.esSaldoAFavor ? `Saldo a Favor acreditado: +$${resultado.saldoRestanteUsd.toFixed(2)} USD (Bs. ${resultado.saldoRestanteBs.toFixed(2)}).` : 'Sin saldo sobrante.'),
        apartamento_id: aptoId,
        monto_bs: resultado.montoPagoBs,
        monto_usd: Number((resultado.montoPagoBs / tasa).toFixed(2)),
        motivo: `Cascada de prelación: Bolívares Fijos > Indexado al Dólar > Saldo a Favor`,
      })
    } catch (errAud) {
      console.warn('[pagosPrelacionService] Error registrando auditoría:', errAud)
    }

    // Invalidar cachés en tiempo real
    limpiarCacheMora()
    appCache.invalidateTags(['recibos', 'saldos', 'mora', 'pagos', `recibo_${aptoId}`, `pago_${aptoId}`])

    return resultado
  } catch (err: any) {
    console.error('[pagosPrelacionService] Error en cascada de pagos:', err)
    return {
      ...resultado,
      success: false,
      error: err?.message || 'Error procesando la prelación del pago'
    }
  }
}
