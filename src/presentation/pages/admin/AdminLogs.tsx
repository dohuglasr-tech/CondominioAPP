import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { obtenerLogsAccesosResidentes, LogAccesoResidente } from '../../../data/accesosService'
import { supabase } from '../../../data/supabase'

export const AdminLogs: React.FC = () => {
  const [logs, setLogs] = useState<LogAccesoResidente[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')

  const cargarLogs = useCallback(async () => {
    setLoading(true)
    try {
      const items = await obtenerLogsAccesosResidentes(250)
      setLogs(items)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    cargarLogs()

    // Suscripción en tiempo real para reflejar nuevas conexiones al instante
    const channelId = `admin_logs_accesos_${Math.random().toString(36).slice(2, 7)}`
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'historial_auditoria' },
        (payload: any) => {
          if (payload?.new?.tipo_accion === 'ACCESO_RESIDENTE') {
            cargarLogs()
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [cargarLogs])

  const logsFiltrados = useMemo(() => {
    if (!busqueda.trim()) return logs
    const q = busqueda.trim().toLowerCase()
    return logs.filter((log) => {
      const matchApto = log.apartamento_numero.toLowerCase().includes(q)
      const matchFecha = log.fecha_conexion.toLowerCase().includes(q)
      const matchHora = log.hora_conexion.toLowerCase().includes(q)
      return matchApto || matchFecha || matchHora
    })
  }, [logs, busqueda])

  // Estadísticas rápidas
  const hoyStr = new Date().toLocaleDateString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })

  const conexionesHoy = useMemo(() => {
    return logs.filter(l => l.fecha_conexion === hoyStr).length
  }, [logs, hoyStr])

  const aptosUnicos = useMemo(() => {
    return new Set(logs.map(l => l.apartamento_numero)).size
  }, [logs])

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px 20px 48px' }}>
      {/* Encabezado */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '26px' }}>📋</span>
            <h1 style={{
              margin: 0,
              fontSize: '24px',
              fontWeight: 800,
              color: '#fff',
              letterSpacing: '-0.3px'
            }}>
              Logs de Conexión
            </h1>
          </div>
          <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: '13px' }}>
            Registro cronológico de entradas y accesos de residentes a la aplicación.
          </p>
        </div>

        <button
          onClick={cargarLogs}
          disabled={loading}
          style={{
            background: 'rgba(255, 255, 255, 0.06)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            color: '#cbd5e1',
            borderRadius: '10px',
            padding: '8px 14px',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.15s ease'
          }}
        >
          🔄 {loading ? 'Actualizando...' : 'Refrescar'}
        </button>
      </div>

      {/* Tarjetas de Resumen */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '14px',
        marginBottom: '24px'
      }}>
        <div style={{
          backgroundColor: '#111318',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '16px',
          padding: '16px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <span style={{ fontSize: '24px' }}>📊</span>
          <div>
            <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>
              Total Conexiones
            </div>
            <div style={{ color: '#fff', fontSize: '20px', fontWeight: 800 }}>
              {logs.length}
            </div>
          </div>
        </div>

        <div style={{
          backgroundColor: '#111318',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '16px',
          padding: '16px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <span style={{ fontSize: '24px' }}>⚡</span>
          <div>
            <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>
              Conexiones Hoy
            </div>
            <div style={{ color: '#38bdf8', fontSize: '20px', fontWeight: 800 }}>
              {conexionesHoy}
            </div>
          </div>
        </div>

        <div style={{
          backgroundColor: '#111318',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '16px',
          padding: '16px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <span style={{ fontSize: '24px' }}>🏢</span>
          <div>
            <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>
              Apartamentos Activos
            </div>
            <div style={{ color: '#22c55e', fontSize: '20px', fontWeight: 800 }}>
              {aptosUnicos}
            </div>
          </div>
        </div>
      </div>

      {/* Buscador */}
      <div style={{
        marginBottom: '18px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        backgroundColor: '#111318',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '12px',
        padding: '10px 14px'
      }}>
        <span style={{ color: '#64748b', fontSize: '16px' }}>🔍</span>
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por apartamento (ej. 565) o fecha (DD/MM/YYYY)..."
          style={{
            background: 'none',
            border: 'none',
            color: '#fff',
            fontSize: '13px',
            outline: 'none',
            width: '100%'
          }}
        />
        {busqueda && (
          <button
            onClick={() => setBusqueda('')}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Tabla de Logs */}
      <div style={{
        backgroundColor: '#111318',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '18px',
        overflow: 'hidden',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)'
      }}>
        {/* Cabecera de la tabla */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1.2fr 1fr 1fr',
          padding: '14px 20px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          backgroundColor: 'rgba(255, 255, 255, 0.02)',
          fontSize: '11px',
          fontWeight: 800,
          color: '#94a3b8',
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}>
          <div>Apartamento</div>
          <div>Fecha</div>
          <div style={{ textAlign: 'right' }}>Hora de Conexión</div>
        </div>

        {/* Lista de Registros */}
        {loading && logs.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
            ⏳ Cargando registros de conexión...
          </div>
        ) : logsFiltrados.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>📭</div>
            <div style={{ color: '#fff', fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>
              {busqueda ? 'No se encontraron registros coincidentes' : 'No hay conexiones registradas aún'}
            </div>
            <p style={{ color: '#64748b', fontSize: '12px', margin: 0 }}>
              {busqueda ? 'Intenta buscar con otro término o borra el filtro.' : 'Las conexiones de los residentes aparecerán aquí automáticamente en tiempo real cuando ingresen.'}
            </p>
          </div>
        ) : (
          <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
            {logsFiltrados.map((item, idx) => (
              <div
                key={item.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.2fr 1fr 1fr',
                  alignItems: 'center',
                  padding: '12px 20px',
                  borderBottom: idx < logsFiltrados.length - 1 ? '1px solid rgba(255, 255, 255, 0.04)' : 'none',
                  backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.01)',
                  transition: 'background-color 0.15s ease'
                }}
              >
                {/* Apartamento */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(56, 189, 248, 0.12)',
                    border: '1px solid rgba(56, 189, 248, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#38bdf8',
                    fontSize: '12px',
                    fontWeight: 800,
                    flexShrink: 0
                  }}>
                    🏢
                  </div>
                  <div>
                    <span style={{
                      color: '#fff',
                      fontSize: '13px',
                      fontWeight: 800
                    }}>
                      Apto {item.apartamento_numero}
                    </span>
                  </div>
                </div>

                {/* Fecha */}
                <div style={{ color: '#cbd5e1', fontSize: '12.5px', fontWeight: 600 }}>
                  📅 {item.fecha_conexion}
                </div>

                {/* Hora de Conexión */}
                <div style={{ textAlign: 'right' }}>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    backgroundColor: 'rgba(34, 197, 94, 0.12)',
                    border: '1px solid rgba(34, 197, 94, 0.25)',
                    color: '#4ade80',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '6px'
                  }}>
                    🕒 {item.hora_conexion}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
