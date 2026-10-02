import { supabase } from './supabase'

export interface DatosPagoGas {
  banco: string
  telefono: string
  rifCedula: string
  titular: string
  tipoCuenta: string
  nota?: string
}

export interface TanqueGasConfig {
  capacidadLitros: number
  nivelActualPorcentaje: number
  porcentajeAlertaMinimo: number
  proveedorActual: string
  telefonoProveedor: string
  monedaCuota: 'BS' | 'USD'
  costoPorAptoDefectoBs: number
  costoPorAptoDefectoUsd: number
  tasaBcv: number
  datosPago: DatosPagoGas
}

export interface LlenadoGas {
  id: string
  fecha: string // YYYY-MM-DD
  porcentajeInicial: number
  porcentajeFinal: number
  litrosCargados: number
  costoTotalUsd: number
  costoTotalBs: number
  tasaBcv: number
  proveedor: string
  numeroFacturaGuia?: string
  responsableRecibio: string
  estado: 'completado' | 'programado'
  observaciones?: string
}

export interface DetallePagoAptoGas {
  apartamentoId: string
  apartamentoNumero: string
  propietario?: string
  estado: 'pagado' | 'pendiente'
  fechaPago?: string // YYYY-MM-DD
  moneda?: 'BS' | 'USD'
  montoBs: number
  montoUsd: number
  metodoPago?: 'pago_movil' | 'transferencia' | 'efectivo_bs' | 'efectivo_usd' | 'otro'
  referencia?: string
  comprobanteUrl?: string
  observaciones?: string
}

export interface JornadaRecaudacionGas {
  id: string
  titulo: string
  mes: string // YYYY-MM
  fechaInicio: string // YYYY-MM-DD
  fechaLimite: string // YYYY-MM-DD
  monedaPrincipal: 'BS' | 'USD'
  costoPorAptoBs: number
  costoPorAptoUsd: number
  metaTotalBs: number
  metaTotalUsd: number
  estado: 'activa' | 'cerrada'
  pagos: Record<string, DetallePagoAptoGas> // key: apartamentoId o apartamentoNumero
}

export interface EventoDiarioGas {
  id: string
  fecha: string // YYYY-MM-DD
  tipo: 'recaudacion' | 'llenado' | 'cierre_cobro' | 'mantenimiento' | 'otro'
  titulo: string
  descripcion: string
  moneda?: 'BS' | 'USD'
  montoBs?: number
  montoUsd?: number
  apartamentoRef?: string
}

export interface GasServicioData {
  config: TanqueGasConfig
  llenados: LlenadoGas[]
  jornadas: JornadaRecaudacionGas[]
  eventosCalendario: EventoDiarioGas[]
  updatedAt: string
}

const STORAGE_GAS_KEY = 'condominio_gas_servicio_cache'
const DB_GAS_TIPO = 'config_gas_servicio'

// Configuración limpia por defecto
export const DEFAULT_GAS_CONFIG: TanqueGasConfig = {
  capacidadLitros: 2500,
  nivelActualPorcentaje: 0,
  porcentajeAlertaMinimo: 25,
  proveedorActual: '',
  telefonoProveedor: '',
  monedaCuota: 'BS',
  costoPorAptoDefectoBs: 4300.0,
  costoPorAptoDefectoUsd: 5.0,
  tasaBcv: 859.06,
  datosPago: {
    banco: 'Banco de Venezuela (0102)',
    telefono: '',
    rifCedula: '',
    titular: 'Junta de Condominio Torre 5',
    tipoCuenta: 'Pago Móvil / Corriente',
    nota: 'Colocar en concepto o referencia: Gas Apto XXX'
  }
}

// Generador de estructura completamente limpia (sin datos de prueba falsos)
export function generarDatosSemillaGas(
  aptosList?: { id: string; numero: string; propietario_nombre?: string | null }[],
  tasaBcvInput: number = 859.06
): GasServicioData {
  const tasaBcv = tasaBcvInput || 859.06
  const cuotaUsd = 5.0
  const cuotaBs = Number((cuotaUsd * tasaBcv).toFixed(2))

  // Mapear los 62 apartamentos sin pagos falsos
  const aptos = aptosList && aptosList.length > 0
    ? aptosList
    : Array.from({ length: 62 }, (_, idx) => {
        const floor = Math.floor(idx / 4) + 1
        const letter = ['A', 'B', 'C', 'D'][idx % 4]
        return {
          id: `apto-${idx + 1}`,
          numero: `5${floor.toString().padStart(2, '0')}${letter}`,
          propietario_nombre: null
        }
      })

  const pagosMap: Record<string, DetallePagoAptoGas> = {}

  // Todos los apartamentos inician limpios como PENDIENTE sin referencias falsas
  aptos.forEach((apto) => {
    const key = apto.id || apto.numero
    pagosMap[key] = {
      apartamentoId: apto.id,
      apartamentoNumero: apto.numero,
      propietario: apto.propietario_nombre || undefined,
      estado: 'pendiente',
      moneda: 'BS',
      montoBs: cuotaBs,
      montoUsd: cuotaUsd,
      observaciones: ''
    }
  })

  const jornadaActiva: JornadaRecaudacionGas = {
    id: `jornada-${new Date().toISOString().slice(0, 7)}`,
    titulo: 'Recaudación de Gas',
    mes: new Date().toISOString().slice(0, 7),
    fechaInicio: new Date().toISOString().slice(0, 10),
    fechaLimite: '',
    monedaPrincipal: 'BS',
    costoPorAptoBs: cuotaBs,
    costoPorAptoUsd: cuotaUsd,
    metaTotalBs: Number((cuotaBs * aptos.length).toFixed(2)),
    metaTotalUsd: Number((cuotaUsd * aptos.length).toFixed(2)),
    estado: 'activa',
    pagos: pagosMap
  }

  return {
    config: {
      ...DEFAULT_GAS_CONFIG,
      costoPorAptoDefectoBs: cuotaBs,
      costoPorAptoDefectoUsd: cuotaUsd,
      tasaBcv: tasaBcv
    },
    llenados: [], // Limpio: sin llenados falsos
    jornadas: [jornadaActiva],
    eventosCalendario: [], // Limpio: sin eventos falsos
    updatedAt: new Date().toISOString()
  }
}

function getLocalGasCache(): GasServicioData | null {
  try {
    const raw = localStorage.getItem(STORAGE_GAS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && parsed.config && Array.isArray(parsed.llenados)) {
        return parsed
      }
    }
  } catch (e) {
    console.warn('[gasService] Error leyendo caché local:', e)
  }
  return null
}

function saveLocalGasCache(data: GasServicioData) {
  try {
    localStorage.setItem(STORAGE_GAS_KEY, JSON.stringify(data))
  } catch (e) {
    console.warn('[gasService] Error guardando caché local:', e)
  }
}

export function limpiarCacheLocalGas() {
  try {
    localStorage.removeItem(STORAGE_GAS_KEY)
  } catch (e) {}
}

/**
 * Obtener todos los datos del servicio de gas sincronizados con Supabase y localStorage
 */
export async function obtenerGasServicioData(forceClean: boolean = false): Promise<{
  data: GasServicioData
  error: string | null
  fromDb: boolean
}> {
  try {
    // 1. Consultar apartamentos de la base de datos
    const { data: aptosDb } = await supabase
      .from('apartamentos')
      .select('id, numero, propietario_nombre')
      .order('numero')

    // 2. Consultar tasa BCV actual
    const { data: configEdificio } = await supabase
      .from('configuracion_edificio')
      .select('tasa_bcv_actual')
      .limit(1)
      .maybeSingle()

    const tasaBcv = Number(configEdificio?.tasa_bcv_actual || 859.06)

    if (forceClean) {
      limpiarCacheLocalGas()
    }

    // 3. Consultar registro de gas en casos_comunidad
    const { data: row, error } = await supabase
      .from('casos_comunidad')
      .select('id, descripcion, updated_at')
      .eq('tipo', DB_GAS_TIPO)
      .maybeSingle()

    if (!error && row?.descripcion && !forceClean) {
      try {
        const parsed = JSON.parse(row.descripcion) as GasServicioData
        if (parsed.config) {
          parsed.config.tasaBcv = tasaBcv
        }
        sincronizarAptosEnJornadas(parsed, aptosDb || [])
        saveLocalGasCache(parsed)
        return { data: parsed, error: null, fromDb: true }
      } catch (errParse) {
        console.warn('[gasService] Error parseando datos de DB:', errParse)
      }
    }

    // 4. Fallback a caché local si existe y no forzamos limpieza
    if (!forceClean) {
      const cached = getLocalGasCache()
      if (cached) {
        cached.config.tasaBcv = tasaBcv
        sincronizarAptosEnJornadas(cached, aptosDb || [])
        return { data: cached, error: null, fromDb: false }
      }
    }

    // 5. Generar estructura limpia sin datos de prueba y guardarla en Supabase
    const limpia = generarDatosSemillaGas(aptosDb || [], tasaBcv)

    Promise.resolve(
      supabase
        .from('casos_comunidad')
        .insert({
          tipo: DB_GAS_TIPO,
          titulo: 'CONFIG_GAS_SERVICIO',
          descripcion: JSON.stringify(limpia),
          monto_usd: 0,
          monto_bs: 0,
          estado: 'abierto',
          fecha: new Date().toISOString().split('T')[0]
        })
    )
      .then(() => {
        saveLocalGasCache(limpia)
      })
      .catch((e: any) => console.warn('[gasService] Error guardando config limpia en Supabase:', e))

    saveLocalGasCache(limpia)
    return { data: limpia, error: null, fromDb: false }
  } catch (err: any) {
    console.error('[gasService] Error en obtenerGasServicioData:', err)
    const fallback = generarDatosSemillaGas()
    return { data: fallback, error: err?.message || 'Error cargando datos de gas', fromDb: false }
  }
}

/**
 * Guarda los datos de gas completos en Supabase y localStorage
 */
export async function guardarGasServicioData(
  data: GasServicioData
): Promise<{ success: boolean; error: string | null }> {
  try {
    data.updatedAt = new Date().toISOString()
    saveLocalGasCache(data)

    const { data: existente } = await supabase
      .from('casos_comunidad')
      .select('id')
      .eq('tipo', DB_GAS_TIPO)
      .maybeSingle()

    let resError = null

    if (existente?.id) {
      const { error } = await supabase
        .from('casos_comunidad')
        .update({
          descripcion: JSON.stringify(data),
          updated_at: new Date().toISOString()
        })
        .eq('id', existente.id)
      resError = error
    } else {
      const { error } = await supabase
        .from('casos_comunidad')
        .insert({
          tipo: DB_GAS_TIPO,
          titulo: 'CONFIG_GAS_SERVICIO',
          descripcion: JSON.stringify(data),
          monto_usd: 0,
          monto_bs: 0,
          estado: 'abierto',
          fecha: new Date().toISOString().split('T')[0]
        })
      resError = error
    }

    if (resError) {
      console.warn('[gasService] Error persistiendo en Supabase, guardado en local:', resError.message)
      return { success: true, error: resError.message }
    }

    return { success: true, error: null }
  } catch (err: any) {
    console.error('[gasService] Error guardando datos:', err)
    return { success: false, error: err.message }
  }
}

function sincronizarAptosEnJornadas(
  data: GasServicioData,
  aptos: { id: string; numero: string; propietario_nombre?: string | null }[]
) {
  if (!aptos || aptos.length === 0) return
  data.jornadas.forEach(j => {
    if (j.estado === 'activa') {
      aptos.forEach(apto => {
        const key = apto.id || apto.numero
        if (!j.pagos[key]) {
          j.pagos[key] = {
            apartamentoId: apto.id,
            apartamentoNumero: apto.numero,
            propietario: apto.propietario_nombre || undefined,
            estado: 'pendiente',
            moneda: j.monedaPrincipal || 'BS',
            montoUsd: j.costoPorAptoUsd,
            montoBs: j.costoPorAptoBs,
            observaciones: ''
          }
        } else {
          if (!j.pagos[key].apartamentoNumero) {
            j.pagos[key].apartamentoNumero = apto.numero
          }
          if (apto.propietario_nombre && !j.pagos[key].propietario) {
            j.pagos[key].propietario = apto.propietario_nombre
          }
        }
      })
    }
  })
}

/**
 * Actualiza la configuración del tanque y la cuota (en BS o USD)
 */
export async function actualizarConfigTanque(
  nuevosValores: Partial<TanqueGasConfig>
): Promise<{ success: boolean; data?: GasServicioData; error?: string | null }> {
  const { data: actual } = await obtenerGasServicioData()
  actual.config = { ...actual.config, ...nuevosValores }

  // Si se actualizó la cuota por defecto, sincronizar en la jornada activa
  const jornada = actual.jornadas.find(j => j.estado === 'activa')
  if (jornada) {
    if (nuevosValores.monedaCuota) jornada.monedaPrincipal = nuevosValores.monedaCuota
    if (nuevosValores.costoPorAptoDefectoBs !== undefined) jornada.costoPorAptoBs = nuevosValores.costoPorAptoDefectoBs
    if (nuevosValores.costoPorAptoDefectoUsd !== undefined) jornada.costoPorAptoUsd = nuevosValores.costoPorAptoDefectoUsd
    
    // Actualizar montos en apartamentos pendientes
    Object.values(jornada.pagos).forEach(p => {
      if (p.estado === 'pendiente') {
        p.moneda = jornada.monedaPrincipal
        p.montoBs = jornada.costoPorAptoBs
        p.montoUsd = jornada.costoPorAptoUsd
      }
    })
  }

  const res = await guardarGasServicioData(actual)
  return { success: res.success, data: actual, error: res.error }
}

/**
 * Registra un nuevo llenado de gas
 */
export async function registrarLlenado(
  llenado: Omit<LlenadoGas, 'id'> & { id?: string }
): Promise<{ success: boolean; data?: GasServicioData; error?: string | null }> {
  const { data: actual } = await obtenerGasServicioData()
  const nuevoLlenado: LlenadoGas = {
    ...llenado,
    id: llenado.id || `llenado-${Date.now()}`
  }

  if (nuevoLlenado.estado === 'completado') {
    actual.config.nivelActualPorcentaje = nuevoLlenado.porcentajeFinal
  }

  const idx = actual.llenados.findIndex(l => l.id === nuevoLlenado.id)
  if (idx >= 0) {
    actual.llenados[idx] = nuevoLlenado
  } else {
    actual.llenados.unshift(nuevoLlenado)
  }

  const eventoLlenado: EventoDiarioGas = {
    id: `ev-llenado-${nuevoLlenado.id}`,
    fecha: nuevoLlenado.fecha,
    tipo: 'llenado',
    titulo: `Llenado Gas: ${nuevoLlenado.litrosCargados.toLocaleString()} L`,
    descripcion: `Proveedor: ${nuevoLlenado.proveedor}. Costo: ${nuevoLlenado.costoTotalBs ? `Bs. ${nuevoLlenado.costoTotalBs.toLocaleString('es-VE')}` : `$${nuevoLlenado.costoTotalUsd.toFixed(2)} USD`}. Responsable: ${nuevoLlenado.responsableRecibio}`,
    moneda: 'BS',
    montoBs: nuevoLlenado.costoTotalBs,
    montoUsd: nuevoLlenado.costoTotalUsd
  }

  actual.eventosCalendario = actual.eventosCalendario.filter(e => e.id !== eventoLlenado.id)
  actual.eventosCalendario.push(eventoLlenado)

  const res = await guardarGasServicioData(actual)
  return { success: res.success, data: actual, error: res.error }
}

/**
 * Elimina un registro de llenado
 */
export async function eliminarLlenado(
  llenadoId: string
): Promise<{ success: boolean; data?: GasServicioData; error?: string | null }> {
  const { data: actual } = await obtenerGasServicioData()
  actual.llenados = actual.llenados.filter(l => l.id !== llenadoId)
  actual.eventosCalendario = actual.eventosCalendario.filter(e => e.id !== `ev-llenado-${llenadoId}`)
  const res = await guardarGasServicioData(actual)
  return { success: res.success, data: actual, error: res.error }
}

/**
 * Concilia o revierte el pago de un apartamento
 */
export async function togglePagoApartamento(
  jornadaId: string,
  aptoKey: string,
  datosPagoActualizados: Partial<DetallePagoAptoGas>
): Promise<{ success: boolean; data?: GasServicioData; error?: string | null }> {
  const { data: actual } = await obtenerGasServicioData()
  const jornada = actual.jornadas.find(j => j.id === jornadaId)
  if (!jornada) return { success: false, error: 'Jornada no encontrada' }

  const pagoActual = jornada.pagos[aptoKey]
  if (!pagoActual) return { success: false, error: 'Apartamento no registrado en la jornada' }

  jornada.pagos[aptoKey] = {
    ...pagoActual,
    ...datosPagoActualizados
  }

  if (datosPagoActualizados.estado === 'pagado') {
    const fecha = datosPagoActualizados.fechaPago || new Date().toISOString().split('T')[0]
    const evPagoId = `ev-pago-${jornadaId}-${aptoKey}`
    const moneda = datosPagoActualizados.moneda || pagoActual.moneda || 'BS'
    const textoMonto = moneda === 'BS'
      ? `Bs. ${(pagoActual.montoBs || 0).toLocaleString('es-VE')}`
      : `$${(pagoActual.montoUsd || 0).toFixed(2)} USD`

    actual.eventosCalendario = actual.eventosCalendario.filter(e => e.id !== evPagoId)
    actual.eventosCalendario.push({
      id: evPagoId,
      fecha,
      tipo: 'recaudacion',
      titulo: `Recaudación Apto ${pagoActual.apartamentoNumero}`,
      descripcion: `Pago de gas ${textoMonto} (${datosPagoActualizados.metodoPago || 'Pago Móvil'} Ref: ${datosPagoActualizados.referencia || 'N/A'})`,
      moneda,
      montoBs: pagoActual.montoBs,
      montoUsd: pagoActual.montoUsd,
      apartamentoRef: pagoActual.apartamentoNumero
    })
  } else if (datosPagoActualizados.estado === 'pendiente') {
    const evPagoId = `ev-pago-${jornadaId}-${aptoKey}`
    actual.eventosCalendario = actual.eventosCalendario.filter(e => e.id !== evPagoId)
  }

  const res = await guardarGasServicioData(actual)
  return { success: res.success, data: actual, error: res.error }
}

/**
 * Agrega o modifica un evento diario del calendario
 */
export async function guardarEventoCalendario(
  evento: Omit<EventoDiarioGas, 'id'> & { id?: string }
): Promise<{ success: boolean; data?: GasServicioData; error?: string | null }> {
  const { data: actual } = await obtenerGasServicioData()
  const nuevoEvento: EventoDiarioGas = {
    ...evento,
    id: evento.id || `ev-${Date.now()}`
  }

  const idx = actual.eventosCalendario.findIndex(e => e.id === nuevoEvento.id)
  if (idx >= 0) {
    actual.eventosCalendario[idx] = nuevoEvento
  } else {
    actual.eventosCalendario.push(nuevoEvento)
  }

  const res = await guardarGasServicioData(actual)
  return { success: res.success, data: actual, error: res.error }
}

/**
 * Elimina un evento del calendario
 */
export async function eliminarEventoCalendario(
  eventoId: string
): Promise<{ success: boolean; data?: GasServicioData; error?: string | null }> {
  const { data: actual } = await obtenerGasServicioData()
  actual.eventosCalendario = actual.eventosCalendario.filter(e => e.id !== eventoId)
  const res = await guardarGasServicioData(actual)
  return { success: res.success, data: actual, error: res.error }
}

/**
 * Calcula las métricas del micro dashboard
 */
export function calcularMetricasGas(data: GasServicioData) {
  const cfg = data.config
  const nivelPct = Math.min(100, Math.max(0, cfg.nivelActualPorcentaje))
  const litrosActuales = Math.round((cfg.capacidadLitros * nivelPct) / 100)
  
  const consumoDiarioEstimado = 40
  const diasAutonomia = consumoDiarioEstimado > 0 ? Math.floor(litrosActuales / consumoDiarioEstimado) : 0

  let nivelEstado: 'optimo' | 'medio' | 'alerta' | 'critico' = 'optimo'
  if (nivelPct <= 15) nivelEstado = 'critico'
  else if (nivelPct <= cfg.porcentajeAlertaMinimo) nivelEstado = 'alerta'
  else if (nivelPct <= 50) nivelEstado = 'medio'

  const jornadaActiva = data.jornadas.find(j => j.estado === 'activa') || data.jornadas[0]
  let totalRecaudadoUsd = 0
  let totalRecaudadoBs = 0
  let aptosSolventes = 0
  let aptosMorosos = 0
  let totalAptos = 0

  if (jornadaActiva && jornadaActiva.pagos) {
    Object.values(jornadaActiva.pagos).forEach(p => {
      totalAptos++
      if (p.estado === 'pagado') {
        aptosSolventes++
        totalRecaudadoUsd += p.montoUsd || 0
        totalRecaudadoBs += p.montoBs || 0
      } else {
        aptosMorosos++
      }
    })
  }

  const monedaPrincipal = jornadaActiva?.monedaPrincipal || cfg.monedaCuota || 'BS'
  const metaUsd = jornadaActiva?.metaTotalUsd || (totalAptos * cfg.costoPorAptoDefectoUsd) || 310
  const metaBs = jornadaActiva?.metaTotalBs || (totalAptos * cfg.costoPorAptoDefectoBs) || (metaUsd * cfg.tasaBcv)

  const metaPrincipal = monedaPrincipal === 'BS' ? metaBs : metaUsd
  const recaudadoPrincipal = monedaPrincipal === 'BS' ? totalRecaudadoBs : totalRecaudadoUsd
  const porcentajeRecaudado = metaPrincipal > 0 ? Math.min(100, Math.round((recaudadoPrincipal / metaPrincipal) * 100)) : 0

  const ultimoLlenado = data.llenados.find(l => l.estado === 'completado')
  const proximoLlenado = data.llenados.find(l => l.estado === 'programado')

  return {
    nivelPct,
    litrosActuales,
    capacidadTotal: cfg.capacidadLitros,
    nivelEstado,
    diasAutonomia,
    jornadaActiva,
    monedaPrincipal,
    totalRecaudadoUsd,
    totalRecaudadoBs,
    metaUsd,
    metaBs,
    metaPrincipal,
    recaudadoPrincipal,
    porcentajeRecaudado,
    aptosSolventes,
    aptosMorosos,
    totalAptos,
    ultimoLlenado,
    proximoLlenado
  }
}

/**
 * Consulta la deuda de gas para el apartamento del residente
 */
export function obtenerDeudaGasApartamento(
  data: GasServicioData,
  aptoId?: string | null,
  aptoNumero?: string | null
): {
  tieneDeuda: boolean
  monedaPrincipal: 'BS' | 'USD'
  montoPrincipal: number
  montoBs: number
  montoUsd: number
  campanaTitulo: string
  fechaLimite?: string
  detallePago?: DetallePagoAptoGas
  datosBancarios: DatosPagoGas
} {
  const jornada = data.jornadas.find(j => j.estado === 'activa') || data.jornadas[0]
  const datosBancarios = data.config.datosPago
  const monedaPrincipal = jornada?.monedaPrincipal || data.config.monedaCuota || 'BS'

  if (!jornada || (!aptoId && !aptoNumero)) {
    return {
      tieneDeuda: false,
      monedaPrincipal,
      montoPrincipal: 0,
      montoUsd: 0,
      montoBs: 0,
      campanaTitulo: 'Servicio de Gas al Día',
      datosBancarios
    }
  }

  let detalle = aptoId ? jornada.pagos[aptoId] : undefined
  if (!detalle && aptoNumero) {
    detalle = Object.values(jornada.pagos).find(p => p.apartamentoNumero === aptoNumero || p.apartamentoId === aptoId)
  }

  const montoBsCalculado = detalle?.montoBs || data.config.costoPorAptoDefectoBs || Number((data.config.costoPorAptoDefectoUsd * data.config.tasaBcv).toFixed(2))
  const montoUsdCalculado = detalle?.montoUsd || data.config.costoPorAptoDefectoUsd || 5.0
  const montoPrincipal = monedaPrincipal === 'BS' ? montoBsCalculado : montoUsdCalculado

  if (detalle && detalle.estado === 'pendiente') {
    return {
      tieneDeuda: true,
      monedaPrincipal,
      montoPrincipal,
      montoBs: montoBsCalculado,
      montoUsd: montoUsdCalculado,
      campanaTitulo: jornada.titulo,
      fechaLimite: jornada.fechaLimite,
      detallePago: detalle,
      datosBancarios
    }
  }

  return {
    tieneDeuda: false,
    monedaPrincipal,
    montoPrincipal: 0,
    montoUsd: 0,
    montoBs: 0,
    campanaTitulo: jornada.titulo,
    fechaLimite: jornada.fechaLimite,
    detallePago: detalle,
    datosBancarios
  }
}
