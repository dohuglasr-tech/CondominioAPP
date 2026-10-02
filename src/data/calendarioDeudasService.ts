import { supabase } from './supabase'
import { appCache } from './cacheService'
import { registrarEventoAuditoria } from './auditoriaService'
import { obtenerTodosLosSaldosAFavor } from './saldoFavorService'
import { compararApartamentos } from '../utils/alicuota'

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
  created_at?: string
}

export interface ConfiguracionCalendario {
  tituloSeccionHistorica: string
  filasCuotasEspeciales: FilaCuotaEspecial[]
}

const CONFIG_STORAGE_KEY = 'condominio_config_calendario_v2'

export async function obtenerConfiguracionCalendario(): Promise<ConfiguracionCalendario> {
  const defaultConfig: ConfiguracionCalendario = {
    tituloSeccionHistorica: 'DEUDA AL AÑO 2025 / CONCEPTOS EXTRAORDINARIOS (BS)',
    filasCuotasEspeciales: []
  }

  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        return {
          tituloSeccionHistorica: parsed.tituloSeccionHistorica || defaultConfig.tituloSeccionHistorica,
          filasCuotasEspeciales: Array.isArray(parsed.filasCuotasEspeciales) ? parsed.filasCuotasEspeciales : []
        }
      }
    }

    const { data } = await supabase
      .from('casos_comunidad')
      .select('descripcion')
      .eq('tipo', 'config_calendario_mora')
      .maybeSingle()

    if (data?.descripcion) {
      const parsed = JSON.parse(data.descripcion)
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(parsed))
      return {
        tituloSeccionHistorica: parsed.tituloSeccionHistorica || defaultConfig.tituloSeccionHistorica,
        filasCuotasEspeciales: Array.isArray(parsed.filasCuotasEspeciales) ? parsed.filasCuotasEspeciales : []
      }
    }
  } catch (err) {
    console.warn('[calendarioDeudasService] Error cargando config:', err)
  }

  return defaultConfig
}

export async function guardarConfiguracionCalendario(
  config: Partial<ConfiguracionCalendario>
): Promise<{ success: boolean; data: ConfiguracionCalendario; error: string | null }> {
  try {
    const actual = await obtenerConfiguracionCalendario()
    const nueva: ConfiguracionCalendario = {
      tituloSeccionHistorica: config.tituloSeccionHistorica !== undefined ? config.tituloSeccionHistorica : actual.tituloSeccionHistorica,
      filasCuotasEspeciales: config.filasCuotasEspeciales !== undefined ? config.filasCuotasEspeciales : actual.filasCuotasEspeciales
    }

    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(nueva))

    // Sincronizar en casos_comunidad para persistencia multi-usuario
    const { data: existente } = await supabase
      .from('casos_comunidad')
      .select('id')
      .eq('tipo', 'config_calendario_mora')
      .maybeSingle()

    if (existente?.id) {
      await supabase
        .from('casos_comunidad')
        .update({
          descripcion: JSON.stringify(nueva),
          updated_at: new Date().toISOString()
        })
        .eq('id', existente.id)
    } else {
      await supabase
        .from('casos_comunidad')
        .insert({
          tipo: 'config_calendario_mora',
          titulo: 'CONFIG_CALENDARIO',
          descripcion: JSON.stringify(nueva),
          monto_usd: 0,
          monto_bs: 0
        })
    }

    appCache.invalidateTags(['recibos', 'saldos', 'mora'])

    return { success: true, data: nueva, error: null }
  } catch (err: any) {
    console.error('[calendarioDeudasService] Error guardando config:', err)
    return { success: false, data: await obtenerConfiguracionCalendario(), error: err.message }
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
  const clean = (num || '').trim().toUpperCase()
  if (clean === '511') return '501'
  if (clean === '512') return '502'
  if (clean === '513') return '503'
  if (clean === '514') return '504'
  if (clean === '515') return '505'
  if (clean === '516') return '506'
  return clean
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
          supabase.from('recibos_generados').select('*').order('mes_facturado', { ascending: true }),
          supabase.from('deudas_mora').select('*'),
          obtenerConfiguracionCalendario()
        ])

        const tasaBcv = Number(configRes.data?.tasa_bcv_actual || 859.06)
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

        // Construir filas por apartamento
        const filas: FilaCalendarioApto[] = aptos.map(apto => {
          const perf = perfilesMap.get(apto.id)
          const moraRow = moraMap.get(apto.id)
          const saldo = saldosMap.get(apto.id)

          let conceptosHist: any = {}
          if (moraRow?.conceptos_detalle) {
            try {
              if (moraRow.conceptos_detalle.startsWith('{')) {
                conceptosHist = JSON.parse(moraRow.conceptos_detalle)
              }
            } catch (e) {}
          }

          const esMoraSolventada = moraRow?.estado === 'solventado'
          const deudaBase2025 = esMoraSolventada ? 0 : Number(conceptosHist.deuda_2025 || (moraRow?.monto_bs && !conceptosHist.deuda_2025 ? moraRow.monto_bs : 0))
          const cableViajero  = esMoraSolventada ? 0 : Number(conceptosHist.cable_viajero || 0)
          const guaya         = esMoraSolventada ? 0 : Number(conceptosHist.guaya || 0)
          const arreglo       = esMoraSolventada ? 0 : Number(conceptosHist.arreglo || 0)

          const mesesMap: Record<string, ReciboMesItem | null> = {}
          let sumPendienteBs = deudaBase2025 + arreglo
          let sumPendienteUsd = cableViajero + guaya
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

          // Sumar también las cuotas especiales activas configuradas
          configCalendario.filasCuotasEspeciales.forEach(cuotaEsp => {
            const val = cuotaEsp.valoresPorApto?.[apto.id] ?? (cuotaEsp.montoDefecto > 0 ? { monto: cuotaEsp.montoDefecto, estado: 'pendiente' } : null)
            if (val && val.estado === 'pendiente' && val.monto > 0) {
              if (cuotaEsp.moneda === 'USD') sumPendienteUsd += val.monto
              else sumPendienteBs += val.monto
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

            deuda_base_2025: deudaBase2025,
            cable_viajero: cableViajero,
            guaya: guaya,
            arreglo: arreglo,

            meses: mesesMap,
            total_bs: Number(sumPendienteBs.toFixed(2)),
            total_usd: Number(sumPendienteUsd.toFixed(2)),
            meses_con_deuda: mesesConDeuda,
            estado_solvente: !tieneDeudaTotal,

            saldo_a_favor_usd: saldo?.saldo_a_favor_usd || 0,
            saldo_a_favor_bs: saldo?.saldo_a_favor_bs || 0,

            deuda_mora_id: moraRow?.id,
            deuda_mora_estado: moraRow?.estado
          }
        })

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
      } catch (err: any) {
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
            tasaBcvActual: 859.06
          },
          configuracion: {
            tituloSeccionHistorica: 'DEUDA AL AÑO 2025 / CONCEPTOS EXTRAORDINARIOS (BS)',
            filasCuotasEspeciales: []
          },
          error: err.message || 'Error consultando calendario de mora'
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
  nuevoMonto: number
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

    const montoUsd = moneda === 'USD' ? nuevoMonto : Number((nuevoMonto / 859.06).toFixed(2))
    const montoBs  = moneda === 'BS'  ? nuevoMonto : Number((nuevoMonto * 859.06).toFixed(2))
    const fechaEfectiva = fechaPago || new Date().toISOString().slice(0, 10)
    const refLimpia = referencia?.trim() || (estado === 'pagado' ? `CONCIL-${Date.now().toString().slice(-6)}` : '')

    const payloadRecibo: any = {
      apartamento_id: apartamentoId,
      mes_facturado: mesFacturadoIso,
      total_usd: montoUsd,
      total_bs: montoBs,
      estado: estado,
      tasa_bcv: 859.06,
      subtotal_usd: montoUsd,
      alicuota: 0.0159,
      fondo_reserva_pct: 10,
      data_json: {
        editado_manualmente: true,
        moneda_original: moneda,
        monto_original: nuevoMonto,
        editado_por: autorNombre || 'Administrador',
        editado_at: new Date().toISOString(),
        pago_info: estado === 'pagado' ? {
          referencia: refLimpia,
          metodo: metodo || 'Conciliación Manual Admin',
          fecha_pago: fechaEfectiva,
          nota: nota || null
        } : null
      }
    }

    if (reciboId && !reciboId.startsWith('temp-')) {
      payloadRecibo.id = reciboId
    }

    const { error: upsertErr } = await supabase
      .from('recibos_generados')
      .upsert(payloadRecibo, { onConflict: 'apartamento_id,mes_facturado' })

    if (upsertErr) throw upsertErr

    // Si se marcó como pagado y tiene referencia, asentar en pagos_reportados
    if (estado === 'pagado') {
      try {
        await supabase
          .from('pagos_reportados')
          .insert({
            apartamento_id: apartamentoId,
            monto_usd: montoUsd > 0 ? montoUsd : null,
            monto_bs: montoBs,
            tasa_bcv: 859.06,
            metodo_pago: (metodo || '').toLowerCase().includes('movil') ? 'pago_movil' : 'transferencia',
            referencia: refLimpia || 'DIRECTO',
            banco_origen: metodo || 'Directo Admin',
            banco_destino: 'Banco Bicentenario',
            fecha_pago: fechaEfectiva,
            fecha_revision: new Date().toISOString(),
            estado: 'aprobado',
            notas_admin: `Conciliado desde Calendario por ${autorNombre || 'Administrador'}. ${mesLabel}. ${nota || ''}`.trim()
          })
      } catch (e) {}
    }

    // Revisar si el apartamento queda completamente solvente
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

    await supabase
      .from('apartamentos')
      .update({ estado: hayPendientes ? 'moroso' : 'solvente' })
      .eq('id', apartamentoId)

    // Auditoría
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
    }).catch(() => {})

    appCache.invalidateTags(['recibos', 'saldos', 'mora', 'apartamentos'])

    return { success: true, error: null }
  } catch (err: any) {
    console.error('[calendarioDeudasService] Error guardando monto personalizado:', err)
    return { success: false, error: err.message || 'Error guardando monto' }
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
  deudaBase2025: number
  cableViajero: number
  guaya: number
  arreglo: number
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
      autorNombre
    } = params

    const totalBs = Number((deudaBase2025 + arreglo).toFixed(2))
    const totalUsd = Number((cableViajero + guaya).toFixed(2))
    const tieneDeuda = totalBs > 0.01 || totalUsd > 0.01

    const payloadConceptos = JSON.stringify({
      deuda_2025: deudaBase2025,
      cable_viajero: cableViajero,
      guaya: guaya,
      arreglo: arreglo,
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
          fecha_corte: new Date().toISOString().slice(0, 10),
          updated_at: new Date().toISOString()
        },
        { onConflict: 'apartamento_id' }
      )

    if (error) throw error

    appCache.invalidateTags(['mora', 'saldos', 'apartamentos'])

    return { success: true, error: null }
  } catch (err: any) {
    console.error('[calendarioDeudasService] Error guardando histórico:', err)
    return { success: false, error: err.message || 'Error guardando datos históricos' }
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
    const existeIndex = config.filasCuotasEspeciales.findIndex(f => f.id === cuota.id)

    if (existeIndex >= 0) {
      config.filasCuotasEspeciales[existeIndex] = cuota
    } else {
      config.filasCuotasEspeciales.push(cuota)
    }

    await guardarConfiguracionCalendario(config)
    return { success: true, error: null }
  } catch (err: any) {
    return { success: false, error: err.message || 'Error guardando cuota especial' }
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
    config.filasCuotasEspeciales = config.filasCuotasEspeciales.filter(f => f.id !== cuotaId)
    await guardarConfiguracionCalendario(config)
    return { success: true, error: null }
  } catch (err: any) {
    return { success: false, error: err.message || 'Error eliminando cuota especial' }
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
      const numExcel = apto.numero.startsWith('50') ? '51' + apto.numero.slice(2) : apto.numero
      const dataApto = DATOS_EXCEL_ORIGINAL[numExcel] || DATOS_EXCEL_ORIGINAL[apto.numero]

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

        const montoUsd = mDef.moneda === 'USD' ? montoReal : Number((montoReal / 859.06).toFixed(2))
        const montoBs  = mDef.moneda === 'BS' ? montoReal : Number((montoReal * 859.06).toFixed(2))

        const { error: insErr } = await supabase
          .from('recibos_generados')
          .upsert({
            apartamento_id: apto.id,
            mes_facturado: mDef.mes,
            tasa_bcv: 859.06,
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
          }, { onConflict: 'apartamento_id,mes_facturado' })

        if (!insErr) totalRecibosCargados++
      }
    }

    appCache.invalidateTags(['recibos', 'saldos', 'mora', 'apartamentos'])

    return { success: true, registrosSincronizados: totalRecibosCargados, error: null }
  } catch (err: any) {
    console.error('[sincronizarDatosExcelOficial] Error:', err)
    return { success: false, registrosSincronizados: 0, error: err.message || 'Error sincronizando Excel' }
  }
}
