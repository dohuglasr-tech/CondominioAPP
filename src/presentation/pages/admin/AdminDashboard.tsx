import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBcvRate } from '../../../data/useBcvRate'
import { supabase } from '../../../data/supabase'
import { SkeletonCard, SkeletonListItem } from '../../components/Skeleton'

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
    onMouseOver={e => {
      if (onClick) {
        e.currentTarget.style.borderColor = color
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = `0 16px 36px -4px rgba(0, 0, 0, 0.65), 0 0 15px ${color}20, inset 0 1px 0 rgba(255, 255, 255, 0.1)`
      }
    }}
    onMouseOut={e => {
      if (onClick) {
        e.currentTarget.style.borderColor = pulse ? color : 'rgba(255, 255, 255, 0.08)'
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = pulse
          ? `0 0 20px ${color}35, 0 12px 30px rgba(0, 0, 0, 0.5)`
          : '0 14px 34px -4px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.06)'
      }
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

      {/* Stats Grid */}
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
              icon="✅"
              label={`Pagos Aprobados (${getMesSoloNombre(mesSeleccionado)})`}
              value={stats.aprobadosMes}
              sub={`${stats.aprobadosTotal} confirmados en total`}
              color="#10b981"
              onClick={() => navigate('/admin/recibos?filtro=aprobado')}
            />
            <StatCard
              icon="💰"
              label={`Total Recaudado (${getMesSoloNombre(mesSeleccionado)})`}
              value={`Bs. ${stats.recaudadoMesBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              sub={rate > 0 ? `Ref: $${stats.totalUsdMes.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · ${stats.aprobadosMes} ${stats.aprobadosMes === 1 ? 'pago' : 'pagos'}` : undefined}
              color="#f97316"
              badge={getMesSoloNombre(mesSeleccionado)}
              onClick={() => navigate('/admin/recibos-emitidos')}
            />
            <StatCard
              icon="🏠"
              label="Apartamentos"
              value={apartamentosCount}
              sub="Registrados en edificio"
              color="#3b82f6"
              onClick={() => navigate('/admin/residentes')}
            />
            <StatCard
              icon="📢"
              label="Reportes de Incidencias"
              value={reportesAbiertos}
              sub="En el edificio"
              color="#ec4899"
              onClick={() => navigate('/admin/reportes')}
            />
            <StatCard
              icon="🗳️"
              label="Propuestas Activas"
              value={propuestasActivas}
              sub="En votación"
              color="#8b5cf6"
              onClick={() => navigate('/admin/propuestas')}
            />
          </>
        )}
      </div>

      {/* Actividad reciente */}
      <div style={{
        background: 'linear-gradient(180deg, #151922 0%, #0d1117 100%)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderTop: '1px solid rgba(255, 255, 255, 0.14)',
        boxShadow: '0 14px 34px -4px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
        borderRadius: '22px',
        padding: '26px'
      }}>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <SkeletonListItem />
            <SkeletonListItem />
            <SkeletonListItem />
            <SkeletonListItem />
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
