import { supabase } from './supabase'
import { despacharEmailCuotaGas } from './emailService'

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
  esEspecial?: boolean
  mes: string // YYYY-MM
  fechaInicio: string // YYYY-MM-DD
  fechaLimite: string // YYYY-MM-DD
  monedaPrincipal: 'BS' | 'USD'
  costoPorAptoBs: number
  costoPorAptoUsd: number
  metaTotalBs: number
  metaTotalUsd: number
  estado: 'activa' | 'cerrada'
  activa?: boolean
  pagos: Record<string, DetallePagoAptoGas> // key: apartamentoId o apartamentoNumero
}

export interface DeudaApartamentoGas {
  tieneDeuda: boolean
  esCuotaEspecial?: boolean
  monedaPrincipal: 'BS' | 'USD'
  montoPrincipal: number
  montoBs: number
  montoUsd: number
  campanaTitulo: string
  campanaId?: string
  fechaLimite?: string
  detallePago?: DetallePagoAptoGas
  datosBancarios: DatosPagoGas
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

const STORAGE_GAS_KEY = 'condominio_gas_servicio_v2'
const DB_GAS_TIPO = 'config_gas_servicio'

// Configuración limpia por defecto (SIN cuota ficticia previa)
export const DEFAULT_GAS_CONFIG: TanqueGasConfig = {
  capacidadLitros: 2500,
  nivelActualPorcentaje: 0,
  porcentajeAlertaMinimo: 25,
  proveedorActual: '',
  telefonoProveedor: '',
  monedaCuota: 'BS',
  costoPorAptoDefectoBs: 0,
  costoPorAptoDefectoUsd: 0,
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

// Generador de estructura completamente limpia (sin datos de prueba falsos ni cuotas preasignadas)
export function generarDatosSemillaGas(
  _aptosList?: { id: string; numero: string; propietario_nombre?: string | null }[],
  tasaBcvInput: number = 859.06
): GasServicioData {
  const tasaBcv = tasaBcvInput || 859.06

  return {
    config: {
      ...DEFAULT_GAS_CONFIG,
      costoPorAptoDefectoBs: 0,
      costoPorAptoDefectoUsd: 0,
      tasaBcv: tasaBcv
    },
    llenados: [], // Limpio: sin llenados falsos
    jornadas: [], // Limpio: sin cuotas ficticias pre-cargadas hasta que el admin las cree
    eventosCalendario: [], // Limpio: sin eventos falsos
    updatedAt: new Date().toISOString()
  }
}

function getLocalGasCache(): GasServicioData | null {
  try {
    localStorage.removeItem('condominio_gas_servicio_cache')
    localStorage.removeItem('condominio_gas_servicio_v1')
    const raw = localStorage.getItem(STORAGE_GAS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && parsed.config && Array.isArray(parsed.llenados)) {
        const tieneDatosPrueba =
          parsed.llenados.some((l: any) => l.id?.includes('2026-09-18') || l.id?.includes('2026-08-05') || (l.proveedor && l.proveedor.includes('PDVSA'))) ||
          parsed.eventosCalendario?.some((e: any) => e.id?.includes('ev-recaudo-01') || e.id?.includes('ev-recaudo-02'))

        if (tieneDatosPrueba) {
          localStorage.removeItem(STORAGE_GAS_KEY)
          return null
        }
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
    localStorage.removeItem('condominio_gas_servicio_cache')
    localStorage.removeItem('condominio_gas_servicio_v1')
    localStorage.setItem(STORAGE_GAS_KEY, JSON.stringify(data))
  } catch (e) {
    console.warn('[gasService] Error guardando caché local:', e)
  }
}

export function limpiarCacheLocalGas() {
  try {
    localStorage.removeItem('condominio_gas_servicio_cache')
    localStorage.removeItem('condominio_gas_servicio_v1')
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
        // Si el registro de DB aún tuviese los datos ficticios viejos o la cuota por defecto de 4300/5$, forzar limpieza
        const tieneCuotaFalsa4300 =
          parsed.config?.costoPorAptoDefectoBs === 4300 ||
          parsed.config?.costoPorAptoDefectoUsd === 5 ||
          (parsed.jornadas?.length === 1 && parsed.jornadas[0].titulo === 'Recaudación de Gas' && (parsed.jornadas[0].costoPorAptoBs === 4300 || parsed.jornadas[0].costoPorAptoUsd === 5))

        if (
          tieneCuotaFalsa4300 ||
          parsed.llenados?.some((l: any) => l.id?.includes('2026-09-18') || l.id?.includes('2026-08-05'))
        ) {
          parsed.llenados = []
          parsed.eventosCalendario = []
          parsed.config.nivelActualPorcentaje = 0
          parsed.config.monedaCuota = 'BS'
          parsed.config.costoPorAptoDefectoBs = 0
          parsed.config.costoPorAptoDefectoUsd = 0
          if (tieneCuotaFalsa4300) {
            parsed.jornadas = []
          }
          await guardarGasServicioData(parsed)
        }
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
    limpiarCacheLocalGas()
    saveLocalGasCache(limpia)

    try {
      if (row?.id) {
        await supabase
          .from('casos_comunidad')
          .update({
            descripcion: JSON.stringify(limpia),
            updated_at: new Date().toISOString()
          })
          .eq('id', row.id)
      } else {
        await supabase
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
      }
    } catch (e: any) {
      console.warn('[gasService] Error guardando config limpia en Supabase:', e)
    }

    return { data: limpia, error: null, fromDb: true }
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
): DeudaApartamentoGas {
  const jornada = data.jornadas.find(j => j.estado === 'activa')
  const datosBancarios = data.config.datosPago
  const monedaPrincipal = jornada?.monedaPrincipal || data.config.monedaCuota || 'BS'

  // Si no hay jornada activa o si la cuota es 0, no hay deuda
  if (!jornada || (!aptoId && !aptoNumero) || (jornada.costoPorAptoBs === 0 && jornada.costoPorAptoUsd === 0)) {
    return {
      tieneDeuda: false,
      esCuotaEspecial: false,
      monedaPrincipal,
      montoPrincipal: 0,
      montoUsd: 0,
      montoBs: 0,
      campanaTitulo: 'Servicio de Gas al Día',
      campanaId: jornada?.id,
      datosBancarios
    }
  }

  let detalle = aptoId ? jornada.pagos[aptoId] : undefined
  if (!detalle && aptoNumero) {
    detalle = Object.values(jornada.pagos).find(p => p.apartamentoNumero === aptoNumero || p.apartamentoId === aptoId)
  }

  const montoBsCalculado = detalle?.montoBs || jornada.costoPorAptoBs || 0
  const montoUsdCalculado = detalle?.montoUsd || jornada.costoPorAptoUsd || 0
  const montoPrincipal = monedaPrincipal === 'BS' ? montoBsCalculado : montoUsdCalculado

  if (detalle && detalle.estado === 'pendiente' && (montoBsCalculado > 0 || montoUsdCalculado > 0)) {
    return {
      tieneDeuda: true,
      esCuotaEspecial: !!jornada.esEspecial,
      monedaPrincipal,
      montoPrincipal,
      montoBs: montoBsCalculado,
      montoUsd: montoUsdCalculado,
      campanaTitulo: jornada.titulo,
      campanaId: jornada.id,
      fechaLimite: jornada.fechaLimite,
      detallePago: detalle,
      datosBancarios
    }
  }

  return {
    tieneDeuda: false,
    esCuotaEspecial: !!jornada.esEspecial,
    monedaPrincipal,
    montoPrincipal: 0,
    montoUsd: 0,
    montoBs: 0,
    campanaTitulo: jornada.titulo,
    campanaId: jornada.id,
    fechaLimite: jornada.fechaLimite,
    detallePago: detalle,
    datosBancarios
  }
}

export interface ParametrosCuotaGas {
  titulo: string
  esEspecial?: boolean
  moneda?: 'BS' | 'USD'
  monedaPrincipal?: 'BS' | 'USD'
  monto?: number
  costoPorAptoBs?: number
  costoPorAptoUsd?: number
  fechaLimite?: string
  datosPago?: Partial<DatosPagoGas>
  enviarEmail?: boolean
  notificarEmail?: boolean
  tasaBcv?: number
  edificioNombre?: string
}

/**
 * Permite al administrador crear o actualizar una cuota de gas (ordinaria o especial)
 * y opcionalmente notificar por correo a todos los residentes con email registrado.
 */
export async function crearOActualizarCuotaGas(
  params: ParametrosCuotaGas
): Promise<{ success: boolean; data?: GasServicioData; error?: string | null; correosEnviados?: number; emailsEnviados?: number }> {
  try {
    const { data: actual } = await obtenerGasServicioData()
    const tasa = params.tasaBcv || actual.config.tasaBcv || 859.06

    const moneda = params.moneda || params.monedaPrincipal || 'BS'
    let costoBs = params.costoPorAptoBs || 0
    let costoUsd = params.costoPorAptoUsd || 0

    if (params.monto !== undefined && params.monto > 0) {
      if (moneda === 'BS') {
        costoBs = params.monto
        costoUsd = tasa > 0 ? Number((params.monto / tasa).toFixed(2)) : 0
      } else {
        costoUsd = params.monto
        costoBs = Number((params.monto * tasa).toFixed(2))
      }
    } else if (costoBs > 0 && costoUsd === 0) {
      costoUsd = tasa > 0 ? Number((costoBs / tasa).toFixed(2)) : 0
    } else if (costoUsd > 0 && costoBs === 0) {
      costoBs = Number((costoUsd * tasa).toFixed(2))
    }

    actual.config.tasaBcv = tasa
    actual.config.monedaCuota = moneda
    actual.config.costoPorAptoDefectoBs = costoBs
    actual.config.costoPorAptoDefectoUsd = costoUsd
    if (params.datosPago) {
      actual.config.datosPago = { ...actual.config.datosPago, ...params.datosPago }
    }

    // Consultar todos los apartamentos para asegurar que todos queden en la jornada
    const { data: aptosDb } = await supabase
      .from('apartamentos')
      .select('id, numero, propietario_nombre, propietario_email')
      .order('numero')

    const aptos = aptosDb || []
    const mesActual = new Date().toISOString().slice(0, 7)

    // Buscar si ya hay jornada activa o crear una nueva
    let jornada = actual.jornadas.find(j => j.estado === 'activa')
    if (!jornada) {
      jornada = {
        id: `jornada-${Date.now()}`,
        titulo: params.titulo.trim() || (params.esEspecial ? 'Cuota Especial de Gas Comunal' : 'Recaudación de Gas'),
        esEspecial: !!params.esEspecial,
        mes: mesActual,
        fechaInicio: new Date().toISOString().slice(0, 10),
        fechaLimite: params.fechaLimite || '',
        monedaPrincipal: moneda,
        costoPorAptoBs: costoBs,
        costoPorAptoUsd: costoUsd,
        metaTotalBs: Number((costoBs * Math.max(1, aptos.length)).toFixed(2)),
        metaTotalUsd: Number((costoUsd * Math.max(1, aptos.length)).toFixed(2)),
        estado: 'activa',
        activa: true,
        pagos: {}
      }
      actual.jornadas.unshift(jornada)
    } else {
      jornada.titulo = params.titulo.trim() || jornada.titulo
      jornada.esEspecial = !!params.esEspecial
      jornada.monedaPrincipal = moneda
      jornada.costoPorAptoBs = costoBs
      jornada.costoPorAptoUsd = costoUsd
      jornada.fechaLimite = params.fechaLimite || jornada.fechaLimite
      jornada.metaTotalBs = Number((costoBs * Math.max(1, aptos.length)).toFixed(2))
      jornada.metaTotalUsd = Number((costoUsd * Math.max(1, aptos.length)).toFixed(2))
      jornada.estado = 'activa'
      jornada.activa = true
    }

    // Inicializar o actualizar apartamentos
    aptos.forEach(apto => {
      const key = apto.id || apto.numero
      const existente = jornada!.pagos[key]
      if (!existente || existente.estado === 'pendiente') {
        jornada!.pagos[key] = {
          apartamentoId: apto.id,
          apartamentoNumero: apto.numero,
          propietario: apto.propietario_nombre || undefined,
          estado: 'pendiente',
          moneda: moneda,
          montoBs: costoBs,
          montoUsd: costoUsd,
          observaciones: ''
        }
      }
    })

    const resGuardar = await guardarGasServicioData(actual)
    if (!resGuardar.success) {
      return { success: false, error: resGuardar.error }
    }

    let correosEnviados = 0
    const debeEnviarEmail = params.enviarEmail !== undefined ? params.enviarEmail : !!params.notificarEmail

    // Si se solicitó notificación por email (o si es cuota especial y se marcó enviar)
    if (debeEnviarEmail) {
      const { data: configEdificio } = await supabase
        .from('configuracion_edificio')
        .select('nombre_edificio, color_primario')
        .limit(1)
        .maybeSingle()

      const edificioNombre = params.edificioNombre || configEdificio?.nombre_edificio || 'DOMUS'
      const aptosConEmail = aptos.filter(a => a.propietario_email && a.propietario_email.includes('@'))

      for (const apto of aptosConEmail) {
        try {
          await despacharEmailCuotaGas({
            destinatarioEmail: apto.propietario_email!,
            apartamentoNumero: apto.numero,
            propietarioNombre: apto.propietario_nombre,
            edificioNombre,
            tituloCuota: params.titulo,
            esCuotaEspecial: !!params.esEspecial,
            montoBs: costoBs,
            montoUsd: costoUsd,
            tasaBcv: tasa,
            fechaLimite: params.fechaLimite,
            banco: actual.config.datosPago.banco,
            telefono: actual.config.datosPago.telefono,
            rifCedula: actual.config.datosPago.rifCedula,
            titular: actual.config.datosPago.titular,
            colorPrimario: configEdificio?.color_primario
          })
          correosEnviados++
        } catch (e) {
          console.warn(`[gasService] Error enviando email de gas a ${apto.numero}:`, e)
        }
      }
    }

    return {
      success: true,
      data: actual,
      correosEnviados,
      emailsEnviados: correosEnviados
    }
  } catch (err: any) {
    console.error('[gasService] Error en crearOActualizarCuotaGas:', err)
    return { success: false, error: err.message }
  }
}

export interface ParametrosReportarPagoGas {
  jornadaId?: string
  apartamentoId?: string
  apartamentoNumero: string
  monto?: number
  moneda?: 'BS' | 'USD'
  montoBs?: number
  montoUsd?: number
  metodoPago: string
  referencia: string
  fechaPago?: string
  observaciones?: string
  tasaBcv?: number
}

/**
 * Permite al residente reportar el pago de su cuota de gas con número de referencia y método
 */
export async function reportarPagoGasResidente(
  params: ParametrosReportarPagoGas
): Promise<{ success: boolean; data?: GasServicioData; error?: string | null }> {
  try {
    const { data: actual } = await obtenerGasServicioData()
    const jornada = params.jornadaId
      ? actual.jornadas.find(j => j.id === params.jornadaId) || actual.jornadas.find(j => j.estado === 'activa')
      : actual.jornadas.find(j => j.estado === 'activa')

    if (!jornada) {
      return { success: false, error: 'No hay ninguna jornada de recaudación de gas activa' }
    }

    const tasa = params.tasaBcv || actual.config.tasaBcv || 859.06
    let montoBs = params.montoBs || 0
    let montoUsd = params.montoUsd || 0

    if (params.monto !== undefined && params.monto > 0) {
      if (params.moneda === 'USD') {
        montoUsd = params.monto
        montoBs = Number((params.monto * tasa).toFixed(2))
      } else {
        montoBs = params.monto
        montoUsd = tasa > 0 ? Number((params.monto / tasa).toFixed(2)) : 0
      }
    }

    const key = params.apartamentoId || params.apartamentoNumero
    let item: DetallePagoAptoGas | undefined = jornada.pagos[key]
    if (!item && params.apartamentoNumero) {
      item = Object.values(jornada.pagos).find(p => p.apartamentoNumero === params.apartamentoNumero)
    }

    if (!item) {
      item = {
        apartamentoId: params.apartamentoId || `apto-${params.apartamentoNumero}`,
        apartamentoNumero: params.apartamentoNumero,
        estado: 'pendiente',
        montoBs: montoBs,
        montoUsd: montoUsd
      }
      jornada.pagos[key] = item
    }

    item.estado = 'pagado'
    item.fechaPago = params.fechaPago || new Date().toISOString().slice(0, 10)
    item.metodoPago = params.metodoPago as any
    item.referencia = params.referencia.trim()
    item.observaciones = params.observaciones?.trim() || 'Pago reportado por el residente en su portal'
    if (montoBs > 0) item.montoBs = montoBs
    if (montoUsd > 0) item.montoUsd = montoUsd

    // Registrar evento en calendario de gas
    actual.eventosCalendario.unshift({
      id: `ev-gas-${Date.now()}`,
      fecha: item.fechaPago,
      tipo: 'recaudacion',
      titulo: `Pago Gas Apto ${params.apartamentoNumero}`,
      descripcion: `Reportado: ${item.referencia} · ${params.metodoPago}`,
      montoBs: item.montoBs,
      montoUsd: item.montoUsd,
      apartamentoRef: params.apartamentoNumero
    })

    const res = await guardarGasServicioData(actual)
    return { success: res.success, data: actual, error: res.error }
  } catch (err: any) {
    console.error('[gasService] Error en reportarPagoGasResidente:', err)
    return { success: false, error: err.message }
  }
}
