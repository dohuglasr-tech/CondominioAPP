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
  montoUsd: number
  montoBs: number
  metodoPago?: 'pago_movil' | 'transferencia' | 'efectivo_usd' | 'efectivo_bs' | 'otro'
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
  costoPorAptoUsd: number
  costoPorAptoBs: number
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
  montoUsd?: number
  montoBs?: number
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

// Configuración por defecto
export const DEFAULT_GAS_CONFIG: TanqueGasConfig = {
  capacidadLitros: 2500,
  nivelActualPorcentaje: 68,
  porcentajeAlertaMinimo: 25,
  proveedorActual: 'Gas Comunal / PDVSA Gas Ocumare',
  telefonoProveedor: '0800-4272668',
  costoPorAptoDefectoUsd: 5.0,
  tasaBcv: 859.06,
  datosPago: {
    banco: 'Banco de Venezuela (0102)',
    telefono: '0414-1234567',
    rifCedula: 'J-12345678-0',
    titular: 'Junta de Condominio Torre 5',
    tipoCuenta: 'Pago Móvil / Cta Corriente',
    nota: 'Colocar en concepto o referencia: Gas Apto XXX'
  }
}

// Generador de datos semilla con 62 apartamentos
export function generarDatosSemillaGas(aptosList?: { id: string; numero: string; propietario_nombre?: string | null }[]): GasServicioData {
  const tasaBcv = 859.06
  const cuotaUsd = 5.0
  const cuotaBs = Number((cuotaUsd * tasaBcv).toFixed(2))

  // 62 apartamentos por defecto si no vienen de Supabase
  const aptos = aptosList && aptosList.length > 0
    ? aptosList
    : Array.from({ length: 62 }, (_, idx) => {
        const floor = Math.floor(idx / 4) + 1
        const letter = ['A', 'B', 'C', 'D'][idx % 4]
        return {
          id: `apto-seed-${idx + 1}`,
          numero: `5${floor.toString().padStart(2, '0')}${letter}`,
          propietario_nombre: `Propietario ${letter}-${floor}`
        }
      })

  const pagosMap: Record<string, DetallePagoAptoGas> = {}

  // Semilla de pagos: 44 pagados, 18 pendientes
  aptos.forEach((apto, index) => {
    const isPaid = index % 3 !== 0 // 2 de cada 3 pagan
    const key = apto.id || apto.numero
    if (isPaid) {
      const dia = 2 + (index % 8)
      pagosMap[key] = {
        apartamentoId: apto.id,
        apartamentoNumero: apto.numero,
        propietario: apto.propietario_nombre || `Apto ${apto.numero}`,
        estado: 'pagado',
        fechaPago: `2026-10-0${dia}`,
        montoUsd: cuotaUsd,
        montoBs: cuotaBs,
        metodoPago: index % 2 === 0 ? 'pago_movil' : 'transferencia',
        referencia: `PM-${88000 + index * 123}`,
        observaciones: 'Pago verificado'
      }
    } else {
      pagosMap[key] = {
        apartamentoId: apto.id,
        apartamentoNumero: apto.numero,
        propietario: apto.propietario_nombre || `Apto ${apto.numero}`,
        estado: 'pendiente',
        montoUsd: cuotaUsd,
        montoBs: cuotaBs,
        observaciones: 'Cuota de gas pendiente'
      }
    }
  })

  const jornadaActiva: JornadaRecaudacionGas = {
    id: 'jornada-2026-10',
    titulo: 'Recaudación Llenado de Gas - Octubre 2026',
    mes: '2026-10',
    fechaInicio: '2026-10-01',
    fechaLimite: '2026-10-15',
    costoPorAptoUsd: cuotaUsd,
    costoPorAptoBs: cuotaBs,
    metaTotalUsd: cuotaUsd * aptos.length,
    estado: 'activa',
    pagos: pagosMap
  }

  const jornadaAnterior: JornadaRecaudacionGas = {
    id: 'jornada-2026-09',
    titulo: 'Recaudación Llenado de Gas - Septiembre 2026',
    mes: '2026-09',
    fechaInicio: '2026-09-01',
    fechaLimite: '2026-09-15',
    costoPorAptoUsd: 4.5,
    costoPorAptoBs: Number((4.5 * tasaBcv).toFixed(2)),
    metaTotalUsd: 4.5 * aptos.length,
    estado: 'cerrada',
    pagos: {}
  }

  const llenadosSemilla: LlenadoGas[] = [
    {
      id: 'llenado-2026-09-18',
      fecha: '2026-09-18',
      porcentajeInicial: 12,
      porcentajeFinal: 92,
      litrosCargados: 2000,
      costoTotalUsd: 280.0,
      costoTotalBs: Number((280.0 * tasaBcv).toFixed(2)),
      tasaBcv: tasaBcv,
      proveedor: 'Gas Comunal / PDVSA Cisterna #14',
      numeroFacturaGuia: 'GUIA-882194',
      responsableRecibio: 'Dohuglas Guevara / Conserjería',
      estado: 'completado',
      observaciones: 'Descarga completa sin novedades, prueba de presión exitosa.'
    },
    {
      id: 'llenado-2026-08-05',
      fecha: '2026-08-05',
      porcentajeInicial: 15,
      porcentajeFinal: 95,
      litrosCargados: 2000,
      costoTotalUsd: 280.0,
      costoTotalBs: Number((280.0 * 750.0).toFixed(2)),
      tasaBcv: 750.0,
      proveedor: 'Gas Comunal / PDVSA Cisterna #09',
      numeroFacturaGuia: 'GUIA-741203',
      responsableRecibio: 'José Ramos (Conserje)',
      estado: 'completado',
      observaciones: 'Llenado rutinario mensual.'
    },
    {
      id: 'llenado-2026-10-22',
      fecha: '2026-10-22',
      porcentajeInicial: 20,
      porcentajeFinal: 95,
      litrosCargados: 2000,
      costoTotalUsd: 290.0,
      costoTotalBs: Number((290.0 * tasaBcv).toFixed(2)),
      tasaBcv: tasaBcv,
      proveedor: 'Gas Comunal Ocumare',
      responsableRecibio: 'Junta de Condominio',
      estado: 'programado',
      observaciones: 'Llenado proyectado según meta de recaudación actual.'
    }
  ]

  const eventosCalendario: EventoDiarioGas[] = [
    {
      id: 'ev-1',
      fecha: '2026-10-01',
      tipo: 'recaudacion',
      titulo: 'Apertura Jornada Gas Octubre',
      descripcion: 'Inicio formal de recaudación de la cuota de $5.00 USD por apartamento.',
      montoUsd: 20.0
    },
    {
      id: 'ev-2',
      fecha: '2026-10-03',
      tipo: 'recaudacion',
      titulo: 'Recaudación Lote 1 (Presencial)',
      descripcion: 'Cobro de cuotas en efectivo y verificación en conserjería.',
      montoUsd: 65.0
    },
    {
      id: 'ev-3',
      fecha: '2026-10-06',
      tipo: 'recaudacion',
      titulo: 'Conciliación Pago Móvil Lote 2',
      descripcion: 'Reportes validados de transferencias y pago móvil bancario.',
      montoUsd: 85.0
    },
    {
      id: 'ev-4',
      fecha: '2026-10-15',
      tipo: 'cierre_cobro',
      titulo: 'Fecha Límite de Recaudación',
      descripcion: 'Cierre de recepción para coordinar despacho con el proveedor.',
      montoUsd: 0
    },
    {
      id: 'ev-5',
      fecha: '2026-10-22',
      tipo: 'llenado',
      titulo: 'Cisterna Gas Comunal Programada',
      descripcion: 'Llegada de camión cisterna estimada para recarga de 2.000 L.',
      montoUsd: 290.0
    }
  ]

  return {
    config: DEFAULT_GAS_CONFIG,
    llenados: llenadosSemilla,
    jornadas: [jornadaActiva, jornadaAnterior],
    eventosCalendario,
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

/**
 * Obtener todos los datos del servicio de gas sincronizados con Supabase y localStorage
 */
export async function obtenerGasServicioData(): Promise<{
  data: GasServicioData
  error: string | null
  fromDb: boolean
}> {
  try {
    // 1. Consultar apartamentos para garantizar que todos estén mapeados
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

    // 3. Consultar registro de gas en casos_comunidad
    const { data: row, error } = await supabase
      .from('casos_comunidad')
      .select('id, descripcion, updated_at')
      .eq('tipo', DB_GAS_TIPO)
      .maybeSingle()

    if (!error && row?.descripcion) {
      try {
        const parsed = JSON.parse(row.descripcion) as GasServicioData
        // Asegurar tasa BCV y datos actualizados
        if (parsed.config) {
          parsed.config.tasaBcv = tasaBcv
        }
        // Sincronizar apartamentos si la jornada activa no tiene todos
        sincronizarAptosEnJornadas(parsed, aptosDb || [])
        saveLocalGasCache(parsed)
        return { data: parsed, error: null, fromDb: true }
      } catch (errParse) {
        console.warn('[gasService] Error parseando datos de DB:', errParse)
      }
    }

    // 4. Fallback a caché local si existe
    const cached = getLocalGasCache()
    if (cached) {
      cached.config.tasaBcv = tasaBcv
      sincronizarAptosEnJornadas(cached, aptosDb || [])
      return { data: cached, error: null, fromDb: false }
    }

    // 5. Generar plantilla semilla inicial y guardarla en Supabase
    const semilla = generarDatosSemillaGas(aptosDb || [])
    semilla.config.tasaBcv = tasaBcv

    // Guardar en Supabase en segundo plano
    Promise.resolve(
      supabase
        .from('casos_comunidad')
        .insert({
          tipo: DB_GAS_TIPO,
          titulo: 'CONFIG_GAS_SERVICIO',
          descripcion: JSON.stringify(semilla),
          monto_usd: 0,
          monto_bs: 0,
          estado: 'abierto',
          fecha: new Date().toISOString().split('T')[0]
        })
    )
      .then(() => {
        saveLocalGasCache(semilla)
      })
      .catch((e: any) => console.warn('[gasService] Error guardando semilla inicial en Supabase:', e))

    saveLocalGasCache(semilla)
    return { data: semilla, error: null, fromDb: false }
  } catch (err: any) {
    console.error('[gasService] Error en obtenerGasServicioData:', err)
    const fallback = getLocalGasCache() || generarDatosSemillaGas()
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

    // Buscar si ya existe el registro
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

/**
 * Garantiza que todos los apartamentos del edificio existan en la jornada activa
 */
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
            propietario: apto.propietario_nombre || `Apto ${apto.numero}`,
            estado: 'pendiente',
            montoUsd: j.costoPorAptoUsd,
            montoBs: j.costoPorAptoBs,
            observaciones: 'Pendiente de pago'
          }
        } else {
          // Asegurar número de apto visible
          if (!j.pagos[key].apartamentoNumero) {
            j.pagos[key].apartamentoNumero = apto.numero
          }
        }
      })
    }
  })
}

/**
 * Actualiza la configuración y nivel del tanque
 */
export async function actualizarConfigTanque(
  nuevosValores: Partial<TanqueGasConfig>
): Promise<{ success: boolean; data?: GasServicioData; error?: string | null }> {
  const { data: actual } = await obtenerGasServicioData()
  actual.config = { ...actual.config, ...nuevosValores }
  const res = await guardarGasServicioData(actual)
  return { success: res.success, data: actual, error: res.error }
}

/**
 * Registra un nuevo llenado de gas y actualiza el nivel del tanque automáticamente
 */
export async function registrarLlenado(
  llenado: Omit<LlenadoGas, 'id'> & { id?: string }
): Promise<{ success: boolean; data?: GasServicioData; error?: string | null }> {
  const { data: actual } = await obtenerGasServicioData()
  const nuevoLlenado: LlenadoGas = {
    ...llenado,
    id: llenado.id || `llenado-${Date.now()}`
  }

  // Si está completado, actualizar el nivel actual del tanque al porcentaje final
  if (nuevoLlenado.estado === 'completado') {
    actual.config.nivelActualPorcentaje = nuevoLlenado.porcentajeFinal
  }

  // Prevenir duplicados si se edita
  const idx = actual.llenados.findIndex(l => l.id === nuevoLlenado.id)
  if (idx >= 0) {
    actual.llenados[idx] = nuevoLlenado
  } else {
    actual.llenados.unshift(nuevoLlenado)
  }

  // Agregar evento correspondiente en el calendario
  const eventoLlenado: EventoDiarioGas = {
    id: `ev-llenado-${nuevoLlenado.id}`,
    fecha: nuevoLlenado.fecha,
    tipo: 'llenado',
    titulo: `Llenado Gas: ${nuevoLlenado.litrosCargados.toLocaleString()} L`,
    descripcion: `Proveedor: ${nuevoLlenado.proveedor}. Costo: $${nuevoLlenado.costoTotalUsd.toFixed(2)} USD. Responsable: ${nuevoLlenado.responsableRecibio}`,
    montoUsd: nuevoLlenado.costoTotalUsd,
    montoBs: nuevoLlenado.costoTotalBs
  }

  // Reemplazar o insertar evento de calendario
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
 * Cambia el estado de pago de un apartamento en una jornada de recaudación
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

  // Si se marcó pagado y tiene fecha, registrar recaudación en el calendario
  if (datosPagoActualizados.estado === 'pagado') {
    const fecha = datosPagoActualizados.fechaPago || new Date().toISOString().split('T')[0]
    const evPagoId = `ev-pago-${jornadaId}-${aptoKey}`
    actual.eventosCalendario = actual.eventosCalendario.filter(e => e.id !== evPagoId)
    actual.eventosCalendario.push({
      id: evPagoId,
      fecha,
      tipo: 'recaudacion',
      titulo: `Recaudación Apto ${pagoActual.apartamentoNumero}`,
      descripcion: `Pago de gas $${pagoActual.montoUsd.toFixed(2)} USD (${pagoActual.metodoPago || 'Pago Móvil'} Ref: ${datosPagoActualizados.referencia || 'N/A'})`,
      montoUsd: pagoActual.montoUsd,
      montoBs: pagoActual.montoBs,
      apartamentoRef: pagoActual.apartamentoNumero
    })
  } else if (datosPagoActualizados.estado === 'pendiente') {
    // Si se revierte a pendiente, remover evento del calendario
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
 * Crea o actualiza una campaña / jornada de recaudación
 */
export async function guardarJornadaRecaudacion(
  jornada: JornadaRecaudacionGas
): Promise<{ success: boolean; data?: GasServicioData; error?: string | null }> {
  const { data: actual } = await obtenerGasServicioData()
  const idx = actual.jornadas.findIndex(j => j.id === jornada.id)
  if (idx >= 0) {
    actual.jornadas[idx] = jornada
  } else {
    actual.jornadas.unshift(jornada)
  }
  const res = await guardarGasServicioData(actual)
  return { success: res.success, data: actual, error: res.error }
}

/**
 * Calcula las métricas clave para el micro dashboard
 */
export function calcularMetricasGas(data: GasServicioData) {
  const cfg = data.config
  const nivelPct = Math.min(100, Math.max(0, cfg.nivelActualPorcentaje))
  const litrosActuales = Math.round((cfg.capacidadLitros * nivelPct) / 100)
  
  // Consumo diario estimado: ~40 litros al día para el edificio completo (62 apartamentos)
  const consumoDiarioEstimado = 40
  const diasAutonomia = consumoDiarioEstimado > 0 ? Math.floor(litrosActuales / consumoDiarioEstimado) : 0

  let nivelEstado: 'optimo' | 'medio' | 'alerta' | 'critico' = 'optimo'
  if (nivelPct <= 15) nivelEstado = 'critico'
  else if (nivelPct <= cfg.porcentajeAlertaMinimo) nivelEstado = 'alerta'
  else if (nivelPct <= 50) nivelEstado = 'medio'

  // Métricas de la campaña activa
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

  const metaUsd = jornadaActiva?.metaTotalUsd || (totalAptos * cfg.costoPorAptoDefectoUsd) || 310
  const porcentajeRecaudado = metaUsd > 0 ? Math.min(100, Math.round((totalRecaudadoUsd / metaUsd) * 100)) : 0

  // Último llenado completado
  const ultimoLlenado = data.llenados.find(l => l.estado === 'completado')
  // Próximo llenado programado
  const proximoLlenado = data.llenados.find(l => l.estado === 'programado')

  return {
    nivelPct,
    litrosActuales,
    capacidadTotal: cfg.capacidadLitros,
    nivelEstado,
    diasAutonomia,
    jornadaActiva,
    totalRecaudadoUsd,
    totalRecaudadoBs,
    metaUsd,
    porcentajeRecaudado,
    aptosSolventes,
    aptosMorosos,
    totalAptos,
    ultimoLlenado,
    proximoLlenado
  }
}

/**
 * Consulta la deuda de gas para el apartamento del residente autenticado
 */
export function obtenerDeudaGasApartamento(
  data: GasServicioData,
  aptoId?: string | null,
  aptoNumero?: string | null
): {
  tieneDeuda: boolean
  montoUsd: number
  montoBs: number
  campanaTitulo: string
  fechaLimite?: string
  detallePago?: DetallePagoAptoGas
  datosBancarios: DatosPagoGas
} {
  const jornada = data.jornadas.find(j => j.estado === 'activa') || data.jornadas[0]
  const datosBancarios = data.config.datosPago

  if (!jornada || (!aptoId && !aptoNumero)) {
    return {
      tieneDeuda: false,
      montoUsd: 0,
      montoBs: 0,
      campanaTitulo: 'Servicio de Gas al Día',
      datosBancarios
    }
  }

  // Buscar por ID o por número de apartamento
  let detalle = aptoId ? jornada.pagos[aptoId] : undefined
  if (!detalle && aptoNumero) {
    detalle = Object.values(jornada.pagos).find(p => p.apartamentoNumero === aptoNumero || p.apartamentoId === aptoId)
  }

  if (detalle && detalle.estado === 'pendiente') {
    return {
      tieneDeuda: true,
      montoUsd: detalle.montoUsd || data.config.costoPorAptoDefectoUsd,
      montoBs: detalle.montoBs || (detalle.montoUsd * data.config.tasaBcv),
      campanaTitulo: jornada.titulo,
      fechaLimite: jornada.fechaLimite,
      detallePago: detalle,
      datosBancarios
    }
  }

  return {
    tieneDeuda: false,
    montoUsd: 0,
    montoBs: 0,
    campanaTitulo: jornada.titulo,
    fechaLimite: jornada.fechaLimite,
    detallePago: detalle,
    datosBancarios
  }
}
