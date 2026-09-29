import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBcvRate } from '../../../data/useBcvRate'
import { supabase } from '../../../data/supabase'

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
      backgroundColor: '#141414',
      border: pulse ? `1px solid ${color}` : '1px solid #1e1e1e',
      boxShadow: pulse ? `0 0 15px ${color}30` : 'none',
      borderRadius: '14px',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      cursor: onClick ? 'pointer' : 'default',
      transition: 'all 0.2s ease',
      position: 'relative',
    }}
    onMouseOver={e => { if (onClick) e.currentTarget.style.borderColor = color }}
    onMouseOut={e => { if (onClick && !pulse) e.currentTarget.style.borderColor = '#1e1e1e' }}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: '24px' }}>{icon}</span>
      {badge && (
        <span style={{
          backgroundColor: `${color}25`,
          color: color,
          fontSize: '11px',
          fontWeight: 700,
          padding: '2px 8px',
          borderRadius: '999px',
          border: `1px solid ${color}40`,
        }}>
          {badge}
        </span>
      )}
    </div>
    <p style={{ color: '#888', fontSize: '12px', fontWeight: 500, margin: 0 }}>{label}</p>
    <p style={{ color: '#fff', fontSize: '24px', fontWeight: 800, margin: 0 }}>{value}</p>
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

  const cargarMetricas = useCallback(async () => {
    try {
      // 1. Apartamentos
      const { count: aptCount } = await supabase
        .from('apartamentos')
        .select('*', { count: 'exact', head: true })
      if (aptCount !== null) setApartamentosCount(aptCount)

      // 2. Pagos reportados y Recibos emitidos
      const [pagosRes, recibosRes] = await Promise.all([
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
          .from('recibos_generados')
          .select('mes_facturado')
          .order('mes_facturado', { ascending: false })
      ])

      const pagosData = pagosRes.data || []
      setTodosLosPagos(pagosData)

      // Extraer lista de meses disponibles
      const setMeses = new Set<string>()
      setMeses.add(mesActualKey)

      pagosData.forEach((p: any) => {
        const fecha = (p.fecha_pago || p.created_at || '').substring(0, 7)
        if (fecha && fecha.length === 7) setMeses.add(fecha)
      })

      if (recibosRes.data) {
        recibosRes.data.forEach((r: any) => {
          const m = (r.mes_facturado || '').substring(0, 7)
          if (m && m.length === 7) setMeses.add(m)
        })
      }

      const listaMeses = Array.from(setMeses).sort((a, b) => b.localeCompare(a))
      setMesesDisponibles(listaMeses)

      // Armar actividad reciente (primeros 6)
      const itemsActividad: ActividadItem[] = []
      pagosData.slice(0, 6).forEach((p: any) => {
        const aptoNum = p.apartamento?.numero ? `Apto ${p.apartamento.numero}` : 'Apartamento'
        const residentName = p.residente?.nombre_completo || 'Residente'
        const d = new Date(p.created_at)
        const hora = d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })
        const dia = d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })

        itemsActividad.push({
          id: p.id,
          tipo: 'pago',
          titulo: `Pago reportado - ${aptoNum} (${residentName})`,
          subtitulo: `Ref: ${p.referencia || 'S/R'} · ${p.notas_admin || 'Transferencia'}`,
          monto: `Bs. ${(p.monto_bs || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          estado: p.estado || 'pendiente',
          fecha: `${dia}, ${hora}`,
          rawDate: p.created_at,
        })
      })
      setActividad(itemsActividad)

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
  }, [mesActualKey])

  // ── Estadísticas calculadas en función del mes seleccionado ──
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

        // Comprobar si pertenece al mes seleccionado (YYYY-MM)
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

    // ── Suscripción en Tiempo Real ──
    const channel = supabase
      .channel('admin_dashboard_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pagos_reportados' },
        (payload) => {
          console.log('[AdminDashboard] Realtime en pagos_reportados:', payload)
          cargarMetricas()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'falencias' },
        () => cargarMetricas()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'perfiles' },
        () => cargarMetricas()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [cargarMetricas])

  return (
    <div style={{ padding: '32px' }}>
      {/* Header */}
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
          {/* Selector de Mes */}
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
            backgroundColor: '#f59e0b15',
            border: '1px solid #f59e0b40',
            borderRadius: '12px',
            padding: '14px 18px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            transition: 'background-color 0.2s',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '20px' }}>⏳</span>
            <div>
              <p style={{ color: '#f59e0b', fontSize: '14px', fontWeight: 700, margin: 0 }}>
                Tienes {stats.pendientesTotal} {stats.pendientesTotal === 1 ? 'pago pendiente' : 'pagos pendientes'} por revisar y aprobar
              </p>
              <p style={{ color: '#aaa', fontSize: '12px', margin: 0, marginTop: '2px' }}>
                Los residentes están esperando la confirmación de su solvencia.
              </p>
            </div>
          </div>
          <button style={{
            backgroundColor: '#f59e0b',
            color: '#000',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '8px',
            fontWeight: 700,
            fontSize: '12px',
            cursor: 'pointer',
          }}>
            Revisar Ahora →
          </button>
        </div>
      )}

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
        <StatCard
          icon="⏳"
          label="Pagos Pendientes"
          value={loading ? '...' : stats.pendientesTotal}
          sub={stats.pendientesTotal > 0 ? "Requieren aprobación" : "Al día"}
          color="#f59e0b"
          badge={stats.pendientesTotal > 0 ? "¡Atención!" : undefined}
          pulse={stats.pendientesTotal > 0}
          onClick={() => navigate('/admin/recibos?filtro=pendiente')}
        />
        <StatCard
          icon="✅"
          label={`Pagos Aprobados (${getMesSoloNombre(mesSeleccionado)})`}
          value={loading ? '...' : stats.aprobadosMes}
          sub={`${stats.aprobadosTotal} confirmados en total`}
          color="#10b981"
          onClick={() => navigate('/admin/recibos?filtro=aprobado')}
        />
        <StatCard
          icon="💰"
          label={`Total Recaudado (${getMesSoloNombre(mesSeleccionado)})`}
          value={loading ? '...' : `Bs. ${stats.recaudadoMesBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          sub={rate > 0 ? `Ref: $${stats.totalUsdMes.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · ${stats.aprobadosMes} ${stats.aprobadosMes === 1 ? 'pago' : 'pagos'}` : undefined}
          color="#f97316"
          badge={getMesSoloNombre(mesSeleccionado)}
          onClick={() => navigate('/admin/recibos-emitidos')}
        />
        <StatCard
          icon="🏠"
          label="Apartamentos"
          value={loading ? '...' : apartamentosCount}
          sub="Registrados en edificio"
          color="#3b82f6"
          onClick={() => navigate('/admin/residentes')}
        />
        <StatCard
          icon="📢"
          label="Reportes de Incidencias"
          value={loading ? '...' : reportesAbiertos}
          sub="En el edificio"
          color="#ec4899"
          onClick={() => navigate('/admin/reportes')}
        />
        <StatCard
          icon="🗳️"
          label="Propuestas Activas"
          value={loading ? '...' : propuestasActivas}
          sub="En votación"
          color="#8b5cf6"
          onClick={() => navigate('/admin/propuestas')}
        />
      </div>

      {/* Actividad reciente */}
      <div style={{ backgroundColor: '#141414', border: '1px solid #1e1e1e', borderRadius: '16px', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h2 style={{ color: '#fff', fontSize: '16px', fontWeight: 700, margin: 0 }}>Actividad Reciente en Vivo</h2>
            <p style={{ color: '#666', fontSize: '12px', margin: '4px 0 0 0' }}>Últimas transacciones y reportes recibidos</p>
          </div>
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
            Ver todos los recibos →
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#666', fontSize: '14px' }}>
            Cargando actividad en tiempo real...
          </div>
        ) : actividad.length === 0 ? (
          <div style={{ padding: '30px', textAlign: 'center', color: '#666', fontSize: '14px' }}>
            No hay pagos ni reportes registrados recientemente.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {actividad.map(item => {
              const isPendiente = item.estado === 'pendiente'
              const isAprobado = item.estado === 'aprobado'
              const colorEstado = isPendiente ? '#f59e0b' : isAprobado ? '#10b981' : '#ef4444'
              const iconEstado = isPendiente ? '⏳' : isAprobado ? '✅' : '❌'

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
                    gap: '12px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '10px',
                      backgroundColor: `${colorEstado}15`,
                      border: `1px solid ${colorEstado}30`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '18px',
                      flexShrink: 0,
                    }}>
                      {iconEstado}
                    </div>
                    <div>
                      <p style={{ color: '#fff', fontSize: '14px', fontWeight: 600, margin: 0 }}>
                        {item.titulo}
                      </p>
                      <p style={{ color: '#777', fontSize: '12px', margin: '2px 0 0 0' }}>
                        {item.subtitulo} · <span style={{ color: '#555' }}>{item.fecha}</span>
                      </p>
                    </div>
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

                    {isPendiente && (
                      <button
                        onClick={() => navigate('/admin/recibos?filtro=pendiente')}
                        style={{
                          backgroundColor: '#f59e0b',
                          color: '#000',
                          border: 'none',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Revisar
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
