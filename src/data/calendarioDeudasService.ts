import { supabase } from './supabase'
import { appCache } from './cacheService'
import { registrarEventoAuditoria } from './auditoriaService'
import { obtenerTodosLosSaldosAFavor } from './saldoFavorService'
import { compararApartamentos } from '../utils/alicuota'
import { encodePagoMeta, PagoDomusMeta } from './gasService'
import { clasificarCuotaExtraordinaria, obtenerFechaHoyLocalIso } from './moraService'
import { fetchAllSupabasePages } from './supabasePagination'
import { getHoyVE } from '../utils/fechaVE'
import { getTasaBcvNumerica } from '../utils/tasaBcvHelper'
import { getActiveEdificioId } from './tenantContext'
import { logger, getErrorMessage } from '../utils/logger'

export interface ReciboMesItem {
  id: string
  apartamento_id: string
  mes_facturado: string // "YYYY-MM-01"
  total_usd: number
  total_bs: number
  tasa_bcv?: number
  estado: 'pendiente' | 'pagado'
  emitido_at?: string
  data_json?: any
}

export interface FilaCuotaEspecial {
  id: string
  nombre: string
  moneda: 'USD' | 'BS'
  montoDefecto: number
  montosPorColumna?: Record<string, number>
  // Valores por apartamento: key = apartamento_id
  valoresPorApto: Record<string, { monto: number; estado: 'pendiente' | 'pagado' }>
  fechaEmision?: string
  fechaLimite?: string
  descripcion?: string
  created_at?: string
}

export interface ColumnaCalendarioConfig {
  id: string
  titulo: string
  seccion: 'naranja' | 'azul' // 'naranja' = Deudas pasadas / conceptos extraordinarios, 'azul' = Calendario mensual
  moneda: 'USD' | 'BS'
  tipo: 'historico' | 'mes' | 'cuota_especial'
  mesKey?: string // e.g. '2026-01'
  orden: number
  esPersonalizada?: boolean
  montoDefecto?: number
  descripcion?: string
  fechaEmision?: string // YYYY-MM-DD
  fechaLimite?: string  // YYYY-MM-DD
  creadaEn?: string
}

export interface EventoCalendarioCuota {
  id: string
  columnaId: string
  anio: number
  titulo: string
  descripcion?: string
  tipoEvento: 'emision' | 'vencimiento'
  fecha: string // YYYY-MM-DD
  moneda: 'USD' | 'BS'
  montoDefecto: number
  totalAptosAsignados: number
  totalAptosPendientes: number
  totalAptosPagados: number
  estado: 'proximo' | 'hoy' | 'vencido' | 'completado'
}

export interface FilaPersonalizadaConfig {
  id: string
  numero: string
  propietario?: string
  alicuota?: number
}

export interface ValorCeldaPersonalizada {
  monto: number
  estado: 'pendiente' | 'pagado'
  moneda?: 'USD' | 'BS'
  montoOriginal?: number
  abonado?: number
  pagadoPorAdelantado?: boolean
  ultimaFechaAbono?: string
}

export interface ConfiguracionCalendario {
  tituloSeccionHistorica: string
  tituloSeccionMensual?: string
  columnas: ColumnaCalendarioConfig[]
  filasPersonalizadas: FilaPersonalizadaConfig[]
  filasOcultasIds: string[]
  // Valores de columnas personalizadas: [filaId][columnaId] = { monto, estado, ... }
  valoresCeldasPersonalizadas: Record<string, Record<string, ValorCeldaPersonalizada>>
  filasCuotasEspeciales?: FilaCuotaEspecial[]
}

/**
 * Parsea montos flexibles admitiendo formatos con separador de miles latino (14.304,23 o 14304,23)
 * o anglosajón (14,304.23 o 14304.23), eliminando símbolos monetarios y manejando entradas de usuario.
 */
export function parsearMontoFlexible(val: string | number | undefined | null, moneda: 'USD' | 'BS' = 'BS'): number {
  if (val === undefined || val === null || val === '') return 0
  if (typeof val === 'number') return isNaN(val) ? 0 : val

  let s = String(val).trim()
  if (!s) return 0

  // Quitar símbolos de moneda y espacios
  s = s.replace(/^(Bs\.?|USD|\$)\s*/i, '').replace(/\s*(Bs\.?|USD|\$)$/i, '').trim()

  // Caso 1: Tiene tanto punto como coma:
  // "14.304,23" -> punto es miles, coma es decimal
  // "14,304.23" -> coma es miles, punto es decimal
  if (s.includes('.') && s.includes(',')) {
    const lastDot = s.lastIndexOf('.')
    const lastComma = s.lastIndexOf(',')
    if (lastDot < lastComma) {
      s = s.replace(/\./g, '').replace(',', '.')
    } else {
      s = s.replace(/,/g, '')
    }
    const n = parseFloat(s)
    return isNaN(n) ? 0 : n
  }

  // Caso 2: Más de una coma -> separadores de miles
  const comas = s.split(',')
  if (comas.length > 2) {
    s = s.replace(/,/g, '')
    const n = parseFloat(s)
    return isNaN(n) ? 0 : n
  }

  // Caso 3: Solo una coma -> separador decimal
  if (s.includes(',')) {
    s = s.replace(',', '.')
    const n = parseFloat(s)
    return isNaN(n) ? 0 : n
  }

  // Caso 4: Múltiples puntos -> separadores de miles
  const puntos = s.split('.')
  if (puntos.length > 2) {
    s = s.replace(/\./g, '')
    const n = parseFloat(s)
    return isNaN(n) ? 0 : n
  }

  // Caso 5: Exactamente un punto con 3 dígitos al final en Bolívares (ej: "14.304" = 14304)
  if (puntos.length === 2 && puntos[1].length === 3 && moneda === 'BS') {
    s = s.replace(/\./g, '')
    const n = parseFloat(s)
    return isNaN(n) ? 0 : n
  }

  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

export function obtenerColumnasPorDefecto(anio = 2026): ColumnaCalendarioConfig[] {
  if (anio === 2026) {
    return [
      // Sección Naranja (Deudas pasadas / Conceptos anteriores en Bs y $)
      { id: 'deuda_2025', titulo: 'Deuda 2025', seccion: 'naranja', moneda: 'BS', tipo: 'historico', orden: 1 },
      { id: 'cable_viajero', titulo: 'Cable Viaj.', seccion: 'naranja', moneda: 'USD', tipo: 'historico', orden: 2 },
      { id: 'guaya', titulo: 'Guaya', seccion: 'naranja', moneda: 'USD', tipo: 'historico', orden: 3 },
      { id: 'arreglo', titulo: 'Arreglo', seccion: 'naranja', moneda: 'BS', tipo: 'historico', orden: 4 },
      { id: '2026-01', titulo: 'Ene (Bs)', seccion: 'naranja', moneda: 'BS', tipo: 'mes', mesKey: '2026-01', orden: 5 },
      { id: '2026-02', titulo: 'Feb (Bs)', seccion: 'naranja', moneda: 'BS', tipo: 'mes', mesKey: '2026-02', orden: 6 },

      // Sección Azul (Calendario mensual 2026)
      { id: '2026-03', titulo: 'Marzo $', seccion: 'azul', moneda: 'USD', tipo: 'mes', mesKey: '2026-03', orden: 7 },
      { id: '2026-04', titulo: 'Abril $', seccion: 'azul', moneda: 'USD', tipo: 'mes', mesKey: '2026-04', orden: 8 },
      { id: '2026-05', titulo: 'Mayo $', seccion: 'azul', moneda: 'USD', tipo: 'mes', mesKey: '2026-05', orden: 9 },
      { id: '2026-06', titulo: 'Junio $', seccion: 'azul', moneda: 'USD', tipo: 'mes', mesKey: '2026-06', orden: 10 },
      { id: '2026-07', titulo: 'Julio $', seccion: 'azul', moneda: 'USD', tipo: 'mes', mesKey: '2026-07', orden: 11 },
      { id: '2026-08', titulo: 'Agosto $', seccion: 'azul', moneda: 'USD', tipo: 'mes', mesKey: '2026-08', orden: 12 },
      { id: '2026-09', titulo: 'Septiembre $', seccion: 'azul', moneda: 'USD', tipo: 'mes', mesKey: '2026-09', orden: 13 },
      { id: '2026-10', titulo: 'Octubre $', seccion: 'azul', moneda: 'USD', tipo: 'mes', mesKey: '2026-10', orden: 14 },
      { id: '2026-11', titulo: 'Noviembre $', seccion: 'azul', moneda: 'USD', tipo: 'mes', mesKey: '2026-11', orden: 15 },
      { id: '2026-12', titulo: 'Diciembre $', seccion: 'azul', moneda: 'USD', tipo: 'mes', mesKey: '2026-12', orden: 16 }
    ]
  }

  // Plantilla limpia para 2027 y años sucesivos:
  // Completamente independiente: 12 meses del año en dólares ($), sin arrastre de deudas 2025
  const mesesNombres = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ]
  const colsMeses: ColumnaCalendarioConfig[] = mesesNombres.map((nombre, idx) => {
    const mesNum = idx + 1
    const mesStr = String(mesNum).padStart(2, '0')
    const key = `${anio}-${mesStr}`
    return {
      id: key,
      titulo: `${nombre} $`,
      seccion: 'azul',
      moneda: 'USD',
      tipo: 'mes',
      mesKey: key,
      orden: 1 + idx
    }
  })

  return colsMeses
}

export function obtenerConfiguracionPorDefecto(anio = 2026): ConfiguracionCalendario {
  return {
    tituloSeccionHistorica: anio === 2026 ? 'DEUDA AL AÑO 2025 / CONCEPTOS EXTRAORDINARIOS' : `CONCEPTOS EXTRAORDINARIOS ${anio}`,
    tituloSeccionMensual: `CALENDARIO MENSUAL ${anio} (EMISIÓN)`,
    columnas: obtenerColumnasPorDefecto(anio),
    filasPersonalizadas: [],
    filasOcultasIds: [],
    valoresCeldasPersonalizadas: {},
    filasCuotasEspeciales: []
  }
}

const CONFIG_STORAGE_KEY = 'condominio_config_calendario_v3'

export const CONFIGURACION_CALENDARIO_DEFECTO: ConfiguracionCalendario = obtenerConfiguracionPorDefecto(2026)

function sanitizarConfiguracion(parsed: any, defaultConfig: ConfiguracionCalendario): ConfiguracionCalendario {
  let titHist = parsed.tituloSeccionHistorica || defaultConfig.tituloSeccionHistorica
  if (titHist && typeof titHist === 'string' && titHist.includes('(BS)')) {
    titHist = titHist.replace(/\s*\(BS\)\s*/gi, '').trim()
  }

  const colsRaw = Array.isArray(parsed.columnas) && parsed.columnas.length > 0 ? parsed.columnas : defaultConfig.columnas
  // Filtrar cualquier columna de totales en el medio
  const columnasLimpias = colsRaw.filter((c: any) => {
    const id = (c.id || '').toLowerCase()
    const tit = (c.titulo || '').toLowerCase()
    return id !== 'total_bs' && id !== 'total_usd' && tit !== 'total bs' && tit !== 'total $' && tit !== 'total'
  })

  return {
    tituloSeccionHistorica: titHist,
    tituloSeccionMensual: parsed.tituloSeccionMensual || defaultConfig.tituloSeccionMensual,
    columnas: columnasLimpias.length > 0 ? columnasLimpias : defaultConfig.columnas,
    filasPersonalizadas: Array.isArray(parsed.filasPersonalizadas) ? parsed.filasPersonalizadas : [],
    filasOcultasIds: Array.isArray(parsed.filasOcultasIds) ? parsed.filasOcultasIds : [],
    valoresCeldasPersonalizadas: parsed.valoresCeldasPersonalizadas || {},
    filasCuotasEspeciales: Array.isArray(parsed.filasCuotasEspeciales) ? parsed.filasCuotasEspeciales : []
  }
}

const UUID_REGEXP_REL = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function obtenerEdificioIdRelacional(): Promise<string | null> {
  const active = getActiveEdificioId()
  if (active) return active
  try {
    const { data } = await supabase
      .from('configuracion_edificio')
      .select('id')
      .limit(1)
      .maybeSingle()
    return data?.id || null
  } catch {
    return null
  }
}

async function fusionarAsignacionesRelacionalesEnConfig(
  config: ConfiguracionCalendario,
  anio: number
): Promise<ConfiguracionCalendario> {
  try {
    const { data: cuotasRel, error: errCuotas } = await supabase
      .from('cuotas_extraordinarias')
      .select('id, columna_id, titulo, descripcion, moneda, monto_defecto, fecha_emision, fecha_limite, seccion, orden, activa')
      .eq('anio', anio)
      .eq('activa', true)

    if (errCuotas || !cuotasRel || cuotasRel.length === 0) return config

    const cuotaIdToCol = new Map<string, any>()
    const colsExistentes = new Set((config.columnas || []).map(c => c.id))
    const columnasActualizadas = [...(config.columnas || [])]

    cuotasRel.forEach(c => {
      cuotaIdToCol.set(c.id, c)
      if (!colsExistentes.has(c.columna_id)) {
        columnasActualizadas.push({
          id: c.columna_id,
          titulo: c.titulo,
          seccion: (c.seccion === 'azul' ? 'azul' : 'naranja'),
          moneda: (c.moneda === 'BS' ? 'BS' : 'USD'),
          tipo: 'cuota_especial',
          orden: Number(c.orden || 0),
          esPersonalizada: true,
          montoDefecto: Number(c.monto_defecto || 0),
          descripcion: c.descripcion || undefined,
          fechaEmision: c.fecha_emision || undefined,
          fechaLimite: c.fecha_limite || undefined
        })
      }
    })

    const { data: asigs, error: errAsig } = await supabase
      .from('cuotas_extraordinarias_asignaciones')
      .select('cuota_id, apartamento_id, monto_asignado, monto_abonado, moneda, estado, es_adelanto, pagos_aplicados_ids')
      .in('cuota_id', cuotasRel.map(c => c.id))

    if (errAsig || !asigs || asigs.length === 0) {
      return { ...config, columnas: columnasActualizadas }
    }

    const celdas = { ...(config.valoresCeldasPersonalizadas || {}) }
    for (const a of asigs) {
      const col = cuotaIdToCol.get(a.cuota_id)
      if (!col || !a.apartamento_id) continue
      if (!celdas[a.apartamento_id]) celdas[a.apartamento_id] = {}
      const prev = celdas[a.apartamento_id][col.columna_id] as any
      celdas[a.apartamento_id][col.columna_id] = {
        ...(prev || {}),
        monto: Number(a.monto_asignado ?? prev?.monto ?? col.monto_defecto ?? 0),
        estado: a.estado === 'pagado' ? 'pagado' : 'pendiente',
        moneda: (a.moneda === 'BS' ? 'BS' : 'USD'),
        ...(prev?.montoOriginal !== undefined
          ? { montoOriginal: prev.montoOriginal }
          : (Number(col.monto_defecto) > 0 ? { montoOriginal: Number(col.monto_defecto) } : {})),
        ...(Number(a.monto_abonado) > 0 ? { abonado: Number(a.monto_abonado) } : {}),
        ...(a.es_adelanto ? { pagadoPorAdelantado: true } : {}),
        ...(Array.isArray(a.pagos_aplicados_ids) && a.pagos_aplicados_ids.length > 0
          ? { pagosAplicadosIds: a.pagos_aplicados_ids }
          : {})
      }
    }

    return {
      ...config,
      columnas: columnasActualizadas,
      valoresCeldasPersonalizadas: celdas
    }
  } catch {
    return config
  }
}

async function sincronizarCuotasRelacionalesDesdeConfig(
  config: ConfiguracionCalendario,
  anio: number
): Promise<void> {
  try {
    const edificioId = await obtenerEdificioIdRelacional()
    if (!edificioId) return

    const colsObjetivo = (config.columnas || []).filter(
      c => c.esPersonalizada || c.tipo === 'cuota_especial' || c.tipo === 'historico'
    )
    if (colsObjetivo.length === 0) return

    const cuotasPayload = colsObjetivo.map((c, idx) => ({
      edificio_id: edificioId,
      anio,
      columna_id: c.id,
      titulo: c.titulo || 'Cuota Extraordinaria',
      descripcion: c.descripcion || null,
      moneda: c.moneda === 'BS' ? 'BS' : 'USD',
      monto_defecto: Number(c.montoDefecto || 0),
      fecha_emision: c.fechaEmision || null,
      fecha_limite: c.fechaLimite || null,
      seccion: c.seccion === 'azul' ? 'azul' : 'naranja',
      orden: Number(c.orden ?? idx),
      activa: true,
      updated_at: new Date().toISOString()
    }))

    const { data: cuotasUpserted, error: errCuotas } = await supabase
      .from('cuotas_extraordinarias')
      .upsert(cuotasPayload, { onConflict: 'edificio_id,anio,columna_id' })
      .select('id, columna_id, moneda')

    if (errCuotas || !cuotasUpserted || cuotasUpserted.length === 0) return

    const colIdToCuota = new Map<string, { id: string; moneda: string }>()
    cuotasUpserted.forEach(c => colIdToCuota.set(c.columna_id, { id: c.id, moneda: c.moneda }))

    const asigPayload: any[] = []
    Object.entries(config.valoresCeldasPersonalizadas || {}).forEach(([aptoId, cols]) => {
      if (!UUID_REGEXP_REL.test(aptoId) || !cols) return
      Object.entries(cols).forEach(([colId, val]: [string, any]) => {
        const meta = colIdToCuota.get(colId)
        if (!meta || !val) return
        asigPayload.push({
          edificio_id: edificioId,
          cuota_id: meta.id,
          apartamento_id: aptoId,
          monto_asignado: Number(val.monto ?? 0),
          monto_abonado: Number(val.abonado ?? 0),
          moneda: (val.moneda === 'BS' || val.moneda === 'USD') ? val.moneda : meta.moneda,
          estado: val.estado === 'pagado' ? 'pagado' : 'pendiente',
          es_adelanto: Boolean(val.pagadoPorAdelantado),
          pagos_aplicados_ids: Array.isArray(val.pagosAplicadosIds) ? val.pagosAplicadosIds : [],
          updated_at: new Date().toISOString()
        })
      })
    })

    if (asigPayload.length > 0) {
      await supabase
        .from('cuotas_extraordinarias_asignaciones')
        .upsert(asigPayload, { onConflict: 'cuota_id,apartamento_id' })
    }
  } catch {
    // No bloquear escritura principal si tablas relacionales aún no existen o usuario es residente
  }
}

export async function obtenerConfiguracionCalendario(anio: number = 2026): Promise<ConfiguracionCalendario> {
  const defaultConfig = obtenerConfiguracionPorDefecto(anio)
  const dbTipo = anio === 2026 ? 'config_calendario_mora' : `config_calendario_mora_${anio}`
  const storageKey = anio === 2026 ? CONFIG_STORAGE_KEY : `${CONFIG_STORAGE_KEY}_${anio}`

  try {
    // 1. Prioridad: Consultar directamente de Supabase para tener la configuración más actualizada
    const { data } = await supabase
      .from('casos_comunidad')
      .select('descripcion')
      .eq('tipo', dbTipo)
      .maybeSingle()

    if (data?.descripcion) {
      try {
        const parsed = JSON.parse(data.descripcion)
        const baseRes = sanitizarConfiguracion(parsed, defaultConfig)
        const res = await fusionarAsignacionesRelacionalesEnConfig(baseRes, anio)
        localStorage.setItem(storageKey, JSON.stringify(res))
        return res
      } catch (e) {
        console.warn(`[calendarioDeudasService] Error parseando config ${anio} de DB:`, e)
      }
    }

    // 2. Si no existe en Supabase y no es 2026 (ej: 2027 inicializándose por primera vez):
    if (anio !== 2026) {
      // Guardar plantilla limpia del nuevo año en Supabase de forma asíncrona
      Promise.resolve(
        supabase
          .from('casos_comunidad')
          .insert({
            tipo: dbTipo,
            titulo: `CONFIG_CALENDARIO_${anio}`,
            descripcion: JSON.stringify(defaultConfig),
            monto_usd: 0,
            monto_bs: 0
          })
      )
        .then(() => {
          localStorage.setItem(storageKey, JSON.stringify(defaultConfig))
        })
        .catch((e: any) => console.warn(`Error guardando plantilla ${anio} en Supabase:`, e))

      return defaultConfig
    }

    // 3. Fallback a localStorage si Supabase no tiene el registro o está offline
    const raw = localStorage.getItem(storageKey)
    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') {
          return sanitizarConfiguracion(parsed, defaultConfig)
        }
      } catch (err) { logger.debug('calendarioDeudasService', 'Fallback controlado', err) }
    }
  } catch (err) {
    console.warn(`[calendarioDeudasService] Error cargando config ${anio}:`, err)
  }

  return defaultConfig
}

function mergearConfiguracionCalendario(
  remota: ConfiguracionCalendario,
  localPatch: Partial<ConfiguracionCalendario>,
  esReintentoConflicto: boolean
): ConfiguracionCalendario {
  const base: ConfiguracionCalendario = {
    tituloSeccionHistorica: localPatch.tituloSeccionHistorica !== undefined ? localPatch.tituloSeccionHistorica : remota.tituloSeccionHistorica,
    tituloSeccionMensual: localPatch.tituloSeccionMensual !== undefined ? localPatch.tituloSeccionMensual : remota.tituloSeccionMensual,
    columnas: localPatch.columnas !== undefined ? localPatch.columnas : remota.columnas,
    filasPersonalizadas: localPatch.filasPersonalizadas !== undefined ? localPatch.filasPersonalizadas : remota.filasPersonalizadas,
    filasOcultasIds: localPatch.filasOcultasIds !== undefined ? localPatch.filasOcultasIds : remota.filasOcultasIds,
    valoresCeldasPersonalizadas: localPatch.valoresCeldasPersonalizadas !== undefined ? localPatch.valoresCeldasPersonalizadas : remota.valoresCeldasPersonalizadas,
    filasCuotasEspeciales: localPatch.filasCuotasEspeciales !== undefined ? localPatch.filasCuotasEspeciales : remota.filasCuotasEspeciales
  }

  if (!esReintentoConflicto) return base

  // En caso de conflicto concurrente, fusionar celdas y cuotas extraordinarias por apartamento/clave
  const mergedCeldas: Record<string, Record<string, any>> = { ...(remota.valoresCeldasPersonalizadas || {}) }
  if (localPatch.valoresCeldasPersonalizadas) {
    Object.entries(localPatch.valoresCeldasPersonalizadas).forEach(([aptoId, cols]) => {
      mergedCeldas[aptoId] = {
        ...(mergedCeldas[aptoId] || {}),
        ...(cols || {})
      }
    })
  }

  const cuotasMap = new Map<string, FilaCuotaEspecial>()
    ; (remota.filasCuotasEspeciales || []).forEach(f => cuotasMap.set(f.id, f))
    ; (localPatch.filasCuotasEspeciales || []).forEach(f => {
      const prev = cuotasMap.get(f.id)
      cuotasMap.set(f.id, prev ? {
        ...prev,
        ...f,
        valoresPorApto: { ...(prev.valoresPorApto || {}), ...(f.valoresPorApto || {}) }
      } : f)
    })

  return {
    ...base,
    valoresCeldasPersonalizadas: mergedCeldas,
    filasCuotasEspeciales: Array.from(cuotasMap.values())
  }
}

export async function guardarConfiguracionCalendario(
  config: Partial<ConfiguracionCalendario>,
  anio: number = 2026
): Promise<{ success: boolean; data: ConfiguracionCalendario; error: string | null }> {
  const defaultConfig = obtenerConfiguracionPorDefecto(anio)
  const storageKey = anio === 2026 ? CONFIG_STORAGE_KEY : `${CONFIG_STORAGE_KEY}_${anio}`
  const dbTipo = anio === 2026 ? 'config_calendario_mora' : `config_calendario_mora_${anio}`
  const MAX_RETRIES = 3

  try {
    let ultimaGuardada: ConfiguracionCalendario = await obtenerConfiguracionCalendario(anio)

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const { data: existente } = await supabase
        .from('casos_comunidad')
        .select('id, updated_at, descripcion')
        .eq('tipo', dbTipo)
        .maybeSingle()

      let baseRemota = ultimaGuardada
      if (existente?.descripcion) {
        try {
          baseRemota = sanitizarConfiguracion(JSON.parse(existente.descripcion), defaultConfig)
        } catch (err) { logger.debug('calendarioDeudasService', 'Fallback controlado', err) }
      }

      const nueva = mergearConfiguracionCalendario(baseRemota, config, attempt > 0)
      localStorage.setItem(storageKey, JSON.stringify(nueva))

      if (existente?.id) {
        const expectedUpdatedAt = existente.updated_at || null
        let updQuery = supabase
          .from('casos_comunidad')
          .update({
            descripcion: JSON.stringify(nueva),
            updated_at: new Date().toISOString()
          })
          .eq('id', existente.id)

        if (expectedUpdatedAt) {
          updQuery = updQuery.eq('updated_at', expectedUpdatedAt)
        }

        const { data: updatedRow, error: updErr } = await updQuery
          .select('id, updated_at')
          .maybeSingle()

        if (updErr) throw updErr

        // Si updatedRow es null (concurrencia optimista: otro proceso actualizó antes), reintentar con merge
        if (!updatedRow && expectedUpdatedAt) {
          console.warn(`[calendarioDeudasService] Conflicto optimista al guardar calendario ${anio}, reintento ${attempt + 1}/${MAX_RETRIES}`)
          ultimaGuardada = baseRemota
          continue
        }
      } else {
        const { error: insErr } = await supabase
          .from('casos_comunidad')
          .insert({
            tipo: dbTipo,
            titulo: `CONFIG_CALENDARIO_${anio}`,
            descripcion: JSON.stringify(nueva),
            monto_usd: 0,
            monto_bs: 0
          })
        if (insErr) throw insErr
      }

      await sincronizarCuotasRelacionalesDesdeConfig(nueva, anio).catch(() => { })
      appCache.invalidateTags(['recibos', 'saldos', 'mora', 'calendario_config', `calendario_${anio}`, `calendario_matriz_${anio}`])
      return { success: true, data: nueva, error: null }
    }

    return {
      success: false,
      data: await obtenerConfiguracionCalendario(anio),
      error: 'Conflicto de edición concurrente en calendario. Por favor recarga e intenta de nuevo.'
    }
  } catch (err: unknown) {
    console.error(`[calendarioDeudasService] Error guardando config ${anio}:`, err)
    return { success: false, data: await obtenerConfiguracionCalendario(anio), error: getErrorMessage(err) }
  }
}

export interface FilaCalendarioApto {
  apartamento_id: string
  apartamento_numero: string
  piso: number | null
  alicuota: number
  propietario_nombre: string | null
  telefono: string | null
  email: string | null

  // Deuda Histórica al año 2025 y conceptos extraordinarios
  deuda_base_2025: number
  cable_viajero: number
  guaya: number
  arreglo: number

  // Monedas específicas de cada concepto para este apartamento
  monedas_conceptos?: {
    deuda_base_2025?: 'USD' | 'BS'
    cable_viajero?: 'USD' | 'BS'
    guaya?: 'USD' | 'BS'
    arreglo?: 'USD' | 'BS'
  }

  // Meses facturados en recibos_generados (clave: "YYYY-MM")
  meses: Record<string, ReciboMesItem | null>

  // Totales
  total_bs: number
  total_usd: number
  meses_con_deuda: number
  estado_solvente: boolean

  // Depósitos y Saldo a favor
  saldo_a_favor_usd: number
  saldo_a_favor_bs: number

  // Valores de columnas personalizadas (clave: colId)
  valores_personalizados?: Record<string, ValorCeldaPersonalizada>
  esPersonalizada?: boolean

  // Referencia a deudas_mora en DB
  deuda_mora_id?: string
  deuda_mora_estado?: 'activo' | 'en_convenio' | 'solventado'
}

export interface ColumnaMes {
  key: string       // "YYYY-MM"
  fechaIso: string  // "YYYY-MM-01"
  mesNum: number    // 1-12
  anio: number      // ej: 2026
  label: string     // ej: "Enero"
  moneda: 'BS' | 'USD'
  esEmitido: boolean
  totalMoraUsd: number
  totalMoraBs: number
  totalPagadoUsd: number
  totalPagadoBs: number
  aptosConDeudaCount: number
}

export interface ResumenGlobalCalendario {
  totalApartamentos: number
  apartamentosSolventes: number
  apartamentosMorosos: number
  totalDeudaEdificioUsd: number
  totalDeudaEdificioBs: number
  totalSaldoAFavorUsd: number
  totalSaldoAFavorBs: number
  mesesDisponibles: string[]
  tasaBcvActual: number
}

export const MESES_NOMBRES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

export function normalizarNumeroApto(num: string): string {
  return (num || '').trim().toUpperCase()
}

export function displayNumeroApto(num: string): string {
  return (num || '').trim().toUpperCase()
}

/**
 * Consulta y consolida la matriz completa de deudas mensuales por apartamento
 */
export async function obtenerMatrizCalendario(
  anioSeleccionado: number = 2026,
  forceRefresh: boolean = false
): Promise<{
  filas: FilaCalendarioApto[]
  columnasMeses: ColumnaMes[]
  columnasHistoricasBs: ColumnaMes[]
  columnasMesesDolares: ColumnaMes[]
  resumenGlobal: ResumenGlobalCalendario
  configuracion: ConfiguracionCalendario
  error: string | null
}> {
  return appCache.fetch(
    `calendario_matriz_${anioSeleccionado}`,
    async () => {
      try {
        const [
          configRes,
          aptosRes,
          perfilesRes,
          recibosRes,
          deudasMoraRes,
          configCalendario
        ] = await Promise.all([
          supabase.from('configuracion_edificio').select('tasa_bcv_actual').limit(1).maybeSingle(),
          supabase.from('apartamentos').select('id, numero, piso, alicuota, propietario_nombre, telefono_contacto').order('numero'),
          supabase.from('perfiles').select('apartamento_id, nombre_completo, propietario_nombre, propietario_email, telefono'),
          fetchAllSupabasePages((from, to) =>
            supabase
              .from('recibos_generados')
              .select('id, apartamento_id, mes_facturado, total_usd, total_bs, tasa_bcv, estado, emitido_at, data_json')
              .order('mes_facturado', { ascending: true })
              .range(from, to)
          ),
          supabase
            .from('deudas_mora')
            .select('id, apartamento_id, estado, monto_bs, monto_usd, conceptos_detalle, observaciones, fecha_corte, updated_at'),
          obtenerConfiguracionCalendario(anioSeleccionado)
        ])

        const tasaBcv = getTasaBcvNumerica(configRes.data?.tasa_bcv_actual)
        const saldosMap = await obtenerTodosLosSaldosAFavor(tasaBcv, forceRefresh)

        const aptos = aptosRes.data || []
        const perfiles = perfilesRes.data || []
        const recibos = recibosRes.data || []
        const deudasMora = deudasMoraRes.data || []

        const perfilesMap = new Map<string, any>()
        perfiles.forEach(p => {
          if (p.apartamento_id) {
            const prev = perfilesMap.get(p.apartamento_id)
            if (!prev || (!prev.propietario_email && p.propietario_email)) {
              perfilesMap.set(p.apartamento_id, p)
            }
          }
        })

        const moraMap = new Map<string, any>()
        deudasMora.forEach(dm => {
          if (dm.apartamento_id) {
            moraMap.set(dm.apartamento_id, dm)
          }
        })

        const recibosPorAptoYMes = new Map<string, ReciboMesItem>()
        const mesesEmitidosSet = new Set<string>()

        recibos.forEach((r: any) => {
          if (!r.mes_facturado) return
          const mesKey = r.mes_facturado.slice(0, 7) // "YYYY-MM"
          mesesEmitidosSet.add(mesKey)
          recibosPorAptoYMes.set(`${r.apartamento_id}_${mesKey}`, {
            id: r.id,
            apartamento_id: r.apartamento_id,
            mes_facturado: r.mes_facturado,
            total_usd: Number(r.total_usd || 0),
            total_bs: Number(r.total_bs || 0),
            tasa_bcv: Number(r.tasa_bcv || tasaBcv),
            estado: r.estado || 'pendiente',
            emitido_at: r.emitido_at,
            data_json: r.data_json
          })
        })

        // Columnas completas para el año
        const columnasMeses: ColumnaMes[] = []
        for (let m = 1; m <= 12; m++) {
          const mesStr = String(m).padStart(2, '0')
          const key = `${anioSeleccionado}-${mesStr}`
          const fechaIso = `${key}-01`
          const esEmitido = mesesEmitidosSet.has(key)

          let moneda: 'BS' | 'USD' = (anioSeleccionado === 2026 && m <= 2) ? 'BS' : 'USD'
          const recibosDeEsteMes = recibos.filter((r: any) => (r.mes_facturado || '').startsWith(key))
          if (recibosDeEsteMes.length > 0) {
            const hayMayorUsd = recibosDeEsteMes.some((r: any) => Number(r.total_usd || 0) > 0 && r.data_json?.es_indexado !== false)
            moneda = hayMayorUsd ? 'USD' : 'BS'
          }

          columnasMeses.push({
            key,
            fechaIso,
            mesNum: m,
            anio: anioSeleccionado,
            label: MESES_NOMBRES[m - 1],
            moneda,
            esEmitido,
            totalMoraUsd: 0,
            totalMoraBs: 0,
            totalPagadoUsd: 0,
            totalPagadoBs: 0,
            aptosConDeudaCount: 0
          })
        }

        // Subconjuntos: Enero y Febrero 2026 (en Bs) van en el bloque histórico como en el Excel
        const columnasHistoricasBs = columnasMeses.filter(c => c.moneda === 'BS')
        // Marzo a Diciembre 2026 (en $) van en el bloque de dólares
        const columnasMesesDolares = columnasMeses.filter(c => c.moneda === 'USD')

        // Construir filas por todos los apartamentos
        const filasAptos: FilaCalendarioApto[] = aptos.map(apto => {
          const perf = perfilesMap.get(apto.id)
          const moraRow = moraMap.get(apto.id)
          const saldo = saldosMap.get(apto.id)

          let conceptosHist: any = {}
          if (moraRow?.conceptos_detalle) {
            try {
              if (moraRow.conceptos_detalle.startsWith('{')) {
                conceptosHist = JSON.parse(moraRow.conceptos_detalle)
              }
            } catch (err) { logger.debug('calendarioDeudasService', 'Fallback controlado', err) }
          }

          const es2026 = anioSeleccionado === 2026
          const esMoraSolventada = moraRow?.estado === 'solventado'
          const deudaBase2025 = (es2026 && !esMoraSolventada) ? Number(conceptosHist.deuda_2025 || (moraRow?.monto_bs && !conceptosHist.deuda_2025 ? moraRow.monto_bs : 0)) : 0
          const cableViajero = (es2026 && !esMoraSolventada) ? Number(conceptosHist.cable_viajero || 0) : 0
          const guaya = (es2026 && !esMoraSolventada) ? Number(conceptosHist.guaya || 0) : 0
          const arreglo = (es2026 && !esMoraSolventada) ? Number(conceptosHist.arreglo || 0) : 0

          const colsParaApto = configCalendario.columnas || []
          const mDeuda: 'USD' | 'BS' = es2026 ? ((conceptosHist.deuda_2025_moneda as ('USD' | 'BS')) || colsParaApto.find(c => c.id === 'deuda_2025')?.moneda || 'BS') : 'BS'
          const mCable: 'USD' | 'BS' = es2026 ? ((conceptosHist.cable_viajero_moneda as ('USD' | 'BS')) || colsParaApto.find(c => c.id === 'cable_viajero')?.moneda || 'USD') : 'USD'
          const mGuaya: 'USD' | 'BS' = es2026 ? ((conceptosHist.guaya_moneda as ('USD' | 'BS')) || colsParaApto.find(c => c.id === 'guaya')?.moneda || 'USD') : 'USD'
          const mArreglo: 'USD' | 'BS' = es2026 ? ((conceptosHist.arreglo_moneda as ('USD' | 'BS')) || colsParaApto.find(c => c.id === 'arreglo')?.moneda || 'BS') : 'BS'

          const mesesMap: Record<string, ReciboMesItem | null> = {}
          let sumPendienteBs = 0
          let sumPendienteUsd = 0

          if (es2026) {
            if (mDeuda === 'BS') sumPendienteBs += deudaBase2025; else sumPendienteUsd += deudaBase2025
            if (mCable === 'BS') sumPendienteBs += cableViajero; else sumPendienteUsd += cableViajero
            if (mGuaya === 'BS') sumPendienteBs += guaya; else sumPendienteUsd += guaya
            if (mArreglo === 'BS') sumPendienteBs += arreglo; else sumPendienteUsd += arreglo
          }
          let mesesConDeuda = 0

          columnasMeses.forEach(col => {
            const recibo = recibosPorAptoYMes.get(`${apto.id}_${col.key}`) || null
            mesesMap[col.key] = recibo

            if (recibo) {
              if (recibo.estado === 'pendiente') {
                mesesConDeuda += 1
                col.aptosConDeudaCount += 1
                if (col.moneda === 'USD') {
                  sumPendienteUsd += recibo.total_usd
                  col.totalMoraUsd += recibo.total_usd
                } else {
                  sumPendienteBs += recibo.total_bs
                  col.totalMoraBs += recibo.total_bs
                }
              } else if (recibo.estado === 'pagado') {
                if (col.moneda === 'USD') {
                  col.totalPagadoUsd += recibo.total_usd
                } else {
                  col.totalPagadoBs += recibo.total_bs
                }
              }
            }
          })

          const celdasPers = configCalendario.valoresCeldasPersonalizadas?.[apto.id] || {}
          const hoyIsoCal = obtenerFechaHoyLocalIso()

          // Sumar montos de columnas personalizadas (excluyendo cuotas programadas futuras aún no exigibles)
          colsParaApto.forEach((col: ColumnaCalendarioConfig) => {
            if (col.tipo === 'cuota_especial') {
              const estadoVigencia = clasificarCuotaExtraordinaria(col.fechaEmision, col.fechaLimite, hoyIsoCal)
              if (estadoVigencia === 'programada') return
              const val = celdasPers[col.id] ?? (col.montoDefecto ? { monto: col.montoDefecto, estado: 'pendiente' } : null)
              if (val && val.estado === 'pendiente' && val.monto > 0) {
                const mon = (val as any)?.moneda || col.moneda || 'USD'
                if (mon === 'USD') sumPendienteUsd += val.monto
                else sumPendienteBs += val.monto
                mesesConDeuda += 1
              }
            }
          })

          const tieneDeudaTotal = sumPendienteBs > 0.01 || sumPendienteUsd > 0.01

          return {
            apartamento_id: apto.id,
            apartamento_numero: apto.numero,
            piso: apto.piso,
            alicuota: Number(apto.alicuota || 0.0159),
            propietario_nombre: perf?.propietario_nombre || perf?.nombre_completo || apto.propietario_nombre || null,
            telefono: perf?.telefono || apto.telefono_contacto || null,
            email: perf?.propietario_email || null,

            deuda_base_2025: es2026 ? deudaBase2025 : 0,
            cable_viajero: es2026 ? cableViajero : 0,
            guaya: es2026 ? guaya : 0,
            arreglo: es2026 ? arreglo : 0,
            monedas_conceptos: {
              deuda_base_2025: mDeuda,
              cable_viajero: mCable,
              guaya: mGuaya,
              arreglo: mArreglo
            },

            meses: mesesMap,
            valores_personalizados: celdasPers,
            total_bs: Number(sumPendienteBs.toFixed(2)),
            total_usd: Number(sumPendienteUsd.toFixed(2)),
            meses_con_deuda: mesesConDeuda,
            estado_solvente: !tieneDeudaTotal,

            saldo_a_favor_usd: saldo?.saldo_a_favor_usd || 0,
            saldo_a_favor_bs: saldo?.saldo_a_favor_bs || 0,

            deuda_mora_id: es2026 ? moraRow?.id : undefined,
            deuda_mora_estado: es2026 ? moraRow?.estado : undefined
          }
        })

        // Filas personalizadas adicionales añadidas por el admin
        const filasPersonalizadasList: FilaCalendarioApto[] = (configCalendario.filasPersonalizadas || [])
          .filter(f => !(configCalendario.filasOcultasIds || []).includes(f.id))
          .map(filaPers => {
            const celdasPers = configCalendario.valoresCeldasPersonalizadas?.[filaPers.id] || {}
            let sumPendienteBs = 0
            let sumPendienteUsd = 0
            let mesesConDeuda = 0
            const colsParaPers = configCalendario.columnas || []
            const hoyIsoPers = obtenerFechaHoyLocalIso()

            colsParaPers.forEach((col: ColumnaCalendarioConfig) => {
              if (col.tipo === 'cuota_especial') {
                const estadoVigencia = clasificarCuotaExtraordinaria(col.fechaEmision, col.fechaLimite, hoyIsoPers)
                if (estadoVigencia === 'programada') return
                const val = celdasPers[col.id] ?? (col.montoDefecto ? { monto: col.montoDefecto, estado: 'pendiente' } : null)
                if (val && val.estado === 'pendiente' && val.monto > 0) {
                  if (col.moneda === 'USD') sumPendienteUsd += val.monto
                  else sumPendienteBs += val.monto
                  mesesConDeuda += 1
                }
              }
            })

            const tieneDeudaTotal = sumPendienteBs > 0.01 || sumPendienteUsd > 0.01

            return {
              apartamento_id: filaPers.id,
              apartamento_numero: filaPers.numero,
              piso: null,
              alicuota: filaPers.alicuota || 0.0159,
              propietario_nombre: filaPers.propietario || 'Fila Personalizada',
              telefono: null,
              email: null,
              deuda_base_2025: 0,
              cable_viajero: 0,
              guaya: 0,
              arreglo: 0,
              meses: {},
              valores_personalizados: celdasPers,
              total_bs: Number(sumPendienteBs.toFixed(2)),
              total_usd: Number(sumPendienteUsd.toFixed(2)),
              meses_con_deuda: mesesConDeuda,
              estado_solvente: !tieneDeudaTotal,
              saldo_a_favor_usd: 0,
              saldo_a_favor_bs: 0,
              esPersonalizada: true
            }
          })

        const filas = [...filasAptos, ...filasPersonalizadasList]

        filas.sort((a, b) => compararApartamentos(a.apartamento_numero, b.apartamento_numero))

        const totalAptos = filas.length
        const aptosSolventes = filas.filter(f => f.estado_solvente).length
        const aptosMorosos = totalAptos - aptosSolventes
        const totalDeudaEdificioUsd = filas.reduce((s, f) => s + f.total_usd, 0)
        const totalDeudaEdificioBs = filas.reduce((s, f) => s + f.total_bs, 0)
        const totalSaldoAFavorUsd = filas.reduce((s, f) => s + f.saldo_a_favor_usd, 0)
        const totalSaldoAFavorBs = filas.reduce((s, f) => s + f.saldo_a_favor_bs, 0)

        const resumenGlobal: ResumenGlobalCalendario = {
          totalApartamentos: totalAptos,
          apartamentosSolventes: aptosSolventes,
          apartamentosMorosos: aptosMorosos,
          totalDeudaEdificioUsd: Number(totalDeudaEdificioUsd.toFixed(2)),
          totalDeudaEdificioBs: Number(totalDeudaEdificioBs.toFixed(2)),
          totalSaldoAFavorUsd: Number(totalSaldoAFavorUsd.toFixed(2)),
          totalSaldoAFavorBs: Number(totalSaldoAFavorBs.toFixed(2)),
          mesesDisponibles: Array.from(mesesEmitidosSet).sort(),
          tasaBcvActual: tasaBcv
        }

        return {
          filas,
          columnasMeses,
          columnasHistoricasBs,
          columnasMesesDolares,
          resumenGlobal,
          configuracion: configCalendario,
          error: null
        }
      } catch (err: unknown) {
        console.error('[calendarioDeudasService] Error cargando matriz:', err)
        return {
          filas: [],
          columnasMeses: [],
          columnasHistoricasBs: [],
          columnasMesesDolares: [],
          resumenGlobal: {
            totalApartamentos: 0,
            apartamentosSolventes: 0,
            apartamentosMorosos: 0,
            totalDeudaEdificioUsd: 0,
            totalDeudaEdificioBs: 0,
            totalSaldoAFavorUsd: 0,
            totalSaldoAFavorBs: 0,
            mesesDisponibles: [],
            tasaBcvActual: getTasaBcvNumerica()
          },
          configuracion: CONFIGURACION_CALENDARIO_DEFECTO,
          error: getErrorMessage(err) || 'Error consultando calendario de mora'
        }
      }
    },
    { ttlMs: 60_000, forceRefresh, tags: ['recibos', 'saldos', 'mora', 'apartamentos'] }
  )
}

export interface EditarMontoCuotaParams {
  reciboId?: string
  apartamentoId: string
  apartamentoNumero: string
  mesFacturadoIso: string
  mesLabel: string
  nuevoMonto: number | string
  moneda: 'USD' | 'BS'
  estado: 'pendiente' | 'pagado'
  referencia?: string
  metodo?: string
  fechaPago?: string
  nota?: string
  autorNombre?: string
}

/**
 * Permite al administrador editar cualquier monto de cualquier celda del calendario,
 * ajustando automáticamente los totales, estado de solvencia y auditoría.
 */
export async function guardarMontoReciboPersonalizado(params: EditarMontoCuotaParams): Promise<{ success: boolean; error: string | null }> {
  try {
    const {
      reciboId,
      apartamentoId,
      apartamentoNumero,
      mesFacturadoIso,
      mesLabel,
      nuevoMonto,
      moneda,
      estado,
      referencia,
      metodo,
      fechaPago,
      nota,
      autorNombre
    } = params

    const isBs = moneda === 'BS'
    let tasaBcvAplicada = getTasaBcvNumerica()
    try {
      const { data: edifConfig } = await supabase.from('configuracion_edificio').select('tasa_bcv_actual').limit(1).maybeSingle()
      if (edifConfig?.tasa_bcv_actual && Number(edifConfig.tasa_bcv_actual) > 0) {
        tasaBcvAplicada = Number(edifConfig.tasa_bcv_actual)
      }
    } catch (err) { logger.debug('calendarioDeudasService', 'Fallback controlado', err) }

    const montoNum = parsearMontoFlexible(nuevoMonto, moneda)
    const montoUsd = moneda === 'USD' ? montoNum : Number((montoNum / tasaBcvAplicada).toFixed(2))
    const montoBs = moneda === 'BS' ? montoNum : Number((montoNum * tasaBcvAplicada).toFixed(2))
    const fechaEfectiva = fechaPago || getHoyVE()

    // 1. Localizar recibo existente por ID o por (apartamento_id, mes_facturado)
    let targetReciboId = (reciboId && !reciboId.startsWith('temp-')) ? reciboId : null
    let reciboExistente: any = null

    if (targetReciboId) {
      const { data } = await supabase
        .from('recibos_generados')
        .select('id, data_json')
        .eq('id', targetReciboId)
        .maybeSingle()
      reciboExistente = data
    } else {
      const { data } = await supabase
        .from('recibos_generados')
        .select('id, data_json')
        .eq('apartamento_id', apartamentoId)
        .eq('mes_facturado', mesFacturadoIso)
        .maybeSingle()
      reciboExistente = data
      if (reciboExistente?.id) {
        targetReciboId = reciboExistente.id
      }
    }

    const prevJson = (reciboExistente?.data_json && typeof reciboExistente.data_json === 'object') ? reciboExistente.data_json : {}

    // Preservar y priorizar la referencia bancaria:
    // 1. Si el usuario ingresó una referencia explícita, se usa
    // 2. Si no la ingresó en este envío, pero ya existía una registrada en el recibo, se preserva
    // 3. Fallback solo si es pagado y no existía ninguna referencia previa
    const refIngresada = (referencia !== undefined && referencia !== null) ? String(referencia).trim() : ''
    const refPrevia = prevJson?.pago_info?.referencia || prevJson?.referencia || prevJson?.ultima_referencia || ''
    const refFinal = refIngresada || refPrevia || (estado === 'pagado' ? `CONCIL-${Date.now().toString().slice(-6)}` : '')

    const dataJsonMerged = {
      ...prevJson,
      editado_manualmente: true,
      moneda_original: moneda,
      monto_original: nuevoMonto,
      es_indexado: !isBs,
      editado_por: autorNombre || 'Administrador',
      editado_at: new Date().toISOString(),
      ultima_referencia: refFinal || refPrevia || null,
      pago_historico: estado === 'pagado' ? null : (prevJson?.pago_info || prevJson?.pago_historico || null),
      pago_info: estado === 'pagado' ? {
        referencia: refFinal,
        metodo: metodo || prevJson?.pago_info?.metodo || 'Conciliación Manual Admin',
        fecha_pago: fechaEfectiva,
        nota: nota !== undefined && nota !== null ? nota : (prevJson?.pago_info?.nota || null)
      } : null
    }

    if (targetReciboId) {
      const { error: updErr } = await supabase
        .from('recibos_generados')
        .update({
          total_usd: isBs ? 0 : montoUsd,
          total_bs: montoBs,
          estado: estado,
          data_json: dataJsonMerged
        })
        .eq('id', targetReciboId)

      if (updErr) throw updErr
    } else {
      const { error: insErr } = await supabase
        .from('recibos_generados')
        .insert({
          apartamento_id: apartamentoId,
          mes_facturado: mesFacturadoIso,
          total_usd: isBs ? 0 : montoUsd,
          total_bs: montoBs,
          estado: estado,
          tasa_bcv: tasaBcvAplicada,
          subtotal_usd: isBs ? 0 : montoUsd,
          alicuota: 0.0159,
          fondo_reserva_pct: 10,
          data_json: dataJsonMerged,
          emitido_at: new Date().toISOString()
        })

      if (insErr) throw insErr
    }

    // 2. Si se marcó como pagado, asentar en pagos_reportados para sincronización completa
    if (estado === 'pagado') {
      try {
        let userId: string | null = null
        const { data: authData } = await supabase.auth.getUser()
        if (authData?.user?.id) {
          userId = authData.user.id
        } else {
          const { data: adminProf } = await supabase.from('perfiles').select('id').eq('rol', 'administrador').limit(1).maybeSingle()
          userId = adminProf?.id || null
        }

        let metodoDb: 'transferencia_bs' | 'pago_movil' | 'efectivo_usd' | 'efectivo_bs' | 'zelle' | 'otro' = 'transferencia_bs'
        const mLower = (metodo || '').toLowerCase()
        if (mLower.includes('movil')) metodoDb = 'pago_movil'
        else if (mLower.includes('efectivo') && moneda === 'USD') metodoDb = 'efectivo_usd'
        else if (mLower.includes('efectivo')) metodoDb = 'efectivo_bs'
        else if (mLower.includes('zelle')) metodoDb = 'zelle'
        else if (mLower.includes('transferencia')) metodoDb = 'transferencia_bs'
        else metodoDb = 'otro'

        if (userId) {
          const { data: yaExistePago } = await supabase
            .from('pagos_reportados')
            .select('id')
            .eq('apartamento_id', apartamentoId)
            .eq('referencia', refFinal || 'DIRECTO')
            .maybeSingle()

          if (!yaExistePago?.id) {
            await supabase
              .from('pagos_reportados')
              .insert({
                apartamento_id: apartamentoId,
                reportado_por: userId,
                revisado_por: userId,
                monto_usd: montoUsd > 0 ? montoUsd : null,
                monto_bs: montoBs,
                metodo: metodoDb,
                referencia: refFinal || 'DIRECTO',
                fecha_pago: fechaEfectiva,
                fecha_revision: new Date().toISOString(),
                estado: 'aprobado',
                notas_admin: `Conciliado desde Calendario por ${autorNombre || 'Administrador'}. ${mesLabel}. ${nota || ''}`.trim()
              })
          }
        }
      } catch (pErr) {
        console.warn('[calendarioDeudasService] Aviso registrando pago reportado:', pErr)
      }
    }

    // 3. Revisar si el apartamento queda completamente solvente y sincronizar deudas_mora
    const { data: recibosRestantes } = await supabase
      .from('recibos_generados')
      .select('id')
      .eq('apartamento_id', apartamentoId)
      .eq('estado', 'pendiente')

    const { data: moraRestante } = await supabase
      .from('deudas_mora')
      .select('id, monto_bs, monto_usd, estado')
      .eq('apartamento_id', apartamentoId)
      .eq('estado', 'activo')
      .maybeSingle()

    const hayPendientes = (recibosRestantes && recibosRestantes.length > 0) ||
      (moraRestante && (Number(moraRestante.monto_bs || 0) > 0.05 || Number(moraRestante.monto_usd || 0) > 0.05))

    // Si no queda nada pendiente, solventar la mora activa para sincronizar todo el sistema
    if (!hayPendientes && moraRestante?.id) {
      await supabase
        .from('deudas_mora')
        .update({ estado: 'solventado', updated_at: new Date().toISOString() })
        .eq('id', moraRestante.id)
    }

    // 4. Auditoría
    await registrarEventoAuditoria({
      tipo_accion: 'CALENDARIO_CHECKLIST_PAGO',
      titulo: `Apto ${apartamentoNumero}: Cuota ${mesLabel} editada a ${moneda === 'USD' ? `$${montoUsd}` : `Bs. ${montoBs}`}`,
      descripcion: `Monto y estado modificado directamente desde el Calendario de Deudas por ${autorNombre || 'Administrador'}. Estado: ${estado.toUpperCase()}`,
      apartamento_numero: apartamentoNumero,
      apartamento_id: apartamentoId,
      mes_afectado: mesFacturadoIso,
      monto_usd: montoUsd,
      monto_bs: montoBs,
      motivo: `Edición manual de cuota ${mesLabel}`,
      autor_nombre: autorNombre || 'Administrador'
    }).catch(() => { })

    // 5. Invalida todas las etiquetas de caché para sincronización total inmediata
    appCache.invalidateTags(['recibos', 'saldos', 'mora', 'apartamentos', 'calendario_config', 'pagos'])
    appCache.invalidatePattern(/^calendario_matriz/)

    return { success: true, error: null }
  } catch (err: unknown) {
    console.error('[calendarioDeudasService] Error guardando monto personalizado:', err)
    return { success: false, error: getErrorMessage(err) || 'Error guardando monto' }
  }
}

export interface MarcarSolventeParams {
  reciboId?: string
  apartamentoId: string
  apartamentoNumero: string
  mesFacturadoIso: string
  mesLabel: string
  nuevoEstado: 'pagado' | 'pendiente'
  montoUsd: number
  montoBs: number
  referencia?: string
  metodo?: string
  fechaPago?: string
  nota?: string
  autorNombre?: string
  autorEmail?: string
}

export async function marcarReciboSolvente(params: MarcarSolventeParams): Promise<{ success: boolean; error: string | null }> {
  return guardarMontoReciboPersonalizado({
    reciboId: params.reciboId,
    apartamentoId: params.apartamentoId,
    apartamentoNumero: params.apartamentoNumero,
    mesFacturadoIso: params.mesFacturadoIso,
    mesLabel: params.mesLabel,
    nuevoMonto: params.montoUsd > 0 ? params.montoUsd : params.montoBs,
    moneda: params.montoUsd > 0 ? 'USD' : 'BS',
    estado: params.nuevoEstado,
    referencia: params.referencia,
    metodo: params.metodo,
    fechaPago: params.fechaPago,
    nota: params.nota,
    autorNombre: params.autorNombre
  })
}

/**
 * Guarda o actualiza los conceptos históricos de un apartamento
 */
export async function guardarConceptosHistoricos(params: {
  apartamentoId: string
  apartamentoNumero: string
  deudaBase2025: number | string
  cableViajero: number | string
  guaya: number | string
  arreglo: number | string
  monedas?: {
    deudaBase2025?: 'USD' | 'BS'
    cableViajero?: 'USD' | 'BS'
    guaya?: 'USD' | 'BS'
    arreglo?: 'USD' | 'BS'
  }
  autorNombre?: string
}): Promise<{ success: boolean; error: string | null }> {
  try {
    const {
      apartamentoId,
      apartamentoNumero,
      deudaBase2025,
      cableViajero,
      guaya,
      arreglo,
      monedas,
      autorNombre
    } = params

    const mDeuda = monedas?.deudaBase2025 || 'BS'
    const mCable = monedas?.cableViajero || 'USD'
    const mGuaya = monedas?.guaya || 'USD'
    const mArreglo = monedas?.arreglo || 'BS'

    const numDeuda = parsearMontoFlexible(deudaBase2025, mDeuda)
    const numCable = parsearMontoFlexible(cableViajero, mCable)
    const numGuaya = parsearMontoFlexible(guaya, mGuaya)
    const numArreglo = parsearMontoFlexible(arreglo, mArreglo)

    let totalBs = 0
    let totalUsd = 0
    if (mDeuda === 'BS') totalBs += numDeuda; else totalUsd += numDeuda
    if (mCable === 'BS') totalBs += numCable; else totalUsd += numCable
    if (mGuaya === 'BS') totalBs += numGuaya; else totalUsd += numGuaya
    if (mArreglo === 'BS') totalBs += numArreglo; else totalUsd += numArreglo

    totalBs = Number(totalBs.toFixed(2))
    totalUsd = Number(totalUsd.toFixed(2))
    const tieneDeuda = totalBs > 0.01 || totalUsd > 0.01

    const payloadConceptos = JSON.stringify({
      deuda_2025: numDeuda,
      deuda_2025_moneda: mDeuda,
      cable_viajero: numCable,
      cable_viajero_moneda: mCable,
      guaya: numGuaya,
      guaya_moneda: mGuaya,
      arreglo: numArreglo,
      arreglo_moneda: mArreglo,
      actualizado_at: new Date().toISOString()
    })

    const { error } = await supabase
      .from('deudas_mora')
      .upsert(
        {
          apartamento_id: apartamentoId,
          meses_deuda: tieneDeuda ? 3 : 0,
          monto_bs: totalBs,
          monto_usd: totalUsd,
          moneda_principal: 'MIXTO',
          tasa_riesgo: tieneDeuda ? 'amarillo' : 'azul',
          accion_legal: 'notificacion_amistosa',
          estado: tieneDeuda ? 'activo' : 'solventado',
          conceptos_detalle: payloadConceptos,
          observaciones: `Conceptos históricos al 2025 para Apto ${apartamentoNumero} actualizados por ${autorNombre || 'Administrador'}.`,
          fecha_corte: getHoyVE(),
          updated_at: new Date().toISOString()
        },
        { onConflict: 'apartamento_id' }
      )

    if (error) throw error

    appCache.invalidateTags(['mora', 'saldos', 'apartamentos'])

    return { success: true, error: null }
  } catch (err: unknown) {
    console.error('[calendarioDeudasService] Error guardando histórico:', err)
    return { success: false, error: getErrorMessage(err) || 'Error guardando datos históricos' }
  }
}

/**
 * Guarda o actualiza una Fila de Cuota Especial
 */
export async function guardarFilaCuotaEspecial(
  cuota: FilaCuotaEspecial
): Promise<{ success: boolean; error: string | null }> {
  try {
    const config = await obtenerConfiguracionCalendario()
    if (!config.filasCuotasEspeciales) {
      config.filasCuotasEspeciales = []
    }
    const existeIndex = config.filasCuotasEspeciales.findIndex(f => f.id === cuota.id)

    if (existeIndex >= 0) {
      config.filasCuotasEspeciales[existeIndex] = cuota
    } else {
      config.filasCuotasEspeciales.push(cuota)
    }

    await guardarConfiguracionCalendario(config)
    return { success: true, error: null }
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) || 'Error guardando cuota especial' }
  }
}

/**
 * Elimina una Fila de Cuota Especial
 */
export async function eliminarFilaCuotaEspecial(
  cuotaId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const config = await obtenerConfiguracionCalendario()
    config.filasCuotasEspeciales = (config.filasCuotasEspeciales || []).filter(f => f.id !== cuotaId)
    await guardarConfiguracionCalendario(config)
    return { success: true, error: null }
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) || 'Error eliminando cuota especial' }
  }
}

/**
 * Guarda el valor (monto y estado) de una celda para una columna personalizada
 */
export async function guardarCeldaPersonalizada(params: {
  filaId: string
  columnaId: string
  monto: number | string
  estado: 'pendiente' | 'pagado'
  moneda?: 'USD' | 'BS'
  anio?: number
  apartamentoNumero?: string
  autorNombre?: string
  referencia?: string
  sincronizarReporte?: boolean
}): Promise<{ success: boolean; error: string | null }> {
  try {
    const anio = params.anio || 2026
    const config = await obtenerConfiguracionCalendario(anio)
    if (!config.valoresCeldasPersonalizadas) config.valoresCeldasPersonalizadas = {}
    if (!config.valoresCeldasPersonalizadas[params.filaId]) {
      config.valoresCeldasPersonalizadas[params.filaId] = {}
    }
    const colMeta = (config.columnas || []).find(c => c.id === params.columnaId)
    const monedaFinal = params.moneda || colMeta?.moneda || 'USD'
    const montoNum = parsearMontoFlexible(params.monto, monedaFinal)
    const prev = config.valoresCeldasPersonalizadas[params.filaId][params.columnaId]
    const hoyIsoCell = obtenerFechaHoyLocalIso()
    const esFuturaCol = Boolean(colMeta?.fechaEmision && clasificarCuotaExtraordinaria(colMeta.fechaEmision, colMeta.fechaLimite, hoyIsoCell) === 'programada')
    const montoOrig = Number(prev?.montoOriginal ?? colMeta?.montoDefecto ?? montoNum)

    config.valoresCeldasPersonalizadas[params.filaId][params.columnaId] = {
      monto: montoNum,
      estado: params.estado,
      moneda: monedaFinal,
      ...(montoOrig > 0 ? { montoOriginal: montoOrig } : {}),
      ...(params.estado === 'pagado'
        ? {
          abonado: Math.max(Number(prev?.abonado || 0), montoOrig || montoNum),
          pagadoPorAdelantado: Boolean(prev?.pagadoPorAdelantado || esFuturaCol),
          ultimaFechaAbono: hoyIsoCell
        }
        : (prev?.abonado ? { abonado: prev.abonado } : {}))
    }

    await guardarConfiguracionCalendario(config, anio)

    // Sincronizar con pagos_reportados si corresponde y la fila corresponde a un UUID de apartamento
    const esAptoUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(params.filaId)
    if (esAptoUuid && params.sincronizarReporte !== false) {
      const campanaKey = `cuota_esp_${anio}_${params.columnaId}_${params.filaId}`
      try {
        const { data: existentes } = await supabase
          .from('pagos_reportados')
          .select('id, notas_admin')
          .eq('apartamento_id', params.filaId)

        const autoRows = (existentes || []).filter(r => {
          const n = String(r.notas_admin || '')
          return n.includes(`"campanaIdUnico":"${campanaKey}"`) && n.includes('"origenAdmin":true')
        })

        if (params.estado === 'pagado' && montoNum > 0.01) {
          let tasa = getTasaBcvNumerica()
          try {
            const { data: edCfg } = await supabase.from('configuracion_edificio').select('tasa_bcv_actual').limit(1).maybeSingle()
            if (edCfg?.tasa_bcv_actual && Number(edCfg.tasa_bcv_actual) > 1) tasa = Number(edCfg.tasa_bcv_actual)
          } catch (err) { logger.debug('calendarioDeudasService', 'Fallback controlado', err) }
          const montoBs = monedaFinal === 'BS' ? montoNum : Number((montoNum * tasa).toFixed(2))
          const montoUsd = monedaFinal === 'USD' ? montoNum : Number((montoNum / tasa).toFixed(2))
          const ref = (params.referencia || '').trim() || `CUOTA-${anio}-${params.columnaId.slice(-6).toUpperCase()}`
          const meta: PagoDomusMeta = {
            tipoServicio: 'condominio',
            origenAdmin: true,
            campanaIdUnico: campanaKey,
            condominioMontoBs: montoBs,
            condominioMontoUsd: montoUsd,
            cuotasEspeciales: [{
              columnaId: params.columnaId,
              titulo: colMeta?.titulo || 'Cuota Extraordinaria',
              anio,
              monto: montoNum,
              moneda: monedaFinal
            }]
          }
          const notas = encodePagoMeta(
            `Cuota Extraordinaria: ${colMeta?.titulo || 'Cuota Especial'} (${anio}) · Liquidada por ${params.autorNombre || 'Administración'}`,
            meta
          )
          if (autoRows.length > 0) {
            await supabase.from('pagos_reportados').update({
              monto_bs: montoBs,
              monto_usd: montoUsd,
              referencia: ref,
              estado: 'aprobado',
              fecha_pago: getHoyVE(),
              notas_admin: notas
            }).eq('id', autoRows[0].id)
          } else {
            await supabase.from('pagos_reportados').insert({
              apartamento_id: params.filaId,
              monto_bs: montoBs,
              monto_usd: montoUsd,
              referencia: ref,
              metodo: 'otro',
              estado: 'aprobado',
              fecha_pago: getHoyVE(),
              notas_admin: notas
            })
          }
        } else if (params.estado === 'pendiente' && autoRows.length > 0) {
          await supabase.from('pagos_reportados').delete().in('id', autoRows.map(a => a.id))
        }
      } catch (syncErr) {
        console.warn('[calendarioDeudasService] Aviso sincronizando cuota especial en pagos_reportados:', syncErr)
      }
    }

    appCache.invalidateTags(['calendario_config', 'mora', 'saldos', 'recibos', 'pagos'])
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('condominio_cuotas_updated'))
    }
    return { success: true, error: null }
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) || 'Error guardando celda' }
  }
}

/**
 * Aplica en un solo guardado atómico un monto/estado de cuota especial para todos o varios apartamentos
 * (evita el problema N+1 de múltiples escrituras secuenciales).
 */
export async function guardarCeldaPersonalizadaMasiva(params: {
  columnaId: string
  monto: number | string
  estado: 'pendiente' | 'pagado'
  moneda?: 'USD' | 'BS'
  anio?: number
  apartamentosIds?: string[]
}): Promise<{ success: boolean; afectados: number; error: string | null }> {
  try {
    const anio = params.anio || 2026
    const config = await obtenerConfiguracionCalendario(anio)
    const colMeta = (config.columnas || []).find(c => c.id === params.columnaId)
    const monedaFinal = params.moneda || colMeta?.moneda || 'USD'
    const montoNum = parsearMontoFlexible(params.monto, monedaFinal)

    let targetIds = params.apartamentosIds
    if (!targetIds || targetIds.length === 0) {
      const { data: aptos } = await supabase.from('apartamentos').select('id')
      targetIds = (aptos || []).map(a => a.id)
    }

    if (!config.valoresCeldasPersonalizadas) config.valoresCeldasPersonalizadas = {}
    targetIds.forEach(aid => {
      if (!config.valoresCeldasPersonalizadas[aid]) config.valoresCeldasPersonalizadas[aid] = {}
      config.valoresCeldasPersonalizadas[aid][params.columnaId] = {
        monto: montoNum,
        estado: params.estado,
        moneda: monedaFinal
      } as any
    })

    await guardarConfiguracionCalendario(config, anio)
    appCache.invalidateTags(['calendario_config', 'mora', 'saldos', 'recibos', 'pagos'])
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('condominio_cuotas_updated'))
    }
    return { success: true, afectados: targetIds.length, error: null }
  } catch (err: unknown) {
    return { success: false, afectados: 0, error: getErrorMessage(err) || 'Error guardando celdas masivamente' }
  }
}

export type PosicionInsercionColumna =
  | { tipo: 'inicio_naranja' }
  | { tipo: 'fin_naranja' }
  | { tipo: 'inicio_azul' }
  | { tipo: 'fin_azul' }
  | { tipo: 'despues_de'; colIdReferencia: string }
  | { tipo: 'antes_de'; colIdReferencia: string }

/**
 * Agrega una columna personalizada (Cuota Extraoficial / Especial) en la posición exacta indicada
 */
export async function agregarColumnaPersonalizada(params: {
  titulo: string
  descripcion?: string
  seccion: 'naranja' | 'azul'
  moneda: 'USD' | 'BS'
  montoDefecto?: number | string
  fechaEmision?: string
  fechaLimite?: string
  posicion: PosicionInsercionColumna
  aplicarATodos?: boolean
  apartamentosIds?: string[]
  anio?: number
}): Promise<{ success: boolean; nuevaColumna: ColumnaCalendarioConfig | null; error: string | null }> {
  try {
    const anio = params.anio || 2026
    const config = await obtenerConfiguracionCalendario(anio)
    const cols = [...(config.columnas || obtenerColumnasPorDefecto(anio))]
    const pos = params.posicion

    let seccionEfectiva: 'naranja' | 'azul' = params.seccion
    if (pos.tipo === 'inicio_naranja' || pos.tipo === 'fin_naranja') {
      seccionEfectiva = 'naranja'
    } else if (pos.tipo === 'inicio_azul' || pos.tipo === 'fin_azul') {
      seccionEfectiva = 'azul'
    } else if ((pos.tipo === 'despues_de' || pos.tipo === 'antes_de') && pos.colIdReferencia) {
      const refCol = cols.find(c => c.id === pos.colIdReferencia)
      if (refCol) seccionEfectiva = refCol.seccion
    }

    const id = `cuota_col_${Date.now()}`
    const montoLimpio = parsearMontoFlexible(params.montoDefecto, params.moneda)
    const nuevaCol: ColumnaCalendarioConfig = {
      id,
      titulo: params.titulo.trim(),
      ...(params.descripcion?.trim() ? { descripcion: params.descripcion.trim() } : {}),
      seccion: seccionEfectiva,
      moneda: params.moneda,
      tipo: 'cuota_especial',
      esPersonalizada: true,
      montoDefecto: montoLimpio,
      ...(params.fechaEmision ? { fechaEmision: params.fechaEmision } : {}),
      ...(params.fechaLimite ? { fechaLimite: params.fechaLimite } : {}),
      creadaEn: new Date().toISOString(),
      orden: 999
    }

    if (pos.tipo === 'inicio_naranja') {
      const idxPrimerNaranja = cols.findIndex(c => c.seccion === 'naranja')
      if (idxPrimerNaranja >= 0) cols.splice(idxPrimerNaranja, 0, nuevaCol)
      else cols.unshift(nuevaCol)
    } else if (pos.tipo === 'fin_naranja') {
      let idxUltimoNaranja = -1
      for (let i = cols.length - 1; i >= 0; i--) {
        if (cols[i].seccion === 'naranja') {
          idxUltimoNaranja = i
          break
        }
      }
      if (idxUltimoNaranja >= 0) cols.splice(idxUltimoNaranja + 1, 0, nuevaCol)
      else cols.push(nuevaCol)
    } else if (pos.tipo === 'inicio_azul') {
      const idxPrimerAzul = cols.findIndex(c => c.seccion === 'azul')
      if (idxPrimerAzul >= 0) cols.splice(idxPrimerAzul, 0, nuevaCol)
      else cols.push(nuevaCol)
    } else if (pos.tipo === 'fin_azul') {
      cols.push(nuevaCol)
    } else if (pos.tipo === 'despues_de' && pos.colIdReferencia) {
      const idx = cols.findIndex(c => c.id === pos.colIdReferencia)
      if (idx >= 0) cols.splice(idx + 1, 0, nuevaCol)
      else cols.push(nuevaCol)
    } else if (pos.tipo === 'antes_de' && pos.colIdReferencia) {
      const idx = cols.findIndex(c => c.id === pos.colIdReferencia)
      if (idx >= 0) cols.splice(idx, 0, nuevaCol)
      else cols.unshift(nuevaCol)
    } else {
      cols.push(nuevaCol)
    }

    // Normalizar números de orden
    cols.forEach((c, idx) => { c.orden = idx + 1 })
    config.columnas = cols

    // Poblar valores a todos o a los apartamentos seleccionados
    if (montoLimpio > 0) {
      if (!config.valoresCeldasPersonalizadas) config.valoresCeldasPersonalizadas = {}
      let targets: string[] = []
      if (params.apartamentosIds && params.apartamentosIds.length > 0) {
        targets = params.apartamentosIds
      } else if (params.aplicarATodos) {
        const { data: aptos } = await supabase.from('apartamentos').select('id')
        targets = (aptos || []).map(a => a.id)
      }

      targets.forEach(aid => {
        if (!config.valoresCeldasPersonalizadas[aid]) config.valoresCeldasPersonalizadas[aid] = {}
        config.valoresCeldasPersonalizadas[aid][id] = {
          monto: montoLimpio,
          estado: 'pendiente',
          moneda: params.moneda
        } as any
      })
    }

    await guardarConfiguracionCalendario(config, anio)
    appCache.invalidateTags(['calendario_config', 'mora', 'saldos', 'recibos', 'pagos'])
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('condominio_cuotas_updated'))
    }
    return { success: true, nuevaColumna: nuevaCol, error: null }
  } catch (err: unknown) {
    return { success: false, nuevaColumna: null, error: getErrorMessage(err) || 'Error agregando columna' }
  }
}

/**
 * Edita una Cuota Extraoficial / Especial existente (título, descripción, fechas, monto y alcance),
 * preservando intactos los apartamentos que ya pagaron.
 */
export async function editarColumnaPersonalizada(params: {
  colId: string
  titulo: string
  descripcion?: string
  seccion?: 'naranja' | 'azul'
  moneda: 'USD' | 'BS'
  montoDefecto?: number | string
  fechaEmision?: string
  fechaLimite?: string
  aplicarATodos?: boolean
  apartamentosIds?: string[]
  actualizarPendientes?: boolean
  anio?: number
  nuevoAnio?: number
}): Promise<{ success: boolean; error: string | null }> {
  try {
    const anio = params.anio || 2026
    const anioDestino = params.nuevoAnio || anio
    const config = await obtenerConfiguracionCalendario(anio)
    const cols = [...(config.columnas || obtenerColumnasPorDefecto(anio))]
    const idx = cols.findIndex(c => c.id === params.colId)
    if (idx === -1) return { success: false, error: 'Cuota extraordinaria no encontrada' }

    const montoLimpio = parsearMontoFlexible(params.montoDefecto, params.moneda)
    const colActualizada: ColumnaCalendarioConfig = {
      ...cols[idx],
      titulo: params.titulo.trim(),
      descripcion: params.descripcion?.trim() || undefined,
      ...(params.seccion ? { seccion: params.seccion } : {}),
      moneda: params.moneda,
      montoDefecto: montoLimpio,
      fechaEmision: params.fechaEmision || undefined,
      fechaLimite: params.fechaLimite || undefined
    }

    let configTarget = config
    let targetAnio = anio

    if (anioDestino !== anio) {
      // Mover columna y sus valores desde `anio` hacia `anioDestino` preservando pagados/pendientes
      cols.splice(idx, 1)
      cols.forEach((c, i) => { c.orden = i + 1 })
      config.columnas = cols

      const valoresTransferidos: Record<string, any> = {}
      if (config.valoresCeldasPersonalizadas) {
        Object.keys(config.valoresCeldasPersonalizadas).forEach(aid => {
          const val = config.valoresCeldasPersonalizadas[aid]?.[params.colId]
          if (val !== undefined) {
            valoresTransferidos[aid] = val
            delete config.valoresCeldasPersonalizadas[aid][params.colId]
          }
        })
      }
      await guardarConfiguracionCalendario(config, anio)

      const configDest = await obtenerConfiguracionCalendario(anioDestino)
      const colsDest = [...(configDest.columnas || obtenerColumnasPorDefecto(anioDestino))]
      if (colActualizada.seccion === 'naranja') {
        let idxUltNaranja = -1
        for (let i = colsDest.length - 1; i >= 0; i--) {
          if (colsDest[i].seccion === 'naranja') {
            idxUltNaranja = i
            break
          }
        }
        if (idxUltNaranja >= 0) colsDest.splice(idxUltNaranja + 1, 0, colActualizada)
        else colsDest.unshift(colActualizada)
      } else {
        colsDest.push(colActualizada)
      }
      colsDest.forEach((c, i) => { c.orden = i + 1 })
      configDest.columnas = colsDest

      if (!configDest.valoresCeldasPersonalizadas) configDest.valoresCeldasPersonalizadas = {}
      Object.entries(valoresTransferidos).forEach(([aid, val]) => {
        if (!configDest.valoresCeldasPersonalizadas[aid]) configDest.valoresCeldasPersonalizadas[aid] = {}
        configDest.valoresCeldasPersonalizadas[aid][params.colId] = val
      })

      configTarget = configDest
      targetAnio = anioDestino
    } else {
      cols[idx] = colActualizada
      config.columnas = cols
    }

    // Si se solicita reasignar / actualizar montos pendientes
    if (params.actualizarPendientes && montoLimpio >= 0) {
      if (!configTarget.valoresCeldasPersonalizadas) configTarget.valoresCeldasPersonalizadas = {}
      let targets: string[] = []
      if (params.apartamentosIds && params.apartamentosIds.length > 0) {
        targets = params.apartamentosIds
      } else if (params.aplicarATodos) {
        const { data: aptos } = await supabase.from('apartamentos').select('id')
        targets = (aptos || []).map(a => a.id)
      }

      if (targets.length > 0) {
        const targetSet = new Set(targets)
        // Limpiar pendientes de apartamentos ya no seleccionados
        Object.keys(configTarget.valoresCeldasPersonalizadas).forEach(aid => {
          const val = configTarget.valoresCeldasPersonalizadas[aid]?.[params.colId]
          if (val && val.estado === 'pendiente' && !targetSet.has(aid)) {
            delete configTarget.valoresCeldasPersonalizadas[aid][params.colId]
          }
        })
        // Asignar o actualizar pendientes en los seleccionados (respetando los ya pagados)
        targets.forEach(aid => {
          if (!configTarget.valoresCeldasPersonalizadas[aid]) configTarget.valoresCeldasPersonalizadas[aid] = {}
          const prev = configTarget.valoresCeldasPersonalizadas[aid][params.colId]
          if (!prev || prev.estado !== 'pagado') {
            configTarget.valoresCeldasPersonalizadas[aid][params.colId] = {
              monto: montoLimpio,
              estado: montoLimpio > 0 ? 'pendiente' : 'pagado',
              moneda: params.moneda
            } as any
          }
        })
      }
    }

    await guardarConfiguracionCalendario(configTarget, targetAnio)
    appCache.invalidateTags(['calendario_config', 'mora', 'saldos', 'recibos', 'pagos'])
    appCache.invalidatePattern(/^calendario_matriz/)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('condominio_cuotas_updated'))
    }
    return { success: true, error: null }
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) || 'Error editando cuota extraordinaria' }
  }
}

/**
 * Liquida cuotas extraoficiales / especiales seleccionadas al aprobar un pago reportado desde Reportes de Pago.
 * Devuelve exactamente cuánto monto en Bs/USD fue absorbido por cuotas especiales para evitar doble abono.
 */
export async function liquidarCuotasEspecialesDesdePago(params: {
  apartamentoId: string
  pagoReportadoId?: string
  cuotasEspeciales: Array<{
    columnaId: string
    anio: number
    monto: number
    moneda: 'USD' | 'BS'
    esAdelantado?: boolean
    fechaEmision?: string
    montoOriginal?: number
  }>
  montoDisponibleBs: number
  montoDisponibleUsd: number
  tasaBcv: number
  esAdelantado?: boolean
  fechaPago?: string
}): Promise<{ liquidadoBs: number; liquidadoUsd: number; error?: string | null }> {
  try {
    if (!params.apartamentoId || !params.cuotasEspeciales?.length) {
      return { liquidadoBs: 0, liquidadoUsd: 0, error: null }
    }

    const tasa = getTasaBcvNumerica(params.tasaBcv)
    const hoyIso = obtenerFechaHoyLocalIso()
    const fechaAbono = (params.fechaPago || hoyIso).slice(0, 10)
    let budgetBs = Number(params.montoDisponibleBs || 0)
    let budgetUsd = Number(params.montoDisponibleUsd || 0)
    if (budgetBs <= 0 && budgetUsd > 0) budgetBs = Number((budgetUsd * tasa).toFixed(2))
    if (budgetUsd <= 0 && budgetBs > 0 && tasa > 0) budgetUsd = Number((budgetBs / tasa).toFixed(2))

    let liquidadoBs = 0
    let liquidadoUsd = 0

    // Agrupar por año para minimizar lecturas/escrituras
    const porAnio = new Map<number, typeof params.cuotasEspeciales>()
    params.cuotasEspeciales.forEach(c => {
      const a = Number(c.anio) || 2026
      const arr = porAnio.get(a) || []
      arr.push(c)
      porAnio.set(a, arr)
    })

    for (const [anio, lista] of porAnio.entries()) {
      const config = await obtenerConfiguracionCalendario(anio)
      if (!config.valoresCeldasPersonalizadas) config.valoresCeldasPersonalizadas = {}
      if (!config.valoresCeldasPersonalizadas[params.apartamentoId]) {
        config.valoresCeldasPersonalizadas[params.apartamentoId] = {}
      }

      let huboCambio = false
      for (const item of lista) {
        if (budgetBs <= 0.01 && budgetUsd <= 0.01) break
        const col = (config.columnas || []).find(c => c.id === item.columnaId)
        const celdaActual: any = config.valoresCeldasPersonalizadas[params.apartamentoId][item.columnaId]
        const pagosPreviosIds: string[] = Array.isArray(celdaActual?.pagosAplicadosIds) ? celdaActual.pagosAplicadosIds : []
        if (params.pagoReportadoId && pagosPreviosIds.includes(params.pagoReportadoId)) {
          continue
        }
        const montoActual = Number(celdaActual?.monto ?? col?.montoDefecto ?? item.monto ?? 0)
        const estadoActual = celdaActual?.estado || 'pendiente'
        if (estadoActual === 'pagado' || montoActual <= 0.01) continue

        const mon = celdaActual?.moneda || item.moneda || col?.moneda || 'USD'
        const montoOriginal = Number(celdaActual?.montoOriginal ?? item.montoOriginal ?? col?.montoDefecto ?? montoActual)
        const abonadoPrevio = Number(celdaActual?.abonado || 0)
        const esAdelantadoEfectivo = Boolean(
          item.esAdelantado ||
          params.esAdelantado ||
          (col?.fechaEmision && clasificarCuotaExtraordinaria(col.fechaEmision, col.fechaLimite, hoyIso) === 'programada')
        )
        const nextPagosIds = params.pagoReportadoId ? [...pagosPreviosIds, params.pagoReportadoId] : pagosPreviosIds

        const deudaBs = mon === 'BS' ? montoActual : Number((montoActual * tasa).toFixed(2))
        const deudaUsd = mon === 'USD' ? montoActual : Number((montoActual / tasa).toFixed(2))

        const cubre = mon === 'USD' ? (budgetUsd + 0.05 >= deudaUsd) : (budgetBs + 0.05 >= deudaBs)
        if (cubre) {
          config.valoresCeldasPersonalizadas[params.apartamentoId][item.columnaId] = {
            monto: montoOriginal,
            estado: 'pagado',
            moneda: mon,
            montoOriginal,
            abonado: montoOriginal,
            pagadoPorAdelantado: Boolean(celdaActual?.pagadoPorAdelantado || esAdelantadoEfectivo),
            ultimaFechaAbono: fechaAbono,
            ...(nextPagosIds.length > 0 ? { pagosAplicadosIds: nextPagosIds } : {})
          } as any
          budgetBs = Math.max(0, Number((budgetBs - deudaBs).toFixed(2)))
          budgetUsd = Math.max(0, Number((budgetUsd - deudaUsd).toFixed(2)))
          liquidadoBs += Math.min(deudaBs, Number(params.montoDisponibleBs || deudaBs))
          liquidadoUsd += Math.min(deudaUsd, Number(params.montoDisponibleUsd || deudaUsd))
          huboCambio = true
        } else {
          // Abono parcial sobre la cuota extraordinaria (vigente o adelantada futura)
          const abonoMon = mon === 'USD' ? budgetUsd : budgetBs
          const restante = Math.max(0, Number((montoActual - abonoMon).toFixed(2)))
          const nuevoAbonado = Number(Math.min(montoOriginal, abonadoPrevio + abonoMon).toFixed(2))
          const saldado = restante <= 0.05
          config.valoresCeldasPersonalizadas[params.apartamentoId][item.columnaId] = {
            monto: saldado ? montoOriginal : restante,
            estado: saldado ? 'pagado' : 'pendiente',
            moneda: mon,
            montoOriginal,
            abonado: saldado ? montoOriginal : nuevoAbonado,
            pagadoPorAdelantado: Boolean(celdaActual?.pagadoPorAdelantado || esAdelantadoEfectivo),
            ultimaFechaAbono: fechaAbono,
            ...(nextPagosIds.length > 0 ? { pagosAplicadosIds: nextPagosIds } : {})
          } as any
          liquidadoBs += budgetBs
          liquidadoUsd += budgetUsd
          budgetBs = 0
          budgetUsd = 0
          huboCambio = true
        }
      }

      if (huboCambio) {
        await guardarConfiguracionCalendario(config, anio)
      }
    }

    if (liquidadoBs > 0 || liquidadoUsd > 0) {
      appCache.invalidateTags(['calendario_config', 'mora', 'saldos', 'recibos', 'pagos'])
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('condominio_cuotas_updated'))
      }
    }

    return {
      liquidadoBs: Number(liquidadoBs.toFixed(2)),
      liquidadoUsd: Number(liquidadoUsd.toFixed(2)),
      error: null
    }
  } catch (err: unknown) {
    console.error('[calendarioDeudasService] Error liquidando cuotas especiales:', err)
    return { liquidadoBs: 0, liquidadoUsd: 0, error: getErrorMessage(err) }
  }
}

/**
 * Construye automáticamente los eventos y recordatorios del calendario (Emisión y Fecha Límite)
 * a partir de todas las Cuotas Extraoficiales configuradas en el sistema.
 */
export async function obtenerEventosCalendarioCuotas(anioFilter?: number): Promise<EventoCalendarioCuota[]> {
  try {
    const [{ data: configRows }, { data: aptosDb }] = await Promise.all([
      supabase
        .from('casos_comunidad')
        .select('tipo, descripcion')
        .like('tipo', 'config_calendario_mora%'),
      supabase.from('apartamentos').select('id')
    ])

    const totalAptos = (aptosDb || []).length
    const hoyIso = getHoyVE()
    const eventos: EventoCalendarioCuota[] = []

    const calcularEstado = (fecha: string, pendientes: number, asignados: number): EventoCalendarioCuota['estado'] => {
      if (asignados > 0 && pendientes === 0) return 'completado'
      if (fecha === hoyIso) return 'hoy'
      if (fecha < hoyIso) return 'vencido'
      return 'proximo'
    }

      ; (configRows || []).forEach(row => {
        if (!row?.descripcion) return
        let cfg: any = null
        try { cfg = JSON.parse(row.descripcion) } catch (err) { logger.debug('calendarioDeudasService', 'Fallback controlado', err) }
        if (!cfg || !Array.isArray(cfg.columnas)) return

        const matchAnio = String(row.tipo || '').match(/config_calendario_mora_(\d{4})/)
        const anio = matchAnio ? Number(matchAnio[1]) : 2026
        if (anioFilter && anio !== anioFilter) return

        const valoresCeldas = cfg.valoresCeldasPersonalizadas || {}
        cfg.columnas.forEach((col: ColumnaCalendarioConfig) => {
          if (col.tipo !== 'cuota_especial') return
          if (!col.fechaEmision && !col.fechaLimite) return

          let asignados = 0
          let pendientes = 0
          let pagados = 0
            ; (aptosDb || []).forEach(a => {
              const val = valoresCeldas[a.id]?.[col.id] ?? (col.montoDefecto ? { monto: col.montoDefecto, estado: 'pendiente' } : null)
              if (val && Number(val.monto || 0) > 0) {
                asignados++
                if (val.estado === 'pagado') pagados++
                else pendientes++
              }
            })

          if (col.fechaEmision) {
            eventos.push({
              id: `ev_em_${anio}_${col.id}`,
              columnaId: col.id,
              anio,
              titulo: col.titulo,
              descripcion: col.descripcion,
              tipoEvento: 'emision',
              fecha: col.fechaEmision,
              moneda: col.moneda,
              montoDefecto: Number(col.montoDefecto || 0),
              totalAptosAsignados: asignados || totalAptos,
              totalAptosPendientes: pendientes,
              totalAptosPagados: pagados,
              estado: calcularEstado(col.fechaEmision, pendientes, asignados)
            })
          }

          if (col.fechaLimite) {
            eventos.push({
              id: `ev_lim_${anio}_${col.id}`,
              columnaId: col.id,
              anio,
              titulo: col.titulo,
              descripcion: col.descripcion,
              tipoEvento: 'vencimiento',
              fecha: col.fechaLimite,
              moneda: col.moneda,
              montoDefecto: Number(col.montoDefecto || 0),
              totalAptosAsignados: asignados || totalAptos,
              totalAptosPendientes: pendientes,
              totalAptosPagados: pagados,
              estado: calcularEstado(col.fechaLimite, pendientes, asignados)
            })
          }
        })
      })

    eventos.sort((a, b) => a.fecha.localeCompare(b.fecha))
    return eventos
  } catch (err) {
    console.warn('[calendarioDeudasService] Error obteniendo eventos de cuotas:', err)
    return []
  }
}

/**
 * Cambia una columna entre la sección Naranja (Deudas pasadas / extraordinarios) y la sección Azul (Calendario)
 */
export async function cambiarSeccionColumna(
  colId: string,
  nuevaSeccion: 'naranja' | 'azul',
  anio: number = 2026
): Promise<{ success: boolean; error: string | null }> {
  try {
    const config = await obtenerConfiguracionCalendario(anio)
    const cols = [...(config.columnas || obtenerColumnasPorDefecto(anio))]
    const idx = cols.findIndex(c => c.id === colId)
    if (idx === -1) return { success: false, error: 'Columna no encontrada' }

    const col = cols[idx]
    col.seccion = nuevaSeccion

    cols.forEach((c, i) => { c.orden = i + 1 })
    config.columnas = cols

    await guardarConfiguracionCalendario(config, anio)
    return { success: true, error: null }
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) || 'Error cambiando sección de columna' }
  }
}

/**
 * Cambia la moneda de una columna ('USD' o 'BS')
 */
export async function cambiarMonedaColumna(
  colId: string,
  nuevaMoneda: 'USD' | 'BS',
  anio: number = 2026
): Promise<{ success: boolean; error: string | null }> {
  try {
    const config = await obtenerConfiguracionCalendario(anio)
    const cols = [...(config.columnas || obtenerColumnasPorDefecto(anio))]
    const idx = cols.findIndex(c => c.id === colId)
    if (idx === -1) return { success: false, error: 'Columna no encontrada' }

    cols[idx].moneda = nuevaMoneda
    config.columnas = cols

    await guardarConfiguracionCalendario(config, anio)
    appCache.invalidateTags(['calendario_config', 'mora', `calendario_${anio}`])
    return { success: true, error: null }
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) || 'Error cambiando moneda de columna' }
  }
}

/**
 * Mueve una columna hacia la izquierda o derecha en el orden de visualización
 */
export async function moverColumnaPosicion(
  colId: string,
  direccion: 'izquierda' | 'derecha',
  anio: number = 2026
): Promise<{ success: boolean; error: string | null }> {
  try {
    const config = await obtenerConfiguracionCalendario(anio)
    const cols = [...(config.columnas || obtenerColumnasPorDefecto(anio))]
    const idx = cols.findIndex(c => c.id === colId)
    if (idx === -1) return { success: false, error: 'Columna no encontrada' }

    const targetIdx = direccion === 'izquierda' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= cols.length) {
      return { success: true, error: null }
    }

    const temp = cols[idx]
    cols[idx] = cols[targetIdx]
    cols[targetIdx] = temp

    cols.forEach((c, i) => { c.orden = i + 1 })
    config.columnas = cols

    await guardarConfiguracionCalendario(config, anio)
    return { success: true, error: null }
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) || 'Error moviendo columna' }
  }
}

/**
 * Elimina una columna del calendario
 */
export async function eliminarColumna(colId: string, anio: number = 2026): Promise<{ success: boolean; error: string | null }> {
  try {
    const config = await obtenerConfiguracionCalendario(anio)
    config.columnas = (config.columnas || obtenerColumnasPorDefecto(anio)).filter(c => c.id !== colId)
    config.columnas.forEach((c, i) => { c.orden = i + 1 })
    await guardarConfiguracionCalendario(config, anio)
    return { success: true, error: null }
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) || 'Error eliminando columna' }
  }
}

/**
 * Restablece las columnas a su configuración por defecto
 */
export async function restablecerColumnasPorDefecto(anio: number = 2026): Promise<{ success: boolean; error: string | null }> {
  try {
    const config = await obtenerConfiguracionCalendario(anio)
    config.columnas = obtenerColumnasPorDefecto(anio)
    await guardarConfiguracionCalendario(config, anio)
    return { success: true, error: null }
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) || 'Error restableciendo columnas' }
  }
}

/**
 * Edita propiedades de una columna (título, moneda, monto por defecto)
 */
export async function editarColumna(params: {
  id: string
  titulo?: string
  moneda?: 'USD' | 'BS'
  montoDefecto?: number
  anio?: number
}): Promise<{ success: boolean; error: string | null }> {
  try {
    const anio = params.anio || 2026
    const config = await obtenerConfiguracionCalendario(anio)
    const cols = [...(config.columnas || obtenerColumnasPorDefecto(anio))]
    const idx = cols.findIndex(c => c.id === params.id)
    if (idx === -1) return { success: false, error: 'Columna no encontrada' }

    if (params.titulo !== undefined) cols[idx].titulo = params.titulo.trim()
    if (params.moneda !== undefined) cols[idx].moneda = params.moneda
    if (params.montoDefecto !== undefined) cols[idx].montoDefecto = Number(params.montoDefecto)

    config.columnas = cols
    await guardarConfiguracionCalendario(config, anio)
    return { success: true, error: null }
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) || 'Error editando columna' }
  }
}

/**
 * Agrega una fila personalizada al calendario (ej: Locales, Conserjería, Depósitos)
 */
export async function agregarFilaPersonalizada(params: {
  numero: string
  propietario?: string
  alicuota?: number
  anio?: number
}): Promise<{ success: boolean; fila: FilaPersonalizadaConfig | null; error: string | null }> {
  try {
    const anio = params.anio || 2026
    const config = await obtenerConfiguracionCalendario(anio)
    const nuevaFila: FilaPersonalizadaConfig = {
      id: `fila_${Date.now()}`,
      numero: params.numero.trim(),
      propietario: params.propietario?.trim() || 'Fila Personalizada',
      alicuota: Number(params.alicuota || 0.0159)
    }
    if (!config.filasPersonalizadas) config.filasPersonalizadas = []
    config.filasPersonalizadas.push(nuevaFila)
    await guardarConfiguracionCalendario(config, anio)
    return { success: true, fila: nuevaFila, error: null }
  } catch (err: unknown) {
    return { success: false, fila: null, error: getErrorMessage(err) || 'Error agregando fila' }
  }
}

/**
 * Oculta o elimina una fila del calendario a gusto del administrador
 */
export async function ocultarOEliminarFila(filaId: string, anio: number = 2026): Promise<{ success: boolean; error: string | null }> {
  try {
    const config = await obtenerConfiguracionCalendario(anio)
    if (config.filasPersonalizadas?.some(f => f.id === filaId)) {
      config.filasPersonalizadas = config.filasPersonalizadas.filter(f => f.id !== filaId)
    } else {
      if (!config.filasOcultasIds) config.filasOcultasIds = []
      if (!config.filasOcultasIds.includes(filaId)) {
        config.filasOcultasIds.push(filaId)
      }
    }
    await guardarConfiguracionCalendario(config, anio)
    return { success: true, error: null }
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) || 'Error ocultando fila' }
  }
}

/**
 * Restaura una fila oculta para que vuelva a ser visible en el calendario
 */
export async function restaurarFilaOculta(filaId: string, anio: number = 2026): Promise<{ success: boolean; error: string | null }> {
  try {
    const config = await obtenerConfiguracionCalendario(anio)
    if (!config.filasOcultasIds) config.filasOcultasIds = []
    config.filasOcultasIds = config.filasOcultasIds.filter(id => id !== filaId)
    await guardarConfiguracionCalendario(config, anio)
    return { success: true, error: null }
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) || 'Error restaurando fila' }
  }
}

/**
 * Datos semilla extraídos directamente del Excel original del edificio
 */
export const DATOS_EXCEL_ORIGINAL: Record<string, {
  deuda_2025?: number
  cable_viajero?: number
  guaya?: number
  arreglo?: number
  enero_bs?: number
  febrero_bs?: number
  marzo_usd?: number
  abril_usd?: number
  mayo_usd?: number
  junio_usd?: number
  julio_usd?: number
  agosto_usd?: number
  sep_usd?: number
  depositos?: number
}> = {
  '511': { junio_usd: 8.50, julio_usd: 9.44, agosto_usd: 10.71, sep_usd: 12.91 },
  '512': { arreglo: 26.06, agosto_usd: 10.71, sep_usd: 12.91 },
  '513': {
    deuda_2025: 14304.23, guaya: 10, arreglo: 26.06,
    enero_bs: 2916.05, febrero_bs: 2777.86,
    marzo_usd: 7.26, abril_usd: 7.34, mayo_usd: 11.68, junio_usd: 8.50, julio_usd: 9.44, agosto_usd: 10.71, sep_usd: 12.91
  },
  '524': {
    deuda_2025: 11348.82, guaya: 20, arreglo: 26.06,
    enero_bs: 2916.05, febrero_bs: 2777.86,
    marzo_usd: 7.26, abril_usd: 7.34, mayo_usd: 11.68, junio_usd: 8.50, julio_usd: 9.44, agosto_usd: 10.71, sep_usd: 12.91
  },
  '525': { julio_usd: 9.44, sep_usd: 12.91 },
  '532': {
    deuda_2025: 8594.11,
    enero_bs: 2916.05, febrero_bs: 2777.86,
    marzo_usd: 7.26, abril_usd: 7.34, mayo_usd: 11.68, junio_usd: 8.50, julio_usd: 9.44, agosto_usd: 10.71, sep_usd: 12.91
  },
  '534': { sep_usd: 12.91 },
  '541': {
    arreglo: 26.06, enero_bs: 2916.05, febrero_bs: 2777.86,
    marzo_usd: 7.26, abril_usd: 7.34, mayo_usd: 11.68, junio_usd: 8.50, julio_usd: 9.44, agosto_usd: 10.71, sep_usd: 12.91
  },
  '542': { sep_usd: 12.91 },
  '543': {
    deuda_2025: 8726.54,
    enero_bs: 2916.05, febrero_bs: 2777.86,
    marzo_usd: 7.26, abril_usd: 7.34, mayo_usd: 11.68, junio_usd: 8.50, julio_usd: 9.44, agosto_usd: 10.71, sep_usd: 12.91
  },
  '544': { sep_usd: 12.91, depositos: 120 },
  '545': { sep_usd: 12.91 },
  '551': { sep_usd: 12.91 },
  '552': { sep_usd: 12.91 },
  '555': { junio_usd: 8.50, julio_usd: 9.44, agosto_usd: 10.71, sep_usd: 12.91 },
  '556': { depositos: 0 },
  '561': { sep_usd: 12.91 },
  '563': { arreglo: 26.06, sep_usd: 12.91 },
  '566': { arreglo: 10.06, junio_usd: 8.50, julio_usd: 9.44, agosto_usd: 10.71, sep_usd: 12.91 },
  '571': { arreglo: 7.57 },
  '572': {
    deuda_2025: 18338.04, cable_viajero: 9, guaya: 20,
    enero_bs: 2916.05, febrero_bs: 2777.86,
    marzo_usd: 7.26, abril_usd: 7.34, mayo_usd: 11.68, junio_usd: 8.50, julio_usd: 9.44, agosto_usd: 10.71, sep_usd: 12.91
  }
}

/**
 * Pre-carga automática en Supabase de los datos del Excel oficial del edificio
 */
export async function sincronizarDatosExcelOficial(autorNombre?: string): Promise<{ success: boolean; registrosSincronizados: number; error: string | null }> {
  try {
    const { data: aptos, error: aptosErr } = await supabase.from('apartamentos').select('id, numero, alicuota')
    if (aptosErr || !aptos) throw new Error(aptosErr?.message || 'No se pudieron consultar los apartamentos')

    const mesesDefs: Array<{ mes: string; key: keyof typeof DATOS_EXCEL_ORIGINAL['511']; moneda: 'BS' | 'USD'; montoBase: number }> = [
      { mes: '2026-01-01', key: 'enero_bs', moneda: 'BS', montoBase: 2916.05 },
      { mes: '2026-02-01', key: 'febrero_bs', moneda: 'BS', montoBase: 2777.86 },
      { mes: '2026-03-01', key: 'marzo_usd', moneda: 'USD', montoBase: 7.26 },
      { mes: '2026-04-01', key: 'abril_usd', moneda: 'USD', montoBase: 7.34 },
      { mes: '2026-05-01', key: 'mayo_usd', moneda: 'USD', montoBase: 11.68 },
      { mes: '2026-06-01', key: 'junio_usd', moneda: 'USD', montoBase: 8.50 },
      { mes: '2026-07-01', key: 'julio_usd', moneda: 'USD', montoBase: 9.44 },
      { mes: '2026-08-01', key: 'agosto_usd', moneda: 'USD', montoBase: 10.71 },
      { mes: '2026-09-01', key: 'sep_usd', moneda: 'USD', montoBase: 12.91 }
    ]

    let totalRecibosCargados = 0

    for (const apto of aptos) {
      const dataApto = DATOS_EXCEL_ORIGINAL[apto.numero]

      if (dataApto && (dataApto.deuda_2025 || dataApto.cable_viajero || dataApto.guaya || dataApto.arreglo)) {
        await guardarConceptosHistoricos({
          apartamentoId: apto.id,
          apartamentoNumero: apto.numero,
          deudaBase2025: dataApto.deuda_2025 || 0,
          cableViajero: dataApto.cable_viajero || 0,
          guaya: dataApto.guaya || 0,
          arreglo: dataApto.arreglo || 0,
          autorNombre
        })
      }

      for (const mDef of mesesDefs) {
        const montoExcel = dataApto ? (dataApto[mDef.key] as number | undefined) : undefined
        const tieneDeuda = montoExcel !== undefined && montoExcel > 0
        const estadoFinal = tieneDeuda ? 'pendiente' : 'pagado'
        const montoReal = tieneDeuda ? montoExcel : mDef.montoBase

        const tasaRef = getTasaBcvNumerica()
        const montoUsd = mDef.moneda === 'USD' ? montoReal : Number((montoReal / tasaRef).toFixed(2))
        const montoBs = mDef.moneda === 'BS' ? montoReal : Number((montoReal * tasaRef).toFixed(2))

        const { data: recExistente } = await supabase
          .from('recibos_generados')
          .select('id')
          .eq('apartamento_id', apto.id)
          .eq('mes_facturado', mDef.mes)
          .maybeSingle()

        const payloadItem = {
          apartamento_id: apto.id,
          mes_facturado: mDef.mes,
          tasa_bcv: tasaRef,
          total_gastos_usd: montoUsd,
          alicuota: Number(apto.alicuota || 0.0159),
          subtotal_usd: montoUsd,
          fondo_reserva_pct: 10,
          fondo_reserva_usd: 0,
          cargos_extra_usd: 0,
          total_usd: montoUsd,
          total_bs: montoBs,
          estado: estadoFinal,
          data_json: {
            origen: 'sincronizacion_excel_inicial',
            moneda_original: mDef.moneda,
            notas_residentes: 'Sincronizado con balance oficial'
          }
        }

        let insErr: any = null
        if (recExistente?.id) {
          const resUpd = await supabase
            .from('recibos_generados')
            .update(payloadItem)
            .eq('id', recExistente.id)
          insErr = resUpd.error
        } else {
          const resIns = await supabase
            .from('recibos_generados')
            .insert(payloadItem)
          insErr = resIns.error
        }

        if (!insErr) totalRecibosCargados++
      }
    }

    appCache.invalidateTags(['recibos', 'saldos', 'mora', 'apartamentos'])

    return { success: true, registrosSincronizados: totalRecibosCargados, error: null }
  } catch (err: unknown) {
    console.error('[sincronizarDatosExcelOficial] Error:', err)
    return { success: false, registrosSincronizados: 0, error: getErrorMessage(err) || 'Error sincronizando Excel' }
  }
}
