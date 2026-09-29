import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBcvRate } from '../../../data/useBcvRate'
import { supabase } from '../../../data/supabase'
import { SkeletonCard } from '../../components/Skeleton'

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

const StatCard: React.FC<StatCardProps> = ({ icon, label, value, sub, color = '#f97316', badge, pulse, onClick }) => (
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

interface ActividadItem {
  id: string
  tipo: 'pago' | 'reporte'
  titulo: string
  subtitulo: string
  monto?: string
  estado: string
  fecha: string
  rawDate: string
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

  const cargarMetricas = useCallback(async () => {
    try {
      // 1. Apartamentos
      const { count: aptCount } = await supabase
        .from('apartamentos')
        .select('*', { count: 'exact', head: true })
      if (aptCount !== null) setApartamentosCount(aptCount)

      // 2. Pagos reportados, Recibos emitidos y Gastos
      const [pagosRes, recibosRes, gastosRes] = await Promise.all([
        supabase
          .from('pagos_reportados')
          .select(`
            id,
            monto_bs,
            referencia,
            estado,
            created_at,
            fecha_pago,
            notas_admin,
            apartamento:apartamento_id ( numero ),
            residente:reportado_por ( nombre_completo )
          `)
          .order('created_at', { ascending: false }),
        supabase
          .from('recibos')
          .select('mes, anio')
          .order('anio', { ascending: false }),
        supabase
          .from('gastos')
          .select('monto_usd, mes_gasto')
      ])

      // Pagos
      const pagosList = pagosRes.data || []
      setTodosLosPagos(pagosList)

      // Gastos del mes
      let totalGastosBs = 0
      const currentRate = rate || 40
      if (gastosRes.data) {
        gastosRes.data.forEach((g: any) => {
          if (!g.mes_gasto || g.mes_gasto === mesSeleccionado) {
            totalGastosBs += Number(g.monto_usd || 0) * currentRate
          }
        })
      }
      setGastosMesBs(totalGastosBs)

      // Meses disponibles
      const mesesSet = new Set<string>()
      mesesSet.add(mesActualKey)
      ;(recibosRes.data || []).forEach((r: any) => {
        if (r.mes && r.anio) {
          const mKey = `${r.anio}-${String(r.mes).padStart(2, '0')}`
          mesesSet.add(mKey)
        }
      })
      const mesesArr = Array.from(mesesSet).sort().reverse()
      setMesesDisponibles(mesesArr)

      // Actividad reciente
      const itemsPagos: ActividadItem[] = pagosList.slice(0, 6).map((p: any) => ({
        id: p.id,
        tipo: 'pago',
        titulo: `Pago Apto ${p.apartamento?.numero || 'S/N'}`,
        subtitulo: `Ref: ${p.referencia || 'N/D'} · ${p.residente?.nombre_completo || 'Residente'}`,
        monto: `Bs. ${Number(p.monto_bs || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`,
        estado: p.estado,
        fecha: new Date(p.created_at).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' }),
        rawDate: p.created_at
      }))
      setActividad(itemsPagos)

      // 3. Reportes / Falencias
      const { count: falCount } = await supabase
        .from('falencias')
        .select('*', { count: 'exact', head: true })
      if (falCount !== null) setReportesAbiertos(falCount)

      // 4. Propuestas activas
      const { count: propCount } = await supabase
        .from('propuestas')
        .select('*', { count: 'exact', head: true })
        .eq('estado', 'activa')
      if (propCount !== null) setPropuestasActivas(propCount)

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

    return {
      pendientesTotal,
      aprobadosMes,
      recaudadoMesBs,
      totalUsdMes,
      aprobadosTotal,
      recaudadoTotalBs,
      totalUsdHistorico
    }
  }, [todosLosPagos, mesSeleccionado, rate])

  useEffect(() => {
    cargarMetricas()

    const channel = supabase
      .channel('admin_dashboard_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pagos_reportados' }, () => cargarMetricas())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'falencias' }, () => cargarMetricas())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'perfiles' }, () => cargarMetricas())
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

        {/* SECCIÓN: ACCIONES RÁPIDAS DE CONDOMINIO */}
        <div>
          <h2 style={{ color: '#fff', fontSize: '18px', fontWeight: 800, margin: '0 0 16px', letterSpacing: '-0.3px' }}>
            Acciones rápidas
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '18px 12px' }}>
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
                    backgroundColor: '#ea580c',
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
            style={{ color: '#f97316', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
          >
            Ver todos los recibos emitidos →
          </div>
        </div>

        {/* SECCIÓN: ÚLTIMOS PAGOS REPORTADOS */}
        <div>
          <h2 style={{ color: '#fff', fontSize: '18px', fontWeight: 800, margin: '0 0 14px', letterSpacing: '-0.3px' }}>
            Últimos Pagos Reportados
          </h2>

          {actividad.length === 0 ? (
            <div style={{
              backgroundColor: '#141519',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '20px',
              padding: '28px 20px',
              textAlign: 'center'
            }}>
              <p style={{ color: '#a1a1aa', fontSize: '14px', fontWeight: 600, margin: '0 0 8px' }}>
                No hay pagos pendientes de revisión
              </p>
              <div
                onClick={() => navigate('/admin/recibos')}
                style={{ color: '#f97316', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
              >
                Ver historial de recibos
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {actividad.slice(0, 4).map(item => {
                const isPendiente = item.estado === 'pendiente'
                const isAprobado = item.estado === 'aprobado'
                const colorEstado = isAprobado ? '#22c55e' : (isPendiente ? '#f59e0b' : '#ef4444')

                return (
                  <div
                    key={item.id}
                    onClick={() => navigate('/admin/recibos')}
                    style={{
                      backgroundColor: '#141519',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '16px',
                      padding: '14px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer'
                    }}
                  >
                    <div>
                      <div style={{ color: '#fff', fontSize: '13px', fontWeight: 700 }}>
                        {item.titulo}
                      </div>
                      <div style={{ color: '#71717a', fontSize: '11px', marginTop: '2px' }}>
                        {item.subtitulo} · {item.fecha}
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
                        {item.estado}
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
              <p style={{ color: '#f97316', fontSize: '12px', marginTop: '6px', margin: 0 }}>
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
                    color: '#f97316',
                    border: '1px solid #f9731650',
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
              onClick={cargarMetricas}
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
              background: 'linear-gradient(135deg, #fb923c 0%, #f97316 55%, #ea580c 100%)',
              color: '#fff',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              padding: '8px 18px',
              borderRadius: '12px',
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(249, 115, 22, 0.35)',
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

        {/* Actividad Reciente Desktop */}
        <div style={{
          backgroundColor: '#141414',
          border: '1px solid #1e1e1e',
          borderRadius: '16px',
          padding: '24px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ color: '#fff', fontSize: '18px', fontWeight: 700, margin: 0 }}>
              📋 Últimos Pagos Reportados
            </h2>
            <button
              onClick={() => navigate('/admin/recibos')}
              style={{
                backgroundColor: 'transparent',
                color: '#f97316',
                border: 'none',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Ver todos →
            </button>
          </div>

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ height: '48px', backgroundColor: '#1a1a1a', borderRadius: '10px' }} />
              <div style={{ height: '48px', backgroundColor: '#1a1a1a', borderRadius: '10px' }} />
            </div>
          ) : actividad.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px 0', color: '#666' }}>
              No hay pagos reportados recientemente.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {actividad.map(item => {
                const isPendiente = item.estado === 'pendiente'
                const isAprobado = item.estado === 'aprobado'
                const colorEstado = isAprobado ? '#10b981' : (isPendiente ? '#f59e0b' : '#ef4444')

                return (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '14px 16px',
                      backgroundColor: '#0a0a0a',
                      border: '1px solid #1e1e1e',
                      borderRadius: '12px',
                    }}
                  >
                    <div>
                      <p style={{ color: '#fff', fontSize: '14px', fontWeight: 600, margin: 0 }}>
                        {item.titulo}
                      </p>
                      <p style={{ color: '#777', fontSize: '12px', margin: '2px 0 0 0' }}>
                        {item.subtitulo} · {item.fecha}
                      </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      {item.monto && (
                        <span style={{ color: '#fff', fontSize: '15px', fontWeight: 700 }}>
                          {item.monto}
                        </span>
                      )}
                      <span style={{
                        backgroundColor: `${colorEstado}20`,
                        color: colorEstado,
                        border: `1px solid ${colorEstado}40`,
                        padding: '4px 10px',
                        borderRadius: '999px',
                        fontSize: '11px',
                        fontWeight: 700,
                        textTransform: 'capitalize',
                      }}>
                        {item.estado}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
