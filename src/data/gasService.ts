import { supabase } from './supabase'
import { appCache } from './cacheService'
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

export interface DeudaAnteriorGas {
  id: string
  apartamentoId: string
  apartamentoNumero: string
  montoBs: number
  montoUsd: number
  moneda: 'BS' | 'USD'
  estado: 'pendiente' | 'pagado'
  nota?: string
  fecha?: string
}

export interface GasServicioData {
  config: TanqueGasConfig
  llenados: LlenadoGas[]
  jornadas: JornadaRecaudacionGas[]
  eventosCalendario: EventoDiarioGas[]
  deudasAnteriores: Record<string, DeudaAnteriorGas> // key: apartamentoId o apartamentoNumero
  updatedAt: string
}

const STORAGE_GAS_KEY = 'condominio_gas_servicio_v3'
const DB_LEGACY_TIPO = 'config_gas_servicio'

// Tipos de fila relacionales en casos_comunidad
const TIPO_GAS_CONFIG = 'gas_config'
const TIPO_GAS_LLENADO = 'gas_llenado'
const TIPO_GAS_JORNADA = 'gas_jornada'
const TIPO_GAS_PAGO = 'gas_pago'
const TIPO_GAS_EVENTO = 'gas_evento'
const TIPO_GAS_DEUDA_ANTERIOR = 'gas_deuda_anterior'

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

/**
 * Genera un UUID estándar v4 compatible con PostgreSQL
 */
export function generarUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function esUUIDValido(str: string): boolean {
  if (!str || typeof str !== 'string') return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str.trim())
}

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
    llenados: [],
    jornadas: [],
    eventosCalendario: [],
    deudasAnteriores: {},
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
    localStorage.removeItem('condominio_gas_servicio_cache')
    localStorage.removeItem('condominio_gas_servicio_v1')
    localStorage.removeItem('condominio_gas_servicio_v2')
    localStorage.removeItem(STORAGE_GAS_KEY)
  } catch (e) {}
}

function matchAptoEnGas(
  p: DetallePagoAptoGas,
  aptoId?: string | null,
  aptoNumero?: string | null
): boolean {
  if (!p) return false
  if (aptoId && (p.apartamentoId === aptoId || p.apartamentoNumero === aptoId)) return true
  const cleanSearch = String(aptoNumero || aptoId || '').trim().toUpperCase().replace(/^APTO\.?\s*/i, '')
  if (cleanSearch) {
    const cleanItemNum = String(p.apartamentoNumero || '').trim().toUpperCase().replace(/^APTO\.?\s*/i, '')
    const cleanItemId = String(p.apartamentoId || '').trim().toUpperCase().replace(/^APTO\.?\s*/i, '')
    if (cleanItemNum === cleanSearch || cleanItemId === cleanSearch) return true
  }
  return false
}

export { matchAptoEnGas }

function sincronizarAptosEnJornadas(
  data: GasServicioData,
  aptos: { id: string; numero: string; propietario_nombre?: string | null }[]
) {
  if (!aptos || aptos.length === 0) return
  data.jornadas.forEach(j => {
    if (j.estado === 'activa') {
      if (!j.pagos) j.pagos = {}
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
 * Obtener todos los datos del servicio de gas sincronizados con Supabase y localStorage.
 * NOTA DE SEGURIDAD CRÍTICA: Esta función es 100% de LECTURA.
 * NUNCA ejecuta UPDATE ni INSERT destructivo si los datos están vacíos o hay un error transitorio.
 */
export async function obtenerGasServicioData(forceRefresh: boolean = false): Promise<{
  data: GasServicioData
  error: string | null
  fromDb: boolean
}> {
  return appCache.fetch(
    'gas_servicio_data_global',
    async () => {
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

        // 3. Consultar todas las filas relacionales de gas en casos_comunidad
        const { data: rows, error } = await supabase
          .from('casos_comunidad')
          .select('*')
          .in('tipo', [
            TIPO_GAS_CONFIG,
            TIPO_GAS_LLENADO,
            TIPO_GAS_JORNADA,
            TIPO_GAS_PAGO,
            TIPO_GAS_EVENTO,
            TIPO_GAS_DEUDA_ANTERIOR,
            DB_LEGACY_TIPO
          ])
          .order('created_at', { ascending: false })

        if (error) {
          console.warn('[gasService] Error leyendo casos_comunidad:', error.message)
          const cached = getLocalGasCache()
          if (cached) {
            cached.config.tasaBcv = tasaBcv
            sincronizarAptosEnJornadas(cached, aptosDb || [])
            return { data: cached, error: null, fromDb: false }
          }
          const limpia = generarDatosSemillaGas(aptosDb || [], tasaBcv)
          return { data: limpia, error: error.message, fromDb: false }
        }

        const safeRows = rows || []

        // Separar por entidad
        const configRow = safeRows.find(r => r.tipo === TIPO_GAS_CONFIG)
        const llenadoRows = safeRows.filter(r => r.tipo === TIPO_GAS_LLENADO)
        const jornadaRows = safeRows.filter(r => r.tipo === TIPO_GAS_JORNADA)
        const pagoRows = safeRows.filter(r => r.tipo === TIPO_GAS_PAGO)
        const eventoRows = safeRows.filter(r => r.tipo === TIPO_GAS_EVENTO)
        const deudaAnteriorRows = safeRows.filter(r => r.tipo === TIPO_GAS_DEUDA_ANTERIOR)
        const legacyRow = safeRows.find(r => r.tipo === DB_LEGACY_TIPO)

        // Soporte de compatibilidad legacy si aún no se han migrado filas individuales
        let legacyData: GasServicioData | null = null
        if (legacyRow?.descripcion) {
          try {
            legacyData = JSON.parse(legacyRow.descripcion) as GasServicioData
          } catch (e) {
            console.warn('[gasService] No se pudo parsear legacyRow:', e)
          }
        }

        // 3.1 Construir Configuración de Gas
        let config: TanqueGasConfig = { ...DEFAULT_GAS_CONFIG, tasaBcv }
        if (configRow?.descripcion) {
          try {
            const parsedConfig = JSON.parse(configRow.descripcion)
            config = {
              ...DEFAULT_GAS_CONFIG,
              ...parsedConfig,
              tasaBcv
            }
          } catch (e) {
            console.warn('[gasService] Error parseando gas_config:', e)
          }
        } else if (legacyData?.config) {
          config = {
            ...DEFAULT_GAS_CONFIG,
            ...legacyData.config,
            tasaBcv
          }
        }

        // 3.2 Construir Llenados
        let llenados: LlenadoGas[] = []
        if (llenadoRows.length > 0) {
          llenados = llenadoRows.map(r => {
            try {
              const parsed = JSON.parse(r.descripcion || '{}')
              return {
                id: r.id,
                fecha: r.fecha || parsed.fecha || new Date().toISOString().split('T')[0],
                porcentajeInicial: Number(parsed.porcentajeInicial ?? 0),
                porcentajeFinal: Number(parsed.porcentajeFinal ?? 0),
                litrosCargados: Number(parsed.litrosCargados ?? 0),
                costoTotalUsd: Number(r.monto_usd ?? parsed.costoTotalUsd ?? 0),
                costoTotalBs: Number(r.monto_bs ?? parsed.costoTotalBs ?? 0),
                tasaBcv: Number(parsed.tasaBcv ?? tasaBcv),
                proveedor: parsed.proveedor || '',
                numeroFacturaGuia: parsed.numeroFacturaGuia || '',
                responsableRecibio: parsed.responsableRecibio || '',
                estado: (r.estado as any) || parsed.estado || 'completado',
                observaciones: parsed.observaciones || ''
              }
            } catch {
              return {
                id: r.id,
                fecha: r.fecha || '',
                porcentajeInicial: 0,
                porcentajeFinal: 0,
                litrosCargados: 0,
                costoTotalUsd: Number(r.monto_usd || 0),
                costoTotalBs: Number(r.monto_bs || 0),
                tasaBcv,
                proveedor: '',
                responsableRecibio: '',
                estado: 'completado'
              }
            }
          })
        } else if (legacyData?.llenados && legacyData.llenados.length > 0) {
          llenados = legacyData.llenados
        }

        // Ordenar llenados por fecha desc
        llenados.sort((a, b) => (b.fecha > a.fecha ? 1 : b.fecha < a.fecha ? -1 : 0))

        // Si hay llenados completados, el nivel actual se sincroniza con el último completado
        const ultimoLlenadoCompletado = llenados.find(l => l.estado === 'completado')
        if (ultimoLlenadoCompletado && config.nivelActualPorcentaje === 0) {
          config.nivelActualPorcentaje = ultimoLlenadoCompletado.porcentajeFinal
        }

        // 3.3 Construir Jornadas
        let jornadas: JornadaRecaudacionGas[] = []
        if (jornadaRows.length > 0) {
          jornadas = jornadaRows.map(r => {
            let meta: any = {}
            try {
              meta = JSON.parse(r.descripcion || '{}')
            } catch {}
            return {
              id: r.id,
              titulo: r.titulo || meta.titulo || 'Recaudación de Gas',
              esEspecial: Boolean(meta.esEspecial),
              mes: meta.mes || (r.fecha ? r.fecha.slice(0, 7) : new Date().toISOString().slice(0, 7)),
              fechaInicio: r.fecha || meta.fechaInicio || new Date().toISOString().slice(0, 10),
              fechaLimite: r.fecha_vencimiento || meta.fechaLimite || '',
              monedaPrincipal: (r.moneda as any) || meta.monedaPrincipal || config.monedaCuota || 'BS',
              costoPorAptoBs: Number(r.monto_bs ?? meta.costoPorAptoBs ?? config.costoPorAptoDefectoBs),
              costoPorAptoUsd: Number(r.monto_usd ?? meta.costoPorAptoUsd ?? config.costoPorAptoDefectoUsd),
              metaTotalBs: Number(meta.metaTotalBs ?? 0),
              metaTotalUsd: Number(meta.metaTotalUsd ?? 0),
              estado: (r.estado as any) || meta.estado || 'activa',
              activa: (r.estado === 'activa') || Boolean(meta.activa),
              pagos: {}
            }
          })
        } else if (legacyData?.jornadas && legacyData.jornadas.length > 0) {
          jornadas = legacyData.jornadas
        }

        // 3.4 Conectar Pagos de Apartamentos a sus respectivas Jornadas
        if (pagoRows.length > 0) {
          pagoRows.forEach(pr => {
            try {
              const detalle = JSON.parse(pr.descripcion || '{}') as DetallePagoAptoGas & { jornadaId?: string }
              const jId = detalle.jornadaId || (jornadas.length > 0 ? jornadas[0].id : null)
              if (!jId) return

              const targetJornada = jornadas.find(j => j.id === jId) || jornadas.find(j => j.estado === 'activa')
              if (!targetJornada) return

              const key = detalle.apartamentoId || detalle.apartamentoNumero || pr.apartamento_id
              if (!key) return

              targetJornada.pagos[key] = {
                apartamentoId: detalle.apartamentoId || pr.apartamento_id || key,
                apartamentoNumero: detalle.apartamentoNumero || pr.titulo?.replace(/^Pago Gas Apto\s*/i, '').split(' ')[0] || '',
                propietario: detalle.propietario,
                estado: (pr.estado as any) || detalle.estado || 'pagado',
                fechaPago: pr.fecha || detalle.fechaPago,
                moneda: (pr.moneda as any) || detalle.moneda || targetJornada.monedaPrincipal,
                montoBs: Number(pr.monto_bs ?? detalle.montoBs ?? targetJornada.costoPorAptoBs),
                montoUsd: Number(pr.monto_usd ?? detalle.montoUsd ?? targetJornada.costoPorAptoUsd),
                metodoPago: detalle.metodoPago,
                referencia: detalle.referencia,
                comprobanteUrl: detalle.comprobanteUrl || pr.comprobante_url || undefined,
                observaciones: detalle.observaciones
              }
            } catch (e) {
              console.warn('[gasService] Error procesando fila gas_pago:', e)
            }
          })
        }

        // Sincronizar todos los apartamentos del edificio en las jornadas activas
        sincronizarAptosEnJornadas({ config, llenados, jornadas, eventosCalendario: [], deudasAnteriores: {}, updatedAt: '' }, aptosDb || [])

        // 3.5 Construir Eventos del Calendario
        let eventosCalendario: EventoDiarioGas[] = []
        if (eventoRows.length > 0) {
          eventosCalendario = eventoRows.map(r => {
            let ev: any = {}
            try {
              ev = JSON.parse(r.descripcion || '{}')
            } catch {}
            return {
              id: r.id,
              fecha: r.fecha || ev.fecha || new Date().toISOString().slice(0, 10),
              tipo: ev.tipo || 'otro',
              titulo: r.titulo || ev.titulo || 'Evento de Gas',
              descripcion: ev.descripcion || '',
              moneda: (r.moneda as any) || ev.moneda || 'BS',
              montoBs: Number(r.monto_bs ?? ev.montoBs ?? 0),
              montoUsd: Number(r.monto_usd ?? ev.montoUsd ?? 0),
              apartamentoRef: ev.apartamentoRef || undefined
            }
          })
        } else if (legacyData?.eventosCalendario && legacyData.eventosCalendario.length > 0) {
          eventosCalendario = legacyData.eventosCalendario
        }

        eventosCalendario.sort((a, b) => (b.fecha > a.fecha ? 1 : b.fecha < a.fecha ? -1 : 0))

        // 3.6 Construir Deudas Anteriores por Apartamento
        const deudasAnteriores: Record<string, DeudaAnteriorGas> = {}
        if (deudaAnteriorRows.length > 0) {
          deudaAnteriorRows.forEach(r => {
            try {
              const parsed = JSON.parse(r.descripcion || '{}')
              const aptoId = parsed.apartamentoId || r.apartamento_id || ''
              const aptoNum = parsed.apartamentoNumero || r.titulo?.replace(/^Deuda Anterior Gas Apto\s*/i, '') || ''
              const item: DeudaAnteriorGas = {
                id: r.id,
                apartamentoId: aptoId,
                apartamentoNumero: aptoNum,
                montoBs: Number(r.monto_bs ?? parsed.montoBs ?? 0),
                montoUsd: Number(r.monto_usd ?? parsed.montoUsd ?? 0),
                moneda: (r.moneda as any) || parsed.moneda || 'BS',
                estado: (r.estado as any) || parsed.estado || 'pendiente',
                nota: parsed.nota || '',
                fecha: r.fecha || parsed.fecha
              }
              const key = item.apartamentoId || item.apartamentoNumero
              if (key) deudasAnteriores[key] = item
            } catch (e) {
              console.warn('[gasService] Error procesando fila gas_deuda_anterior:', e)
            }
          })
        }

        const resultado: GasServicioData = {
          config,
          llenados,
          jornadas,
          eventosCalendario,
          deudasAnteriores,
          updatedAt: new Date().toISOString()
        }

        saveLocalGasCache(resultado)
        return { data: resultado, error: null, fromDb: true }
      } catch (err: any) {
        console.error('[gasService] Error en obtenerGasServicioData:', err)
        const cached = getLocalGasCache()
        if (cached) {
          return { data: cached, error: null, fromDb: false }
        }
        const fallback = generarDatosSemillaGas()
        return { data: fallback, error: err?.message || 'Error cargando datos de gas', fromDb: false }
      }
    },
    { ttlMs: 15 * 1000, tags: ['gas'], forceRefresh }
  )
}

/**
 * Guarda los datos de gas relacionales en Supabase por fila independiente
 */
export async function guardarGasServicioData(
  data: GasServicioData
): Promise<{ success: boolean; error: string | null }> {
  try {
    data.updatedAt = new Date().toISOString()
    saveLocalGasCache(data)
    appCache.invalidate('gas_servicio_data_global')
    appCache.invalidateTags(['gas', 'deudas_gas', 'saldos', 'recibos', 'mora'])

    // 1. Guardar Configuración de Gas (upsert seguro)
    const { data: configRows } = await supabase
      .from('casos_comunidad')
      .select('id')
      .eq('tipo', TIPO_GAS_CONFIG)
      .limit(1)

    const configId = configRows && configRows.length > 0 ? configRows[0].id : generarUUID()
    await supabase.from('casos_comunidad').upsert({
      id: configId,
      tipo: TIPO_GAS_CONFIG,
      titulo: 'Configuración Tanque Gas',
      descripcion: JSON.stringify(data.config),
      monto_usd: data.config.costoPorAptoDefectoUsd || 0,
      monto_bs: data.config.costoPorAptoDefectoBs || 0,
      moneda: data.config.monedaCuota || 'BS',
      estado: 'activo',
      fecha: new Date().toISOString().split('T')[0],
      updated_at: new Date().toISOString()
    })

    // 2. Guardar Llenados
    for (const l of data.llenados) {
      const rowId = esUUIDValido(l.id) ? l.id : generarUUID()
      await supabase.from('casos_comunidad').upsert({
        id: rowId,
        tipo: TIPO_GAS_LLENADO,
        titulo: `Llenado Gas: ${l.litrosCargados.toLocaleString()} L - ${l.proveedor}`,
        descripcion: JSON.stringify(l),
        monto_usd: l.costoTotalUsd || 0,
        monto_bs: l.costoTotalBs || 0,
        moneda: l.costoTotalBs > 0 ? 'BS' : 'USD',
        estado: l.estado,
        fecha: l.fecha,
        updated_at: new Date().toISOString()
      })
    }

    // 3. Guardar Jornadas y sus pagos
    for (const j of data.jornadas) {
      const jRowId = esUUIDValido(j.id) ? j.id : generarUUID()
      const { pagos: _, ...jornadaMeta } = j

      await supabase.from('casos_comunidad').upsert({
        id: jRowId,
        tipo: TIPO_GAS_JORNADA,
        titulo: j.titulo,
        descripcion: JSON.stringify(jornadaMeta),
        monto_usd: j.costoPorAptoUsd || 0,
        monto_bs: j.costoPorAptoBs || 0,
        moneda: j.monedaPrincipal || 'BS',
        estado: j.estado,
        fecha: j.fechaInicio,
        fecha_vencimiento: j.fechaLimite || null,
        updated_at: new Date().toISOString()
      })

      // Guardar pagos confirmados de esta jornada
      if (j.pagos) {
        for (const [key, p] of Object.entries(j.pagos)) {
          if (p.estado === 'pagado') {
            const pagoDetalle = { ...p, jornadaId: j.id }
            // Buscar si ya existe una fila para este pago
            const { data: existingPagos } = await supabase
              .from('casos_comunidad')
              .select('id')
              .eq('tipo', TIPO_GAS_PAGO)
              .ilike('titulo', `%${p.apartamentoNumero || key}%`)
              .limit(1)

            const pagoRowId = existingPagos && existingPagos.length > 0 ? existingPagos[0].id : generarUUID()

            await supabase.from('casos_comunidad').upsert({
              id: pagoRowId,
              tipo: TIPO_GAS_PAGO,
              apartamento_id: esUUIDValido(p.apartamentoId) ? p.apartamentoId : null,
              titulo: `Pago Gas Apto ${p.apartamentoNumero || key} - ${j.id}`,
              descripcion: JSON.stringify(pagoDetalle),
              monto_usd: p.montoUsd || 0,
              monto_bs: p.montoBs || 0,
              moneda: p.moneda || 'BS',
              estado: 'pagado',
              fecha: p.fechaPago || new Date().toISOString().split('T')[0],
              updated_at: new Date().toISOString()
            })
          }
        }
      }
    }

    // 4. Guardar Eventos del Calendario
    for (const ev of data.eventosCalendario) {
      const evRowId = esUUIDValido(ev.id) ? ev.id : generarUUID()
      await supabase.from('casos_comunidad').upsert({
        id: evRowId,
        tipo: TIPO_GAS_EVENTO,
        titulo: ev.titulo,
        descripcion: JSON.stringify(ev),
        monto_usd: ev.montoUsd || 0,
        monto_bs: ev.montoBs || 0,
        moneda: ev.moneda || 'BS',
        estado: 'completado',
        fecha: ev.fecha,
        updated_at: new Date().toISOString()
      })
    }

    // 5. Guardar copia snapshot en legacy (sin bloquear)
    Promise.resolve(
      supabase
        .from('casos_comunidad')
        .update({
          descripcion: JSON.stringify(data),
          updated_at: new Date().toISOString()
        })
        .eq('tipo', DB_LEGACY_TIPO)
    ).catch(() => {})

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('condominio_gas_updated', { detail: data }))
    }

    return { success: true, error: null }
  } catch (err: any) {
    console.error('[gasService] Error en guardarGasServicioData:', err)
    return { success: false, error: err.message }
  }
}

/**
 * Restablece a valores iniciales de fábrica el servicio de gas (SOLO cuando el admin lo solicita explícitamente)
 */
export async function reiniciarDatosGasAFabrica(): Promise<{
  success: boolean
  data: GasServicioData
  error: string | null
}> {
  try {
    limpiarCacheLocalGas()

    const { data: aptosDb } = await supabase
      .from('apartamentos')
      .select('id, numero, propietario_nombre')
      .order('numero')

    const { data: configEdificio } = await supabase
      .from('configuracion_edificio')
      .select('tasa_bcv_actual')
      .limit(1)
      .maybeSingle()

    const tasaBcv = Number(configEdificio?.tasa_bcv_actual || 859.06)
    const limpia = generarDatosSemillaGas(aptosDb || [], tasaBcv)

    // Eliminar todas las filas relacionadas con el servicio de gas
    await supabase
      .from('casos_comunidad')
      .delete()
      .in('tipo', [
        TIPO_GAS_CONFIG,
        TIPO_GAS_LLENADO,
        TIPO_GAS_JORNADA,
        TIPO_GAS_PAGO,
        TIPO_GAS_EVENTO,
        TIPO_GAS_DEUDA_ANTERIOR,
        DB_LEGACY_TIPO
      ])

    // Crear la nueva configuración limpia
    await supabase.from('casos_comunidad').insert({
      id: generarUUID(),
      tipo: TIPO_GAS_CONFIG,
      titulo: 'Configuración Tanque Gas',
      descripcion: JSON.stringify(limpia.config),
      monto_usd: 0,
      monto_bs: 0,
      moneda: 'BS',
      estado: 'activo',
      fecha: new Date().toISOString().split('T')[0]
    })

    saveLocalGasCache(limpia)
    appCache.invalidate('gas_servicio_data_global')
    appCache.invalidateTags(['gas', 'deudas_gas', 'saldos', 'recibos', 'mora'])

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('condominio_gas_updated', { detail: limpia }))
    }

    return { success: true, data: limpia, error: null }
  } catch (err: any) {
    console.error('[gasService] Error reiniciando gas a fábrica:', err)
    return { success: false, data: generarDatosSemillaGas(), error: err.message }
  }
}

/**
 * Actualiza la configuración del tanque y la cuota (en BS o USD) de forma atómica en casos_comunidad
 */
export async function actualizarConfigTanque(
  nuevosValores: Partial<TanqueGasConfig>
): Promise<{ success: boolean; data?: GasServicioData; error?: string | null }> {
  try {
    const { data: actual } = await obtenerGasServicioData(true)
    actual.config = { ...actual.config, ...nuevosValores }

    // Sincronizar cuota por defecto en la jornada activa si corresponde
    const jornada = actual.jornadas.find(j => j.estado === 'activa')
    if (jornada) {
      if (nuevosValores.monedaCuota) jornada.monedaPrincipal = nuevosValores.monedaCuota
      if (nuevosValores.costoPorAptoDefectoBs !== undefined) jornada.costoPorAptoBs = nuevosValores.costoPorAptoDefectoBs
      if (nuevosValores.costoPorAptoDefectoUsd !== undefined) jornada.costoPorAptoUsd = nuevosValores.costoPorAptoDefectoUsd

      Object.values(jornada.pagos).forEach(p => {
        if (p.estado === 'pendiente') {
          p.moneda = jornada.monedaPrincipal
          p.montoBs = jornada.costoPorAptoBs
          p.montoUsd = jornada.costoPorAptoUsd
        }
      })
    }

    // Persistir directamente la fila gas_config
    const { data: existingRows } = await supabase
      .from('casos_comunidad')
      .select('id')
      .eq('tipo', TIPO_GAS_CONFIG)
      .limit(1)

    const configId = existingRows && existingRows.length > 0 ? existingRows[0].id : generarUUID()

    await supabase.from('casos_comunidad').upsert({
      id: configId,
      tipo: TIPO_GAS_CONFIG,
      titulo: 'Configuración Tanque Gas',
      descripcion: JSON.stringify(actual.config),
      monto_usd: actual.config.costoPorAptoDefectoUsd || 0,
      monto_bs: actual.config.costoPorAptoDefectoBs || 0,
      moneda: actual.config.monedaCuota || 'BS',
      estado: 'activo',
      fecha: new Date().toISOString().split('T')[0],
      updated_at: new Date().toISOString()
    })

    // Si había jornada activa, actualizar su fila
    if (jornada) {
      const { pagos: _, ...jMeta } = jornada
      await supabase.from('casos_comunidad').upsert({
        id: jornada.id,
        tipo: TIPO_GAS_JORNADA,
        titulo: jornada.titulo,
        descripcion: JSON.stringify(jMeta),
        monto_usd: jornada.costoPorAptoUsd || 0,
        monto_bs: jornada.costoPorAptoBs || 0,
        moneda: jornada.monedaPrincipal || 'BS',
        estado: jornada.estado,
        fecha: jornada.fechaInicio,
        updated_at: new Date().toISOString()
      })
    }

    saveLocalGasCache(actual)
    appCache.invalidate('gas_servicio_data_global')
    appCache.invalidateTags(['gas', 'deudas_gas', 'saldos', 'recibos', 'mora'])

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('condominio_gas_updated', { detail: actual }))
    }

    return { success: true, data: actual, error: null }
  } catch (err: any) {
    console.error('[gasService] Error actualizando config del tanque:', err)
    return { success: false, error: err.message }
  }
}

/**
 * Registra un nuevo llenado de gas de manera atómica por fila independiente
 */
export async function registrarLlenado(
  llenado: Omit<LlenadoGas, 'id'> & { id?: string }
): Promise<{ success: boolean; data?: GasServicioData; error?: string | null }> {
  try {
    const llenadoId = llenado.id && esUUIDValido(llenado.id) ? llenado.id : generarUUID()
    const nuevoLlenado: LlenadoGas = {
      ...llenado,
      id: llenadoId
    }

    // 1. Guardar la fila individual del llenado
    const { error: errLlenado } = await supabase.from('casos_comunidad').upsert({
      id: llenadoId,
      tipo: TIPO_GAS_LLENADO,
      titulo: `Llenado Gas: ${nuevoLlenado.litrosCargados.toLocaleString()} L`,
      descripcion: JSON.stringify(nuevoLlenado),
      monto_usd: nuevoLlenado.costoTotalUsd || 0,
      monto_bs: nuevoLlenado.costoTotalBs || 0,
      moneda: nuevoLlenado.costoTotalBs > 0 ? 'BS' : 'USD',
      estado: nuevoLlenado.estado,
      fecha: nuevoLlenado.fecha,
      updated_at: new Date().toISOString()
    })

    if (errLlenado) {
      console.error('[gasService] Error guardando llenado:', errLlenado)
      return { success: false, error: errLlenado.message }
    }

    // 2. Si es completado, actualizar el porcentaje actual del tanque en gas_config
    if (nuevoLlenado.estado === 'completado') {
      await actualizarConfigTanque({ nivelActualPorcentaje: nuevoLlenado.porcentajeFinal })
    }

    // 3. Registrar el evento en el calendario de gas
    const eventoId = generarUUID()
    const eventoLlenado: EventoDiarioGas = {
      id: eventoId,
      fecha: nuevoLlenado.fecha,
      tipo: 'llenado',
      titulo: `Llenado Gas: ${nuevoLlenado.litrosCargados.toLocaleString()} L`,
      descripcion: `Proveedor: ${nuevoLlenado.proveedor}. Costo: ${nuevoLlenado.costoTotalBs ? `Bs. ${nuevoLlenado.costoTotalBs.toLocaleString('es-VE')}` : `$${nuevoLlenado.costoTotalUsd.toFixed(2)} USD`}. Responsable: ${nuevoLlenado.responsableRecibio}`,
      moneda: 'BS',
      montoBs: nuevoLlenado.costoTotalBs,
      montoUsd: nuevoLlenado.costoTotalUsd
    }

    await supabase.from('casos_comunidad').insert({
      id: eventoId,
      tipo: TIPO_GAS_EVENTO,
      titulo: eventoLlenado.titulo,
      descripcion: JSON.stringify({ ...eventoLlenado, llenadoRefId: llenadoId }),
      monto_usd: eventoLlenado.montoUsd || 0,
      monto_bs: eventoLlenado.montoBs || 0,
      moneda: 'BS',
      estado: 'completado',
      fecha: eventoLlenado.fecha
    })

    // 4. Recargar datos frescos
    const { data: frescos } = await obtenerGasServicioData(true)
    return { success: true, data: frescos, error: null }
  } catch (err: any) {
    console.error('[gasService] Error registrando llenado:', err)
    return { success: false, error: err.message }
  }
}

/**
 * Elimina un registro de llenado de forma atómica
 */
export async function eliminarLlenado(
  llenadoId: string
): Promise<{ success: boolean; data?: GasServicioData; error?: string | null }> {
  try {
    // 1. Eliminar la fila del llenado
    await supabase
      .from('casos_comunidad')
      .delete()
      .eq('id', llenadoId)

    // 2. Eliminar eventos de calendario relacionados
    await supabase
      .from('casos_comunidad')
      .delete()
      .eq('tipo', TIPO_GAS_EVENTO)
      .ilike('descripcion', `%"llenadoRefId":"${llenadoId}"%`)

    const { data: frescos } = await obtenerGasServicioData(true)
    return { success: true, data: frescos, error: null }
  } catch (err: any) {
    console.error('[gasService] Error eliminando llenado:', err)
    return { success: false, error: err.message }
  }
}

/**
 * Concilia o revierte el pago de un apartamento de forma atómica por fila individual
 */
export async function togglePagoApartamento(
  jornadaId: string,
  aptoKey: string,
  datosPagoActualizados: Partial<DetallePagoAptoGas>
): Promise<{ success: boolean; data?: GasServicioData; error?: string | null }> {
  try {
    const { data: actual } = await obtenerGasServicioData(true)
    const jornada = actual.jornadas.find(j => j.id === jornadaId) || actual.jornadas.find(j => j.estado === 'activa')
    if (!jornada) return { success: false, error: 'Jornada no encontrada' }

    let pagoActual = jornada.pagos[aptoKey]
    if (!pagoActual) {
      pagoActual = Object.values(jornada.pagos).find(p => matchAptoEnGas(p, aptoKey)) || {
        apartamentoId: aptoKey,
        apartamentoNumero: datosPagoActualizados.apartamentoNumero || aptoKey,
        estado: 'pendiente',
        montoBs: jornada.costoPorAptoBs,
        montoUsd: jornada.costoPorAptoUsd
      }
    }

    const detalleCompleto: DetallePagoAptoGas & { jornadaId: string } = {
      ...pagoActual,
      ...datosPagoActualizados,
      jornadaId: jornada.id,
      apartamentoId: pagoActual.apartamentoId || aptoKey,
      apartamentoNumero: datosPagoActualizados.apartamentoNumero || pagoActual.apartamentoNumero || aptoKey
    }

    // Buscar si ya existe una fila de gas_pago para este apto y jornada
    const { data: existingRows } = await supabase
      .from('casos_comunidad')
      .select('id')
      .eq('tipo', TIPO_GAS_PAGO)
      .ilike('titulo', `%${detalleCompleto.apartamentoNumero}%`)
      .limit(1)

    const pagoRowId = existingRows && existingRows.length > 0 ? existingRows[0].id : generarUUID()

    if (datosPagoActualizados.estado === 'pagado') {
      const fechaPago = datosPagoActualizados.fechaPago || new Date().toISOString().split('T')[0]
      detalleCompleto.fechaPago = fechaPago
      detalleCompleto.estado = 'pagado'

      await supabase.from('casos_comunidad').upsert({
        id: pagoRowId,
        tipo: TIPO_GAS_PAGO,
        apartamento_id: esUUIDValido(detalleCompleto.apartamentoId) ? detalleCompleto.apartamentoId : null,
        titulo: `Pago Gas Apto ${detalleCompleto.apartamentoNumero} - ${jornada.id}`,
        descripcion: JSON.stringify(detalleCompleto),
        monto_usd: detalleCompleto.montoUsd || 0,
        monto_bs: detalleCompleto.montoBs || 0,
        moneda: detalleCompleto.moneda || 'BS',
        estado: 'pagado',
        fecha: fechaPago,
        updated_at: new Date().toISOString()
      })

      // Registrar evento en el calendario de recaudación
      const evPagoId = generarUUID()
      const moneda = detalleCompleto.moneda || 'BS'
      const textoMonto = moneda === 'BS'
        ? `Bs. ${(detalleCompleto.montoBs || 0).toLocaleString('es-VE')}`
        : `$${(detalleCompleto.montoUsd || 0).toFixed(2)} USD`

      await supabase.from('casos_comunidad').insert({
        id: evPagoId,
        tipo: TIPO_GAS_EVENTO,
        titulo: `Recaudación Apto ${detalleCompleto.apartamentoNumero}`,
        descripcion: JSON.stringify({
          id: evPagoId,
          jornadaId: jornada.id,
          aptoKey,
          fecha: fechaPago,
          tipo: 'recaudacion',
          titulo: `Recaudación Apto ${detalleCompleto.apartamentoNumero}`,
          descripcion: `Pago de gas ${textoMonto} (${detalleCompleto.metodoPago || 'Pago Móvil'} Ref: ${detalleCompleto.referencia || 'N/A'})`,
          moneda,
          montoBs: detalleCompleto.montoBs,
          montoUsd: detalleCompleto.montoUsd,
          apartamentoRef: detalleCompleto.apartamentoNumero
        }),
        monto_usd: detalleCompleto.montoUsd || 0,
        monto_bs: detalleCompleto.montoBs || 0,
        moneda: moneda,
        estado: 'completado',
        fecha: fechaPago
      })
    } else {
      // Revertir a pendiente
      detalleCompleto.estado = 'pendiente'
      detalleCompleto.fechaPago = undefined
      detalleCompleto.referencia = undefined

      if (existingRows && existingRows.length > 0) {
        await supabase
          .from('casos_comunidad')
          .delete()
          .eq('id', pagoRowId)
      }

      // Eliminar el evento de calendario
      await supabase
        .from('casos_comunidad')
        .delete()
        .eq('tipo', TIPO_GAS_EVENTO)
        .ilike('descripcion', `%"aptoKey":"${aptoKey}"%`)
    }

    const { data: frescos } = await obtenerGasServicioData(true)
    return { success: true, data: frescos, error: null }
  } catch (err: any) {
    console.error('[gasService] Error en togglePagoApartamento:', err)
    return { success: false, error: err.message }
  }
}

/**
 * Agrega o modifica un evento diario del calendario de manera atómica
 */
export async function guardarEventoCalendario(
  evento: Omit<EventoDiarioGas, 'id'> & { id?: string }
): Promise<{ success: boolean; data?: GasServicioData; error?: string | null }> {
  try {
    const eventoId = evento.id && esUUIDValido(evento.id) ? evento.id : generarUUID()
    const nuevoEvento: EventoDiarioGas = { ...evento, id: eventoId }

    await supabase.from('casos_comunidad').upsert({
      id: eventoId,
      tipo: TIPO_GAS_EVENTO,
      titulo: nuevoEvento.titulo,
      descripcion: JSON.stringify(nuevoEvento),
      monto_usd: nuevoEvento.montoUsd || 0,
      monto_bs: nuevoEvento.montoBs || 0,
      moneda: nuevoEvento.moneda || 'BS',
      estado: 'completado',
      fecha: nuevoEvento.fecha,
      updated_at: new Date().toISOString()
    })

    const { data: frescos } = await obtenerGasServicioData(true)
    return { success: true, data: frescos, error: null }
  } catch (err: any) {
    console.error('[gasService] Error en guardarEventoCalendario:', err)
    return { success: false, error: err.message }
  }
}

/**
 * Elimina un evento del calendario
 */
export async function eliminarEventoCalendario(
  eventoId: string
): Promise<{ success: boolean; data?: GasServicioData; error?: string | null }> {
  try {
    await supabase.from('casos_comunidad').delete().eq('id', eventoId)
    const { data: frescos } = await obtenerGasServicioData(true)
    return { success: true, data: frescos, error: null }
  } catch (err: any) {
    console.error('[gasService] Error en eliminarEventoCalendario:', err)
    return { success: false, error: err.message }
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
 * de forma atómica en casos_comunidad y opcionalmente notificar por correo.
 */
export async function crearOActualizarCuotaGas(
  params: ParametrosCuotaGas
): Promise<{ success: boolean; data?: GasServicioData; error?: string | null; correosEnviados?: number; emailsEnviados?: number }> {
  try {
    const { data: actual } = await obtenerGasServicioData(true)
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

    // Actualizar configuración base
    actual.config.tasaBcv = tasa
    actual.config.monedaCuota = moneda
    actual.config.costoPorAptoDefectoBs = costoBs
    actual.config.costoPorAptoDefectoUsd = costoUsd
    if (params.datosPago) {
      actual.config.datosPago = { ...actual.config.datosPago, ...params.datosPago }
    }

    // Consultar todos los apartamentos
    const { data: aptosDb } = await supabase
      .from('apartamentos')
      .select('id, numero, propietario_nombre, propietario_email')
      .order('numero')

    const aptos = aptosDb || []
    const mesActual = new Date().toISOString().slice(0, 7)

    // Buscar si ya hay jornada activa o crear una nueva con UUID
    const { data: jornadaRows } = await supabase
      .from('casos_comunidad')
      .select('id, descripcion')
      .eq('tipo', TIPO_GAS_JORNADA)
      .eq('estado', 'activa')
      .limit(1)

    const jornadaId = jornadaRows && jornadaRows.length > 0 ? jornadaRows[0].id : generarUUID()

    const metaJornada = {
      id: jornadaId,
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
      activa: true
    }

    // Guardar fila gas_jornada
    await supabase.from('casos_comunidad').upsert({
      id: jornadaId,
      tipo: TIPO_GAS_JORNADA,
      titulo: metaJornada.titulo,
      descripcion: JSON.stringify(metaJornada),
      monto_usd: costoUsd,
      monto_bs: costoBs,
      moneda: moneda,
      estado: 'activa',
      fecha: metaJornada.fechaInicio,
      fecha_vencimiento: metaJornada.fechaLimite || null,
      updated_at: new Date().toISOString()
    })

    // Guardar fila gas_config
    const { data: cfgRows } = await supabase
      .from('casos_comunidad')
      .select('id')
      .eq('tipo', TIPO_GAS_CONFIG)
      .limit(1)

    const configRowId = cfgRows && cfgRows.length > 0 ? cfgRows[0].id : generarUUID()
    await supabase.from('casos_comunidad').upsert({
      id: configRowId,
      tipo: TIPO_GAS_CONFIG,
      titulo: 'Configuración Tanque Gas',
      descripcion: JSON.stringify(actual.config),
      monto_usd: costoUsd,
      monto_bs: costoBs,
      moneda: moneda,
      estado: 'activo',
      fecha: new Date().toISOString().split('T')[0],
      updated_at: new Date().toISOString()
    })

    let correosEnviados = 0
    const debeEnviarEmail = params.enviarEmail !== undefined ? params.enviarEmail : !!params.notificarEmail

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

    const { data: frescos } = await obtenerGasServicioData(true)
    return {
      success: true,
      data: frescos,
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
 * Permite al residente reportar el pago de su cuota de gas de forma atómica por fila individual
 */
export async function reportarPagoGasResidente(
  params: ParametrosReportarPagoGas
): Promise<{ success: boolean; data?: GasServicioData; error?: string | null }> {
  try {
    const { data: actual } = await obtenerGasServicioData(true)
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
    } else {
      if (montoBs === 0 && montoUsd === 0) {
        montoBs = jornada.costoPorAptoBs
        montoUsd = jornada.costoPorAptoUsd
      }
    }

    const fechaPago = params.fechaPago || new Date().toISOString().slice(0, 10)
    const detallePago: DetallePagoAptoGas & { jornadaId: string } = {
      jornadaId: jornada.id,
      apartamentoId: params.apartamentoId || `apto-${params.apartamentoNumero}`,
      apartamentoNumero: params.apartamentoNumero,
      estado: 'pagado',
      fechaPago,
      moneda: (params.moneda || jornada.monedaPrincipal || 'BS') as any,
      montoBs,
      montoUsd,
      metodoPago: (params.metodoPago as any) || 'pago_movil',
      referencia: params.referencia.trim(),
      observaciones: params.observaciones?.trim() || 'Pago reportado por el residente en su portal'
    }

    // Buscar si ya existe la fila en casos_comunidad
    const { data: existingRows } = await supabase
      .from('casos_comunidad')
      .select('id')
      .eq('tipo', TIPO_GAS_PAGO)
      .ilike('titulo', `%${params.apartamentoNumero}%`)
      .limit(1)

    const pagoRowId = existingRows && existingRows.length > 0 ? existingRows[0].id : generarUUID()

    await supabase.from('casos_comunidad').upsert({
      id: pagoRowId,
      tipo: TIPO_GAS_PAGO,
      apartamento_id: esUUIDValido(detallePago.apartamentoId) ? detallePago.apartamentoId : null,
      titulo: `Pago Gas Apto ${params.apartamentoNumero} - ${jornada.id}`,
      descripcion: JSON.stringify(detallePago),
      monto_usd: montoUsd,
      monto_bs: montoBs,
      moneda: detallePago.moneda,
      estado: 'pagado',
      fecha: fechaPago,
      updated_at: new Date().toISOString()
    })

    // Registrar evento en calendario
    const evPagoId = generarUUID()
    await supabase.from('casos_comunidad').insert({
      id: evPagoId,
      tipo: TIPO_GAS_EVENTO,
      titulo: `Pago Gas Apto ${params.apartamentoNumero}`,
      descripcion: JSON.stringify({
        id: evPagoId,
        fecha: fechaPago,
        tipo: 'recaudacion',
        titulo: `Pago Gas Apto ${params.apartamentoNumero}`,
        descripcion: `Reportado: ${detallePago.referencia} · ${params.metodoPago}`,
        montoBs,
        montoUsd,
        apartamentoRef: params.apartamentoNumero
      }),
      monto_usd: montoUsd,
      monto_bs: montoBs,
      moneda: detallePago.moneda,
      estado: 'completado',
      fecha: fechaPago
    })

    const { data: frescos } = await obtenerGasServicioData(true)
    return { success: true, data: frescos, error: null }
  } catch (err: any) {
    console.error('[gasService] Error en reportarPagoGasResidente:', err)
    return { success: false, error: err.message }
  }
}

/**
 * Guarda o actualiza la deuda anterior histórica de gas para un apartamento
 */
export async function guardarDeudaAnteriorGas(params: {
  apartamentoId: string
  apartamentoNumero: string
  monto: number
  moneda: 'BS' | 'USD'
  nota?: string
  estado?: 'pendiente' | 'pagado'
  tasaBcv?: number
}): Promise<{ success: boolean; data?: GasServicioData; error?: string | null }> {
  try {
    const { data: actual } = await obtenerGasServicioData(true)
    const tasa = params.tasaBcv || actual.config.tasaBcv || 859.06
    const moneda = params.moneda || 'BS'
    const monto = params.monto || 0
    const montoBs = moneda === 'BS' ? monto : Number((monto * tasa).toFixed(2))
    const montoUsd = moneda === 'USD' ? monto : (tasa > 0 ? Number((monto / tasa).toFixed(2)) : 0)

    const cleanNum = String(params.apartamentoNumero || '').trim().replace(/^APTO\.?\s*/i, '')

    // Buscar si ya existe la fila en casos_comunidad
    const { data: existingRows } = await supabase
      .from('casos_comunidad')
      .select('id')
      .eq('tipo', TIPO_GAS_DEUDA_ANTERIOR)
      .ilike('titulo', `%${cleanNum}%`)
      .limit(1)

    const rowId = existingRows && existingRows.length > 0 ? existingRows[0].id : generarUUID()

    const item: DeudaAnteriorGas = {
      id: rowId,
      apartamentoId: params.apartamentoId,
      apartamentoNumero: cleanNum,
      montoBs,
      montoUsd,
      moneda,
      estado: params.estado || (monto > 0 ? 'pendiente' : 'pagado'),
      nota: params.nota?.trim() || 'Deuda Anterior de Gas',
      fecha: new Date().toISOString().split('T')[0]
    }

    await supabase.from('casos_comunidad').upsert({
      id: rowId,
      tipo: TIPO_GAS_DEUDA_ANTERIOR,
      apartamento_id: esUUIDValido(params.apartamentoId) ? params.apartamentoId : null,
      titulo: `Deuda Anterior Gas Apto ${cleanNum}`,
      descripcion: JSON.stringify(item),
      monto_usd: montoUsd,
      monto_bs: montoBs,
      moneda: moneda,
      estado: item.estado,
      fecha: item.fecha,
      updated_at: new Date().toISOString()
    })

    appCache.invalidate('gas_servicio_data_global')
    appCache.invalidateTags(['gas', 'deudas_gas', 'saldos', 'recibos', 'mora'])

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('condominio_gas_updated'))
    }

    const { data: frescos } = await obtenerGasServicioData(true)
    return { success: true, data: frescos, error: null }
  } catch (err: any) {
    console.error('[gasService] Error guardando deuda anterior gas:', err)
    return { success: false, error: err.message }
  }
}

/**
 * Elimina la deuda anterior histórica de gas para un apartamento
 */
export async function eliminarDeudaAnteriorGas(
  apartamentoKey: string
): Promise<{ success: boolean; data?: GasServicioData; error?: string | null }> {
  try {
    const cleanKey = String(apartamentoKey || '').replace(/^APTO\.?\s*/i, '').trim()
    await supabase
      .from('casos_comunidad')
      .delete()
      .eq('tipo', TIPO_GAS_DEUDA_ANTERIOR)
      .ilike('titulo', `%${cleanKey}%`)

    appCache.invalidate('gas_servicio_data_global')
    appCache.invalidateTags(['gas', 'deudas_gas', 'saldos', 'recibos', 'mora'])

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('condominio_gas_updated'))
    }

    const { data: frescos } = await obtenerGasServicioData(true)
    return { success: true, data: frescos, error: null }
  } catch (err: any) {
    console.error('[gasService] Error eliminando deuda anterior gas:', err)
    return { success: false, error: err.message }
  }
}

/**
 * Guarda o modifica la cuota/deuda de gas de un mes específico para un apartamento en el Calendario de Deudas
 */
export async function guardarDeudaMesGas(params: {
  mesKey: string // YYYY-MM
  mesLabel?: string
  apartamentoId: string
  apartamentoNumero: string
  propietario?: string
  monto: number
  moneda: 'BS' | 'USD'
  estado: 'pendiente' | 'pagado'
  referencia?: string
  metodo?: string
  fechaPago?: string
  nota?: string
  tasaBcv?: number
}): Promise<{ success: boolean; data?: GasServicioData; error?: string | null }> {
  try {
    const { data: actual } = await obtenerGasServicioData(true)
    const tasa = params.tasaBcv || actual.config.tasaBcv || 859.06
    const moneda = params.moneda || 'BS'
    const monto = params.monto || 0
    const montoBs = moneda === 'BS' ? monto : Number((monto * tasa).toFixed(2))
    const montoUsd = moneda === 'USD' ? monto : (tasa > 0 ? Number((monto / tasa).toFixed(2)) : 0)
    const cleanNum = String(params.apartamentoNumero || '').trim().replace(/^APTO\.?\s*/i, '')

    // 1. Buscar o crear la jornada correspondiente a este mes
    let jornada = actual.jornadas.find(j => j.mes === params.mesKey)
    let jornadaId: string

    if (!jornada) {
      jornadaId = generarUUID()
      const titulo = params.mesLabel || `Cuota Gas ${params.mesKey}`
      await supabase.from('casos_comunidad').insert({
        id: jornadaId,
        tipo: TIPO_GAS_JORNADA,
        titulo,
        descripcion: JSON.stringify({
          id: jornadaId,
          titulo,
          mes: params.mesKey,
          fechaInicio: `${params.mesKey}-01`,
          monedaPrincipal: moneda,
          costoPorAptoBs: montoBs,
          costoPorAptoUsd: montoUsd,
          metaTotalBs: montoBs * 62,
          metaTotalUsd: montoUsd * 62,
          estado: 'activa',
          activa: true
        }),
        monto_usd: montoUsd,
        monto_bs: montoBs,
        moneda,
        estado: 'activa',
        fecha: `${params.mesKey}-01`
      })
    } else {
      jornadaId = jornada.id
    }

    // 2. Buscar o crear la fila individual de gas_pago
    const { data: existingPagos } = await supabase
      .from('casos_comunidad')
      .select('id')
      .eq('tipo', TIPO_GAS_PAGO)
      .ilike('titulo', `%${cleanNum}%`)
      .ilike('titulo', `%${jornadaId}%`)
      .limit(1)

    const pagoRowId = existingPagos && existingPagos.length > 0 ? existingPagos[0].id : generarUUID()

    const pagoDetalle: DetallePagoAptoGas & { jornadaId: string } = {
      jornadaId,
      apartamentoId: params.apartamentoId,
      apartamentoNumero: cleanNum,
      propietario: params.propietario,
      estado: params.estado,
      fechaPago: params.estado === 'pagado' ? (params.fechaPago || new Date().toISOString().split('T')[0]) : undefined,
      moneda,
      montoBs,
      montoUsd,
      metodoPago: params.metodo as any,
      referencia: params.referencia,
      observaciones: params.nota
    }

    await supabase.from('casos_comunidad').upsert({
      id: pagoRowId,
      tipo: TIPO_GAS_PAGO,
      apartamento_id: esUUIDValido(params.apartamentoId) ? params.apartamentoId : null,
      titulo: `Pago Gas Apto ${cleanNum} - ${jornadaId}`,
      descripcion: JSON.stringify(pagoDetalle),
      monto_usd: montoUsd,
      monto_bs: montoBs,
      moneda,
      estado: params.estado,
      fecha: pagoDetalle.fechaPago || `${params.mesKey}-01`,
      updated_at: new Date().toISOString()
    })

    appCache.invalidate('gas_servicio_data_global')
    appCache.invalidateTags(['gas', 'deudas_gas', 'saldos', 'recibos', 'mora'])

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('condominio_gas_updated'))
    }

    const { data: frescos } = await obtenerGasServicioData(true)
    return { success: true, data: frescos, error: null }
  } catch (err: any) {
    console.error('[gasService] Error en guardarDeudaMesGas:', err)
    return { success: false, error: err.message }
  }
}

/**
 * Elimina la deuda de un mes específico para un apartamento
 */
export async function eliminarDeudaMesGas(
  mesKey: string,
  apartamentoKey: string
): Promise<{ success: boolean; data?: GasServicioData; error?: string | null }> {
  try {
    const { data: actual } = await obtenerGasServicioData(true)
    const cleanKey = String(apartamentoKey || '').replace(/^APTO\.?\s*/i, '').trim()
    const jornada = actual.jornadas.find(j => j.mes === mesKey)

    if (jornada) {
      await supabase
        .from('casos_comunidad')
        .delete()
        .eq('tipo', TIPO_GAS_PAGO)
        .ilike('titulo', `%${cleanKey}%`)
        .ilike('titulo', `%${jornada.id}%`)
    }

    appCache.invalidate('gas_servicio_data_global')
    appCache.invalidateTags(['gas', 'deudas_gas', 'saldos', 'recibos', 'mora'])

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('condominio_gas_updated'))
    }

    const { data: frescos } = await obtenerGasServicioData(true)
    return { success: true, data: frescos, error: null }
  } catch (err: any) {
    console.error('[gasService] Error en eliminarDeudaMesGas:', err)
    return { success: false, error: err.message }
  }
}

/**
 * Elimina todas las deudas de gas (anteriores y mensuales pendientes) de un apartamento
 */
export async function eliminarTodasLasDeudasGasApartamento(
  apartamentoKey: string
): Promise<{ success: boolean; data?: GasServicioData; error?: string | null }> {
  try {
    const cleanKey = String(apartamentoKey || '').replace(/^APTO\.?\s*/i, '').trim()

    // 1. Eliminar deuda anterior
    await supabase
      .from('casos_comunidad')
      .delete()
      .eq('tipo', TIPO_GAS_DEUDA_ANTERIOR)
      .ilike('titulo', `%${cleanKey}%`)

    // 2. Eliminar cuotas pendientes de gas_pago
    await supabase
      .from('casos_comunidad')
      .delete()
      .eq('tipo', TIPO_GAS_PAGO)
      .ilike('titulo', `%${cleanKey}%`)

    appCache.invalidate('gas_servicio_data_global')
    appCache.invalidateTags(['gas', 'deudas_gas', 'saldos', 'recibos', 'mora'])

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('condominio_gas_updated'))
    }

    const { data: frescos } = await obtenerGasServicioData(true)
    return { success: true, data: frescos, error: null }
  } catch (err: any) {
    console.error('[gasService] Error en eliminarTodasLasDeudasGasApartamento:', err)
    return { success: false, error: err.message }
  }
}

/**
 * Calcula las métricas del micro dashboard de gas
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

export interface ItemDeudaGasDetallada {
  campanaId: string
  titulo: string
  esEspecial: boolean
  mes: string
  fechaLimite?: string
  monedaPrincipal: 'BS' | 'USD'
  montoBs: number
  montoUsd: number
  montoPrincipal: number
  estado: 'pendiente' | 'pagado'
  detallePago?: DetallePagoAptoGas
}

export interface HistorialCuotaGasApartamento {
  jornadaId: string
  titulo: string
  esEspecial: boolean
  mes: string
  fechaLimite?: string
  moneda: 'BS' | 'USD'
  montoBs: number
  montoUsd: number
  monto: number
  estado: 'pagado' | 'pendiente'
  fechaPago?: string
  metodoPago?: string
  referencia?: string
  observaciones?: string
  comprobanteUrl?: string
}

/**
 * Consulta todas las cuotas de gas (históricas y actuales) del apartamento para el Calendario de Pago de Gas
 */
export function obtenerHistorialCuotasGasApartamento(
  data: GasServicioData,
  aptoId?: string | null,
  aptoNumero?: string | null
): HistorialCuotaGasApartamento[] {
  if (!data?.jornadas || (!aptoId && !aptoNumero)) return []
  const res: HistorialCuotaGasApartamento[] = []

  // 1. Deuda anterior histórica si existe
  if (data?.deudasAnteriores) {
    const da = Object.values(data.deudasAnteriores).find(d => matchAptoEnGas(d as any, aptoId, aptoNumero))
    if (da && (da.montoBs > 0 || da.montoUsd > 0)) {
      res.push({
        jornadaId: 'deuda-anterior-gas',
        titulo: da.nota || 'Deuda Anterior de Gas',
        esEspecial: false,
        mes: 'Anterior',
        fechaLimite: undefined,
        moneda: da.moneda,
        montoBs: Number(da.montoBs.toFixed(2)),
        montoUsd: Number(da.montoUsd.toFixed(2)),
        monto: Number((da.moneda === 'BS' ? da.montoBs : da.montoUsd).toFixed(2)),
        estado: da.estado,
        fechaPago: da.fecha
      })
    }
  }

  for (const j of data.jornadas) {
    let detalle: DetallePagoAptoGas | undefined
    if (aptoId && j.pagos[aptoId]) detalle = j.pagos[aptoId]
    if (!detalle && aptoNumero && j.pagos[aptoNumero]) detalle = j.pagos[aptoNumero]
    if (!detalle) detalle = Object.values(j.pagos || {}).find(p => matchAptoEnGas(p, aptoId, aptoNumero))

    const montoBs = detalle?.montoBs !== undefined ? detalle.montoBs : j.costoPorAptoBs
    const montoUsd = detalle?.montoUsd !== undefined ? detalle.montoUsd : j.costoPorAptoUsd
    const moneda = j.monedaPrincipal || data.config.monedaCuota || 'BS'
    const monto = moneda === 'BS' ? montoBs : montoUsd
    const estado = detalle?.estado || 'pendiente'

    res.push({
      jornadaId: j.id,
      titulo: j.titulo,
      esEspecial: !!j.esEspecial,
      mes: j.mes,
      fechaLimite: j.fechaLimite,
      moneda,
      montoBs: Number((montoBs || 0).toFixed(2)),
      montoUsd: Number((montoUsd || 0).toFixed(2)),
      monto: Number((monto || 0).toFixed(2)),
      estado,
      fechaPago: detalle?.fechaPago,
      metodoPago: detalle?.metodoPago,
      referencia: detalle?.referencia,
      observaciones: detalle?.observaciones,
      comprobanteUrl: detalle?.comprobanteUrl
    })
  }

  return res
}

/**
 * Consulta todas las deudas de gas pendientes acumuladas del apartamento
 */
export function obtenerTodasLasDeudasGasApartamento(
  data: GasServicioData,
  aptoId?: string | null,
  aptoNumero?: string | null
): {
  tieneDeuda: boolean
  totalBs: number
  totalUsd: number
  cuotasPendientes: ItemDeudaGasDetallada[]
  cuotaActiva?: ItemDeudaGasDetallada
  datosBancarios: DatosPagoGas
} {
  const datosBancarios = data.config.datosPago
  if (!data?.jornadas || (!aptoId && !aptoNumero)) {
    return {
      tieneDeuda: false,
      totalBs: 0,
      totalUsd: 0,
      cuotasPendientes: [],
      datosBancarios
    }
  }

  const cuotasPendientes: ItemDeudaGasDetallada[] = []
  let totalBs = 0
  let totalUsd = 0

  // 1. Deuda anterior acumulada si está pendiente
  if (data?.deudasAnteriores) {
    const da = Object.values(data.deudasAnteriores).find(d => matchAptoEnGas(d as any, aptoId, aptoNumero))
    if (da && da.estado === 'pendiente' && (da.montoBs > 0 || da.montoUsd > 0)) {
      totalBs += da.montoBs
      totalUsd += da.montoUsd
      cuotasPendientes.push({
        campanaId: 'deuda-anterior-gas',
        titulo: da.nota || 'Deuda Anterior de Gas',
        esEspecial: false,
        mes: 'Anterior',
        fechaLimite: undefined,
        monedaPrincipal: da.moneda,
        montoBs: da.montoBs,
        montoUsd: da.montoUsd,
        montoPrincipal: da.moneda === 'BS' ? da.montoBs : da.montoUsd,
        estado: 'pendiente'
      })
    }
  }

  for (const j of data.jornadas) {
    let detalle: DetallePagoAptoGas | undefined
    if (aptoId && j.pagos[aptoId]) detalle = j.pagos[aptoId]
    if (!detalle && aptoNumero && j.pagos[aptoNumero]) detalle = j.pagos[aptoNumero]
    if (!detalle) detalle = Object.values(j.pagos || {}).find(p => matchAptoEnGas(p, aptoId, aptoNumero))

    const montoBs = detalle?.montoBs !== undefined ? detalle.montoBs : j.costoPorAptoBs
    const montoUsd = detalle?.montoUsd !== undefined ? detalle.montoUsd : j.costoPorAptoUsd
    const moneda = j.monedaPrincipal || data.config.monedaCuota || 'BS'
    const montoPrincipal = moneda === 'BS' ? montoBs : montoUsd
    const estado = detalle?.estado || 'pendiente'

    if (estado === 'pendiente' && (montoBs > 0 || montoUsd > 0)) {
      totalBs += montoBs
      totalUsd += montoUsd
      cuotasPendientes.push({
        campanaId: j.id,
        titulo: j.titulo,
        esEspecial: !!j.esEspecial,
        mes: j.mes,
        fechaLimite: j.fechaLimite,
        monedaPrincipal: moneda,
        montoBs,
        montoUsd,
        montoPrincipal,
        estado: 'pendiente',
        detallePago: detalle
      })
    }
  }

  const jornadaActiva = data.jornadas.find(j => j.estado === 'activa')
  const cuotaActiva = cuotasPendientes.find(c => c.campanaId === jornadaActiva?.id) || cuotasPendientes[0]

  return {
    tieneDeuda: cuotasPendientes.length > 0,
    totalBs: Number(totalBs.toFixed(2)),
    totalUsd: Number(totalUsd.toFixed(2)),
    cuotasPendientes,
    cuotaActiva,
    datosBancarios
  }
}

/**
 * Consulta la deuda de gas para el apartamento del residente (con soporte multi-jornada consolidado)
 */
export function obtenerDeudaGasApartamento(
  data: GasServicioData,
  aptoId?: string | null,
  aptoNumero?: string | null
): DeudaApartamentoGas {
  const datosBancarios = data.config.datosPago
  const resTodas = obtenerTodasLasDeudasGasApartamento(data, aptoId, aptoNumero)

  if (resTodas.tieneDeuda && resTodas.cuotasPendientes.length > 0) {
    const primera = resTodas.cuotaActiva || resTodas.cuotasPendientes[0]
    return {
      tieneDeuda: true,
      esCuotaEspecial: resTodas.cuotasPendientes.some(c => c.esEspecial),
      monedaPrincipal: primera.monedaPrincipal,
      montoPrincipal: primera.monedaPrincipal === 'BS' ? resTodas.totalBs : resTodas.totalUsd,
      montoBs: resTodas.totalBs,
      montoUsd: resTodas.totalUsd,
      campanaTitulo: resTodas.cuotasPendientes.length > 1
        ? `${resTodas.cuotasPendientes.length} cuotas de gas pendientes`
        : primera.titulo,
      campanaId: primera.campanaId,
      fechaLimite: primera.fechaLimite,
      detallePago: primera.detallePago,
      datosBancarios
    }
  }

  const jornada = data.jornadas.find(j => j.estado === 'activa') || data.jornadas[0]
  return {
    tieneDeuda: false,
    esCuotaEspecial: !!jornada?.esEspecial,
    monedaPrincipal: jornada?.monedaPrincipal || data.config.monedaCuota || 'BS',
    montoPrincipal: 0,
    montoUsd: 0,
    montoBs: 0,
    campanaTitulo: jornada?.titulo || 'Servicio de Gas al Día',
    campanaId: jornada?.id,
    fechaLimite: jornada?.fechaLimite,
    datosBancarios
  }
}
