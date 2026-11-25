import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import { useAuth } from '../../application/contexts/AuthContext'
import { useTheme } from '../../application/contexts/ThemeContext'
import { useBcvRate } from '../../data/useBcvRate'
import { supabase } from '../../data/supabase'
import { appCache } from '../../data/cacheService'
import { useNavigate } from 'react-router-dom'
import {
  obtenerDeudaMoraApartamento,
  TASA_RIESGO_CONFIG,
  DeudaMoraItem,
  TasaRiesgoMora,
  formatearFechaCortaEs,
  obtenerFechaHoyLocalIso
} from '../../data/moraService'
import { formatAlicuotaPct, getAlicuotaPctNumber } from '../../utils/alicuota'
import { AvisoBanner } from '../components/AvisoBanner'
import { obtenerSaldoAFavorApartamento } from '../../data/saldoFavorService'
import { esReciboIndexado } from '../../utils/indexacionHelper'
import { getTasaBcvNumerica } from '../../utils/tasaBcvHelper'
import { obtenerResumenGasApartamento, obtenerDeudaGasApartamento, DeudaApartamentoGas } from '../../data/gasService'
import { parsePagoMeta } from '../../utils/pagoMeta'
import { obtenerLocalesPorApartamento, LocalComercial } from '../../data/localesService'
import { obtenerJunta, MiembroJunta } from '../../data/juntaService'
import { ModalCartaSolvencia } from '../components/ModalCartaSolvencia'

const ReportarPagoModal = lazy(() =>
  import('../components/ReportarPagoModal').then((m) => ({ default: m.ReportarPagoModal }))
)
import { DatosCartaSolvencia, obtenerMesActualEs, descargarSolvenciaPDF } from '../../utils/solvenciaPdfGenerator'
import { registrarAccesoResidente } from '../../data/accesosService'
import { DashboardQuickActions } from './dashboard/DashboardQuickActions'
import { DashboardPagosRecientesCard } from './dashboard/DashboardPagosRecientesCard'
import { DashboardSideCards } from './dashboard/DashboardSideCards'
import { FondoReservaCard } from '../components/FondoReservaCard'
import { obtenerFondoReservaPortalResidente, calcularTotalesFondoReserva, ResumenFondoReserva } from '../../data/fondoReservaService'

interface PagoItem {
  id: string
  monto_bs: number
  monto_usd?: number
  referencia: string
  estado: string
  created_at: string
  fecha_pago?: string
  notas_admin?: string
  banco_origen?: string
  banco_destino?: string
}

const getTasaConfig = (tasa?: string) => {
  if (tasa && (tasa in TASA_RIESGO_CONFIG)) {
    return TASA_RIESGO_CONFIG[tasa as TasaRiesgoMora]
  }
  return TASA_RIESGO_CONFIG.azul
}

export function Dashboard() {
  const { perfil, config } = useAuth()
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const navigate = useNavigate()

  const p = perfil as any
  const aptoNumero = p?.apartamento?.numero || p?.apartamentos?.numero || perfil?.apartamento_id || ''
  const apartamentoId = perfil?.apartamento_id ?? ''
  const residenteNombre = p?.nombre_completo || 'Propietario'

  const [modalOpen, setModalOpen] = useState(false)
  const [modalTipoPago, setModalTipoPago] = useState<'todos' | 'gas' | 'condominio'>('todos')
  const [modalCuotaAdelanto, setModalCuotaAdelanto] = useState<{ cuotaId: string; modo: 'total' | 'abono' } | null>(null)
  const [ocultarSaldos, setOcultarSaldos] = useState(false)
  const [alicuota, setAlicuota] = useState<number>(1.59)
  const [esPenthouse, setEsPenthouse] = useState(false)

  const [ultimoPago, setUltimoPago] = useState<PagoItem | null>(null)
  const [pagosRecientes, setPagosRecientes] = useState<PagoItem[]>([])
  const [reciboPendiente, setReciboPendiente] = useState<any | null>(null)
  const [recibosPendientesList, setRecibosPendientesList] = useState<any[]>([])
  const [moraRecord, setMoraRecord] = useState<DeudaMoraItem | null>(null)
  const [saldoAFavor, setSaldoAFavor] = useState<number>(0)
  const [saldoAFavorBs, setSaldoAFavorBs] = useState<number>(0)
  const [deudaGas, setDeudaGas] = useState<DeudaApartamentoGas | null>(null)
  const [localesAsignados, setLocalesAsignados] = useState<LocalComercial[]>([])
  const [modalSolvenciaOpen, setModalSolvenciaOpen] = useState(false)
  const [juntaMiembros, setJuntaMiembros] = useState<MiembroJunta[]>([])
  const [fondoReserva, setFondoReserva] = useState<ResumenFondoReserva | null>(null)
  const [aptDetalle, setAptDetalle] = useState<{ numero?: string; piso?: number | null; propietario_nombre?: string | null } | null>(null)

  const { rate, loading: loadingRate } = useBcvRate()
  const tasaValida = getTasaBcvNumerica(rate, config?.tasa_bcv_actual)
  const tasaValidaRef = useRef(tasaValida)
  useEffect(() => {
    tasaValidaRef.current = tasaValida
  }, [tasaValida])

  // ── Registrar conexión del residente (Fire-and-forget, throttle por sesión) ──
  useEffect(() => {
    const rolActual = perfil?.rol
    const esResidente = rolActual === 'residente' || (!rolActual && aptoNumero)
    if (esResidente) {
      const numApto = aptDetalle?.numero || aptoNumero
      if (numApto) {
        registrarAccesoResidente(String(numApto), apartamentoId, residenteNombre)
      }
    }
  }, [aptoNumero, apartamentoId, residenteNombre, perfil?.rol, aptDetalle?.numero])

  // ── Cálculo consolidado y desglose de deudas ──────────────────────────────
  // Si el recibo no está indexado (o la deuda es manual en Bs), queda fija en Bolívares.
  // Si está indexado, se ancla al Dólar y se multiplica por la tasa BCV del día en curso.
  let deudaFijaBs = 0
  let deudaIndexadaUsd = 0

  if (recibosPendientesList.length > 0) {
    recibosPendientesList.forEach(r => {
      if (esReciboIndexado(r, config?.fecha_inicio_gestion)) {
        deudaIndexadaUsd += Number(r.total_usd || 0)
      } else {
        deudaFijaBs += Number(r.total_bs || 0)
      }
    })
  } else if (reciboPendiente) {
    if (esReciboIndexado(reciboPendiente, config?.fecha_inicio_gestion)) {
      deudaIndexadaUsd += Number(reciboPendiente.total_usd || 0)
    } else {
      deudaFijaBs += Number(reciboPendiente.total_bs || 0)
    }
  }

  // Deuda manual (exclusivamente el componente manual para no duplicar los recibos)
  if (moraRecord && (moraRecord.estado === 'activo' || !moraRecord.estado)) {
    const yaSeContaronRecibos = recibosPendientesList.length > 0 || Boolean(reciboPendiente)
    let manualBs = 0
    let manualUsd = 0

    if (yaSeContaronRecibos) {
      if (moraRecord.desglose?.items && moraRecord.desglose.items.length > 0) {
        moraRecord.desglose.items.forEach(it => {
          if (it.estado === 'pendiente') {
            if (it.moneda === 'BS') manualBs += Number(it.monto || 0)
            else manualUsd += Number(it.monto || 0)
          }
        })
      } else {
        manualBs = Number(moraRecord.monto_manual_bs || 0)
        manualUsd = Number(moraRecord.monto_manual_usd || 0)
      }
    } else {
      manualBs = Number(moraRecord.monto_bs || 0)
      manualUsd = Number(moraRecord.monto_usd || 0)
    }

    if (manualBs > 0.05) deudaFijaBs += manualBs
    if (manualUsd > 0.05) deudaIndexadaUsd += manualUsd
  }

  const deudaIndexadaBs = deudaIndexadaUsd * tasaValida
  const deudaBs = deudaFijaBs + deudaIndexadaBs
  const deudaUsd = (deudaFijaBs > 0 && tasaValida > 0 ? deudaFijaBs / tasaValida : 0) + deudaIndexadaUsd
  const tieneDeudaFijaBs = deudaFijaBs > 0.05
  const tieneDeudaReal = deudaBs > 0.05 || (recibosPendientesList.length > 0)
  const fmtBs = (m: number) => (Number(m) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // ── Sincronización de Deuda Total: Condominio + Servicio de Gas + Locales ──
  const deudaCondominioBs = deudaBs
  const deudaCondominioUsd = deudaUsd
  const tieneDeudaCondominio = tieneDeudaReal

  const deudaGasBs = deudaGas?.tieneDeuda ? Number(deudaGas.montoBs || 0) : 0
  const deudaGasUsd = deudaGas?.tieneDeuda ? Number(deudaGas.montoUsd || 0) : 0
  const tieneDeudaGas = Boolean(deudaGas?.tieneDeuda && (deudaGasBs > 0.05 || deudaGasUsd > 0.05))

  const deudaLocalesUsd = localesAsignados.reduce((acc, l) => acc + (Number(l.deuda_actual_usd) || 0), 0)
  const deudaLocalesBs = localesAsignados.reduce((acc, l) => acc + (Number(l.deuda_actual_bs) || 0), 0)
  const tieneDeudaLocales = deudaLocalesUsd > 0.05

  const deudaTotalConsolidadaBs = deudaCondominioBs + deudaGasBs + deudaLocalesBs
  const deudaTotalConsolidadaUsd = deudaCondominioUsd + deudaGasUsd + deudaLocalesUsd
  const tieneDeudaTotal = tieneDeudaCondominio || tieneDeudaGas || tieneDeudaLocales

  // ── Lógica estricta de "Diferencia de pago" vs "No está al día / Deuda pendiente" ──
  // La diferencia SOLO aplica cuando:
  // 1. El residente tiene saldo a favor (> 0.05), O
  // 2. Su último pago fue menor a la cuota seleccionada a pagar por el residente (abono parcial o pago inferior a la cuota del período actual).
  // Si no cumple esto, NO es diferencia; es deuda pendiente / no está al día.
  const tieneSaldoAFavor = (saldoAFavor > 0.05 || saldoAFavorBs > 0.05)
  const tieneAbonoEnRecibos = recibosPendientesList.some(r =>
    Boolean(
      (r.data_json?.abonos && r.data_json.abonos.length > 0) ||
      Number(r.data_json?.monto_pagado_parcial || 0) > 0 ||
      (r.data_json?.monto_original_usd && Number(r.data_json.monto_original_usd) > Number(r.total_usd || 0) + 0.05) ||
      (r.data_json?.monto_original_bs && Number(r.data_json.monto_original_bs) > Number(r.total_bs || 0) + 1)
    )
  )

  const cuotaReciboUsd = reciboPendiente
    ? Number(reciboPendiente.total_usd || (reciboPendiente.total_bs && tasaValida > 0 ? reciboPendiente.total_bs / tasaValida : 0))
    : 0
  const cuotaReciboBs = reciboPendiente
    ? Number(reciboPendiente.total_bs || (reciboPendiente.total_usd && tasaValida > 0 ? reciboPendiente.total_usd * tasaValida : 0))
    : 0

  // Comprobar si existe un pago reportado/aprobado específico para este recibo pendiente
  // (evita que un pago de un mes anterior menor que la nueva cuota se confunda con abono)
  const pagoCorrespondienteAlRecibo = pagosRecientes.find(p => {
    if (!reciboPendiente) return false
    if (p.estado !== 'aprobado' && p.estado !== 'completado') return false

    const fechaPagoStr = p.fecha_pago || p.created_at
    const fechaReciboStr = reciboPendiente.emitido_at || reciboPendiente.created_at
    const mesFacturado = (reciboPendiente.mes_facturado || '').slice(0, 7) // 'YYYY-MM'

    // Coincidencia por notas o referencia
    const notas = ((p.notas_admin || '') + ' ' + (p.referencia || '')).toLowerCase()
    if (mesFacturado && notas.includes(mesFacturado)) return true

    // Coincidencia por fecha (pago realizado en o después de la emisión del recibo)
    if (fechaPagoStr && fechaReciboStr) {
      const tPago = new Date(fechaPagoStr).getTime()
      const tRecibo = new Date(fechaReciboStr).getTime()
      return tPago >= (tRecibo - 24 * 60 * 60 * 1000)
    }

    if (fechaPagoStr && mesFacturado) {
      const mesPago = fechaPagoStr.slice(0, 7)
      return mesPago >= mesFacturado
    }

    return false
  })

  const pagoMenorQueCuotaPeriodo = Boolean(
    pagoCorrespondienteAlRecibo && reciboPendiente && (() => {
      const pagoUsd = Number(pagoCorrespondienteAlRecibo.monto_usd || (pagoCorrespondienteAlRecibo.monto_bs && tasaValida > 0 ? pagoCorrespondienteAlRecibo.monto_bs / tasaValida : 0))
      const pagoBs = Number(pagoCorrespondienteAlRecibo.monto_bs || (pagoCorrespondienteAlRecibo.monto_usd && tasaValida > 0 ? pagoCorrespondienteAlRecibo.monto_usd * tasaValida : 0))
      const esMenorUsd = pagoUsd > 0.05 && cuotaReciboUsd > 0.05 && pagoUsd < (cuotaReciboUsd - 0.05)
      const esMenorBs = pagoBs > 0.05 && cuotaReciboBs > 0.05 && pagoBs < (cuotaReciboBs - 1)
      return esMenorUsd || esMenorBs
    })()
  )

  const ultimoPagoMenorQueCuota = tieneAbonoEnRecibos || pagoMenorQueCuotaPeriodo
  const aplicaDiferencia = Boolean(tieneDeudaCondominio && (tieneSaldoAFavor || ultimoPagoMenorQueCuota))

  // ── Separación de Cuotas Extraordinarias: Vigentes/Vencidas vs Programadas (Futuras) ──
  const hoyLocalIso = obtenerFechaHoyLocalIso()
  const cuotasExtraActivas = moraRecord?.desglose?.cuotas_especiales || []
  const cuotasExtraProgramadas = moraRecord?.desglose?.cuotas_programadas || []
  const tieneDeudaAnterior = Boolean(
    moraRecord?.desglose?.deuda_base_2025 ||
    moraRecord?.desglose?.cable_viajero ||
    moraRecord?.desglose?.guaya ||
    moraRecord?.desglose?.arreglo
  )
  const tieneRecibosMora = ((moraRecord?.desglose?.recibos_bs?.length || 0) + (moraRecord?.desglose?.recibos_usd?.length || 0)) > 0
  const soloCuotasExtraActivas = cuotasExtraActivas.length > 0 && !tieneDeudaAnterior && !tieneRecibosMora
  const tieneCuotaExtraVencida = cuotasExtraActivas.some(c =>
    c.estadoVigencia ? c.estadoVigencia === 'vencida' : Boolean(c.fechaLimite && c.fechaLimite < hoyLocalIso)
  )

  // ── Verificación estricta de solvencia para Carta de Solvencia ──
  // El residente SOLO puede ver y descargar su carta si está 100% SOLVENTE:
  // - No mantiene ninguna deuda o mora de cualquier categoría (condominio, recargos, gas comunal).
  // - No tiene recibos pendientes de pago.
  // - No tiene pagos reportados bajo verificación pendiente.
  // - No tiene deuda activa registrada en el sistema de mora.
  const tieneDeudaMoraActiva = Boolean(
    moraRecord &&
    moraRecord.estado !== 'solventado' &&
    (
      (moraRecord.meses_deuda && moraRecord.meses_deuda > 0) ||
      (moraRecord.monto_bs && moraRecord.monto_bs > 0.05) ||
      (moraRecord.monto_usd && moraRecord.monto_usd > 0.05)
    )
  )

  const ultimoPagoEsAdelantoFuturo = Boolean(
    ultimoPago && parsePagoMeta(ultimoPago.notas_admin)?.esAdelantoCuotaFutura
  )

  const estaSolvente = Boolean(
    !tieneDeudaTotal &&
    !tieneDeudaCondominio &&
    !tieneDeudaGas &&
    !tieneDeudaMoraActiva &&
    recibosPendientesList.length === 0 &&
    deudaTotalConsolidadaBs <= 0.05 &&
    deudaTotalConsolidadaUsd <= 0.05 &&
    !(ultimoPago?.estado === 'pendiente' && !ultimoPagoEsAdelantoFuturo)
  )

  const adminMiembro = juntaMiembros.find(m => m.categoria === 'administracion' || m.cargo.toLowerCase().includes('administrad'))
  const presidenteMiembro = juntaMiembros.find(m => m.cargo.toLowerCase().includes('presidente'))
  const ultimoPagoAprobado = pagosRecientes.find(pg => pg.estado === 'aprobado')

  const datosCartaSolvencia: DatosCartaSolvencia = {
    nombreEdificio: config?.nombre_edificio || 'Junta de Condominio',
    rif: config?.rif || '',
    direccion: config?.direccion || '',
    ciudad: config?.ciudad || 'Ocumare del Tuy',
    logoUrl: config?.logo_url || null,
    telefono: config?.telefono || adminMiembro?.telefono || null,
    email: config?.email_contacto || null,

    presidenteNombre: presidenteMiembro?.nombre || 'Presidente de la Junta',
    presidenteCargo: presidenteMiembro?.cargo || 'Presidente',
    presidenteCedula: (presidenteMiembro as any)?.cedula || '',

    administradorNombre: adminMiembro?.nombre || config?.titular_cuenta || 'Douglas Guevara',
    administradorCargo: adminMiembro?.cargo || 'Administrador',

    residenteNombre: p?.nombre_completo || aptDetalle?.propietario_nombre || residenteNombre || 'Propietario',
    residenteCedula: p?.cedula || moraRecord?.propietario_cedula || '',
    residenteApto: String(aptDetalle?.numero || aptoNumero || 'N/D'),
    residentePiso: aptDetalle?.piso != null ? String(aptDetalle.piso) : (moraRecord?.piso != null ? String(moraRecord.piso) : ''),
    alicuotaPct: formatAlicuotaPct(alicuota),

    ultimoPagoFecha: ultimoPagoAprobado?.fecha_pago || ultimoPagoAprobado?.created_at || null,
    ultimoPagoReferencia: ultimoPagoAprobado?.referencia || null,
    ultimoPagoMonto: ultimoPagoAprobado ? Number(ultimoPagoAprobado.monto_bs) || null : null,

    mesSolvente: obtenerMesActualEs(),
    anioSolvente: new Date().getFullYear(),
    diaEmision: new Date().getDate(),
    mesEmision: obtenerMesActualEs(),
    anioEmision: new Date().getFullYear()
  }


  // Cargar datos del apartamento y alícuota real impuesta por el administrador
  const cargarApartamentoInfo = useCallback(async (forceRefresh = false) => {
    try {
      const aptKey = apartamentoId ? `apto_id_${apartamentoId}` : `apto_num_${aptoNumero}`
      const aptData = await appCache.fetch(
        aptKey,
        async () => {
          if (apartamentoId) {
            const { data } = await supabase
              .from('apartamentos')
              .select('id, numero, alicuota, piso, propietario_nombre')
              .eq('id', apartamentoId)
              .maybeSingle()
            if (data) return data
          }

          if (aptoNumero) {
            const { data } = await supabase
              .from('apartamentos')
              .select('id, numero, alicuota, piso, propietario_nombre')
              .eq('numero', aptoNumero)
              .maybeSingle()
            return data
          }
          return null
        },
        { ttlMs: 15 * 60 * 1000, tags: ['apartamentos'], forceRefresh }
      )

      if (aptData) {
        setAptDetalle(aptData)
        const numStr = String(aptData.numero || '').toUpperCase()
        const pisoNum = Number(aptData.piso || 0)
        const pct = getAlicuotaPctNumber(aptData.alicuota)
        const isPH = numStr.includes('PH') || pisoNum === 15 || pct > 2.0
        setEsPenthouse(isPH)
        setAlicuota(pct > 0 ? pct : (isPH ? 2.59 : 1.59))
      }
    } catch (err) {
      console.warn('[Dashboard] Error cargando alícuota:', err)
    }
  }, [apartamentoId, aptoNumero])

  // Cargar pagos, recibos y moras en paralelo (Promise.allSettled)
  const cargarDatosResidente = useCallback(async (forceRefresh = false) => {
    if (!apartamentoId && !aptoNumero) {
      return
    }

    try {
      const targetKey = apartamentoId || aptoNumero

      const [
        pagosRes,
        recibosRes,
        moraRes,
        saldoRes,
        gasRes,
        localesRes,
        juntaRes,
        fondoReservaRes,
      ] = await Promise.allSettled([
        appCache.fetch(
          `dashboard_pagos_${targetKey}`,
          async () => {
            if (!apartamentoId) return []
            const { data } = await supabase
              .from('pagos_reportados')
              .select('id, monto_bs, monto_usd, referencia, estado, created_at, fecha_pago, notas_admin, metodo, comprobante_url')
              .eq('apartamento_id', apartamentoId)
              .order('created_at', { ascending: false })
              .limit(5)
            return (data || []) as PagoItem[]
          },
          { ttlMs: 3 * 60 * 1000, tags: ['pagos'], forceRefresh }
        ),
        appCache.fetch(
          `dashboard_recibo_${targetKey}`,
          async () => {
            if (!apartamentoId) return []
            const { data } = await supabase
              .from('recibos_generados')
              .select('id, total_usd, total_bs, mes_facturado, estado, emitido_at, data_json, es_indexado')
              .eq('apartamento_id', apartamentoId)
              .eq('estado', 'pendiente')
              .order('mes_facturado', { ascending: false })
            return data || []
          },
          { ttlMs: 3 * 60 * 1000, tags: ['recibos'], forceRefresh }
        ),
        obtenerDeudaMoraApartamento(apartamentoId, aptoNumero, forceRefresh),
        apartamentoId
          ? obtenerSaldoAFavorApartamento(apartamentoId, tasaValidaRef.current, forceRefresh)
          : Promise.resolve(null),
        obtenerResumenGasApartamento(apartamentoId, aptoNumero, forceRefresh),
        obtenerLocalesPorApartamento(apartamentoId, aptoNumero),
        obtenerJunta(forceRefresh),
        obtenerFondoReservaPortalResidente(tasaValidaRef.current, forceRefresh, 5),
      ])

      if (pagosRes.status === 'fulfilled') {
        const listPagos = pagosRes.value
        setPagosRecientes(listPagos)
        setUltimoPago(listPagos.length > 0 ? listPagos[0] : null)
      }

      if (recibosRes.status === 'fulfilled') {
        const reciboPend = recibosRes.value
        const rList = Array.isArray(reciboPend) ? reciboPend : (reciboPend ? [reciboPend] : [])
        setRecibosPendientesList(rList)
        setReciboPendiente(rList.length > 0 ? rList[0] : null)
      }

      if (moraRes.status === 'fulfilled') {
        setMoraRecord(moraRes.value)
      } else {
        console.warn('[Dashboard] Error cargando mora:', moraRes.reason)
      }

      if (saldoRes.status === 'fulfilled' && saldoRes.value) {
        setSaldoAFavor(saldoRes.value.saldo_a_favor_usd)
        setSaldoAFavorBs(saldoRes.value.saldo_a_favor_bs)
      }

      if (gasRes.status === 'fulfilled') {
        if (gasRes.value?.data) {
          const dGas = obtenerDeudaGasApartamento(gasRes.value.data, apartamentoId, aptoNumero)
          setDeudaGas(dGas)
        }
      } else {
        console.warn('[Dashboard] Error cargando cuota de gas:', gasRes.reason)
      }

      if (localesRes.status === 'fulfilled') {
        setLocalesAsignados(localesRes.value)
      } else {
        console.warn('[Dashboard] Error cargando locales asignados:', localesRes.reason)
      }

      if (juntaRes.status === 'fulfilled') {
        if (juntaRes.value?.data) setJuntaMiembros(juntaRes.value.data)
      } else {
        console.warn('[Dashboard] Error cargando junta:', juntaRes.reason)
      }

      if (fondoReservaRes.status === 'fulfilled' && fondoReservaRes.value) {
        setFondoReserva(fondoReservaRes.value)
      } else if (fondoReservaRes.status === 'rejected') {
        console.warn('[Dashboard] Error cargando fondo de reserva:', fondoReservaRes.reason)
      }
    } catch (err) {
      console.warn('[Dashboard] Error cargando datos del residente:', err)
    }
  }, [apartamentoId, aptoNumero])

  useEffect(() => {
    cargarApartamentoInfo(false)
    cargarDatosResidente(false)

    // Debounce de 500ms para agrupar ráfagas Realtime/Broadcast (ej. emisión masiva de 62 recibos)
    let refreshTimer: ReturnType<typeof setTimeout> | null = null
    const pendingTags = new Set<string>()
    const scheduleDebouncedRefresh = (tags: string[]) => {
      tags.forEach((t) => pendingTags.add(t))
      if (refreshTimer) clearTimeout(refreshTimer)
      refreshTimer = setTimeout(() => {
        const batch = Array.from(pendingTags)
        pendingTags.clear()
        refreshTimer = null
        if (batch.length > 0) {
          appCache.invalidateTags(batch)
        }
        cargarDatosResidente(true)
      }, 500)
    }

    // Escuchar eventos broadcast de actualización de gas comunal y cuotas extraordinarias
    const onGasUpdated = () => {
      scheduleDebouncedRefresh(['gas', 'saldos', 'recibos', 'mora'])
    }
    const onCuotasUpdated = () => {
      scheduleDebouncedRefresh(['mora', 'recibos', 'saldos', 'calendario_config'])
    }
    window.addEventListener('condominio_gas_updated', onGasUpdated)
    window.addEventListener('condominio_cuotas_updated', onCuotasUpdated)

    const onStorage = (e: StorageEvent) => {
      if (e.key === 'gas_servicio_cache' || e.key === 'condominio_gas_cache_v2') {
        scheduleDebouncedRefresh(['gas'])
      }
    }
    window.addEventListener('storage', onStorage)

    if (!apartamentoId) {
      return () => {
        if (refreshTimer) clearTimeout(refreshTimer)
        window.removeEventListener('condominio_gas_updated', onGasUpdated)
        window.removeEventListener('condominio_cuotas_updated', onCuotasUpdated)
        window.removeEventListener('storage', onStorage)
      }
    }

    // Suscripción Realtime para actualizar pagos, recibos o gas agrupando ráfagas
    const channelId = `dashboard_resident_${apartamentoId}_${Math.random().toString(36).slice(2, 7)}`
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pagos_reportados', filter: `apartamento_id=eq.${apartamentoId}` },
        () => {
          scheduleDebouncedRefresh(['pagos', 'saldos', 'recibos', 'mora'])
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'recibos_generados', filter: `apartamento_id=eq.${apartamentoId}` },
        () => {
          scheduleDebouncedRefresh(['recibos', 'saldos', 'mora'])
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'casos_comunidad' },
        (payload: any) => {
          const t = payload?.new?.tipo || payload?.old?.tipo
          if (t === 'config_gas_servicio' || (typeof t === 'string' && t.startsWith('gas_'))) {
            scheduleDebouncedRefresh(['gas', 'saldos'])
          } else if (typeof t === 'string' && t.startsWith('config_calendario_mora')) {
            scheduleDebouncedRefresh(['mora', 'recibos', 'saldos', 'calendario_config'])
          }
        }
      )
      .subscribe()

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer)
      window.removeEventListener('condominio_gas_updated', onGasUpdated)
      window.removeEventListener('condominio_cuotas_updated', onCuotasUpdated)
      window.removeEventListener('storage', onStorage)
      supabase.removeChannel(channel)
    }
  }, [apartamentoId, cargarApartamentoInfo, cargarDatosResidente])

  return (
    <>
      {modalOpen && (
        <Suspense fallback={null}>
          <ReportarPagoModal
            apartamentoId={apartamentoId}
            aptoNumero={aptoNumero}
            initialTipo={modalTipoPago}
            initialCuotaAdelanto={modalCuotaAdelanto}
            onClose={() => {
              setModalOpen(false)
              setModalCuotaAdelanto(null)
            }}
            onSuccess={() => {
              setModalOpen(false)
              setModalCuotaAdelanto(null)
              cargarDatosResidente(true)
            }}
          />
        </Suspense>
      )}

      {/* Modal interactivo de Carta de Solvencia */}
      {modalSolvenciaOpen && (
        <ModalCartaSolvencia
          isOpen={modalSolvenciaOpen}
          onClose={() => setModalSolvenciaOpen(false)}
          datos={datosCartaSolvencia}
          perfilId={perfil?.id}
          onCedulaUpdated={(newCedula) => {
            if (perfil) {
              (perfil as any).cedula = newCedula
            }
          }}
        />
      )}

      {/* ── STYLES PRINCIPALES CON SOPORTE COMPLETO PC Y TELÉFONO ── */}
      <style>{`
        .resident-page {
          min-height: 100vh;
          background-color: #090a0d;
          font-family: 'Inter', sans-serif;
          color: #ffffff;
        }

        /* Vistas Desktop vs Móvil */
        .resident-mobile-view {
          display: none;
        }
        .resident-desktop-view {
          display: block;
          max-width: 1200px;
          margin: 0 auto;
          padding: 32px 28px 48px;
        }

        @media (max-width: 860px) {
          .resident-desktop-view {
            display: none;
          }
          .resident-mobile-view {
            display: flex;
            flex-direction: column;
            gap: 20px;
            padding: 16px 16px 36px;
          }
        }

        /* Botón circular de acción rápida táctil */
        .quick-action-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          background: none;
          border: none;
          cursor: pointer;
          padding: 0;
          outline: none;
          transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .quick-action-btn:active {
          transform: scale(0.94);
        }
        .quick-action-circle {
          width: 58px;
          height: 58px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          position: relative;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
          transition: all 0.2s;
        }
        .quick-action-label {
          color: #d4d4d8;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.2px;
          text-align: center;
        }

        /* Bento Grid Desktop */
        .bento-desktop-grid {
          display: grid;
          grid-template-columns: repeat(12, minmax(0, 1fr));
          gap: 20px;
          margin-top: 24px;
        }
        .bento-col-main {
          grid-column: span 7;
          display: flex;
          flex-direction: column;
          gap: 20px;
          min-width: 0;
        }
        .bento-col-side {
          grid-column: span 5;
          display: flex;
          flex-direction: column;
          gap: 20px;
          min-width: 0;
        }
        @media (max-width: 1180px) {
          .bento-col-main,
          .bento-col-side {
            grid-column: span 12;
          }
        }

        .desktop-card {
          background: linear-gradient(180deg, #151922 0%, #0d1117 100%);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-top: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 22px;
          padding: 24px 26px;
          box-shadow: 0 14px 34px -4px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.06);
          position: relative;
          overflow: hidden;
          min-width: 0;
          overflow-wrap: break-word;
        }

        body.theme-light .resident-page {
          background-color: #eef2f6 !important;
          color: #0f172a !important;
        }
        body.theme-light .desktop-card {
          background: #ffffff !important;
          border: 1px solid #e2e8f0 !important;
          box-shadow: 0 8px 24px -4px rgba(15, 23, 42, 0.06) !important;
          color: #0f172a !important;
        }
        body.theme-light .quick-action-circle {
          box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08) !important;
        }
        body.theme-light .quick-action-circle[style*="background-color: rgb(19, 40, 31)"],
        body.theme-light .quick-action-circle[style*="background-color: rgb(38, 18, 21)"],
        body.theme-light .quick-action-circle[style*="background-color: rgb(16, 29, 44)"],
        body.theme-light .quick-action-circle[style*="background-color: rgb(35, 18, 44)"],
        body.theme-light .quick-action-circle[style*="background-color: rgb(12, 34, 41)"],
        body.theme-light .quick-action-circle[style*="background-color: rgb(38, 30, 14)"] {
          background-color: #ffffff !important;
          border-color: #e2e8f0 !important;
        }
        body.theme-light .quick-action-label {
          color: #334155 !important;
          font-weight: 700;
        }
        body.theme-light .domus-cuota-item {
          background-color: rgba(255, 255, 255, 0.88) !important;
          border: 1px solid rgba(202, 138, 4, 0.28) !important;
        }
      `}</style>

      <div className="resident-page">

        {/* ═════════════════════════════════════════════════════════════════ */}
        {/* ── VISTA TELÉFONO (MÓVIL) - IDÉNTICA A LA INTERFAZ DE REFERENCIA ─ */}
        {/* ═════════════════════════════════════════════════════════════════ */}
        <div className="resident-mobile-view">

          {/* Cartelera / Barra de Avisos Rápidos (Si hay aviso activo) */}
          <AvisoBanner />

          {/* ── 1. TARJETA PRINCIPAL: ESTADO DE CUENTA / APTO ── */}
          <div style={{
            backgroundColor: '#141519',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderTop: '1px solid rgba(255, 255, 255, 0.14)',
            borderRadius: '24px',
            padding: '22px 20px 20px',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
            position: 'relative'
          }}>
            {/* Header de la tarjeta con Ojo para ocultar/mostrar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: '#8e8e93', fontSize: '11px', fontWeight: 800, letterSpacing: '0.8px', textTransform: 'uppercase' }}>
                  ESTADO DE CUENTA
                </span>
                <span style={{
                  color: 'var(--color-accent, #f97316)',
                  fontSize: '10px',
                  fontWeight: 800,
                  backgroundColor: 'var(--color-accent-light, rgba(249, 115, 22, 0.12))',
                  padding: '2px 7px',
                  borderRadius: '6px'
                }}>
                  APTO {aptoNumero}
                </span>
              </div>

              <button
                onClick={() => setOcultarSaldos(!ocultarSaldos)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#8e8e93',
                  fontSize: '18px',
                  cursor: 'pointer',
                  padding: 0
                }}
                title={ocultarSaldos ? 'Mostrar saldo' : 'Ocultar saldo'}
              >
                {ocultarSaldos ? '🙈' : '👁️'}
              </button>
            </div>

            {/* Gran cifra en Bolívares (Consolidada: Condominio + Gas) */}
            <div style={{ color: '#fff', fontSize: 'clamp(24px, 7vw, 34px)', fontWeight: 900, letterSpacing: '-0.5px', lineHeight: 1.15, overflowWrap: 'anywhere' }}>
              {ocultarSaldos ? 'Bs. ••••••' : `Bs. ${(deudaTotalConsolidadaBs > 0 ? deudaTotalConsolidadaBs : 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            </div>

            {/* Píldora de Estatus y Equivalente en USD Consolidado */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', marginBottom: '18px', flexWrap: 'wrap' }}>
              {ultimoPago?.estado === 'pendiente' ? (
                <span style={{
                  backgroundColor: 'rgba(245, 158, 11, 0.14)',
                  color: '#f59e0b',
                  border: '1px solid rgba(245, 158, 11, 0.28)',
                  borderRadius: '999px',
                  padding: '3px 10px',
                  fontSize: '11px',
                  fontWeight: 800,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}>
                  ⏳ Pago en Verificación
                </span>
              ) : tieneDeudaTotal ? (
                <span style={{
                  backgroundColor: tieneDeudaGas && !tieneDeudaCondominio && !tieneDeudaLocales
                    ? 'rgba(249, 115, 22, 0.15)'
                    : (tieneDeudaLocales && !tieneDeudaCondominio && !tieneDeudaGas
                      ? 'rgba(236, 72, 153, 0.15)'
                      : (aplicaDiferencia ? 'rgba(56, 189, 248, 0.15)' : 'rgba(239, 68, 68, 0.15)')),
                  color: tieneDeudaGas && !tieneDeudaCondominio && !tieneDeudaLocales
                    ? '#fb923c'
                    : (tieneDeudaLocales && !tieneDeudaCondominio && !tieneDeudaGas
                      ? '#f472b6'
                      : (aplicaDiferencia ? '#38bdf8' : '#ef4444')),
                  border: `1px solid ${
                    tieneDeudaGas && !tieneDeudaCondominio && !tieneDeudaLocales
                      ? 'rgba(249, 115, 22, 0.35)'
                      : (tieneDeudaLocales && !tieneDeudaCondominio && !tieneDeudaGas
                        ? 'rgba(236, 72, 153, 0.35)'
                        : (aplicaDiferencia ? 'rgba(56, 189, 248, 0.35)' : 'rgba(239, 68, 68, 0.3)'))
                  }`,
                  borderRadius: '999px',
                  padding: '3px 10px',
                  fontSize: '11px',
                  fontWeight: 800,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}>
                  {tieneDeudaGas && !tieneDeudaCondominio && !tieneDeudaLocales
                    ? '⛽ Solo Cuota de Gas Pendiente'
                    : tieneDeudaLocales && !tieneDeudaCondominio && !tieneDeudaGas
                    ? '🏬 Solo Deuda de Local Pendiente'
                    : aplicaDiferencia
                    ? '🔵 Diferencia Pendiente'
                    : (tieneDeudaCondominio && tieneDeudaGas) || (tieneDeudaCondominio && tieneDeudaLocales) || (tieneDeudaGas && tieneDeudaLocales)
                    ? '🔴 No está al día · Deudas Pendientes'
                    : '🔴 No está al día · Deuda Pendiente'}
                </span>
              ) : (
                <span style={{
                  backgroundColor: 'rgba(34, 197, 94, 0.14)',
                  color: '#22c55e',
                  border: '1px solid rgba(34, 197, 94, 0.28)',
                  borderRadius: '999px',
                  padding: '3px 10px',
                  fontSize: '11px',
                  fontWeight: 800,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}>
                  ● Al día · Solvente (Total)
                </span>
              )}

              <span style={{ color: '#8e8e93', fontSize: '12px', fontWeight: 600 }}>
                {ocultarSaldos ? '••••' : `≈ $${deudaTotalConsolidadaUsd.toFixed(2)} USD`}
              </span>
            </div>

            {/* ── DESGLOSE SINCRONIZADO: CONDOMINIO VS GAS COMUNAL (MÓVIL) ── */}
            <div style={{
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '16px',
              padding: '12px 14px',
              marginBottom: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#94a3b8', fontSize: '10.5px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Desglose Sincronizado de Deuda:
                </span>
                <span style={{ fontSize: '10px', color: '#38bdf8', fontWeight: 700 }}>
                  Tiempo Real
                </span>
              </div>

              {/* Fila Condominio */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#cbd5e1', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>🏢</span> Condominio Ordinario:
                </span>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ color: tieneDeudaCondominio ? '#fff' : '#22c55e', fontWeight: 800, fontSize: '12.5px' }}>
                    {ocultarSaldos ? '••••' : (tieneDeudaCondominio ? `Bs. ${fmtBs(deudaCondominioBs)}` : 'Solvente ✅')}
                  </span>
                  {tieneDeudaCondominio && (
                    <span style={{ color: '#8e8e93', fontSize: '10px', display: 'block' }}>
                      {ocultarSaldos ? '••••' : `≈ $${deudaCondominioUsd.toFixed(2)} USD`}
                    </span>
                  )}
                </div>
              </div>

              {/* Fila Gas */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: '1px dashed rgba(255, 255, 255, 0.08)' }}>
                <span style={{ color: '#cbd5e1', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>⛽</span> Servicio Gas Comunal:
                </span>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ color: tieneDeudaGas ? '#fb923c' : '#22c55e', fontWeight: 800, fontSize: '12.5px' }}>
                    {ocultarSaldos ? '••••' : (tieneDeudaGas ? `Bs. ${fmtBs(deudaGasBs)}` : 'Solvente ✅')}
                  </span>
                  {tieneDeudaGas && (
                    <span style={{ color: 'var(--color-accent, #f97316)', fontSize: '10px', display: 'block', fontWeight: 700 }}>
                      {ocultarSaldos ? '••••' : `≈ $${deudaGasUsd.toFixed(2)} USD`}
                    </span>
                  )}
                </div>
              </div>

              {/* Fila Locales Asignados (si aplica) */}
              {localesAsignados.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: '1px dashed rgba(255, 255, 255, 0.08)' }}>
                  <span
                    onClick={() => navigate('/locales')}
                    style={{ color: '#38bdf8', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                  >
                    <span>🏬</span> {localesAsignados[0].nombre}:
                  </span>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ color: tieneDeudaLocales ? '#ef4444' : '#22c55e', fontWeight: 800, fontSize: '12.5px' }}>
                      {ocultarSaldos ? '••••' : (tieneDeudaLocales ? `Bs. ${fmtBs(deudaLocalesBs || (deudaLocalesUsd * tasaValida))}` : 'Solvente ✅')}
                    </span>
                    {tieneDeudaLocales && (
                      <span style={{ color: '#f87171', fontSize: '10px', display: 'block', fontWeight: 700 }}>
                        {ocultarSaldos ? '••••' : `≈ $${deudaLocalesUsd.toFixed(2)} USD`}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Botones de Pago Específicos para el Residente */}
              {tieneDeudaTotal && (
                <div style={{ display: 'flex', gap: '6px', marginTop: '4px', paddingTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  {tieneDeudaGas && (
                    <button
                      onClick={() => {
                        setModalTipoPago('gas')
                        setModalOpen(true)
                      }}
                      style={{
                        flex: 1,
                        backgroundColor: 'rgba(249, 115, 22, 0.16)',
                        color: 'var(--color-accent, #f97316)',
                        border: '1px solid rgba(249, 115, 22, 0.35)',
                        borderRadius: '8px',
                        padding: '7px 6px',
                        fontSize: '11px',
                        fontWeight: 800,
                        cursor: 'pointer'
                      }}
                    >
                      Pagar Gas ⛽
                    </button>
                  )}
                  {tieneDeudaCondominio && (
                    <button
                      onClick={() => {
                        setModalTipoPago('condominio')
                        setModalOpen(true)
                      }}
                      style={{
                        flex: 1,
                        backgroundColor: 'rgba(59, 130, 246, 0.16)',
                        color: '#60a5fa',
                        border: '1px solid rgba(59, 130, 246, 0.35)',
                        borderRadius: '8px',
                        padding: '7px 6px',
                        fontSize: '11px',
                        fontWeight: 800,
                        cursor: 'pointer'
                      }}
                    >
                      Pagar Cond. 🏢
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setModalTipoPago('todos')
                      setModalOpen(true)
                    }}
                    style={{
                      flex: 1,
                      backgroundColor: 'var(--color-accent, #f97316)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '7px 6px',
                      fontSize: '11px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      boxShadow: 'var(--color-brand-shadow, 0 2px 8px rgba(249, 115, 22, 0.4))'
                    }}
                  >
                    Pagar Todo 💳
                  </button>
                </div>
              )}
            </div>

            {/* Desglose de Deudas por Modalidad (Bolívar Fijo vs Dólar BCV) - Solo si tiene deuda en Bolívares */}
            {tieneDeudaFijaBs && (
              <div style={{
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '14px',
                padding: '12px 14px',
                marginBottom: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                <div style={{ color: '#94a3b8', fontSize: '10.5px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Desglose de Deudas por Modalidad:
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#93c5fd', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>🔵</span> Deuda anclada a Bolívares:
                  </span>
                  <span style={{ color: '#60a5fa', fontWeight: 800, fontSize: '13px' }}>
                    {ocultarSaldos ? '••••••' : `Bs. ${deudaFijaBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  </span>
                </div>

                {deudaIndexadaUsd > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#86efac', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>🟢</span> Deuda indexada al Dólar (BCV):
                    </span>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ color: '#4ade80', fontWeight: 800, fontSize: '13px' }}>
                        {ocultarSaldos ? '••••' : `$${deudaIndexadaUsd.toFixed(2)} USD`}
                      </span>
                      <span style={{ color: '#94a3b8', fontSize: '10.5px', display: 'block' }}>
                        {ocultarSaldos ? '••••' : `≈ Bs. ${deudaIndexadaBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Saldo a Favor / Billetera Comunitaria */}
            {(saldoAFavor > 0 || saldoAFavorBs > 0) && (
              <div style={{
                backgroundColor: 'rgba(34, 197, 94, 0.12)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                borderRadius: '14px',
                padding: '10px 14px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '16px' }}>💚</span>
                  <div>
                    <div style={{ color: '#4ade80', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Saldo a Favor Disponible
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: '11px' }}>
                      Se deduce de tu próximo recibo
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: '#4ade80', fontSize: '14px', fontWeight: 800 }}>
                    {ocultarSaldos ? '••••' : (saldoAFavor >= 1 ? `+$${saldoAFavor.toFixed(2)} USD` : `+Bs. ${saldoAFavorBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)}
                  </div>
                  <div style={{ color: '#86efac', fontSize: '10px', fontWeight: 600 }}>
                    {ocultarSaldos ? '••••' : (saldoAFavor >= 1 ? `≈ Bs. ${saldoAFavorBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `≈ $${(saldoAFavor > 0 ? saldoAFavor : saldoAFavorBs / tasaValida).toFixed(2)} USD`)}
                  </div>
                </div>
              </div>
            )}

            {/* Desglose de 3 Columnas al pie (MES ACTUAL | ALÍCUOTA | TASA BCV) */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: '10px',
              borderTop: '1px solid rgba(255, 255, 255, 0.06)',
              paddingTop: '16px'
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: '#8e8e93', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px' }}>
                  MES ACTUAL
                </div>
                <div style={{ color: '#fff', fontSize: '13px', fontWeight: 800, overflowWrap: 'anywhere' }}>
                  {ocultarSaldos ? '••••' : `$${deudaUsd.toFixed(2)}`}
                </div>
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={{ color: '#8e8e93', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px' }}>
                  ALÍCUOTA
                </div>
                <div style={{ color: 'var(--color-accent, #f97316)', fontSize: '13px', fontWeight: 800, overflowWrap: 'break-word' }}>
                  {formatAlicuotaPct(alicuota)} {esPenthouse ? '(PH)' : ''}
                </div>
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={{ color: '#8e8e93', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px' }}>
                  TASA BCV
                </div>
                <div style={{ color: '#fff', fontSize: '13px', fontWeight: 800, overflowWrap: 'anywhere' }}>
                  Bs. {getTasaBcvNumerica(rate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          </div>

          {/* ── AVISO DE PAGO EN REVISIÓN (Si tiene último pago pendiente) ── */}
          {ultimoPago?.estado === 'pendiente' && (
            <div style={{
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: '16px',
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <span style={{ fontSize: '24px' }}>⏳</span>
              <div>
                <div style={{ color: '#f59e0b', fontSize: '13px', fontWeight: 800 }}>
                  Pago en Proceso de Conciliación
                </div>
                <div style={{ color: '#cbd5e1', fontSize: '11px', marginTop: '2px', lineHeight: 1.3 }}>
                  Reportaste Bs. {(Number(ultimoPago.monto_bs) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })} (Ref: <strong>{ultimoPago.referencia}</strong>). Será validado por la administración.
                </div>
              </div>
            </div>
          )}

          {/* ── ALERTA DE CUOTA ESPECIAL POR GAS (MÓVIL) ───────────── */}
          {deudaGas && deudaGas.tieneDeuda && (deudaGas.montoBs > 0 || deudaGas.montoUsd > 0) && (
            <div style={{
              background: deudaGas.esCuotaEspecial
                ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.18) 0%, rgba(249, 115, 22, 0.18) 100%)'
                : 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(37, 99, 235, 0.15) 100%)',
              border: deudaGas.esCuotaEspecial ? '2px solid #ef4444' : '1px solid rgba(59, 130, 246, 0.4)',
              borderRadius: '20px',
              padding: '16px',
              boxShadow: deudaGas.esCuotaEspecial ? '0 8px 24px rgba(239, 68, 68, 0.25)' : '0 8px 20px rgba(0, 0, 0, 0.4)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '20px' }}>{deudaGas.esCuotaEspecial ? '⚡' : '⛽'}</span>
                  <span style={{
                    fontWeight: 900,
                    fontSize: '13px',
                    color: deudaGas.esCuotaEspecial ? '#fca5a5' : '#93c5fd',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    {deudaGas.esCuotaEspecial ? 'Cuota Especial por Gas' : 'Cuota de Gas Comunal'}
                  </span>
                </div>
                <span style={{
                  fontSize: '10.5px',
                  fontWeight: 800,
                  backgroundColor: 'rgba(239, 68, 68, 0.25)',
                  color: '#f87171',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  padding: '2px 8px',
                  borderRadius: '999px'
                }}>
                  Pendiente
                </span>
              </div>

              <div style={{ fontSize: '13px', color: '#e2e8f0', marginBottom: '8px' }}>
                <b>{deudaGas.campanaTitulo || 'Aporte para recarga del tanque central'}</b>
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '12px' }}>
                <span style={{ fontSize: '22px', fontWeight: 900, color: '#fff' }}>
                  Bs. {fmtBs(deudaGas.montoBs)}
                </span>
                <span style={{ fontSize: '12px', color: '#cbd5e1' }}>
                  (≈ ${deudaGas.montoUsd.toFixed(2)} USD)
                </span>
              </div>

              {deudaGas.fechaLimite && (
                <div style={{ fontSize: '11px', color: '#fca5a5', marginBottom: '12px' }}>
                  ⏳ Fecha límite de pago: <b>{deudaGas.fechaLimite}</b>
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => navigate('/gas?reportar=1')}
                  style={{
                    flex: 2,
                    backgroundColor: 'var(--color-accent, #f97316)',
                    color: '#fff',
                    border: 'none',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    fontSize: '12.5px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    boxShadow: 'var(--color-brand-shadow, 0 4px 12px rgba(249, 115, 22, 0.4))'
                  }}
                >
                  <span>💳</span>
                  <span>Reportar Pago</span>
                </button>
                <button
                  onClick={() => navigate('/gas')}
                  style={{
                    flex: 1,
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    color: '#fff',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Ver Datos
                </button>
              </div>
            </div>
          )}

          {/* ── PRÓXIMOS CARGOS PROGRAMADOS / CUOTAS EXTRAORDINARIAS FUTURAS (MÓVIL) ── */}
          {cuotasExtraProgramadas.length > 0 && (
            <div style={{
              background: isLight
                ? 'linear-gradient(135deg, #eff6ff 0%, #ffffff 100%)'
                : 'linear-gradient(135deg, rgba(14, 165, 233, 0.14) 0%, rgba(15, 23, 42, 0.94) 100%)',
              border: isLight ? '1px solid #bae6fd' : '1px solid rgba(56, 189, 248, 0.35)',
              borderRadius: '20px',
              padding: '16px',
              boxShadow: isLight ? '0 4px 16px rgba(14, 165, 233, 0.08)' : '0 8px 24px rgba(0, 0, 0, 0.45)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ color: isLight ? '#0369a1' : '#38bdf8', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  🗓️ Próximo Cargo · Cuota Extraordinaria Programada ({cuotasExtraProgramadas.length})
                </span>
                <span style={{
                  backgroundColor: isLight ? '#e0f2fe' : 'rgba(56, 189, 248, 0.18)',
                  border: isLight ? '1px solid #7dd3fc' : '1px solid rgba(56, 189, 248, 0.38)',
                  color: isLight ? '#0369a1' : '#7dd3fc',
                  borderRadius: '999px',
                  padding: '2px 9px',
                  fontSize: '10px',
                  fontWeight: 800
                }}>
                  No exigible aún
                </span>
              </div>
              <p style={{ margin: '0 0 10px 0', fontSize: '11px', color: isLight ? '#475569' : '#94a3b8', lineHeight: 1.4 }}>
                Este cargo aún no se suma a tu deuda actual ni afecta tu solvencia. Entrará en vigencia a partir de la fecha indicada.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {cuotasExtraProgramadas.map(ce => {
                  const pagadaAdelantado = ce.estado === 'pagado' && Boolean(ce.pagadoPorAdelantado)
                  const abonado = Number(ce.abonado || 0)
                  const montoOrig = Number(ce.montoOriginal || ce.monto || abonado)
                  const tieneAbono = !pagadaAdelantado && abonado > 0.01
                  const pctAbono = montoOrig > 0 ? Math.min(100, Math.round((abonado / montoOrig) * 100)) : 0
                  return (
                    <div key={ce.id} className="domus-cuota-item" style={{
                      backgroundColor: isLight ? '#f8fafc' : 'rgba(0,0,0,0.28)',
                      border: pagadaAdelantado
                        ? (isLight ? '1px solid #86efac' : '1px solid rgba(34, 197, 94, 0.35)')
                        : (isLight ? '1px solid #cbd5e1' : '1px solid rgba(56, 189, 248, 0.2)'),
                      borderRadius: '12px',
                      padding: '11px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '2px' }}>
                            <span style={{
                              fontSize: '9.5px', fontWeight: 800, padding: '1px 6px', borderRadius: '4px',
                              backgroundColor: isLight ? '#e0f2fe' : 'rgba(56, 189, 248, 0.18)',
                              color: isLight ? '#0369a1' : '#7dd3fc'
                            }}>Cuota Extraordinaria</span>
                            {pagadaAdelantado && (
                              <span style={{
                                fontSize: '9.5px', fontWeight: 800, padding: '1px 6px', borderRadius: '4px',
                                backgroundColor: isLight ? '#dcfce7' : 'rgba(34, 197, 94, 0.18)',
                                color: isLight ? '#15803d' : '#4ade80'
                              }}>✅ Pagada por adelantado</span>
                            )}
                            {tieneAbono && (
                              <span style={{
                                fontSize: '9.5px', fontWeight: 800, padding: '1px 6px', borderRadius: '4px',
                                backgroundColor: isLight ? '#fef3c7' : 'rgba(245, 158, 11, 0.18)',
                                color: isLight ? '#b45309' : '#fbbf24'
                              }}>🌗 Abonada parcialmente</span>
                            )}
                          </div>
                          <div style={{ color: isLight ? '#0f172a' : '#fff', fontSize: '13px', fontWeight: 700 }}>{ce.label}</div>
                          {ce.descripcion && (
                            <div style={{ color: isLight ? '#475569' : '#94a3b8', fontSize: '11px', marginTop: '2px', lineHeight: 1.35 }}>{ce.descripcion}</div>
                          )}
                          <div style={{ fontSize: '10.5px', color: pagadaAdelantado ? (isLight ? '#15803d' : '#4ade80') : (isLight ? '#0369a1' : '#38bdf8'), fontWeight: 700, marginTop: '4px' }}>
                            {pagadaAdelantado
                              ? `Liquidada al 100% · No generará deuda el ${formatearFechaCortaEs(ce.fechaEmision)}`
                              : `📅 Cobro a partir del ${formatearFechaCortaEs(ce.fechaEmision)}${ce.fechaLimite ? ` · Límite: ${formatearFechaCortaEs(ce.fechaLimite)}` : ''}`}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{
                            color: pagadaAdelantado
                              ? (isLight ? '#15803d' : '#4ade80')
                              : (ce.moneda === 'BS' ? (isLight ? '#c2410c' : '#fb923c') : (isLight ? '#0369a1' : '#38bdf8')),
                            fontWeight: 800, fontSize: '13px'
                          }}>
                            {pagadaAdelantado
                              ? (ce.moneda === 'BS' ? `Bs. ${fmtBs(montoOrig)}` : `$${montoOrig.toFixed(2)} USD`)
                              : (ce.moneda === 'BS' ? `Bs. ${fmtBs(ce.monto)}` : `$${ce.monto.toFixed(2)} USD`)}
                          </div>
                          <div style={{ fontSize: '10px', color: isLight ? '#64748b' : '#94a3b8' }}>
                            {pagadaAdelantado ? 'Saldada anticipadamente' : (tieneAbono ? 'Saldo restante' : 'No incluido en saldo actual')}
                          </div>
                        </div>
                      </div>

                      {tieneAbono && (
                        <div style={{ marginTop: '2px' }}>
                          <div style={{ height: '5px', backgroundColor: isLight ? '#e2e8f0' : 'rgba(255,255,255,0.08)', borderRadius: '999px', overflow: 'hidden', marginBottom: '4px' }}>
                            <div style={{ width: `${pctAbono}%`, height: '100%', backgroundColor: '#10b981' }} />
                          </div>
                          <div style={{ fontSize: '10.5px', color: isLight ? '#475569' : '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
                            <span>Abonado: <b style={{ color: isLight ? '#047857' : '#34d399' }}>{ce.moneda === 'BS' ? `Bs. ${fmtBs(abonado)}` : `$${abonado.toFixed(2)}`}</b></span>
                            <span>Total cuota: {ce.moneda === 'BS' ? `Bs. ${fmtBs(montoOrig)}` : `$${montoOrig.toFixed(2)}`}</span>
                          </div>
                        </div>
                      )}

                      {!pagadaAdelantado && ce.monto > 0.01 && (
                        <div style={{ display: 'flex', gap: '8px', paddingTop: '2px' }}>
                          <button
                            type="button"
                            onClick={() => {
                              setModalTipoPago('condominio')
                              setModalCuotaAdelanto({ cuotaId: ce.id, modo: 'total' })
                              setModalOpen(true)
                            }}
                            style={{
                              flex: 1,
                              backgroundColor: isLight ? '#0284c7' : 'rgba(14, 165, 233, 0.2)',
                              border: isLight ? '1px solid #0284c7' : '1px solid rgba(56, 189, 248, 0.4)',
                              color: isLight ? '#ffffff' : '#7dd3fc',
                              borderRadius: '8px',
                              padding: '6px 10px',
                              fontSize: '11px',
                              fontWeight: 800,
                              cursor: 'pointer'
                            }}
                            className="domus-keep-white"
                          >
                            💳 Pagar por adelantado
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setModalTipoPago('condominio')
                              setModalCuotaAdelanto({ cuotaId: ce.id, modo: 'abono' })
                              setModalOpen(true)
                            }}
                            style={{
                              flex: 1,
                              backgroundColor: isLight ? '#f1f5f9' : 'rgba(255, 255, 255, 0.06)',
                              border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(255, 255, 255, 0.16)',
                              color: isLight ? '#0f172a' : '#e2e8f0',
                              borderRadius: '8px',
                              padding: '6px 10px',
                              fontSize: '11px',
                              fontWeight: 800,
                              cursor: 'pointer'
                            }}
                          >
                            ➕ Abonar a cuota
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── ALERTA DE CUOTAS EXTRAORDINARIAS VIGENTES / EXIGIBLES (MÓVIL) ── */}
          {cuotasExtraActivas.length > 0 && (
            <div style={{
              background: isLight
                ? 'linear-gradient(135deg, #fefce8 0%, #ffffff 100%)'
                : 'linear-gradient(135deg, rgba(234, 179, 8, 0.14) 0%, rgba(20, 21, 25, 0.95) 100%)',
              border: isLight ? '1px solid #fde047' : '1px solid rgba(234, 179, 8, 0.38)',
              borderRadius: '20px',
              padding: '16px',
              boxShadow: isLight ? '0 4px 16px rgba(202, 138, 4, 0.08)' : '0 8px 24px rgba(0, 0, 0, 0.45)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', gap: '8px' }}>
                <span style={{ color: isLight ? '#a16207' : '#facc15', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  ✨ Cuotas Extraordinarias Vigentes ({cuotasExtraActivas.length})
                </span>
                <button
                  onClick={() => {
                    setModalTipoPago('condominio')
                    setModalOpen(true)
                  }}
                  style={{
                    backgroundColor: isLight ? '#eab308' : 'rgba(234, 179, 8, 0.2)',
                    border: isLight ? '1px solid #ca8a04' : '1px solid rgba(234, 179, 8, 0.4)',
                    color: isLight ? '#000' : '#fde047',
                    borderRadius: '8px',
                    padding: '4px 10px',
                    fontSize: '11px',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  Pagar
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {cuotasExtraActivas.map(ce => {
                  const vencida = ce.estadoVigencia ? ce.estadoVigencia === 'vencida' : Boolean(ce.fechaLimite && ce.fechaLimite < hoyLocalIso)
                  return (
                    <div key={ce.id} className="domus-cuota-item" style={{
                      backgroundColor: isLight ? '#ffffff' : 'rgba(0,0,0,0.28)',
                      border: `1px solid ${vencida ? 'rgba(239,68,68,0.35)' : (isLight ? '#fde68a' : 'rgba(255,255,255,0.07)')}`,
                      borderRadius: '12px',
                      padding: '10px 12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '2px' }}>
                          <span style={{
                            fontSize: '9.5px', fontWeight: 800, padding: '1px 6px', borderRadius: '4px',
                            backgroundColor: isLight ? '#fef3c7' : 'rgba(234,179,8,0.2)',
                            color: isLight ? '#92400e' : '#fde047'
                          }}>Cuota Extraordinaria</span>
                          <span style={{
                            fontSize: '9.5px', fontWeight: 800, padding: '1px 6px', borderRadius: '4px',
                            backgroundColor: vencida ? (isLight ? '#fee2e2' : 'rgba(239,68,68,0.2)') : (isLight ? '#dcfce7' : 'rgba(34,197,94,0.18)'),
                            color: vencida ? (isLight ? '#b91c1c' : '#f87171') : (isLight ? '#15803d' : '#4ade80')
                          }}>{vencida ? '⚠️ Vencida' : 'Vigente al cobro'}</span>
                        </div>
                        <div style={{ color: isLight ? '#0f172a' : '#fff', fontSize: '13px', fontWeight: 700 }}>{ce.label}</div>
                        {ce.descripcion && (
                          <div style={{ color: isLight ? '#475569' : '#94a3b8', fontSize: '11px', marginTop: '2px', lineHeight: 1.35 }}>{ce.descripcion}</div>
                        )}
                        {(ce.fechaEmision || ce.fechaLimite) && (
                          <div style={{ fontSize: '10.5px', color: vencida ? (isLight ? '#dc2626' : '#f87171') : (isLight ? '#64748b' : '#94a3b8'), marginTop: '3px' }}>
                            {ce.fechaEmision ? `Vigente desde: ${formatearFechaCortaEs(ce.fechaEmision)}` : ''}
                            {ce.fechaEmision && ce.fechaLimite ? ' · ' : ''}
                            {ce.fechaLimite ? `${vencida ? '⚠️ Vencida:' : '📅 Límite:'} ${formatearFechaCortaEs(ce.fechaLimite)}` : ''}
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ color: ce.moneda === 'BS' ? (isLight ? '#c2410c' : '#fb923c') : (isLight ? '#a16207' : '#facc15'), fontWeight: 800, fontSize: '13px' }}>
                          {ce.moneda === 'BS' ? `Bs. ${fmtBs(ce.monto)}` : `$${ce.monto.toFixed(2)} USD`}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── ALERTA DE RECIBO / MORA (Si el apartamento figura en la lista y tiene deuda real exigible) ── */}
          {moraRecord && tieneDeudaReal && (() => {
            const tasaCfg = getTasaConfig(moraRecord.tasa_riesgo)
            const esDiferencia = aplicaDiferencia
            const esSoloExtraVigente = soloCuotasExtraActivas && !tieneCuotaExtraVencida && !esDiferencia
            const esSoloExtraVencida = soloCuotasExtraActivas && tieneCuotaExtraVencida && !esDiferencia
            const nombresExtraTexto = cuotasExtraActivas.map(c => c.label).join(', ')
            const conceptoGeneralMora = tieneDeudaAnterior && cuotasExtraActivas.length > 0
              ? 'deuda anterior y Cuota(s) Extraordinaria(s) por un total de'
              : tieneDeudaAnterior
              ? 'deuda anterior acumulada de'
              : cuotasExtraActivas.length > 0 && tieneRecibosMora
              ? 'recibo(s) pendiente(s) y Cuota(s) Extraordinaria(s) por un total de'
              : 'recibos pendientes acumulados de'
            const accentMobile = esDiferencia
              ? '#38bdf8'
              : esSoloExtraVigente
              ? '#eab308'
              : (moraRecord.tasa_riesgo === 'azul' ? '#ef4444' : tasaCfg.color)
            return (
            <div style={{
              background: esDiferencia
                ? 'linear-gradient(135deg, rgba(14, 165, 233, 0.16) 0%, rgba(3, 105, 161, 0.16) 100%)'
                : esSoloExtraVigente
                ? 'linear-gradient(135deg, rgba(234, 179, 8, 0.14) 0%, rgba(202, 138, 4, 0.08) 100%)'
                : 'linear-gradient(135deg, rgba(239, 68, 68, 0.12) 0%, rgba(185, 28, 28, 0.12) 100%)',
              border: `2px solid ${accentMobile}`,
              borderRadius: '20px',
              padding: '16px',
              boxShadow: `0 8px 24px rgba(0, 0, 0, 0.5), 0 0 16px ${accentMobile}35`
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '20px' }}>{esDiferencia ? '💳' : esSoloExtraVigente ? '✨' : (moraRecord.tasa_riesgo === 'azul' ? '🔴' : '⚠️')}</span>
                <span style={{ fontWeight: 800, fontSize: '13px', color: '#fff' }}>
                  {esDiferencia
                    ? `Apto ${moraRecord.apartamento_numero} · Saldo Pendiente de tu Último Recibo`
                    : esSoloExtraVigente
                    ? `Apto ${moraRecord.apartamento_numero} · Cuota Extraordinaria Vigente`
                    : esSoloExtraVencida
                    ? `Apto ${moraRecord.apartamento_numero} · Cuota Extraordinaria Vencida`
                    : moraRecord.tasa_riesgo === 'azul'
                    ? `Apto ${moraRecord.apartamento_numero} · No está al día · Recibo al Cobro`
                    : `Apto ${moraRecord.apartamento_numero} · No está al día · En Lista de Mora`}
                </span>
                <span style={{
                  fontSize: '10px', fontWeight: 800,
                  color: accentMobile,
                  background: esDiferencia ? 'rgba(56, 189, 248, 0.15)' : esSoloExtraVigente ? 'rgba(234, 179, 8, 0.16)' : (moraRecord.tasa_riesgo === 'azul' ? 'rgba(239, 68, 68, 0.15)' : tasaCfg.bg),
                  border: `1px solid ${accentMobile}55`,
                  padding: '2px 6px', borderRadius: '999px', marginLeft: 'auto'
                }}>
                  {esDiferencia
                    ? '🔵 Diferencia Pendiente'
                    : esSoloExtraVigente
                    ? '✨ Cuota Extraordinaria'
                    : esSoloExtraVencida
                    ? '⚠️ Cuota Extraordinaria Vencida'
                    : (moraRecord.tasa_riesgo === 'azul' ? '🔴 No está al día' : tasaCfg.badgeText)}
                </span>
              </div>
              <p style={{ margin: '0 0 12px 0', fontSize: '11px', color: '#cbd5e1', lineHeight: 1.35 }}>
                {esDiferencia ? (
                  tieneSaldoAFavor ? (
                    <>
                      Tienes saldo a favor aplicado. Te queda por pagar una diferencia de: <strong style={{ color: '#38bdf8' }}>${deudaUsd.toFixed(2)} USD (Bs. {fmtBs(deudaBs)})</strong>. Reporta tu pago para quedar completamente al día.
                    </>
                  ) : (
                    <>
                      Le queda por pagar la diferencia de su último recibo: <strong style={{ color: '#38bdf8' }}>${deudaUsd.toFixed(2)} USD (Bs. {fmtBs(deudaBs)})</strong>. Reporta tu pago para quedar completamente al día.
                    </>
                  )
                ) : esSoloExtraVigente ? (
                  <>
                    Posees una <strong>Cuota Extraordinaria</strong> vigente ({nombresExtraTexto}) por{' '}
                    <strong style={{ color: '#facc15' }}>${deudaUsd.toFixed(2)} USD (Bs. {fmtBs(deudaBs)})</strong>. Cancélala antes de su vencimiento para mantener tu solvencia.
                  </>
                ) : esSoloExtraVencida ? (
                  <>
                    Presentas una <strong>Cuota Extraordinaria</strong> vencida ({nombresExtraTexto}) por{' '}
                    <strong style={{ color: '#f87171' }}>${deudaUsd.toFixed(2)} USD (Bs. {fmtBs(deudaBs)})</strong>. Regulariza tu pago para volver a estar al día.
                  </>
                ) : moraRecord.tasa_riesgo === 'azul' ? (
                  <>
                    Tu apartamento no está al día. Tienes el recibo del mes emitido (&lt;1 mes) con un monto de{' '}
                    <strong style={{ color: '#f87171' }}>${deudaUsd.toFixed(2)} USD</strong>. Reporta tu pago para regularizar tu solvencia.
                  </>
                ) : (
                  <>
                    Tu apartamento no está al día. Tienes <strong>{moraRecord.meses_deuda} meses de atraso</strong> con {conceptoGeneralMora}{' '}
                    <strong style={{ color: 'var(--color-accent, #f97316)' }}>${deudaUsd.toFixed(2)} USD (Bs. {fmtBs(deudaBs)})</strong>.
                  </>
                )}
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => navigate('/recibos?filtro=pendientes')}
                  style={{
                    flex: 1,
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.16)',
                    color: '#fff',
                    padding: '8px 10px',
                    borderRadius: '10px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {esDiferencia ? 'Ver detalle' : 'Ver mora'}
                </button>
                <button
                  onClick={() => setModalOpen(true)}
                  style={{
                    flex: 1,
                    background: 'var(--color-brand-gradient, linear-gradient(135deg, #fb923c 0%, #f97316 100%))',
                    border: 'none',
                    color: '#fff',
                    padding: '8px 10px',
                    borderRadius: '10px',
                    fontSize: '11px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: 'var(--color-brand-shadow, 0 2px 10px rgba(249, 115, 22, 0.4))'
                  }}
                >
                  Reportar Pago
                </button>
              </div>
            </div>
            )
          })()}

          {/* ── SECCIÓN: CARTA DE SOLVENCIA (MÓVIL) - SOLO VISIBLE SI ESTÁ 100% SOLVENTE ── */}
          {estaSolvente && (
            <div style={{
              background: 'linear-gradient(135deg, rgba(22, 163, 74, 0.16) 0%, rgba(15, 23, 42, 0.92) 50%, rgba(34, 197, 94, 0.12) 100%)',
              border: '1.5px solid rgba(34, 197, 94, 0.42)',
              borderRadius: '24px',
              padding: '20px 20px 18px',
              boxShadow: '0 12px 36px rgba(0, 0, 0, 0.5), 0 0 24px rgba(34, 197, 94, 0.15)',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <div style={{
                position: 'absolute',
                top: '-30px',
                right: '-30px',
                width: '100px',
                height: '100px',
                borderRadius: '50%',
                backgroundColor: 'rgba(34, 197, 94, 0.2)',
                filter: 'blur(25px)',
                pointerEvents: 'none'
              }} />

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '14px' }}>
                <div style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '14px',
                  backgroundColor: 'rgba(34, 197, 94, 0.2)',
                  border: '1.5px solid rgba(34, 197, 94, 0.45)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px',
                  flexShrink: 0,
                  boxShadow: '0 4px 14px rgba(34, 197, 94, 0.25)'
                }}>
                  📜
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, color: '#fff', fontSize: '16.5px', fontWeight: 800 }}>
                      Carta de Solvencia
                    </h3>
                    <span style={{
                      backgroundColor: 'rgba(34, 197, 94, 0.25)',
                      color: '#4ade80',
                      border: '1px solid rgba(34, 197, 94, 0.45)',
                      borderRadius: '999px',
                      padding: '2px 8px',
                      fontSize: '10.5px',
                      fontWeight: 800
                    }}>
                      ✓ 100% Solvente
                    </span>
                  </div>
                  <p style={{ margin: '4px 0 0', color: '#cbd5e1', fontSize: '12px', lineHeight: 1.4 }}>
                    ¡Felicidades! Tu apartamento no registra ninguna deuda de condominio ni gas. Tu constancia oficial se encuentra lista.
                  </p>
                </div>
              </div>

              {/* Botones de acción móvil */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: '10px' }}>
                <button
                  onClick={() => setModalSolvenciaOpen(true)}
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.07)',
                    border: '1px solid rgba(255, 255, 255, 0.14)',
                    color: '#fff',
                    borderRadius: '12px',
                    padding: '10px 8px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '5px'
                  }}
                >
                  <span>👁️</span>
                  <span>Ver Carta</span>
                </button>

                <button
                  onClick={() => descargarSolvenciaPDF(datosCartaSolvencia)}
                  style={{
                    background: 'linear-gradient(135deg, #16a34a 0%, #22c55e 100%)',
                    border: 'none',
                    color: '#fff',
                    borderRadius: '12px',
                    padding: '10px 10px',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '5px',
                    boxShadow: '0 4px 14px rgba(34, 197, 94, 0.35)'
                  }}
                >
                  <span>📥</span>
                  <span>Descargar PDF</span>
                </button>
              </div>

              {/* Barra inferior sincronizada */}
              <div style={{
                marginTop: '12px',
                paddingTop: '10px',
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '11px',
                color: '#94a3b8'
              }}>
                <span>Apto: <strong style={{ color: '#fff' }}>{datosCartaSolvencia.residenteApto}</strong></span>
                <span>Hasta: <strong style={{ color: '#4ade80' }}>{datosCartaSolvencia.mesSolvente} {datosCartaSolvencia.anioSolvente}</strong></span>
              </div>
            </div>
          )}

          <DashboardQuickActions
            estaSolvente={estaSolvente}
            onReportarPago={() => setModalOpen(true)}
            onOpenSolvencia={() => setModalSolvenciaOpen(true)}
            onNavigate={navigate}
          />

          {/* ── 3. ÚLTIMOS PAGOS REPORTADOS / MOVIMIENTOS ── */}
          <div style={{
            backgroundColor: '#141519',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '24px',
            padding: '20px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ color: '#fff', fontSize: '15px', fontWeight: 800, margin: 0 }}>
                Mis Pagos Recientes
              </h3>
              <button
                onClick={() => navigate('/recibos')}
                style={{ background: 'none', border: 'none', color: 'var(--color-accent, #f97316)', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
              >
                Ver todos →
              </button>
            </div>

            {pagosRecientes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 10px', color: '#64748b' }}>
                <p style={{ margin: 0, fontSize: '13px' }}>Aún no has reportado pagos este mes.</p>
                <button
                  onClick={() => setModalOpen(true)}
                  style={{
                    marginTop: '12px',
                    background: 'var(--color-accent-light, rgba(249, 115, 22, 0.12))',
                    border: '1px solid var(--color-accent-glow, rgba(249, 115, 22, 0.3))',
                    color: 'var(--color-accent, #f97316)',
                    padding: '8px 16px',
                    borderRadius: '10px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Reportar Pago Ahora
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {pagosRecientes.slice(0, 4).map((pago) => {
                  const isAprobado = pago.estado === 'aprobado'
                  const isRechazado = pago.estado === 'rechazado'

                  return (
                    <div
                      key={pago.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 14px',
                        backgroundColor: '#1b1d22',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        borderRadius: '14px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                          width: '38px', height: '38px', borderRadius: '10px',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px',
                          backgroundColor: isAprobado ? 'rgba(34, 197, 94, 0.15)' : isRechazado ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                          color: isAprobado ? '#22c55e' : isRechazado ? '#ef4444' : '#f59e0b',
                          flexShrink: 0
                        }}>
                          {isAprobado ? '✓' : isRechazado ? '✕' : '⏳'}
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{ color: '#fff', fontSize: '13px', fontWeight: 700 }}>
                              Ref: {pago.referencia}
                            </span>
                            {(() => {
                              const m = parsePagoMeta(pago.notas_admin)
                              if (m?.esAdelantoCuotaFutura) {
                                return (
                                  <span style={{ fontSize: '9.5px', fontWeight: 800, color: '#38bdf8', backgroundColor: 'rgba(14,165,233,0.16)', padding: '1px 6px', borderRadius: '4px' }}>
                                    {m.esAbonoParcialAdelanto ? '🌗 Abono Adelantado' : '🗓️ Pago Adelantado'}
                                  </span>
                                )
                              }
                              if (m?.tipoServicio === 'gas') return <span style={{ fontSize: '9.5px', fontWeight: 800, color: '#fb923c', backgroundColor: 'rgba(249,115,22,0.16)', padding: '1px 6px', borderRadius: '4px' }}>⛽ Gas</span>
                              if (m?.tipoServicio === 'mixto') return <span style={{ fontSize: '9.5px', fontWeight: 800, color: '#c084fc', backgroundColor: 'rgba(168,85,247,0.16)', padding: '1px 6px', borderRadius: '4px' }}>🔀 Mixto</span>
                              return null
                            })()}
                          </div>
                          <div style={{ color: '#8e8e93', fontSize: '11px', marginTop: '1px' }}>
                            {new Date(pago.created_at).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })}
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{ color: '#fff', fontSize: '13px', fontWeight: 800 }}>
                          Bs. {pago.monto_bs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                        </div>
                        <span style={{
                          fontSize: '10px', fontWeight: 800,
                          color: isAprobado ? '#22c55e' : isRechazado ? '#ef4444' : '#f59e0b',
                          textTransform: 'uppercase'
                        }}>
                          {isAprobado ? 'Aprobado' : isRechazado ? 'Rechazado' : 'En Verificación'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <FondoReservaCard
            ubicaciones={fondoReserva?.ubicaciones || []}
            movimientos={fondoReserva?.movimientos || []}
            totales={calcularTotalesFondoReserva(fondoReserva?.ubicaciones || [], tasaValida)}
            ocultarSaldos={ocultarSaldos}
            compact={true}
            onVerDetalle={() => navigate('/fondo-reserva')}
          />

        </div>


        {/* ═════════════════════════════════════════════════════════════════ */}
        {/* ── VISTA PC (DESKTOP) - BENTO GRID ELEGANTE Y OSCURA ─────────── */}
        {/* ═════════════════════════════════════════════════════════════════ */}
        <div className="resident-desktop-view">

          {/* Cartelera / Barra de Avisos Rápidos Desktop */}
          <AvisoBanner />

          {/* Header Superior Desktop */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '14px',
            marginBottom: '28px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            paddingBottom: '20px'
          }}>
            <div style={{ minWidth: 0, flex: '1 1 280px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <h1 style={{ color: '#fff', fontSize: 'clamp(20px, 2.2vw, 26px)', fontWeight: 900, margin: 0, letterSpacing: '-0.5px', overflowWrap: 'break-word' }}>
                  ¡Hola, {residenteNombre}!
                </h1>
                <span style={{
                  backgroundColor: 'var(--color-accent-light, rgba(249, 115, 22, 0.15))',
                  color: 'var(--color-accent, #f97316)',
                  border: '1px solid var(--color-accent-glow, rgba(249, 115, 22, 0.3))',
                  padding: '3px 10px',
                  borderRadius: '999px',
                  fontSize: '12px',
                  fontWeight: 800,
                  flexShrink: 0
                }}>
                  Apartamento {aptoNumero}
                </span>
              </div>
              <p style={{ color: '#7e8b9b', fontSize: '14px', margin: '6px 0 0 0' }}>
                Estado de cuenta, alícuota asignada y gestión de pagos de condominio.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', flexShrink: 0 }}>
              {/* Tasa BCV Oficial Widget */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '14px',
                padding: '8px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <span style={{ fontSize: '18px' }}>🇻🇪</span>
                <div>
                  <div style={{ color: '#8e8e93', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase' }}>TASA BCV</div>
                  <div style={{ color: '#fff', fontSize: '13px', fontWeight: 800 }}>
                    {loadingRate ? 'Cargando...' : `Bs. ${getTasaBcvNumerica(rate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / $`}
                  </div>
                </div>
              </div>

              {/* Botón Principal Reportar Pago */}
              <button
                onClick={() => setModalOpen(true)}
                style={{
                  background: 'var(--color-brand-gradient, linear-gradient(135deg, #fb923c 0%, #ea580c 100%))',
                  border: '1px solid rgba(255, 255, 255, 0.25)',
                  color: '#fff',
                  padding: '12px 22px',
                  borderRadius: '14px',
                  fontSize: '14px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: 'var(--color-brand-shadow, 0 4px 18px rgba(234, 88, 12, 0.45))',
                  transition: 'all 0.2s'
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
                <span>Reportar Pago</span>
              </button>
            </div>
          </div>

          {/* ALERTA DE MORA / RECIBO DESKTOP (Si aplica y tiene deuda real exigible) */}
          {moraRecord && tieneDeudaReal && (() => {
            const tasaCfg = getTasaConfig(moraRecord.tasa_riesgo)
            const esDiferencia = aplicaDiferencia
            const esSoloExtraVigente = soloCuotasExtraActivas && !tieneCuotaExtraVencida && !esDiferencia
            const esSoloExtraVencida = soloCuotasExtraActivas && tieneCuotaExtraVencida && !esDiferencia
            const nombresExtraTexto = cuotasExtraActivas.map(c => c.label).join(', ')
            const conceptoGeneralMora = tieneDeudaAnterior && cuotasExtraActivas.length > 0
              ? 'deuda anterior y Cuota(s) Extraordinaria(s) por un total de'
              : tieneDeudaAnterior
              ? 'deuda anterior acumulada de'
              : cuotasExtraActivas.length > 0 && tieneRecibosMora
              ? 'recibo(s) pendiente(s) y Cuota(s) Extraordinaria(s) por un total de'
              : 'recibos pendientes acumulados de'
            const accentDesktop = esDiferencia
              ? '#38bdf8'
              : esSoloExtraVigente
              ? '#eab308'
              : (moraRecord.tasa_riesgo === 'azul' ? '#ef4444' : tasaCfg.color)
            return (
            <div style={{
              background: esDiferencia
                ? 'linear-gradient(135deg, rgba(14, 165, 233, 0.16) 0%, rgba(3, 105, 161, 0.16) 100%)'
                : esSoloExtraVigente
                ? 'linear-gradient(135deg, rgba(234, 179, 8, 0.14) 0%, rgba(202, 138, 4, 0.08) 100%)'
                : 'linear-gradient(135deg, rgba(239, 68, 68, 0.12) 0%, rgba(185, 28, 28, 0.12) 100%)',
              border: `2px solid ${accentDesktop}`,
              borderRadius: '20px',
              padding: '18px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '14px',
              marginBottom: '24px',
              boxShadow: `0 8px 30px rgba(0, 0, 0, 0.5), 0 0 16px ${accentDesktop}35`
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: '1 1 280px', minWidth: 0 }}>
                <span style={{ fontSize: '32px', flexShrink: 0 }}>{esDiferencia ? '💳' : esSoloExtraVigente ? '✨' : (moraRecord.tasa_riesgo === 'azul' ? '🔴' : '⚠️')}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, fontSize: '16px', color: '#fff' }}>
                      {esDiferencia
                        ? `Tu Apartamento (${moraRecord.apartamento_numero}) tiene un saldo pendiente en su último recibo`
                        : esSoloExtraVigente
                        ? `Tu Apartamento (${moraRecord.apartamento_numero}) · Cuota Extraordinaria Vigente`
                        : esSoloExtraVencida
                        ? `Tu Apartamento (${moraRecord.apartamento_numero}) · Cuota Extraordinaria Vencida`
                        : moraRecord.tasa_riesgo === 'azul'
                        ? `Tu Apartamento (${moraRecord.apartamento_numero}) no está al día · Recibo del Mes al Cobro`
                        : `Tu Apartamento (${moraRecord.apartamento_numero}) no está al día · En Lista de Mora`}
                    </span>
                    <span style={{
                      fontSize: '11px', fontWeight: 800,
                      color: accentDesktop,
                      background: esDiferencia ? 'rgba(56, 189, 248, 0.15)' : esSoloExtraVigente ? 'rgba(234, 179, 8, 0.16)' : (moraRecord.tasa_riesgo === 'azul' ? 'rgba(239, 68, 68, 0.15)' : tasaCfg.bg),
                      border: `1px solid ${accentDesktop}55`,
                      padding: '2px 8px', borderRadius: '999px'
                    }}>
                      {esDiferencia
                        ? '🔵 Diferencia Pendiente'
                        : esSoloExtraVigente
                        ? '✨ Cuota Extraordinaria'
                        : esSoloExtraVencida
                        ? '⚠️ Cuota Extraordinaria Vencida'
                        : (moraRecord.tasa_riesgo === 'azul' ? '🔴 No está al día' : tasaCfg.badgeText)}
                    </span>
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#cbd5e1' }}>
                    {esDiferencia ? (
                      tieneSaldoAFavor ? (
                        <>
                          Tienes saldo a favor aplicado. Te queda por pagar una diferencia de: <strong style={{ color: '#38bdf8' }}>${deudaUsd.toFixed(2)} USD (Bs. {fmtBs(deudaBs)})</strong>. Reporta tu pago para mantener tu solvencia al 100%.
                        </>
                      ) : (
                        <>
                          Le queda por pagar la diferencia de su último recibo: <strong style={{ color: '#38bdf8' }}>${deudaUsd.toFixed(2)} USD (Bs. {fmtBs(deudaBs)})</strong>. Reporta tu pago para mantener tu solvencia al 100%.
                        </>
                      )
                    ) : esSoloExtraVigente ? (
                      <>
                        Tienes una <strong>Cuota Extraordinaria</strong> vigente al cobro ({nombresExtraTexto}) por{' '}
                        <strong style={{ color: '#facc15' }}>${deudaUsd.toFixed(2)} USD (Bs. {fmtBs(deudaBs)})</strong>. Cancélala dentro de su plazo para conservar tu solvencia.
                      </>
                    ) : esSoloExtraVencida ? (
                      <>
                        Presentas una <strong>Cuota Extraordinaria</strong> vencida ({nombresExtraTexto}) por{' '}
                        <strong style={{ color: '#f87171' }}>${deudaUsd.toFixed(2)} USD (Bs. {fmtBs(deudaBs)})</strong>. Regulariza tu saldo para recuperar tu solvencia.
                      </>
                    ) : moraRecord.tasa_riesgo === 'azul' ? (
                      <>
                        Tu apartamento no está al día. Tienes el recibo del mes emitido (&lt;1 mes) con un monto de{' '}
                        <strong style={{ color: '#f87171' }}>${deudaUsd.toFixed(2)} USD</strong>. Cancela dentro del plazo para regularizar tu solvencia comunitaria.
                      </>
                    ) : (
                      <>
                        Tu apartamento no está al día. Presentas <strong>{moraRecord.meses_deuda} meses de atraso</strong> con {conceptoGeneralMora}{' '}
                        <strong style={{ color: 'var(--color-accent, #f97316)' }}>${deudaUsd.toFixed(2)} USD (Bs. {fmtBs(deudaBs)})</strong>. Regulariza tu saldo para evitar recargos legales.
                      </>
                    )}
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => navigate('/recibos?filtro=pendientes')}
                  style={{
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.16)',
                    color: '#fff',
                    padding: '9px 16px',
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {esDiferencia ? 'Ver detalle' : 'Ver mora'}
                </button>
                <button
                  onClick={() => setModalOpen(true)}
                  style={{
                    background: 'var(--color-brand-gradient, linear-gradient(135deg, #fb923c 0%, #f97316 100%))',
                    border: 'none',
                    color: '#fff',
                    padding: '9px 18px',
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: 'var(--color-brand-shadow, 0 2px 12px rgba(249, 115, 22, 0.4))'
                  }}
                >
                  Reportar Pago
                </button>
              </div>
            </div>
            )
          })()}

          {/* ── PRÓXIMOS CARGOS / CUOTAS EXTRAORDINARIAS PROGRAMADAS (DESKTOP) ── */}
          {cuotasExtraProgramadas.length > 0 && (
            <div style={{
              background: isLight
                ? 'linear-gradient(135deg, #eff6ff 0%, #ffffff 100%)'
                : 'linear-gradient(135deg, rgba(14, 165, 233, 0.12) 0%, rgba(15, 23, 42, 0.94) 100%)',
              border: isLight ? '1px solid #bae6fd' : '1px solid rgba(56, 189, 248, 0.35)',
              borderRadius: '20px',
              padding: '18px 24px',
              marginBottom: '24px',
              boxShadow: isLight ? '0 6px 20px rgba(14, 165, 233, 0.08)' : '0 8px 26px rgba(0, 0, 0, 0.45)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '20px' }}>🗓️</span>
                  <div>
                    <div style={{ color: isLight ? '#0369a1' : '#38bdf8', fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Próximo Cargo · Cuota Extraordinaria Programada ({cuotasExtraProgramadas.length})
                    </div>
                    <div style={{ color: isLight ? '#475569' : '#94a3b8', fontSize: '12px' }}>
                      Este cargo aún no se suma a tu deuda actual ni afecta tu solvencia. Entrará en vigencia a partir de la fecha indicada por la administración.
                    </div>
                  </div>
                </div>
                <span style={{
                  backgroundColor: isLight ? '#e0f2fe' : 'rgba(56, 189, 248, 0.16)',
                  color: isLight ? '#0369a1' : '#7dd3fc',
                  border: isLight ? '1px solid #7dd3fc' : '1px solid rgba(56, 189, 248, 0.35)',
                  borderRadius: '999px',
                  padding: '5px 12px',
                  fontSize: '11px',
                  fontWeight: 800
                }}>
                  Programado · No exigible aún
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px' }}>
                {cuotasExtraProgramadas.map(ce => {
                  const pagadaAdelantado = ce.estado === 'pagado' && Boolean(ce.pagadoPorAdelantado)
                  const abonado = Number(ce.abonado || 0)
                  const montoOrig = Number(ce.montoOriginal || ce.monto || abonado)
                  const tieneAbono = !pagadaAdelantado && abonado > 0.01
                  const pctAbono = montoOrig > 0 ? Math.min(100, Math.round((abonado / montoOrig) * 100)) : 0
                  return (
                    <div key={ce.id} className="domus-cuota-item" style={{
                      backgroundColor: isLight ? '#f8fafc' : 'rgba(0,0,0,0.28)',
                      border: pagadaAdelantado
                        ? (isLight ? '1px solid #86efac' : '1px solid rgba(34, 197, 94, 0.35)')
                        : (isLight ? '1px solid #cbd5e1' : '1px solid rgba(56,189,248,0.2)'),
                      borderRadius: '14px',
                      padding: '14px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
                            <span style={{
                              fontSize: '10px', fontWeight: 800, padding: '2px 7px', borderRadius: '5px',
                              backgroundColor: isLight ? '#e0f2fe' : 'rgba(56, 189, 248, 0.18)',
                              color: isLight ? '#0369a1' : '#7dd3fc'
                            }}>Cuota Extraordinaria</span>
                            {pagadaAdelantado && (
                              <span style={{
                                fontSize: '10px', fontWeight: 800, padding: '2px 7px', borderRadius: '5px',
                                backgroundColor: isLight ? '#dcfce7' : 'rgba(34, 197, 94, 0.18)',
                                color: isLight ? '#15803d' : '#4ade80'
                              }}>✅ Pagada por adelantado</span>
                            )}
                            {tieneAbono && (
                              <span style={{
                                fontSize: '10px', fontWeight: 800, padding: '2px 7px', borderRadius: '5px',
                                backgroundColor: isLight ? '#fef3c7' : 'rgba(245, 158, 11, 0.18)',
                                color: isLight ? '#b45309' : '#fbbf24'
                              }}>🌗 Abonada parcialmente</span>
                            )}
                          </div>
                          <div style={{ color: isLight ? '#0f172a' : '#fff', fontSize: '13.5px', fontWeight: 700 }}>{ce.label}</div>
                          {ce.descripcion && (
                            <div style={{ color: isLight ? '#475569' : '#94a3b8', fontSize: '11.5px', marginTop: '3px', lineHeight: 1.4 }}>{ce.descripcion}</div>
                          )}
                          <div style={{ fontSize: '11px', color: pagadaAdelantado ? (isLight ? '#15803d' : '#4ade80') : (isLight ? '#0369a1' : '#38bdf8'), fontWeight: 700, marginTop: '5px' }}>
                            {pagadaAdelantado
                              ? `Liquidada al 100% · No generará deuda el ${formatearFechaCortaEs(ce.fechaEmision)}`
                              : `📅 Cobro a partir del ${formatearFechaCortaEs(ce.fechaEmision)}${ce.fechaLimite ? ` · Fecha límite: ${formatearFechaCortaEs(ce.fechaLimite)}` : ''}`}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{
                            color: pagadaAdelantado
                              ? (isLight ? '#15803d' : '#4ade80')
                              : (ce.moneda === 'BS' ? (isLight ? '#c2410c' : '#fb923c') : (isLight ? '#0369a1' : '#38bdf8')),
                            fontWeight: 900, fontSize: '15px'
                          }}>
                            {pagadaAdelantado
                              ? (ce.moneda === 'BS' ? `Bs. ${fmtBs(montoOrig)}` : `$${montoOrig.toFixed(2)} USD`)
                              : (ce.moneda === 'BS' ? `Bs. ${fmtBs(ce.monto)}` : `$${ce.monto.toFixed(2)} USD`)}
                          </div>
                          <div style={{ fontSize: '10.5px', color: isLight ? '#64748b' : '#94a3b8' }}>
                            {ce.moneda === 'BS'
                              ? `≈ $${((pagadaAdelantado ? montoOrig : ce.monto) / tasaValida).toFixed(2)}`
                              : `≈ Bs. ${fmtBs((pagadaAdelantado ? montoOrig : ce.monto) * tasaValida)}`}
                          </div>
                          <div style={{ fontSize: '10px', color: isLight ? '#64748b' : '#94a3b8', marginTop: '2px' }}>
                            {pagadaAdelantado ? 'Saldada por adelantado' : (tieneAbono ? 'Saldo restante' : 'No incluido en saldo actual')}
                          </div>
                        </div>
                      </div>

                      {tieneAbono && (
                        <div>
                          <div style={{ height: '6px', backgroundColor: isLight ? '#e2e8f0' : 'rgba(255,255,255,0.08)', borderRadius: '999px', overflow: 'hidden', marginBottom: '4px' }}>
                            <div style={{ width: `${pctAbono}%`, height: '100%', backgroundColor: '#10b981' }} />
                          </div>
                          <div style={{ fontSize: '11px', color: isLight ? '#475569' : '#94a3b8', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                            <span>Abonado por adelantado: <b style={{ color: isLight ? '#047857' : '#34d399' }}>{ce.moneda === 'BS' ? `Bs. ${fmtBs(abonado)}` : `$${abonado.toFixed(2)} USD`}</b> ({pctAbono}%)</span>
                            <span>Monto original: {ce.moneda === 'BS' ? `Bs. ${fmtBs(montoOrig)}` : `$${montoOrig.toFixed(2)} USD`}</span>
                          </div>
                        </div>
                      )}

                      {!pagadaAdelantado && ce.monto > 0.01 && (
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingTop: '2px' }}>
                          <button
                            type="button"
                            onClick={() => {
                              setModalTipoPago('condominio')
                              setModalCuotaAdelanto({ cuotaId: ce.id, modo: 'total' })
                              setModalOpen(true)
                            }}
                            className="domus-keep-white"
                            style={{
                              backgroundColor: isLight ? '#0284c7' : 'rgba(14, 165, 233, 0.22)',
                              border: isLight ? '1px solid #0284c7' : '1px solid rgba(56, 189, 248, 0.45)',
                              color: isLight ? '#ffffff' : '#7dd3fc',
                              borderRadius: '10px',
                              padding: '7px 14px',
                              fontSize: '12px',
                              fontWeight: 800,
                              cursor: 'pointer'
                            }}
                          >
                            💳 Pagar por adelantado
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setModalTipoPago('condominio')
                              setModalCuotaAdelanto({ cuotaId: ce.id, modo: 'abono' })
                              setModalOpen(true)
                            }}
                            style={{
                              backgroundColor: isLight ? '#f1f5f9' : 'rgba(255, 255, 255, 0.06)',
                              border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(255, 255, 255, 0.16)',
                              color: isLight ? '#0f172a' : '#e2e8f0',
                              borderRadius: '10px',
                              padding: '7px 14px',
                              fontSize: '12px',
                              fontWeight: 800,
                              cursor: 'pointer'
                            }}
                          >
                            ➕ Abonar a cuota
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── ALERTA DE CUOTAS EXTRAORDINARIAS VIGENTES / EXIGIBLES (DESKTOP) ── */}
          {cuotasExtraActivas.length > 0 && (
            <div style={{
              background: isLight
                ? 'linear-gradient(135deg, #fefce8 0%, #ffffff 100%)'
                : 'linear-gradient(135deg, rgba(234, 179, 8, 0.12) 0%, rgba(15, 23, 42, 0.92) 100%)',
              border: isLight ? '1px solid #fde047' : '1px solid rgba(234, 179, 8, 0.35)',
              borderRadius: '20px',
              padding: '18px 24px',
              marginBottom: '24px',
              boxShadow: isLight ? '0 6px 20px rgba(202, 138, 4, 0.08)' : '0 8px 26px rgba(0, 0, 0, 0.45)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '20px' }}>✨</span>
                  <div>
                    <div style={{ color: isLight ? '#a16207' : '#facc15', fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Cuotas Extraordinarias Vigentes ({cuotasExtraActivas.length})
                    </div>
                    <div style={{ color: isLight ? '#475569' : '#94a3b8', fontSize: '12px' }}>
                      Cargos extraordinarios vigentes en tu estado de cuenta y sincronizados con el calendario.
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setModalTipoPago('condominio')
                    setModalOpen(true)
                  }}
                  style={{
                    backgroundColor: '#eab308',
                    color: '#000',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '8px 16px',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  💳 Pagar Cuotas
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
                {cuotasExtraActivas.map(ce => {
                  const vencida = ce.estadoVigencia ? ce.estadoVigencia === 'vencida' : Boolean(ce.fechaLimite && ce.fechaLimite < hoyLocalIso)
                  return (
                    <div key={ce.id} className="domus-cuota-item" style={{
                      backgroundColor: isLight ? '#ffffff' : 'rgba(0,0,0,0.3)',
                      border: `1px solid ${vencida ? 'rgba(239,68,68,0.35)' : (isLight ? '#fde68a' : 'rgba(255,255,255,0.08)')}`,
                      borderRadius: '14px',
                      padding: '12px 14px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '12px'
                    }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '3px' }}>
                          <span style={{
                            fontSize: '10px', fontWeight: 800, padding: '2px 7px', borderRadius: '5px',
                            backgroundColor: isLight ? '#fef3c7' : 'rgba(234,179,8,0.2)',
                            color: isLight ? '#92400e' : '#fde047'
                          }}>Cuota Extraordinaria</span>
                          <span style={{
                            fontSize: '10px', fontWeight: 800, padding: '2px 7px', borderRadius: '5px',
                            backgroundColor: vencida ? (isLight ? '#fee2e2' : 'rgba(239,68,68,0.2)') : (isLight ? '#dcfce7' : 'rgba(34,197,94,0.18)'),
                            color: vencida ? (isLight ? '#b91c1c' : '#f87171') : (isLight ? '#15803d' : '#4ade80')
                          }}>{vencida ? '⚠️ Vencida' : 'Vigente al cobro'}</span>
                        </div>
                        <div style={{ color: isLight ? '#0f172a' : '#fff', fontSize: '13.5px', fontWeight: 700 }}>{ce.label}</div>
                        {ce.descripcion && (
                          <div style={{ color: isLight ? '#475569' : '#94a3b8', fontSize: '11px', marginTop: '2px' }}>{ce.descripcion}</div>
                        )}
                        {(ce.fechaEmision || ce.fechaLimite) && (
                          <div style={{ fontSize: '11px', color: vencida ? (isLight ? '#dc2626' : '#f87171') : (isLight ? '#64748b' : '#cbd5e1'), marginTop: '4px' }}>
                            {ce.fechaEmision ? `Vigente desde: ${formatearFechaCortaEs(ce.fechaEmision)}` : ''}
                            {ce.fechaEmision && ce.fechaLimite ? ' · ' : ''}
                            {ce.fechaLimite ? `${vencida ? '⚠️ Vence:' : '📅 Límite:'} ${formatearFechaCortaEs(ce.fechaLimite)}` : ''}
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ color: ce.moneda === 'BS' ? (isLight ? '#c2410c' : '#fb923c') : (isLight ? '#a16207' : '#facc15'), fontWeight: 900, fontSize: '15px' }}>
                          {ce.moneda === 'BS' ? `Bs. ${fmtBs(ce.monto)}` : `$${ce.monto.toFixed(2)} USD`}
                        </div>
                        <div style={{ fontSize: '10.5px', color: isLight ? '#64748b' : '#94a3b8' }}>
                          {ce.moneda === 'BS' ? `≈ $${(ce.monto / tasaValida).toFixed(2)}` : `≈ Bs. ${fmtBs(ce.monto * tasaValida)}`}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── ALERTA DE CUOTA ESPECIAL POR GAS (DESKTOP) ─────────── */}
          {deudaGas && deudaGas.tieneDeuda && (deudaGas.montoBs > 0 || deudaGas.montoUsd > 0) && (
            <div style={{
              background: deudaGas.esCuotaEspecial
                ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.16) 0%, rgba(249, 115, 22, 0.16) 100%)'
                : 'linear-gradient(135deg, rgba(59, 130, 246, 0.14) 0%, rgba(37, 99, 235, 0.14) 100%)',
              border: deudaGas.esCuotaEspecial ? '2px solid #ef4444' : '1px solid rgba(59, 130, 246, 0.4)',
              borderRadius: '20px',
              padding: '20px 24px',
              marginBottom: '24px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              boxShadow: deudaGas.esCuotaEspecial ? '0 10px 30px rgba(239, 68, 68, 0.2)' : '0 10px 30px rgba(0, 0, 0, 0.4)',
              gap: '20px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: '1 1 280px', minWidth: 0 }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '14px',
                  backgroundColor: deudaGas.esCuotaEspecial ? 'rgba(239, 68, 68, 0.25)' : 'rgba(59, 130, 246, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px',
                  flexShrink: 0
                }}>
                  {deudaGas.esCuotaEspecial ? '⚡' : '⛽'}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '4px' }}>
                    <span style={{
                      fontWeight: 900,
                      fontSize: '13px',
                      color: deudaGas.esCuotaEspecial ? '#f87171' : '#93c5fd',
                      textTransform: 'uppercase',
                      letterSpacing: '0.6px'
                    }}>
                      {deudaGas.esCuotaEspecial ? 'Cuota Especial por Gas Comunal' : 'Cuota de Gas Comunal'}
                    </span>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 800,
                      backgroundColor: 'rgba(239, 68, 68, 0.25)',
                      color: '#f87171',
                      border: '1px solid rgba(239, 68, 68, 0.4)',
                      padding: '2px 8px',
                      borderRadius: '999px'
                    }}>
                      Pendiente por Pagar
                    </span>
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#fff', marginBottom: '2px' }}>
                    {deudaGas.campanaTitulo || 'Recarga y Mantenimiento del Tanque Central'}
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                    Cuota comunitaria independiente del recibo ordinario de condominio. {deudaGas.fechaLimite ? `· Límite: ${deudaGas.fechaLimite}` : ''}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '24px', fontWeight: 900, color: '#fff' }}>
                    Bs. {fmtBs(deudaGas.montoBs)}
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--color-accent, #f97316)', fontWeight: 700 }}>
                    ≈ ${deudaGas.montoUsd.toFixed(2)} USD
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => navigate('/gas?tab=calendario')}
                    style={{
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.16)',
                      color: '#fff',
                      padding: '10px 16px',
                      borderRadius: '12px',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <span>📅</span>
                    <span>Calendario Gas</span>
                  </button>
                  <button
                    onClick={() => {
                      setModalTipoPago('gas')
                      setModalOpen(true)
                    }}
                    style={{
                      background: 'var(--color-brand-gradient, linear-gradient(135deg, #fb923c 0%, #f97316 100%))',
                      border: 'none',
                      color: '#fff',
                      padding: '10px 18px',
                      borderRadius: '12px',
                      fontSize: '13px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: 'var(--color-brand-shadow, 0 4px 14px rgba(249, 115, 22, 0.4))'
                    }}
                  >
                    <span>💳</span>
                    <span>Pagar Cuota de Gas</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── CARTA DE SOLVENCIA DESKTOP (SOLO SI ESTÁ 100% SOLVENTE) ── */}
          {estaSolvente && (
            <div style={{
              background: 'linear-gradient(135deg, rgba(22, 163, 74, 0.18) 0%, rgba(15, 23, 42, 0.95) 50%, rgba(34, 197, 94, 0.14) 100%)',
              border: '2px solid rgba(34, 197, 94, 0.45)',
              borderRadius: '24px',
              padding: '22px 28px',
              marginBottom: '24px',
              boxShadow: '0 12px 36px rgba(0, 0, 0, 0.5), 0 0 28px rgba(34, 197, 94, 0.18)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '20px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flex: '1 1 300px', minWidth: 0 }}>
                <div style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '18px',
                  backgroundColor: 'rgba(34, 197, 94, 0.22)',
                  border: '1.5px solid rgba(34, 197, 94, 0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '28px',
                  boxShadow: '0 6px 20px rgba(34, 197, 94, 0.3)',
                  flexShrink: 0
                }}>
                  📜
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, color: '#fff', fontSize: '18px', fontWeight: 900 }}>
                      Carta de Solvencia de Condominio
                    </h3>
                    <span style={{
                      backgroundColor: 'rgba(34, 197, 94, 0.25)',
                      color: '#4ade80',
                      border: '1px solid rgba(34, 197, 94, 0.45)',
                      borderRadius: '999px',
                      padding: '3px 12px',
                      fontSize: '11px',
                      fontWeight: 800
                    }}>
                      ✓ 100% Solvente al Día
                    </span>
                  </div>
                  <p style={{ margin: '6px 0 0', color: '#cbd5e1', fontSize: '13px', lineHeight: 1.4, maxWidth: '640px' }}>
                    Tu apartamento se encuentra completamente solvente (Condominio al día y Gas Comunal solventado). Puedes descargar o imprimir tu constancia oficial expedida por la Junta de Condominio.
                  </p>
                  <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px 14px', fontSize: '11.5px', color: '#94a3b8' }}>
                    <span>Apto: <strong style={{ color: '#fff' }}>{datosCartaSolvencia.residenteApto}</strong></span>
                    <span>·</span>
                    <span>Titular: <strong style={{ color: '#fff' }}>{datosCartaSolvencia.residenteNombre}</strong></span>
                    <span>·</span>
                    <span>Solvente hasta: <strong style={{ color: '#4ade80' }}>{datosCartaSolvencia.mesSolvente} {datosCartaSolvencia.anioSolvente}</strong></span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', flexShrink: 0 }}>
                <button
                  onClick={() => setModalSolvenciaOpen(true)}
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.16)',
                    color: '#fff',
                    borderRadius: '12px',
                    padding: '12px 18px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.2s'
                  }}
                >
                  <span>👁️</span>
                  <span>Ver Carta</span>
                </button>

                <button
                  onClick={() => descargarSolvenciaPDF(datosCartaSolvencia)}
                  style={{
                    background: 'linear-gradient(135deg, #16a34a 0%, #22c55e 100%)',
                    border: 'none',
                    color: '#fff',
                    borderRadius: '12px',
                    padding: '12px 22px',
                    fontSize: '13px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 18px rgba(34, 197, 94, 0.35)',
                    transition: 'all 0.2s'
                  }}
                >
                  <span>📥</span>
                  <span>Descargar Carta (PDF)</span>
                </button>
              </div>
            </div>
          )}

          {/* Bento Grid Desktop (7 cols principal / 5 cols lateral) */}
          <div className="bento-desktop-grid">

            {/* COLUMNA PRINCIPAL */}
            <div className="bento-col-main">

              {/* 1. Tarjeta Hero Estado de Cuenta */}
              <div className="desktop-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
                  <div style={{ minWidth: 0 }}>
                    <span style={{ color: '#7e8b9b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                      ESTADO DE CUENTA
                    </span>
                    <h2 style={{ color: '#fff', fontSize: '20px', fontWeight: 800, margin: '2px 0 0' }}>
                      Apartamento {aptoNumero}
                    </h2>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => setOcultarSaldos(!ocultarSaldos)}
                      style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '10px',
                        color: '#94a3b8',
                        padding: '6px 12px',
                        fontSize: '13px',
                        cursor: 'pointer'
                      }}
                      title="Ocultar o mostrar montos"
                    >
                      {ocultarSaldos ? 'Mostrar 👁️' : 'Ocultar 🙈'}
                    </button>

                    {ultimoPago?.estado === 'pendiente' ? (
                      <span style={{
                        backgroundColor: 'rgba(245, 158, 11, 0.15)',
                        color: '#f59e0b',
                        border: '1px solid rgba(245, 158, 11, 0.3)',
                        padding: '5px 12px',
                        borderRadius: '999px',
                        fontSize: '12px',
                        fontWeight: 700
                      }}>
                        ⏳ Pago en Verificación
                      </span>
                    ) : tieneDeudaTotal ? (
                      <span style={{
                        backgroundColor: tieneDeudaGas && !tieneDeudaCondominio && !tieneDeudaLocales
                          ? 'rgba(249, 115, 22, 0.15)'
                          : (tieneDeudaLocales && !tieneDeudaCondominio && !tieneDeudaGas
                            ? 'rgba(236, 72, 153, 0.15)'
                            : (aplicaDiferencia ? 'rgba(56, 189, 248, 0.15)' : 'rgba(239, 68, 68, 0.15)')),
                        color: tieneDeudaGas && !tieneDeudaCondominio && !tieneDeudaLocales
                          ? '#fb923c'
                          : (tieneDeudaLocales && !tieneDeudaCondominio && !tieneDeudaGas
                            ? '#f472b6'
                            : (aplicaDiferencia ? '#38bdf8' : '#ef4444')),
                        border: `1px solid ${
                          tieneDeudaGas && !tieneDeudaCondominio && !tieneDeudaLocales
                            ? 'rgba(249, 115, 22, 0.35)'
                            : (tieneDeudaLocales && !tieneDeudaCondominio && !tieneDeudaGas
                              ? 'rgba(236, 72, 153, 0.35)'
                              : (aplicaDiferencia ? 'rgba(56, 189, 248, 0.35)' : 'rgba(239, 68, 68, 0.3)'))
                        }`,
                        padding: '5px 12px',
                        borderRadius: '999px',
                        fontSize: '12px',
                        fontWeight: 700
                      }}>
                        {tieneDeudaGas && !tieneDeudaCondominio && !tieneDeudaLocales
                          ? '⛽ Solo Cuota de Gas Pendiente'
                          : tieneDeudaLocales && !tieneDeudaCondominio && !tieneDeudaGas
                          ? '🏬 Solo Deuda de Local Pendiente'
                          : aplicaDiferencia
                          ? '🔵 Diferencia Pendiente'
                          : (tieneDeudaCondominio && tieneDeudaGas) || (tieneDeudaCondominio && tieneDeudaLocales) || (tieneDeudaGas && tieneDeudaLocales)
                          ? '🔴 No está al día · Deudas Pendientes'
                          : '🔴 No está al día · Deuda Pendiente'}
                      </span>
                    ) : (
                      <span style={{
                        backgroundColor: 'rgba(34, 197, 94, 0.15)',
                        color: '#22c55e',
                        border: '1px solid rgba(34, 197, 94, 0.3)',
                        padding: '5px 12px',
                        borderRadius: '999px',
                        fontSize: '12px',
                        fontWeight: 700
                      }}>
                        ● Al día · Solvente
                      </span>
                    )}
                  </div>
                </div>

                {/* Gran Monto Consolidado (Condominio + Gas) */}
                <div style={{ color: '#fff', fontSize: 'clamp(26px, 3vw, 42px)', fontWeight: 900, letterSpacing: '-1px', lineHeight: 1.1, overflowWrap: 'anywhere' }}>
                  {ocultarSaldos ? 'Bs. ••••••' : `Bs. ${(deudaTotalConsolidadaBs > 0 ? deudaTotalConsolidadaBs : 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginTop: '6px', color: 'var(--color-accent, #f97316)', fontSize: '16px', fontWeight: 700 }}>
                  <span>{ocultarSaldos ? '•••• USD' : `≈ $${deudaTotalConsolidadaUsd.toFixed(2)} USD`}</span>
                  <span style={{ color: '#64748b', fontSize: '13px', fontWeight: 500 }}>
                    · Total consolidado en tiempo real
                  </span>
                </div>

                {/* ── DESGLOSE SINCRONIZADO: CONDOMINIO VS GAS (DESKTOP) ── */}
                <div style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '16px',
                  padding: '16px 18px',
                  marginTop: '18px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                    <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                      Estado Sincronizado por Servicio:
                    </div>
                    <span style={{ color: '#38bdf8', fontSize: '11px', fontWeight: 700 }}>
                      Sincronizado con Administración ⚡
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 175px), 1fr))', gap: '14px' }}>
                    {/* Tarjeta Condominio */}
                    <div style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      borderRadius: '12px',
                      padding: '12px 14px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <span style={{ color: '#93c5fd', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>🏢</span> Condominio Ordinario
                        </span>
                        <span style={{ fontSize: '10px', color: tieneDeudaCondominio ? '#f87171' : '#22c55e', fontWeight: 800 }}>
                          {tieneDeudaCondominio ? 'PENDIENTE' : 'SOLVENTE'}
                        </span>
                      </div>
                      <div style={{ color: '#fff', fontSize: '17px', fontWeight: 900 }}>
                        {ocultarSaldos ? '••••' : `Bs. ${fmtBs(deudaCondominioBs)}`}
                      </div>
                      <div style={{ color: '#94a3b8', fontSize: '11px' }}>
                        {ocultarSaldos ? '••••' : `≈ $${deudaCondominioUsd.toFixed(2)} USD`}
                      </div>
                    </div>

                    {/* Tarjeta Gas */}
                    <div style={{
                      backgroundColor: 'rgba(249, 115, 22, 0.05)',
                      border: '1px solid rgba(249, 115, 22, 0.2)',
                      borderRadius: '12px',
                      padding: '12px 14px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <span style={{ color: '#fed7aa', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>⛽</span> Gas Comunal ({deudaGas?.campanaTitulo || 'Cuota'})
                        </span>
                        <span style={{ fontSize: '10px', color: tieneDeudaGas ? '#fb923c' : '#22c55e', fontWeight: 800 }}>
                          {tieneDeudaGas ? 'PENDIENTE' : 'SOLVENTE'}
                        </span>
                      </div>
                      <div style={{ color: '#fb923c', fontSize: '17px', fontWeight: 900 }}>
                        {ocultarSaldos ? '••••' : `Bs. ${fmtBs(deudaGasBs)}`}
                      </div>
                      <div style={{ color: 'var(--color-accent, #f97316)', fontSize: '11px', fontWeight: 700 }}>
                        {ocultarSaldos ? '••••' : `≈ $${deudaGasUsd.toFixed(2)} USD`}
                      </div>
                    </div>

                    {/* Tarjeta Locales Asignados (si tiene asignado) */}
                    {localesAsignados.length > 0 && (
                      <div
                        onClick={() => navigate('/locales')}
                        style={{
                          backgroundColor: 'rgba(56, 189, 248, 0.05)',
                          border: '1px solid rgba(56, 189, 248, 0.25)',
                          borderRadius: '12px',
                          padding: '12px 14px',
                          cursor: 'pointer'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <span style={{ color: '#7dd3fc', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>🏬</span> Espacio Asignado
                          </span>
                          <span style={{ fontSize: '10px', color: tieneDeudaLocales ? '#ef4444' : '#22c55e', fontWeight: 800 }}>
                            {tieneDeudaLocales ? 'DEUDA PENDIENTE' : 'SOLVENTE'}
                          </span>
                        </div>
                        <div style={{ color: '#fff', fontSize: '14px', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {localesAsignados[0].nombre}
                        </div>
                        <div style={{ color: tieneDeudaLocales ? '#f87171' : '#38bdf8', fontSize: '11px', fontWeight: 700, marginTop: '2px' }}>
                          {tieneDeudaLocales
                            ? `Deuda: $${deudaLocalesUsd.toFixed(2)} USD`
                            : `Cuota: $${localesAsignados[0].monto_usd} USD / mes`}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Acciones de Pago Rápidas Desktop */}
                  {tieneDeudaTotal && (
                    <div style={{ display: 'flex', gap: '10px', paddingTop: '10px', borderTop: '1px dashed rgba(255, 255, 255, 0.08)' }}>
                      {tieneDeudaGas && (
                        <button
                          onClick={() => {
                            setModalTipoPago('gas')
                            setModalOpen(true)
                          }}
                          style={{
                            flex: 1,
                            backgroundColor: 'rgba(249, 115, 22, 0.16)',
                            color: 'var(--color-accent, #f97316)',
                            border: '1px solid rgba(249, 115, 22, 0.35)',
                            borderRadius: '10px',
                            padding: '9px 12px',
                            fontSize: '12px',
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px'
                          }}
                        >
                          <span>⛽</span>
                          <span>Pagar Gas</span>
                        </button>
                      )}
                      {tieneDeudaCondominio && (
                        <button
                          onClick={() => {
                            setModalTipoPago('condominio')
                            setModalOpen(true)
                          }}
                          style={{
                            flex: 1,
                            backgroundColor: 'rgba(59, 130, 246, 0.16)',
                            color: '#60a5fa',
                            border: '1px solid rgba(59, 130, 246, 0.35)',
                            borderRadius: '10px',
                            padding: '9px 12px',
                            fontSize: '12px',
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px'
                          }}
                        >
                          <span>🏢</span>
                          <span>Pagar Condominio</span>
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setModalTipoPago('todos')
                          setModalOpen(true)
                        }}
                        style={{
                          flex: 1.2,
                          backgroundColor: 'var(--color-accent, #f97316)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '10px',
                          padding: '9px 14px',
                          fontSize: '12px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          boxShadow: 'var(--color-brand-shadow, 0 3px 12px rgba(249, 115, 22, 0.4))'
                        }}
                      >
                        <span>💳</span>
                        <span>Pagar Total Consolidado</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Desglose de Deudas por Modalidad (Desktop) - Solo si tiene deuda fija en Bolívares */}
                {tieneDeudaFijaBs && (
                  <div style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '14px',
                    padding: '14px 18px',
                    marginTop: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}>
                    <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                      Desglose de Deudas por Modalidad:
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#93c5fd', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>🔵</span> Deuda anclada a Bolívares (Monto Fijo):
                      </span>
                      <span style={{ color: '#60a5fa', fontWeight: 800, fontSize: '14px' }}>
                        {ocultarSaldos ? '••••••' : `Bs. ${deudaFijaBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                      </span>
                    </div>

                    {deudaIndexadaUsd > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                        <span style={{ color: '#86efac', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                          <span>🟢</span> Deuda indexada al Dólar (Tasa Oficial BCV):
                        </span>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <span style={{ color: '#4ade80', fontWeight: 800, fontSize: '14px' }}>
                            {ocultarSaldos ? '••••' : `$${deudaIndexadaUsd.toFixed(2)} USD`}
                          </span>
                          <span style={{ color: '#94a3b8', fontSize: '11px', display: 'block' }}>
                            {ocultarSaldos ? '••••' : `≈ Bs. ${deudaIndexadaBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Saldo a Favor Desktop */}
                {(saldoAFavor > 0 || saldoAFavorBs > 0) && (
                  <div style={{
                    backgroundColor: 'rgba(34, 197, 94, 0.12)',
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                    borderRadius: '14px',
                    padding: '12px 18px',
                    marginTop: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 220px', minWidth: 0 }}>
                      <span style={{ fontSize: '20px', flexShrink: 0 }}>💚</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: '#4ade80', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Saldo a Favor en Cuenta
                        </div>
                        <div style={{ color: '#94a3b8', fontSize: '12px', overflowWrap: 'break-word' }}>
                          Dispones de crédito prepagado que se deducirá de tu siguiente facturación.
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ color: '#4ade80', fontSize: '17px', fontWeight: 800 }}>
                        {ocultarSaldos ? '••••' : (saldoAFavor >= 1 ? `+$${saldoAFavor.toFixed(2)} USD` : `+Bs. ${saldoAFavorBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)}
                      </div>
                      <div style={{ color: '#86efac', fontSize: '11px', fontWeight: 600 }}>
                        {ocultarSaldos ? '••••' : (saldoAFavor >= 1 ? `≈ Bs. ${saldoAFavorBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `≈ $${(saldoAFavor > 0 ? saldoAFavor : saldoAFavorBs / tasaValida).toFixed(2)} USD`)}
                      </div>
                    </div>
                  </div>
                )}

                {/* Desglose Inferior */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                  gap: '14px',
                  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                  marginTop: '22px',
                  paddingTop: '18px'
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: '#7e8b9b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>ALÍCUOTA</div>
                    <div style={{ color: '#fff', fontSize: '15px', fontWeight: 800, marginTop: '2px', overflowWrap: 'break-word' }}>
                      {formatAlicuotaPct(alicuota)} {esPenthouse ? '(Penthouse)' : '(Estándar)'}
                    </div>
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: '#7e8b9b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>EQUIVALENTE USD</div>
                    <div style={{ color: '#fff', fontSize: '15px', fontWeight: 800, marginTop: '2px', overflowWrap: 'anywhere' }}>
                      ${deudaUsd.toFixed(2)}
                    </div>
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: '#7e8b9b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>TASA DEL DÍA</div>
                    <div style={{ color: '#22c55e', fontSize: '15px', fontWeight: 800, marginTop: '2px', overflowWrap: 'anywhere' }}>
                      Bs. {getTasaBcvNumerica(rate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>

                {/* Botón de Pago directo */}
                <button
                  onClick={() => setModalOpen(true)}
                  style={{
                    width: '100%',
                    background: 'var(--color-brand-gradient, linear-gradient(135deg, #fb923c 0%, #ea580c 100%))',
                    border: '1px solid rgba(255, 255, 255, 0.25)',
                    color: '#fff',
                    padding: '14px',
                    borderRadius: '14px',
                    fontSize: '15px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    marginTop: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: 'var(--color-brand-shadow, 0 4px 18px rgba(234, 88, 12, 0.45))'
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"/>
                    <line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  <span>Reportar Pago de Condominio</span>
                </button>
              </div>

              <DashboardPagosRecientesCard
                pagosRecientes={pagosRecientes}
                onVerHistorialCompleto={() => navigate('/recibos')}
              />

              <FondoReservaCard
                ubicaciones={fondoReserva?.ubicaciones || []}
                movimientos={fondoReserva?.movimientos || []}
                totales={calcularTotalesFondoReserva(fondoReserva?.ubicaciones || [], tasaValida)}
                ocultarSaldos={ocultarSaldos}
                compact={true}
                onVerDetalle={() => navigate('/fondo-reserva')}
              />

            </div>

            <DashboardSideCards
              estaSolvente={estaSolvente}
              aptoNumero={aptoNumero}
              esPenthouse={esPenthouse}
              alicuota={alicuota}
              onOpenSolvencia={() => setModalSolvenciaOpen(true)}
              onNavigate={navigate}
            />

          </div>

        </div>

      </div>
    </>
  )
}
