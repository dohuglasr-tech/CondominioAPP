import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBcvRate } from '../../../data/useBcvRate'
import { supabase } from '../../../data/supabase'
import { appCache } from '../../../data/cacheService'
import { SkeletonCard } from '../../components/Skeleton'
import { PublicarAvisoModal } from '../../components/PublicarAvisoModal'
import { BotonLimpiarCache } from '../../components/BotonLimpiarCache'
import { ModalRecibosSolventes, ReciboSolventeItem } from '../../components/ModalRecibosSolventes'
import { ModalTimelineAprobaciones } from '../../components/ModalTimelineAprobaciones'

interface StatCardProps {
  icon: string
  label: string
  value: string | number
  sub?: string
  color?: string
  badge?: string
  pulse?: boolean
  onClick?: () => void
}

const StatCard: React.FC<StatCardProps> = ({ icon, label, value, sub, color = 'var(--color-accent, #f97316)', badge, pulse, onClick }) => (
  <div
    onClick={onClick}
    style={{
      background: 'linear-gradient(180deg, #151922 0%, #0d1117 100%)',
      border: pulse ? `1px solid ${color}` : '1px solid rgba(255, 255, 255, 0.08)',
      borderTop: pulse ? `1px solid ${color}` : '1px solid rgba(255, 255, 255, 0.14)',
      boxShadow: pulse
        ? `0 0 20px ${color}35, 0 12px 30px rgba(0, 0, 0, 0.5)`
        : '0 14px 34px -4px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
      borderRadius: '22px',
      padding: '22px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      cursor: onClick ? 'pointer' : 'default',
      transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      position: 'relative',
    }}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: '24px' }}>{icon}</span>
      {badge && (
        <span style={{
          backgroundColor: `${color}18`,
          color: color,
          fontSize: '11px',
          fontWeight: 700,
          padding: '3px 10px',
          borderRadius: '999px',
          border: `1px solid ${color}35`,
        }}>
          {badge}
        </span>
      )}
    </div>
    <p style={{ color: '#7e8b9b', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', margin: 0 }}>{label}</p>
    <p style={{ color: '#fff', fontSize: '24px', fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>{value}</p>
    {sub && <p style={{ color, fontSize: '12px', fontWeight: 600, margin: 0 }}>{sub}</p>}
  </div>
)

export interface ActividadItem {
  id: string
  tipo: 'pago' | 'reporte' | 'pago_reportado' | 'aprobacion_admin' | 'conciliacion_calendario'
  titulo: string
  subtitulo: string
  monto: string
  montoUsd?: string
  montoNumBs: number
  montoNumUsd: number
  estado: string
  fecha: string
  fechaHoraCompleta?: string
  rawDate: string
  origen: 'admin' | 'residente' | 'sistema'
  origenBadge: string
  autor: string
  referencia: string
  apartamentoNumero: string
  propietario?: string
  periodo?: string
  metodo?: string
  nota?: string
}

const MESES_NOMBRES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

const getMesLabel = (key: string) => {
  if (!key) return ''
  const [anio, mesNum] = key.split('-')
  const idx = (parseInt(mesNum) || 1) - 1
  return `${MESES_NOMBRES[idx] || 'Mes'} de ${anio}`
}

const getMesSoloNombre = (key: string) => {
  if (!key) return ''
  const [, mesNum] = key.split('-')
  const idx = (parseInt(mesNum) || 1) - 1
  return MESES_NOMBRES[idx] || ''
}

export const AdminDashboard: React.FC = () => {
  const navigate = useNavigate()
  const { rate, loading: loadingRate, error: errorRate } = useBcvRate()

  // Determinar mes actual por defecto (YYYY-MM)
  const hoy = new Date()
  const anioActual = hoy.getFullYear()
  const mesActualNum = String(hoy.getMonth() + 1).padStart(2, '0')
  const mesActualKey = `${anioActual}-${mesActualNum}`

  const [mesSeleccionado, setMesSeleccionado] = useState<string>(mesActualKey)
  const [mesesDisponibles, setMesesDisponibles] = useState<string[]>([mesActualKey])

  const [loading, setLoading] = useState(true)
  const [apartamentosCount, setApartamentosCount] = useState(0)
  const [reportesAbiertos, setReportesAbiertos] = useState(0)
  const [propuestasActivas, setPropuestasActivas] = useState(0)
  const [actividad, setActividad] = useState<ActividadItem[]>([])
  const [todosLosPagos, setTodosLosPagos] = useState<any[]>([])
  const [gastosMesBs, setGastosMesBs] = useState<number>(0)

  // Ocultar/mostrar saldo
  const [ocultarSaldos, setOcultarSaldos] = useState(false)
  const [avisoModalOpen, setAvisoModalOpen] = useState(false)
  const [modalSolventesOpen, setModalSolventesOpen] = useState(false)
  const [listaSolventes, setListaSolventes] = useState<ReciboSolventeItem[]>([])
  const [modalTimelineOpen, setModalTimelineOpen] = useState(false)
  const [filtroTabActividad, setFiltroTabActividad] = useState<'todos' | 'admin' | 'residente'>('todos')

  const conteoAdmin = useMemo(() => actividad.filter(a => a.origen === 'admin').length, [actividad])
  const conteoResidente = useMemo(() => actividad.filter(a => a.origen === 'residente').length, [actividad])

  const actividadFiltradaWidget = useMemo(() => {
    if (filtroTabActividad === 'admin') return actividad.filter(a => a.origen === 'admin')
    if (filtroTabActividad === 'residente') return actividad.filter(a => a.origen === 'residente')
    return actividad
  }, [actividad, filtroTabActividad])

  const cargarMetricas = useCallback(async (forceRefresh = false) => {
    try {
      const data = await appCache.fetch(
        'admin_dashboard_metricas',
        async () => {
          const [aptRes, pagosRes, recibosRes, gastosRes, falRes, propRes, moraRes] = await Promise.all([
            supabase.from('apartamentos').select('id, numero, propietario_nombre').order('numero'),
            supabase.from('pagos_reportados').select(`
              id,
              monto_bs,
              referencia,
              estado,
              created_at,
              fecha_pago,
              notas_admin,
              apartamento:apartamento_id ( numero ),
              residente:reportado_por ( nombre_completo )
            `).order('created_at', { ascending: false }),
            supabase.from('recibos_generados').select('*').order('mes_facturado', { ascending: false }),
            supabase.from('gastos_comunes').select('monto_usd, monto_bs, mes_aplicacion'),
            supabase.from('falencias').select('*', { count: 'exact', head: true }),
            supabase.from('propuestas').select('*', { count: 'exact', head: true }).eq('estado', 'activa'),
            supabase.from('deudas_mora').select('*').eq('estado', 'solventado')
          ])

          return {
            aptList: aptRes.data || [],
            aptCount: (aptRes.data || []).length,
            pagosList: pagosRes.data || [],
            recibosList: recibosRes.data || [],
            gastosList: gastosRes.data || [],
            falCount: falRes.count ?? 0,
            propCount: propRes.count ?? 0,
            moraSolventadaList: moraRes.data || []
          }
        },
        { ttlMs: 2 * 60 * 1000, tags: ['apartamentos', 'pagos', 'recibos', 'gastos', 'falencias', 'mora'], forceRefresh }
      )

      setApartamentosCount(data.aptCount)
      setReportesAbiertos(data.falCount)
      setPropuestasActivas(data.propCount)
      setTodosLosPagos(data.pagosList)

      // Gastos del mes
      let totalGastosBs = 0
      const currentRate = rate && rate > 1 ? rate : 859.06
      if (data.gastosList) {
        data.gastosList.forEach((g: any) => {
          const mesGasto = (g.mes_aplicacion || '').substring(0, 7)
          if (!mesGasto || mesGasto === mesSeleccionado) {
            if (g.monto_bs && Number(g.monto_bs) > 0) {
              totalGastosBs += Number(g.monto_bs)
            } else {
              totalGastosBs += Number(g.monto_usd || 0) * currentRate
            }
          }
        })
      }
      setGastosMesBs(totalGastosBs)

      // Meses disponibles
      const mesesSet = new Set<string>()
      mesesSet.add(mesActualKey)
      ;(data.recibosList || []).forEach((r: any) => {
        if (r.mes_facturado) {
          const mKey = r.mes_facturado.substring(0, 7)
          if (mKey) mesesSet.add(mKey)
        }
      })
      const mesesArr = Array.from(mesesSet).sort().reverse()
      setMesesDisponibles(mesesArr)

      // Consolidar lista de recibos, facturas y atrasos solventes/pagados
      const aptosMap = new Map<string, any>()
      ;(data.aptList || []).forEach((a: any) => {
        if (a.id) aptosMap.set(a.id, a)
      })

      // Unificar actividad cronológica: pagos de residentes + aprobaciones manuales de admin
      const todosItemsActividad: ActividadItem[] = []
      const refsProcesadas = new Set<string>()
      const idsProcesados = new Set<string>()

      // 1. Pagos reportados (residentes y aprobaciones)
      ;(data.pagosList || []).forEach((p: any) => {
        const aptoNum = p.apartamento?.numero || 'S/N'
        const ref = p.referencia || 'S/R'
        const notasLower = (p.notas_admin || '').toLowerCase()
        const esAdmin = notasLower.includes('calendario') ||
                        notasLower.includes('administrador') ||
                        Boolean(p.revisado_por)
        
        const fechaRaw = p.fecha_pago || p.created_at || new Date().toISOString()
        const fechaDate = new Date(fechaRaw)
        const fechaFmt = !isNaN(fechaDate.getTime())
          ? fechaDate.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })
          : 'Reciente'
        const fechaHoraFmt = !isNaN(fechaDate.getTime())
          ? fechaDate.toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
          : 'Reciente'

        const montoBsNum = Number(p.monto_bs || 0)
        const montoUsdNum = Number(p.monto_usd || (montoBsNum > 0 ? montoBsNum / currentRate : 0))

        const autorNombre = esAdmin
          ? 'Administrador'
          : (p.residente?.nombre_completo || 'Residente')

        const origenTipo: 'admin' | 'residente' = esAdmin ? 'admin' : 'residente'
        const origenBadge = esAdmin
          ? '🛡️ Aprobado Admin'
          : '📱 Reporte Residente'

        todosItemsActividad.push({
          id: p.id,
          tipo: esAdmin ? 'aprobacion_admin' : 'pago_reportado',
          titulo: `Pago Apto ${aptoNum}`,
          subtitulo: `Ref: ${ref} · ${esAdmin ? 'Aprobado por Admin' : (p.residente?.nombre_completo || 'Residente')}`,
          monto: `Bs. ${montoBsNum.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          montoUsd: `$${montoUsdNum.toFixed(2)}`,
          montoNumBs: montoBsNum,
          montoNumUsd: montoUsdNum,
          estado: p.estado || 'aprobado',
          fecha: fechaFmt,
          fechaHoraCompleta: fechaHoraFmt,
          rawDate: p.created_at || fechaRaw,
          origen: origenTipo,
          origenBadge,
          autor: autorNombre,
          referencia: ref,
          apartamentoNumero: aptoNum,
          propietario: p.residente?.nombre_completo || aptosMap.get(p.apartamento_id)?.propietario_nombre,
          metodo: p.metodo ? p.metodo.replace(/_/g, ' ') : 'Transferencia',
          nota: p.notas_admin || ''
        })

        idsProcesados.add(p.id)
        if (ref && ref !== 'S/R') refsProcesadas.add(ref)
      })

      // 2. Recibos mensuales pagados directamente en recibos_generados (Calendario / Conciliación)
      ;(data.recibosList || []).forEach((r: any) => {
        if (r.estado === 'pagado') {
          const pInfo = r.data_json?.pago_info
          const ref = pInfo?.referencia || r.data_json?.referencia || r.data_json?.ultima_referencia || 'S/R'
          const pagoIdRelacionado = pInfo?.pago_id

          if (pagoIdRelacionado && idsProcesados.has(pagoIdRelacionado)) return
          if (ref && ref !== 'S/R' && refsProcesadas.has(ref)) return

          const apto = aptosMap.get(r.apartamento_id)
          const aptoNum = apto?.numero || 'S/N'
          const mesKey = (r.mes_facturado || '').substring(0, 7)
          const periodoLabel = mesKey ? getMesLabel(mesKey) : 'Mes Facturado'

          const fechaRaw = pInfo?.fecha_pago || r.data_json?.editado_at || r.emitido_at || r.created_at || new Date().toISOString()
          const fechaDate = new Date(fechaRaw)
          const fechaFmt = !isNaN(fechaDate.getTime())
            ? fechaDate.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })
            : 'Reciente'
          const fechaHoraFmt = !isNaN(fechaDate.getTime())
            ? fechaDate.toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
            : 'Reciente'

          const montoBsNum = Number(r.total_bs || 0)
          const montoUsdNum = Number(r.total_usd || (montoBsNum > 0 ? montoBsNum / currentRate : 0))
          const autor = r.data_json?.editado_por || pInfo?.autor || 'Administrador'

          todosItemsActividad.push({
            id: `recibo_${r.id}`,
            tipo: 'aprobacion_admin',
            titulo: `Pago Apto ${aptoNum}`,
            subtitulo: `Ref: ${ref} · Solvente en Calendario (${periodoLabel})`,
            monto: `Bs. ${montoBsNum.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            montoUsd: `$${montoUsdNum.toFixed(2)}`,
            montoNumBs: montoBsNum,
            montoNumUsd: montoUsdNum,
            estado: 'aprobado',
            fecha: fechaFmt,
            fechaHoraCompleta: fechaHoraFmt,
            rawDate: fechaRaw,
            origen: 'admin',
            origenBadge: '🛡️ Admin · Calendario',
            autor,
            referencia: ref,
            apartamentoNumero: aptoNum,
            propietario: apto?.propietario_nombre || 'Propietario',
            periodo: periodoLabel,
            metodo: pInfo?.metodo || 'Conciliación Directa',
            nota: pInfo?.nota || r.data_json?.nota || 'Cuota marcada como solvente por la administración'
          })

          if (ref && ref !== 'S/R') refsProcesadas.add(ref)
        }
      })

      // 3. Atrasos históricos solventados de deudas_mora
      ;(data.moraSolventadaList || []).forEach((m: any) => {
        const apto = aptosMap.get(m.apartamento_id)
        const aptoNum = apto?.numero || 'S/N'
        const fechaRaw = m.updated_at || m.created_at || new Date().toISOString()
        const fechaDate = new Date(fechaRaw)
        const fechaFmt = !isNaN(fechaDate.getTime())
          ? fechaDate.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })
          : 'Reciente'
        const fechaHoraFmt = !isNaN(fechaDate.getTime())
          ? fechaDate.toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
          : 'Reciente'

        const montoBsNum = Number(m.monto_bs || 0)
        const montoUsdNum = Number(m.monto_usd || (montoBsNum > 0 ? montoBsNum / currentRate : 0))

        todosItemsActividad.push({
          id: `mora_${m.id}`,
          tipo: 'aprobacion_admin',
          titulo: `Solvencia Mora Apto ${aptoNum}`,
          subtitulo: `Deuda Histórica 2025 conciliada como solvente`,
          monto: `Bs. ${montoBsNum.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          montoUsd: `$${montoUsdNum.toFixed(2)}`,
          montoNumBs: montoBsNum,
          montoNumUsd: montoUsdNum,
          estado: 'aprobado',
          fecha: fechaFmt,
          fechaHoraCompleta: fechaHoraFmt,
          rawDate: fechaRaw,
          origen: 'admin',
          origenBadge: '🛡️ Admin · Convenio Mora',
          autor: 'Administrador',
          referencia: 'CONCIL-MORA',
          apartamentoNumero: aptoNum,
          propietario: apto?.propietario_nombre || 'Propietario',
          periodo: 'Deuda Anterior 2025',
          metodo: 'Convenio de Pago / Solvencia',
          nota: 'Atraso histórico finiquitado por el administrador'
        })
      })

      // Ordenar todo cronológicamente: los más recientes primero
      todosItemsActividad.sort((a, b) => new Date(b.rawDate).getTime() - new Date(a.rawDate).getTime())

      setActividad(todosItemsActividad)

      const solventesArr: ReciboSolventeItem[] = []

      // 1. Recibos mensuales pagados en recibos_generados
      ;(data.recibosList || []).forEach((r: any) => {
        if (r.estado === 'pagado') {
          const apto = aptosMap.get(r.apartamento_id)
          const mesKey = (r.mes_facturado || '').substring(0, 7)
          const periodoLabel = mesKey ? getMesLabel(mesKey) : 'Mes Desconocido'
          const pInfo = r.data_json?.pago_info
          const ref = pInfo?.referencia || r.data_json?.referencia || r.data_json?.ultima_referencia || 'S/R'
          const metodo = pInfo?.metodo || r.data_json?.metodo || 'Conciliación Directa'
          const fechaPago = pInfo?.fecha_pago || r.emitido_at || r.created_at || ''

          let origen = 'Sistema'
          if (pInfo?.pago_id) {
            origen = 'Reporte Residente'
          } else if (r.data_json?.editado_manualmente) {
            origen = 'Calendario de Deudas'
          } else if (r.data_json?.origen?.includes('excel')) {
            origen = 'Sincronización Inicial'
          }

          solventesArr.push({
            id: r.id,
            tipo: 'recibo_mensual',
            apartamento_id: r.apartamento_id,
            apartamento_numero: apto?.numero || 'S/N',
            propietario: apto?.propietario_nombre || 'Propietario',
            mes_facturado: r.mes_facturado || '',
            periodo_label: periodoLabel,
            mes_key: mesKey,
            monto_usd: Number(r.total_usd || 0),
            monto_bs: Number(r.total_bs || 0),
            tasa_bcv: Number(r.tasa_bcv || 0),
            estado: 'pagado',
            referencia: ref,
            metodo,
            fecha_pago: fechaPago ? fechaPago.slice(0, 10) : '',
            fecha_registro: r.emitido_at || r.created_at || '',
            origen,
            nota: pInfo?.nota || r.data_json?.nota || ''
          })
        }
      })

      // 2. Atrasos históricos solventados en deudas_mora
      ;(data.moraSolventadaList || []).forEach((m: any) => {
        const apto = aptosMap.get(m.apartamento_id)
        solventesArr.push({
          id: m.id,
          tipo: 'atraso_historico',
          apartamento_id: m.apartamento_id,
          apartamento_numero: apto?.numero || 'S/N',
          propietario: apto?.propietario_nombre || 'Propietario',
          mes_facturado: '2025-12-01',
          periodo_label: 'Deuda Histórica 2025',
          mes_key: '2025',
          monto_usd: Number(m.monto_usd || 0),
          monto_bs: Number(m.monto_bs || 0),
          tasa_bcv: 859.06,
          estado: 'solvente',
          referencia: 'CONCIL-MORA',
          metodo: 'Convenio / Solvencia Total',
          fecha_pago: (m.updated_at || m.created_at || '').slice(0, 10),
          fecha_registro: m.updated_at || m.created_at || '',
          origen: 'Mora y Deudores',
          nota: 'Atraso anterior conciliado como solvente'
        })
      })

      // Ordenar: primero los más recientes por mes_facturado, y luego por número de apartamento
      solventesArr.sort((a, b) => {
        if (b.mes_facturado !== a.mes_facturado) {
          return b.mes_facturado.localeCompare(a.mes_facturado)
        }
        return a.apartamento_numero.localeCompare(b.apartamento_numero, undefined, { numeric: true })
      })

      setListaSolventes(solventesArr)

    } catch (err) {
      console.error('[AdminDashboard] Error cargando métricas:', err)
    } finally {
      setLoading(false)
    }
  }, [mesActualKey, mesSeleccionado, rate])

  // ── Estadísticas calculadas ──
  const stats = useMemo(() => {
    let pendientesTotal = 0
    let aprobadosMes = 0
    let recaudadoMesBs = 0
    let aprobadosTotal = 0
    let recaudadoTotalBs = 0

    todosLosPagos.forEach((p: any) => {
      if (p.estado === 'pendiente') {
        pendientesTotal++
      }
      if (p.estado === 'aprobado') {
        aprobadosTotal++
        recaudadoTotalBs += Number(p.monto_bs || 0)

        const fechaStr = (p.fecha_pago || p.created_at || '').substring(0, 7)
        if (fechaStr === mesSeleccionado) {
          aprobadosMes++
          recaudadoMesBs += Number(p.monto_bs || 0)
        }
      }
    })

    const totalUsdMes = rate > 0 ? recaudadoMesBs / rate : 0
    const totalUsdHistorico = rate > 0 ? recaudadoTotalBs / rate : 0
    const totalSolventes = listaSolventes.length
    const totalSolventesMes = listaSolventes.filter(i => i.mes_key === mesSeleccionado).length

    return {
      pendientesTotal,
      aprobadosMes,
      recaudadoMesBs,
      totalUsdMes,
      aprobadosTotal,
      recaudadoTotalBs,
      totalUsdHistorico,
      totalSolventes,
      totalSolventesMes
    }
  }, [todosLosPagos, listaSolventes, mesSeleccionado, rate])

  useEffect(() => {
    cargarMetricas()

    const channelId = `admin_dashboard_${Math.random().toString(36).slice(2, 7)}`
    const channel = supabase
      .channel(channelId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pagos_reportados' }, () => {
        appCache.invalidateTags(['pagos', 'saldos', 'recibos', 'mora'])
        cargarMetricas(true)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gastos_comunes' }, () => {
        appCache.invalidateTags(['gastos', 'recibos'])
        cargarMetricas(true)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recibos_generados' }, () => {
        appCache.invalidateTags(['recibos', 'saldos', 'mora'])
        cargarMetricas(true)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deudas_mora' }, () => {
        appCache.invalidateTags(['mora', 'recibos', 'saldos'])
        cargarMetricas(true)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'falencias' }, () => {
        appCache.invalidateTags(['falencias'])
        cargarMetricas(true)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'perfiles' }, () => {
        appCache.invalidateTags(['residentes', 'apartamentos'])
        cargarMetricas(true)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [cargarMetricas])

  return (
    <div>
      <style>{`
        .admin-desktop-view {
          display: block;
          padding: 32px;
        }
        .admin-mobile-view {
          display: none;
        }

        @media (max-width: 768px) {
          .admin-desktop-view {
            display: none;
          }
          .admin-mobile-view {
            display: flex;
            flex-direction: column;
            gap: 20px;
            padding: 16px 16px 28px;
          }
        }
      `}</style>

      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* ── MOBILE DASHBOARD (CONDOMINIO TORRE 5) ─────────────────────── */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      <div className="admin-mobile-view">
        {/* TARJETA PRINCIPAL: TOTAL RECAUDADO ESTE MES */}
        <div style={{
          backgroundColor: '#141519',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '24px',
          padding: '22px 20px 20px',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)',
          position: 'relative'
        }}>
          {/* Header de la tarjeta */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ color: '#8e8e93', fontSize: '11px', fontWeight: 800, letterSpacing: '0.8px', textTransform: 'uppercase' }}>
              TOTAL RECAUDADO ESTE MES
            </span>
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

          {/* Gran cifra en Bolívares */}
          <div style={{ color: '#fff', fontSize: '34px', fontWeight: 900, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
            {ocultarSaldos ? 'Bs. ••••••' : `Bs. ${(stats.recaudadoMesBs || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </div>

          {/* Píldora de Rendimiento / Cobranza */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', marginBottom: '18px' }}>
            <span style={{
              backgroundColor: 'rgba(34, 197, 94, 0.14)',
              color: '#22c55e',
              border: '1px solid rgba(34, 197, 94, 0.28)',
              borderRadius: '999px',
              padding: '2px 8px',
              fontSize: '11px',
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              ↗ +{stats.aprobadosMes > 0 ? '12.50%' : '0,00%'}
            </span>
            <span style={{ color: '#8e8e93', fontSize: '11px', fontWeight: 500 }}>
              cobranza {getMesSoloNombre(mesSeleccionado) || 'del mes'}
            </span>
          </div>

          {/* Desglose de 3 Columnas al pie (COBRADO | GASTOS | EN MORA) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '10px',
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            paddingTop: '16px'
          }}>
            <div>
              <div style={{ color: '#8e8e93', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px' }}>
                COBRADO
              </div>
              <div style={{ color: '#fff', fontSize: '13px', fontWeight: 800 }}>
                {ocultarSaldos ? '••••' : `Bs. ${(stats.recaudadoMesBs || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`}
              </div>
            </div>

            <div>
              <div style={{ color: '#8e8e93', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px' }}>
                GASTOS
              </div>
              <div style={{ color: '#fff', fontSize: '13px', fontWeight: 800 }}>
                {ocultarSaldos ? '••••' : `Bs. ${(gastosMesBs || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`}
              </div>
            </div>

            <div>
              <div style={{ color: '#8e8e93', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px' }}>
                EN MORA
              </div>
              <div style={{ color: '#fff', fontSize: '13px', fontWeight: 800 }}>
                {ocultarSaldos ? '••••' : `Bs. ${(stats.pendientesTotal > 0 ? (stats.pendientesTotal * 15 * (rate || 40)) : 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`}
              </div>
            </div>
          </div>
        </div>

        {/* BANNER INTERACTIVO: FACTURAS Y RECIBOS SOLVENTADOS */}
        <div
          onClick={() => setModalSolventesOpen(true)}
          style={{
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.16) 0%, rgba(5, 150, 105, 0.08) 100%)',
            border: '1px solid rgba(16, 185, 129, 0.35)',
            borderRadius: '20px',
            padding: '16px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
            transition: 'all 0.2s ease'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '14px',
              backgroundColor: 'rgba(16, 185, 129, 0.22)',
              border: '1px solid rgba(16, 185, 129, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px'
            }}>
              🧾
            </div>
            <div>
              <div style={{ color: '#fff', fontSize: '15px', fontWeight: 800 }}>
                {stats.totalSolventes} Facturas y Recibos Pagados
              </div>
              <div style={{ color: '#a7f3d0', fontSize: '11px', marginTop: '2px', fontWeight: 500 }}>
                Toca para ver desglose por apartamento y mes
              </div>
            </div>
          </div>
          <span style={{
            backgroundColor: '#10b981',
            color: '#000',
            fontSize: '11px',
            fontWeight: 800,
            padding: '6px 14px',
            borderRadius: '10px',
            boxShadow: '0 2px 8px rgba(16, 185, 129, 0.4)'
          }}>
            Ver →
          </span>
        </div>

        {/* SECCIÓN: ACCIONES RÁPIDAS DE CONDOMINIO */}
        <div>
          <h2 style={{ color: '#fff', fontSize: '18px', fontWeight: 800, margin: '0 0 16px', letterSpacing: '-0.3px' }}>
            Acciones rápidas
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '18px 8px' }}>
            {/* 1. Registrar Gasto (Verde) */}
            <button
              onClick={() => navigate('/admin/gastos')}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              <div style={{
                width: '58px',
                height: '58px',
                borderRadius: '50%',
                backgroundColor: '#13281f',
                border: '1px solid rgba(34, 197, 94, 0.25)',
                color: '#22c55e',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px'
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </div>
              <span style={{ color: '#d4d4d8', fontSize: '12px', fontWeight: 600 }}>+ Gasto</span>
            </button>

            {/* 2. Emitir Recibos Masivos (Rojizo/Vino) */}
            <button
              onClick={() => navigate('/admin/generar-recibos')}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              <div style={{
                width: '58px',
                height: '58px',
                borderRadius: '50%',
                backgroundColor: '#2b161c',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                color: '#f87171',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px'
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="12" y1="11" x2="12" y2="17"/>
                  <line x1="9" y1="14" x2="15" y2="14"/>
                </svg>
              </div>
              <span style={{ color: '#d4d4d8', fontSize: '12px', fontWeight: 600 }}>Emitir Recibo</span>
            </button>

            {/* 3. Mora y Deudores (Azul/Gris) */}
            <button
              onClick={() => navigate('/admin/mora')}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              <div style={{
                width: '58px',
                height: '58px',
                borderRadius: '50%',
                backgroundColor: '#161c28',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                color: '#60a5fa',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px'
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              </div>
              <span style={{ color: '#d4d4d8', fontSize: '12px', fontWeight: 600 }}>Mora / Deuda</span>
            </button>

            {/* 4. Validar Pagos (Ámbar con badge de pendientes) */}
            <button
              onClick={() => navigate('/admin/recibos?filtro=pendiente')}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              <div style={{
                width: '58px',
                height: '58px',
                borderRadius: '50%',
                backgroundColor: '#262013',
                border: '1px solid rgba(245, 158, 11, 0.25)',
                color: '#fbbf24',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative'
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 11 12 14 22 4"/>
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                </svg>
                {stats.pendientesTotal > 0 && (
                  <span style={{
                    position: 'absolute',
                    top: '-2px',
                    right: '-2px',
                    backgroundColor: 'var(--color-accent, #ea580c)',
                    color: '#fff',
                    fontSize: '9px',
                    fontWeight: 900,
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '2px solid #0c0d10'
                  }}>
                    {stats.pendientesTotal}
                  </span>
                )}
              </div>
              <span style={{ color: '#d4d4d8', fontSize: '12px', fontWeight: 600 }}>Validar Pagos</span>
            </button>

            {/* 5. Casos y Multas (Morado) */}
            <button
              onClick={() => navigate('/admin/casos')}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              <div style={{
                width: '58px',
                height: '58px',
                borderRadius: '50%',
                backgroundColor: '#211629',
                border: '1px solid rgba(168, 85, 247, 0.25)',
                color: '#c084fc',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  <line x1="12" y1="11" x2="12" y2="17"/>
                  <line x1="9" y1="14" x2="15" y2="14"/>
                </svg>
              </div>
              <span style={{ color: '#d4d4d8', fontSize: '12px', fontWeight: 600 }}>Casos / Multas</span>
            </button>

            {/* 6. Apartamentos y Propietarios (Naranja) */}
            <button
              onClick={() => navigate('/admin/residentes')}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              <div style={{
                width: '58px',
                height: '58px',
                borderRadius: '50%',
                backgroundColor: '#291a13',
                border: '1px solid rgba(249, 115, 22, 0.25)',
                color: '#fb923c',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="2" width="16" height="20" rx="2"/>
                  <line x1="9" y1="6" x2="9" y2="6.01"/>
                  <line x1="15" y1="6" x2="15" y2="6.01"/>
                  <line x1="9" y1="10" x2="9" y2="10.01"/>
                  <line x1="15" y1="10" x2="15" y2="10.01"/>
                </svg>
              </div>
              <span style={{ color: '#d4d4d8', fontSize: '12px', fontWeight: 600 }}>Apartamentos</span>
            </button>

            {/* 7. Avisos a la Comunidad (Rojo/Ámbar) */}
            <button
              onClick={() => setAvisoModalOpen(true)}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              <div style={{
                width: '58px',
                height: '58px',
                borderRadius: '50%',
                backgroundColor: '#2d1818',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                color: '#f87171',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px'
              }}>
                📢
              </div>
              <span style={{ color: '#d4d4d8', fontSize: '12px', fontWeight: 600 }}>Avisos</span>
            </button>

            {/* 8. Limpiar Caché Global */}
            <BotonLimpiarCache variant="quickAction" />
          </div>
        </div>

        {/* SECCIÓN: ESTADO GENERAL DE RECIBOS */}
        <div style={{
          backgroundColor: '#141519',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '20px',
          padding: '22px 20px',
          textAlign: 'center'
        }}>
          <p style={{ color: '#a1a1aa', fontSize: '14px', fontWeight: 600, margin: '0 0 6px' }}>
            Balance del Mes de {getMesSoloNombre(mesSeleccionado) || 'Septiembre'}
          </p>
          <p style={{ color: '#71717a', fontSize: '12px', margin: '0 0 10px' }}>
            {apartamentosCount} apartamentos en la comunidad · Cobranza y gastos al día
          </p>
          <div
            onClick={() => navigate('/admin/recibos-emitidos')}
            style={{ color: 'var(--color-accent, #f97316)', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
          >
            Ver todos los recibos emitidos →
          </div>
        </div>

        {/* SECCIÓN: HISTORIAL Y TIMELINE DE PAGOS Y APROBACIONES (MOBILE) */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h2 style={{ color: '#fff', fontSize: '17px', fontWeight: 800, margin: 0, letterSpacing: '-0.3px' }}>
              📋 Pagos y Aprobaciones
            </h2>
            <button
              onClick={() => setModalTimelineOpen(true)}
              style={{
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                color: '#34d399',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                padding: '5px 10px',
                borderRadius: '8px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              🕒 Ver Timeline
            </button>
          </div>

          {/* Filtros rápidos mobile */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', overflowX: 'auto', paddingBottom: '4px' }}>
            {[
              { id: 'todos', label: `Todos (${actividad.length})` },
              { id: 'admin', label: `🛡️ Admin (${conteoAdmin})` },
              { id: 'residente', label: `📱 Residentes (${conteoResidente})` }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setFiltroTabActividad(tab.id as any)}
                style={{
                  padding: '5px 10px',
                  borderRadius: '7px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  border: filtroTabActividad === tab.id ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.08)',
                  backgroundColor: filtroTabActividad === tab.id ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.04)',
                  color: filtroTabActividad === tab.id ? '#60a5fa' : '#94a3b8'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {actividadFiltradaWidget.length === 0 ? (
            <div style={{
              backgroundColor: '#141519',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '20px',
              padding: '28px 20px',
              textAlign: 'center'
            }}>
              <p style={{ color: '#a1a1aa', fontSize: '14px', fontWeight: 600, margin: '0 0 8px' }}>
                No hay pagos ni aprobaciones en esta vista
              </p>
              <div
                onClick={() => setModalTimelineOpen(true)}
                style={{ color: 'var(--color-accent, #f97316)', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
              >
                Abrir timeline completo
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {actividadFiltradaWidget.slice(0, 5).map(item => {
                const isPendiente = item.estado === 'pendiente'
                const isAprobado = item.estado === 'aprobado'
                const esAdmin = item.origen === 'admin'
                const colorEstado = isAprobado ? '#22c55e' : (isPendiente ? '#f59e0b' : '#ef4444')

                return (
                  <div
                    key={item.id}
                    onClick={() => setModalTimelineOpen(true)}
                    style={{
                      backgroundColor: '#141519',
                      border: esAdmin ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '16px',
                      padding: '14px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      gap: '12px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '15px',
                        backgroundColor: esAdmin ? 'rgba(16, 185, 129, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                        border: esAdmin ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(56, 189, 248, 0.3)'
                      }}>
                        {esAdmin ? '🛡️' : '📱'}
                      </span>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: '#fff', fontSize: '13px', fontWeight: 700 }}>
                            {item.titulo}
                          </span>
                          <span style={{
                            fontSize: '9px',
                            fontWeight: 800,
                            padding: '1px 5px',
                            borderRadius: '4px',
                            backgroundColor: esAdmin ? 'rgba(16, 185, 129, 0.2)' : 'rgba(56, 189, 248, 0.2)',
                            color: esAdmin ? '#34d399' : '#38bdf8'
                          }}>
                            {esAdmin ? 'Admin' : 'Residente'}
                          </span>
                        </div>
                        <div style={{ color: '#71717a', fontSize: '11px', marginTop: '2px' }}>
                          Ref: {item.referencia} · {item.fecha}
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: '#fff', fontSize: '13px', fontWeight: 800 }}>
                        {item.monto}
                      </div>
                      <span style={{
                        color: colorEstado,
                        fontSize: '10px',
                        fontWeight: 800,
                        textTransform: 'uppercase'
                      }}>
                        {esAdmin ? '✓ Aprobado' : item.estado}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* ── DESKTOP DASHBOARD (PRESERVADO ÍNTEGRO PARA COMPUTADORAS) ─── */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      <div className="admin-desktop-view">
        {/* Header Desktop */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ color: '#fff', fontSize: '28px', fontWeight: 800, margin: 0 }}>Panel de Administración</h1>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: '#10b98115',
                border: '1px solid #10b98130',
                color: '#10b981',
                fontSize: '11px',
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: '999px',
              }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981', display: 'inline-block' }}></span>
                En Vivo
              </span>
            </div>
            <p style={{ color: '#888', fontSize: '14px', marginTop: '4px', textTransform: 'capitalize' }}>
              {getMesLabel(mesSeleccionado)} {mesSeleccionado === mesActualKey ? '· (Mes Actual)' : ''}
            </p>
            {!loadingRate && !errorRate && rate > 0 && (
              <p style={{ color: 'var(--color-accent, #f97316)', fontSize: '12px', marginTop: '6px', margin: 0 }}>
                Tasa BCV Oficial: {rate.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} Bs/$
              </p>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {mesesDisponibles.length > 0 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: '#141414',
                border: '1px solid #262626',
                padding: '6px 12px',
                borderRadius: '10px'
              }}>
                <span style={{ color: '#888', fontSize: '12px', fontWeight: 600 }}>📅 Mes:</span>
                <select
                  value={mesSeleccionado}
                  onChange={e => setMesSeleccionado(e.target.value)}
                  style={{
                    backgroundColor: '#0a0a0a',
                    color: 'var(--color-accent, #f97316)',
                    border: '1px solid var(--border-accent, #f9731650)',
                    padding: '6px 10px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 700,
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  {mesesDisponibles.map(m => (
                    <option key={m} value={m}>
                      {getMesLabel(m)} {m === mesActualKey ? '(Actual)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              onClick={() => cargarMetricas(true)}
              style={{
                backgroundColor: '#1a1a1a',
                color: '#fff',
                border: '1px solid #2a2a2a',
                padding: '8px 16px',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              🔄 Actualizar
            </button>

            <BotonLimpiarCache variant="button" />

            <button
              onClick={() => setAvisoModalOpen(true)}
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                color: '#f87171',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                padding: '8px 16px',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s',
              }}
            >
              📢 Publicar Aviso
            </button>
          </div>
        </div>

        {/* Banner de alerta si hay pagos pendientes */}
        {stats.pendientesTotal > 0 && (
          <div
            onClick={() => navigate('/admin/recibos?filtro=pendiente')}
            style={{
              background: 'linear-gradient(180deg, rgba(245, 158, 11, 0.12) 0%, rgba(245, 158, 11, 0.04) 100%)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              borderTop: '1px solid rgba(245, 158, 11, 0.5)',
              borderRadius: '22px',
              boxShadow: '0 12px 30px -4px rgba(245, 158, 11, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
              padding: '16px 22px',
              marginBottom: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <span style={{ fontSize: '24px' }}>⏳</span>
              <div>
                <p style={{ color: '#f59e0b', fontSize: '14px', fontWeight: 700, margin: 0 }}>
                  Tienes {stats.pendientesTotal} {stats.pendientesTotal === 1 ? 'pago pendiente' : 'pagos pendientes'} por revisar y aprobar
                </p>
                <p style={{ color: '#94a3b8', fontSize: '12px', margin: 0, marginTop: '2px' }}>
                  Los residentes están esperando la confirmación de su solvencia.
                </p>
              </div>
            </div>
            <button style={{
              background: 'var(--color-brand-gradient, linear-gradient(135deg, #fb923c 0%, #f97316 55%, #ea580c 100%))',
              color: '#fff',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              padding: '8px 18px',
              borderRadius: '12px',
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer',
              boxShadow: 'var(--color-brand-shadow, 0 4px 14px var(--color-accent-glow))',
            }}>
              Revisar Ahora →
            </button>
          </div>
        )}

        {/* Stats Grid Desktop */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
          {loading ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : (
            <>
              <StatCard
                icon="⏳"
                label="Pagos Pendientes"
                value={stats.pendientesTotal}
                sub={stats.pendientesTotal > 0 ? "Requieren aprobación" : "Al día"}
                color="#f59e0b"
                badge={stats.pendientesTotal > 0 ? "¡Atención!" : undefined}
                pulse={stats.pendientesTotal > 0}
                onClick={() => navigate('/admin/recibos?filtro=pendiente')}
              />
              <StatCard
                icon="🧾"
                label="Recibos y Cuotas Pagadas"
                value={stats.totalSolventes}
                sub={`${stats.totalSolventesMes} en ${getMesSoloNombre(mesSeleccionado) || 'este mes'} · Clic para ver detalle →`}
                color="#10b981"
                badge={stats.totalSolventes > 0 ? "Solventes" : undefined}
                onClick={() => setModalSolventesOpen(true)}
              />
              <StatCard
                icon="💵"
                label={`Recaudado (${getMesSoloNombre(mesSeleccionado)})`}
                value={`Bs. ${stats.recaudadoMesBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                sub={rate > 0 ? `≈ $${stats.totalUsdMes.toFixed(2)} USD` : undefined}
                color="#10b981"
                onClick={() => navigate('/admin/recibos')}
              />
              <StatCard
                icon="📈"
                label="Total Histórico Cobrado"
                value={`Bs. ${stats.recaudadoTotalBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                sub={rate > 0 ? `≈ $${stats.totalUsdHistorico.toFixed(2)} USD acumulados` : undefined}
                color="#3b82f6"
              />
              <StatCard
                icon="🏢"
                label="Total Apartamentos"
                value={apartamentosCount}
                sub="Propiedades registradas"
                color="#8b5cf6"
                onClick={() => navigate('/admin/residentes')}
              />
              <StatCard
                icon="⚠️"
                label="Reportes de Averías"
                value={reportesAbiertos}
                sub="Pendientes de solución"
                color="#ef4444"
                onClick={() => navigate('/admin/reportes')}
              />
              <StatCard
                icon="🗳️"
                label="Votaciones Activas"
                value={propuestasActivas}
                sub="Consultas a la comunidad"
                color="#06b6d4"
                onClick={() => navigate('/admin/propuestas')}
              />
            </>
          )}
        </div>

        {/* Actividad y Timeline de Aprobaciones Desktop */}
        <div style={{
          backgroundColor: '#141414',
          border: '1px solid #1e1e1e',
          borderRadius: '16px',
          padding: '24px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h2 style={{ color: '#fff', fontSize: '18px', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>📋</span> Historial y Timeline de Pagos y Aprobaciones
              </h2>
              <p style={{ margin: '4px 0 0', color: '#71717a', fontSize: '12px' }}>
                Visualización combinada de pagos reportados por residentes y cuotas aprobadas manualmente por la administración.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setModalTimelineOpen(true)}
                style={{
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  color: '#34d399',
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                  padding: '7px 14px',
                  borderRadius: '10px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s'
                }}
              >
                <span>🕒</span> Ver Timeline Completo
              </button>

              <button
                type="button"
                onClick={() => navigate('/admin/recibos')}
                style={{
                  backgroundColor: 'transparent',
                  color: 'var(--color-accent, #f97316)',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Validar Pagos →
              </button>
            </div>
          </div>

          {/* Pestañas de Filtro Rápido en el Widget */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
            {[
              { id: 'todos', label: `Todos (${actividad.length})` },
              { id: 'admin', label: `🛡️ Aprobados por Admin (${conteoAdmin})` },
              { id: 'residente', label: `📱 Reportes Residentes (${conteoResidente})` }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFiltroTabActividad(tab.id as any)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: filtroTabActividad === tab.id ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.08)',
                  backgroundColor: filtroTabActividad === tab.id ? 'rgba(59, 130, 246, 0.18)' : 'rgba(255,255,255,0.03)',
                  color: filtroTabActividad === tab.id ? '#60a5fa' : '#94a3b8',
                  transition: 'all 0.15s'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ height: '48px', backgroundColor: '#1a1a1a', borderRadius: '10px' }} />
              <div style={{ height: '48px', backgroundColor: '#1a1a1a', borderRadius: '10px' }} />
            </div>
          ) : actividadFiltradaWidget.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px 0', color: '#666' }}>
              No hay pagos ni aprobaciones para mostrar en este filtro.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {actividadFiltradaWidget.slice(0, 6).map(item => {
                const isPendiente = item.estado === 'pendiente'
                const isAprobado = item.estado === 'aprobado'
                const esAdmin = item.origen === 'admin'
                const colorEstado = isAprobado ? '#10b981' : (isPendiente ? '#f59e0b' : '#ef4444')

                return (
                  <div
                    key={item.id}
                    onClick={() => setModalTimelineOpen(true)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '14px 18px',
                      backgroundColor: '#0a0a0a',
                      border: esAdmin ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid #1e1e1e',
                      borderRadius: '14px',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      gap: '16px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <span style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '18px',
                        backgroundColor: esAdmin ? 'rgba(16, 185, 129, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                        border: esAdmin ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(56, 189, 248, 0.3)',
                        flexShrink: 0
                      }}>
                        {esAdmin ? '🛡️' : '📱'}
                      </span>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ color: '#fff', fontSize: '14px', fontWeight: 700 }}>
                            {item.titulo}
                          </span>
                          <span style={{
                            padding: '2px 7px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            fontWeight: 800,
                            backgroundColor: esAdmin ? 'rgba(16, 185, 129, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                            color: esAdmin ? '#34d399' : '#38bdf8',
                            border: esAdmin ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(56, 189, 248, 0.3)'
                          }}>
                            {esAdmin ? 'Aprobado Admin' : 'Reporte Residente'}
                          </span>
                          {item.periodo && (
                            <span style={{ fontSize: '11px', color: '#64748b' }}>
                              ({item.periodo})
                            </span>
                          )}
                        </div>

                        <p style={{ color: '#777', fontSize: '12px', margin: '3px 0 0 0' }}>
                          Ref: <strong style={{ color: '#cbd5e1' }}>{item.referencia}</strong> · {esAdmin ? `Por: ${item.autor} · ` : ''}{item.fecha}
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', textAlign: 'right' }}>
                      <div>
                        {item.monto && (
                          <div style={{ color: '#fff', fontSize: '15px', fontWeight: 800 }}>
                            {item.monto}
                          </div>
                        )}
                        {item.montoUsd && (
                          <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 600 }}>
                            {item.montoUsd} USD
                          </div>
                        )}
                      </div>

                      <span style={{
                        backgroundColor: `${colorEstado}20`,
                        color: colorEstado,
                        border: `1px solid ${colorEstado}40`,
                        padding: '4px 12px',
                        borderRadius: '999px',
                        fontSize: '11px',
                        fontWeight: 800,
                        textTransform: 'capitalize',
                        whiteSpace: 'nowrap'
                      }}>
                        {esAdmin ? '✓ Aprobado' : (isPendiente ? '⏳ Pendiente' : '✓ Aprobado')}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal de Publicar / Gestionar Avisos de Comunidad */}
      <PublicarAvisoModal
        isOpen={avisoModalOpen}
        onClose={() => setAvisoModalOpen(false)}
      />

      {/* Modal de Detalle de Recibos y Atrasos Solventados */}
      <ModalRecibosSolventes
        isOpen={modalSolventesOpen}
        onClose={() => setModalSolventesOpen(false)}
        items={listaSolventes}
        tasaBcv={rate || 859.06}
      />

      {/* Modal de Historial y Timeline Completo de Aprobaciones */}
      <ModalTimelineAprobaciones
        isOpen={modalTimelineOpen}
        onClose={() => setModalTimelineOpen(false)}
        items={actividad}
        tasaBcv={rate || 859.06}
        onNavigateToRecibos={() => navigate('/admin/recibos')}
        onNavigateToCalendario={() => navigate('/admin/calendario-deudas')}
      />
    </div>
  )
}
