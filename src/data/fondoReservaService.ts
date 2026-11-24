import { supabase } from './supabase'
import { appCache } from './cacheService'
import { withEdificioId } from './tenantContext'
import { getTasaBcvNumerica } from '../utils/tasaBcvHelper'
import { getErrorMessage, logger } from '../utils/logger'

export type MonedaFondoReserva = 'USD' | 'BS'
export type TipoUbicacionFondo = 'banco' | 'efectivo' | 'digital' | 'otro'
export type TipoMovimientoFondo =
  | 'aporte_cuota'
  | 'ajuste_manual'
  | 'egreso'
  | 'transferencia_divisa'
  | 'saldo_inicial'

export interface FondoReservaUbicacion {
  id: string
  edificio_id?: string | null
  nombre: string
  tipo: TipoUbicacionFondo
  moneda: MonedaFondoReserva
  saldo: number
  es_destino_default: boolean
  descripcion?: string | null
  activa?: boolean
  orden?: number
  created_at?: string
  updated_at?: string
}

export interface FondoReservaMovimiento {
  id: string
  edificio_id?: string | null
  ubicacion_id: string
  ubicacion_nombre?: string
  tipo: TipoMovimientoFondo
  moneda: MonedaFondoReserva
  monto: number
  saldo_anterior?: number
  saldo_nuevo: number
  recibo_id?: string | null
  apartamento_id?: string | null
  apartamento_numero?: string | null
  mes_facturado?: string | null
  pago_reportado_id?: string | null
  referencia?: string | null
  descripcion: string
  autor_nombre?: string | null
  created_at: string
}

export interface TotalesFondoReserva {
  totalNativoUsd: number
  totalNativoBs: number
  totalConsolidadoUsd: number
  totalConsolidadoBs: number
  tasaBcvUsada: number
  defaultUsd: FondoReservaUbicacion | null
  defaultBs: FondoReservaUbicacion | null
}

export interface ResumenFondoReserva {
  ubicaciones: FondoReservaUbicacion[]
  movimientos: FondoReservaMovimiento[]
  totales: TotalesFondoReserva
}

/** Calcula totales nativos (USD, Bs) y consolidado equivalente usando la tasa BCV vigente. */
export function calcularTotalesFondoReserva(
  ubicaciones: FondoReservaUbicacion[],
  tasaBcv?: number | null
): TotalesFondoReserva {
  const tasaValida = getTasaBcvNumerica(tasaBcv)
  const activas = (ubicaciones || []).filter((u) => u.activa !== false)

  const totalNativoUsd = Number(
    activas
      .filter((u) => u.moneda === 'USD')
      .reduce((acc, u) => acc + Number(u.saldo || 0), 0)
      .toFixed(2)
  )

  const totalNativoBs = Number(
    activas
      .filter((u) => u.moneda === 'BS')
      .reduce((acc, u) => acc + Number(u.saldo || 0), 0)
      .toFixed(2)
  )

  const totalConsolidadoUsd = Number(
    (totalNativoUsd + (tasaValida > 0 ? totalNativoBs / tasaValida : 0)).toFixed(2)
  )
  const totalConsolidadoBs = Number(
    (totalNativoBs + totalNativoUsd * tasaValida).toFixed(2)
  )

  const defaultUsd =
    activas.find((u) => u.moneda === 'USD' && u.es_destino_default) ||
    activas.find((u) => u.moneda === 'USD') ||
    null

  const defaultBs =
    activas.find((u) => u.moneda === 'BS' && u.es_destino_default) ||
    activas.find((u) => u.moneda === 'BS') ||
    null

  return {
    totalNativoUsd,
    totalNativoBs,
    totalConsolidadoUsd,
    totalConsolidadoBs,
    tasaBcvUsada: tasaValida,
    defaultUsd,
    defaultBs,
  }
}

/** Determina la moneda del aporte al Fondo de Reserva a partir del método y montos aprobados. */
export function inferirMonedaPago(params: {
  metodo?: string | null
  monedaExplicita?: string | null
  montoUsd?: number | null
  montoBs?: number | null
}): MonedaFondoReserva {
  const exp = String(params.monedaExplicita || '').trim().toUpperCase()
  if (exp === 'USD') return 'USD'
  if (exp === 'BS' || exp === 'VES') return 'BS'

  const m = String(params.metodo || '').toLowerCase()
  if (
    m === 'efectivo_usd' ||
    m === 'zelle' ||
    m === 'transferencia_usd' ||
    m.includes('usd') ||
    m.includes('dólar') ||
    m.includes('dolar') ||
    m.includes('zelle')
  ) {
    return 'USD'
  }

  const usd = Number(params.montoUsd || 0)
  const bs = Number(params.montoBs || 0)
  if (usd > 0 && bs <= 0) return 'USD'

  return 'BS'
}

/** Obtiene ubicaciones y movimientos sanitizados para la vista de transparencia del residente. */
export async function obtenerFondoReservaPortalResidente(
  tasaBcv?: number | null,
  forceRefresh = false,
  limit = 25
): Promise<ResumenFondoReserva> {
  return appCache.fetch<ResumenFondoReserva>(
    `fondo_reserva_portal_${limit}`,
    async () => {
      try {
        const { data, error } = await supabase.rpc('get_fondo_reserva_portal_residente', {
          p_limit: limit,
        })

        if (!error && data) {
          const ubicaciones = ((data.ubicaciones || []) as FondoReservaUbicacion[]).map((u) => ({
            ...u,
            saldo: Number(u.saldo || 0),
          }))
          const movimientos = ((data.movimientos || []) as FondoReservaMovimiento[]).map((m) => ({
            ...m,
            monto: Number(m.monto || 0),
            saldo_nuevo: Number(m.saldo_nuevo || 0),
          }))
          return {
            ubicaciones,
            movimientos,
            totales: calcularTotalesFondoReserva(ubicaciones, tasaBcv),
          }
        }
      } catch (err) {
        logger.debug('fondoReservaService', 'Fallback leyendo ubicaciones directamente', err)
      }

      const { data: ubRows } = await supabase
        .from('fondo_reserva_ubicaciones')
        .select('id, edificio_id, nombre, tipo, moneda, saldo, es_destino_default, descripcion, activa, orden, updated_at')
        .eq('activa', true)
        .order('orden', { ascending: true })

      const ubicaciones = ((ubRows || []) as FondoReservaUbicacion[]).map((u) => ({
        ...u,
        saldo: Number(u.saldo || 0),
      }))
      return {
        ubicaciones,
        movimientos: [],
        totales: calcularTotalesFondoReserva(ubicaciones, tasaBcv),
      }
    },
    { ttlMs: 3 * 60 * 1000, forceRefresh, tags: ['fondo_reserva'] }
  )
}

/** Obtiene ubicaciones y movimientos completos para el Panel de Administrador. */
export async function obtenerFondoReservaAdmin(
  tasaBcv?: number | null,
  forceRefresh = false,
  limit = 100
): Promise<ResumenFondoReserva> {
  return appCache.fetch<ResumenFondoReserva>(
    `fondo_reserva_admin_${limit}`,
    async () => {
      const [ubRes, movRes] = await Promise.all([
        supabase
          .from('fondo_reserva_ubicaciones')
          .select('id, edificio_id, nombre, tipo, moneda, saldo, es_destino_default, descripcion, activa, orden, created_at, updated_at')
          .order('orden', { ascending: true })
          .order('created_at', { ascending: true }),
        supabase
          .from('fondo_reserva_movimientos')
          .select('id, edificio_id, ubicacion_id, tipo, moneda, monto, saldo_anterior, saldo_nuevo, recibo_id, apartamento_id, apartamento_numero, mes_facturado, pago_reportado_id, referencia, descripcion, autor_nombre, created_at')
          .order('created_at', { ascending: false })
          .limit(limit),
      ])

      if (ubRes.error) {
        throw new Error(ubRes.error.message)
      }

      const ubicaciones = ((ubRes.data || []) as FondoReservaUbicacion[]).map((u) => ({
        ...u,
        saldo: Number(u.saldo || 0),
      }))

      const ubicMap = new Map(ubicaciones.map((u) => [u.id, u.nombre]))
      const movimientos = ((movRes.data || []) as FondoReservaMovimiento[]).map((m) => ({
        ...m,
        ubicacion_nombre: ubicMap.get(m.ubicacion_id) || 'Ubicación',
        monto: Number(m.monto || 0),
        saldo_anterior: Number(m.saldo_anterior || 0),
        saldo_nuevo: Number(m.saldo_nuevo || 0),
      }))

      return {
        ubicaciones,
        movimientos,
        totales: calcularTotalesFondoReserva(ubicaciones, tasaBcv),
      }
    },
    { ttlMs: 2 * 60 * 1000, forceRefresh, tags: ['fondo_reserva'] }
  )
}

/** Crea una nueva ubicación del Fondo de Reserva y opcionalmente registra su saldo inicial. */
export async function crearUbicacionFondoReserva(params: {
  nombre: string
  tipo: TipoUbicacionFondo
  moneda: MonedaFondoReserva
  saldoInicial: number
  esDestinoDefault?: boolean
  descripcion?: string
  autorNombre?: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    const saldoInicial = Number(Number(params.saldoInicial || 0).toFixed(2))
    if (saldoInicial < 0) {
      return { success: false, error: 'El saldo inicial no puede ser negativo.' }
    }

    const { data: inserted, error } = await supabase
      .from('fondo_reserva_ubicaciones')
      .insert([
        withEdificioId({
          nombre: params.nombre.trim(),
          tipo: params.tipo,
          moneda: params.moneda,
          saldo: 0,
          es_destino_default: false,
          descripcion: params.descripcion?.trim() || null,
          activa: true,
        }),
      ])
      .select('id')
      .single()

    if (error || !inserted) {
      return { success: false, error: error?.message || 'No se pudo crear la ubicación.' }
    }

    if (params.esDestinoDefault) {
      const { error: defErr } = await supabase.rpc('definir_ubicacion_default_fondo_reserva', {
        p_ubicacion_id: inserted.id,
      })
      if (defErr) {
        logger.debug('fondoReservaService', 'Error definiendo default al crear ubicación', defErr)
      }
    }

    if (saldoInicial > 0) {
      await supabase.rpc('ajustar_fondo_reserva_ubicacion', {
        p_ubicacion_id: inserted.id,
        p_nuevo_saldo: saldoInicial,
        p_tipo: 'saldo_inicial',
        p_descripcion: `Saldo inicial de apertura: ${params.nombre.trim()}`,
        p_autor_nombre: params.autorNombre || 'Administrador',
      })
    }

    appCache.invalidateTags(['fondo_reserva'])
    return { success: true }
  } catch (err) {
    return { success: false, error: getErrorMessage(err) }
  }
}

/** Actualiza metadatos de ubicación (nombre, tipo, descripción, estado activo). */
export async function actualizarUbicacionFondoReserva(params: {
  id: string
  nombre: string
  tipo: TipoUbicacionFondo
  descripcion?: string | null
  activa?: boolean
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('fondo_reserva_ubicaciones')
      .update({
        nombre: params.nombre.trim(),
        tipo: params.tipo,
        descripcion: params.descripcion?.trim() || null,
        ...(params.activa !== undefined ? { activa: params.activa } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)

    if (error) return { success: false, error: error.message }
    appCache.invalidateTags(['fondo_reserva'])
    return { success: true }
  } catch (err) {
    return { success: false, error: getErrorMessage(err) }
  }
}

/** Marca una ubicación como receptora por defecto para los aportes automáticos en su moneda. */
export async function definirUbicacionDefaultFondoReserva(
  ubicacionId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('definir_ubicacion_default_fondo_reserva', {
      p_ubicacion_id: ubicacionId,
    })
    if (error) return { success: false, error: error.message }
    if (data && data.ok === false) return { success: false, error: data.error }
    appCache.invalidateTags(['fondo_reserva'])
    return { success: true }
  } catch (err) {
    return { success: false, error: getErrorMessage(err) }
  }
}

/** Ajusta directamente el saldo de una ubicación o registra un egreso sin alterar recibos ni deudas. */
export async function ajustarSaldoFondoReserva(params: {
  ubicacionId: string
  nuevoSaldo: number
  tipo?: 'ajuste_manual' | 'egreso' | 'saldo_inicial'
  descripcion: string
  autorNombre?: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('ajustar_fondo_reserva_ubicacion', {
      p_ubicacion_id: params.ubicacionId,
      p_nuevo_saldo: Number(params.nuevoSaldo.toFixed(2)),
      p_tipo: params.tipo || 'ajuste_manual',
      p_descripcion: params.descripcion.trim(),
      p_autor_nombre: params.autorNombre || 'Administrador',
    })
    if (error) return { success: false, error: error.message }
    if (data && data.ok === false) return { success: false, error: data.error }
    appCache.invalidateTags(['fondo_reserva'])
    return { success: true }
  } catch (err) {
    return { success: false, error: getErrorMessage(err) }
  }
}

/** Convierte o traslada fondos entre dos ubicaciones (ej. cambio de Bs a USD o viceversa). */
export async function convertirDivisaFondoReserva(params: {
  origenId: string
  destinoId: string
  montoOrigen: number
  montoDestino: number
  descripcion?: string
  autorNombre?: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('convertir_divisa_fondo_reserva', {
      p_origen_id: params.origenId,
      p_destino_id: params.destinoId,
      p_monto_origen: Number(params.montoOrigen.toFixed(2)),
      p_monto_destino: Number(params.montoDestino.toFixed(2)),
      p_descripcion: params.descripcion?.trim() || null,
      p_autor_nombre: params.autorNombre || 'Administrador',
    })
    if (error) return { success: false, error: error.message }
    if (data && data.ok === false) return { success: false, error: data.error }
    appCache.invalidateTags(['fondo_reserva'])
    return { success: true }
  } catch (err) {
    return { success: false, error: getErrorMessage(err) }
  }
}

/** Desactiva o elimina una ubicación vacía/sin movimientos. */
export async function desactivarUbicacionFondoReserva(
  ubicacionId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('fondo_reserva_ubicaciones')
      .update({ activa: false, es_destino_default: false, updated_at: new Date().toISOString() })
      .eq('id', ubicacionId)
    if (error) return { success: false, error: error.message }
    appCache.invalidateTags(['fondo_reserva'])
    return { success: true }
  } catch (err) {
    return { success: false, error: getErrorMessage(err) }
  }
}

/**
 * Acredita de forma idempotente el Fondo de Reserva correspondiente a un recibo mensual ordinario
 * cuando alcanza estado 'pagado' (100% liquidado). Nunca acredita gas, locales ni cuotas especiales.
 */
export async function acreditarFondoReservaPorRecibo(params: {
  reciboId: string
  monedaPago: MonedaFondoReserva
  tasaBcv?: number | null
  pagoReportadoId?: string | null
  referencia?: string | null
  autorNombre?: string | null
}): Promise<{ ok: boolean; alreadyCredited?: boolean; skipped?: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('acreditar_fondo_reserva_recibo', {
      p_recibo_id: params.reciboId,
      p_moneda_pago: params.monedaPago,
      p_tasa_bcv: params.tasaBcv || null,
      p_pago_reportado_id: params.pagoReportadoId || null,
      p_referencia: params.referencia || null,
      p_autor_nombre: params.autorNombre || 'Sistema',
    })
    if (error) {
      logger.debug('fondoReservaService', 'Error RPC acreditar_fondo_reserva_recibo', error)
      return { ok: false, error: error.message }
    }
    if (data && data.ok === false) {
      return { ok: false, error: data.error }
    }
    if (data && !data.skipped && !data.already_credited) {
      appCache.invalidateTags(['fondo_reserva', 'recibos'])
    }
    return {
      ok: true,
      alreadyCredited: Boolean(data?.already_credited),
      skipped: Boolean(data?.skipped),
    }
  } catch (err) {
    return { ok: false, error: getErrorMessage(err) }
  }
}
