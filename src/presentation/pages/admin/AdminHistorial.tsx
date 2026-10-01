import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { obtenerHistorialAuditoria, LogAuditoria, TipoAccionAuditoria } from '../../../data/auditoriaService'
import { supabase } from '../../../data/supabase'

export const AdminHistorial: React.FC = () => {
  const [logs, setLogs] = useState<LogAuditoria[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtroTipo, setFiltroTipo] = useState<string>('todos')
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null)

  const cargarLogs = useCallback(async () => {
    setLoading(true)
    try {
      const items = await obtenerHistorialAuditoria()
      setLogs(items)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    cargarLogs()

    // Suscripción Realtime si la tabla existe en Supabase
    const channelId = `auditoria_${Math.random().toString(36).slice(2, 7)}`
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'historial_auditoria' },
        () => cargarLogs()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [cargarLogs])

  // Filtrado
  const logsFiltrados = useMemo(() => {
    return logs.filter(log => {
      if (filtroTipo !== 'todos' && log.tipo_accion !== filtroTipo) {
        return false
      }
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase()
        const matchTitulo = log.titulo.toLowerCase().includes(q)
        const matchDesc = log.descripcion.toLowerCase().includes(q)
        const matchMotivo = log.motivo.toLowerCase().includes(q)
        const matchApto = (log.apartamento_numero || '').toLowerCase().includes(q)
        const matchAutor = (log.autor_nombre || '').toLowerCase().includes(q)
        if (!matchTitulo && !matchDesc && !matchMotivo && !matchApto && !matchAutor) return false
      }
      return true
    })
  }, [logs, filtroTipo, busqueda])

  // Estadísticas
  const stats = useMemo(() => {
    const total = logs.length
    const emisionesBorradas = logs.filter(l => l.tipo_accion === 'ELIMINACION_EMISION').length
    const deudasRetiradas = logs.filter(l => l.tipo_accion === 'ELIMINACION_RECIBO_INDIVIDUAL').length
    const totalMontoUsd = logs.reduce((acc, l) => acc + (Number(l.monto_usd) || 0), 0)
    const totalMontoBs = logs.reduce((acc, l) => acc + (Number(l.monto_bs) || 0), 0)

    const autoresSet = new Set(logs.map(l => l.autor_nombre).filter(Boolean))

    return {
      total,
      emisionesBorradas,
      deudasRetiradas,
      totalMontoUsd,
      totalMontoBs,
      autoresCount: autoresSet.size
    }
  }, [logs])

  const getTipoBadge = (tipo: TipoAccionAuditoria) => {
    switch (tipo) {
      case 'ELIMINACION_EMISION':
        return {
          label: 'EMISIÓN ANULADA',
          color: '#ef4444',
          bg: 'rgba(239, 68, 68, 0.15)',
          border: 'rgba(239, 68, 68, 0.35)',
          icon: '🗑️'
        }
      case 'ELIMINACION_RECIBO_INDIVIDUAL':
        return {
          label: 'DEUDA APTO RETIRADA',
          color: 'var(--color-accent, #f97316)',
          bg: 'var(--color-accent-light, rgba(249, 115, 22, 0.15))',
          border: 'var(--color-accent-glow, rgba(249, 115, 22, 0.35))',
          icon: '📄'
        }
      case 'EDICION_DEUDA':
      case 'CONDONACION_DEUDA':
        return {
          label: 'DEUDA EDITADA / PERDONADA',
          color: '#eab308',
          bg: 'rgba(234, 179, 8, 0.15)',
          border: 'rgba(234, 179, 8, 0.35)',
          icon: '⚖️'
        }
      case 'CAMBIO_CONFIG_EDIFICIO':
      case 'MODIFICACION_ALICUOTA':
        return {
          label: 'CAMBIO EDIFICIO / ALÍCUOTA',
          color: '#3b82f6',
          bg: 'rgba(59, 130, 246, 0.15)',
          border: 'rgba(59, 130, 246, 0.35)',
          icon: '⚙️'
        }
      case 'RETIRO_SALDO_A_FAVOR':
        return {
          label: 'RETIRO SALDO A FAVOR',
          color: '#10b981',
          bg: 'rgba(16, 185, 129, 0.15)',
          border: 'rgba(16, 185, 129, 0.35)',
          icon: '💚'
        }
      case 'PAGO_DEUDA_ATRASADA':
        return {
          label: 'DEUDA ATRASADA PAGADA',
          color: '#10b981',
          bg: 'rgba(16, 185, 129, 0.2)',
          border: 'rgba(16, 185, 129, 0.5)',
          icon: '✅'
        }
      default:
        return {
          label: 'ACCIÓN REGISTRADA',
          color: '#a855f7',
          bg: 'rgba(168, 85, 247, 0.15)',
          border: 'rgba(168, 85, 247, 0.35)',
          icon: '📝'
        }
    }
  }

  return (
    <div style={{ padding: '28px 24px 60px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>
      
      {/* ── HEADER PRINCIPAL CON SELLO DE SEGURIDAD ── */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ color: '#fff', fontSize: '26px', fontWeight: 900, margin: 0, letterSpacing: '-0.5px' }}>
                Historial de Auditoría & Arqueo
              </h1>
              <span style={{
                backgroundColor: 'rgba(34, 197, 94, 0.15)',
                color: '#22c55e',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                padding: '4px 10px',
                borderRadius: '999px',
                fontSize: '11px',
                fontWeight: 800,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                🛡️ Solo Lectura · Inmutable
              </span>
            </div>
            <p style={{ color: '#7e8b9b', fontSize: '13px', margin: '6px 0 0', maxWidth: '750px', lineHeight: 1.4 }}>
              Registro cronológico blindado de todas las emisiones borradas, deudas retiradas, condonaciones y cambios sensibles.
              Imposible de alterar o borrar para garantizar auditorías transparentes.
            </p>
          </div>

          <button
            onClick={() => cargarLogs()}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#d4d4d8',
              padding: '9px 16px',
              borderRadius: '12px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            🔄 Actualizar
          </button>
        </div>
      </div>

      {/* ── MÉTRICAS DE ARQUEO ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px',
        marginBottom: '28px'
      }}>
        <div style={{
          background: 'linear-gradient(180deg, #151922 0%, #0d1117 100%)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '18px',
          padding: '18px 20px',
        }}>
          <div style={{ color: '#7e8b9b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>TOTAL EVENTOS</div>
          <div style={{ color: '#fff', fontSize: '28px', fontWeight: 900, marginTop: '4px' }}>{stats.total}</div>
          <div style={{ color: '#a1a1aa', fontSize: '11px', marginTop: '4px' }}>Registros inmutables</div>
        </div>

        <div style={{
          background: 'linear-gradient(180deg, #151922 0%, #0d1117 100%)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          borderRadius: '18px',
          padding: '18px 20px',
        }}>
          <div style={{ color: '#ef4444', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>EMISIONES ANULADAS</div>
          <div style={{ color: '#fff', fontSize: '28px', fontWeight: 900, marginTop: '4px' }}>{stats.emisionesBorradas}</div>
          <div style={{ color: '#ef4444', fontSize: '11px', marginTop: '4px' }}>Borrados masivos del mes</div>
        </div>

        <div style={{
          background: 'linear-gradient(180deg, #151922 0%, #0d1117 100%)',
          border: '1px solid var(--color-accent-glow, rgba(249, 115, 22, 0.2))',
          borderRadius: '18px',
          padding: '18px 20px',
        }}>
          <div style={{ color: 'var(--color-accent, #f97316)', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>DEUDAS RETIRADAS</div>
          <div style={{ color: '#fff', fontSize: '28px', fontWeight: 900, marginTop: '4px' }}>{stats.deudasRetiradas}</div>
          <div style={{ color: 'var(--color-accent, #f97316)', fontSize: '11px', marginTop: '4px' }}>Apartamentos individuales</div>
        </div>

        <div style={{
          background: 'linear-gradient(180deg, #151922 0%, #0d1117 100%)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '18px',
          padding: '18px 20px',
        }}>
          <div style={{ color: '#7e8b9b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>DEUDA TOTAL ANULADA</div>
          <div style={{ color: '#22c55e', fontSize: '22px', fontWeight: 900, marginTop: '4px' }}>
            $ {stats.totalMontoUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div style={{ color: '#8e8e93', fontSize: '11px', marginTop: '4px' }}>
            Bs. {stats.totalMontoBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* ── BARRA DE BÚSQUEDA Y FILTROS ── */}
      <div style={{
        background: '#13151b',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '18px',
        padding: '16px',
        marginBottom: '24px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '14px',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        {/* Selector de Tipo */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[
            { id: 'todos', label: 'Todos los Registros' },
            { id: 'ELIMINACION_EMISION', label: '🗑️ Emisiones Eliminadas' },
            { id: 'ELIMINACION_RECIBO_INDIVIDUAL', label: '📄 Deudas Individuales' },
            { id: 'EDICION_DEUDA', label: '⚖️ Deudas Editadas' },
            { id: 'CAMBIO_CONFIG_EDIFICIO', label: '⚙️ Configuración' }
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFiltroTipo(f.id)}
              style={{
                backgroundColor: filtroTipo === f.id ? 'var(--color-accent, #f97316)' : 'rgba(255, 255, 255, 0.05)',
                color: filtroTipo === f.id ? '#fff' : '#a1a1aa',
                border: filtroTipo === f.id ? 'none' : '1px solid rgba(255, 255, 255, 0.08)',
                padding: '7px 14px',
                borderRadius: '10px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.18s'
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Buscador */}
        <div style={{ position: 'relative', minWidth: '260px', flex: 1, maxWidth: '400px' }}>
          <input
            type="text"
            placeholder="Buscar por apto, motivo o administrador..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            style={{
              width: '100%',
              backgroundColor: '#090a0d',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '10px',
              padding: '9px 12px 9px 34px',
              color: '#fff',
              fontSize: '13px',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
          <span style={{ position: 'absolute', left: '10px', top: '9px', color: '#64748b', fontSize: '14px' }}>🔍</span>
        </div>
      </div>

      {/* ── LISTADO DE EVENTOS DE AUDITORÍA ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#7e8b9b' }}>
          <div style={{ fontSize: '28px', marginBottom: '10px' }}>⏳</div>
          <p style={{ margin: 0, fontSize: '14px' }}>Cargando registros inmutables de auditoría...</p>
        </div>
      ) : logsFiltrados.length === 0 ? (
        <div style={{
          backgroundColor: '#12141a',
          border: '1px dashed rgba(255, 255, 255, 0.1)',
          borderRadius: '20px',
          padding: '60px 24px',
          textAlign: 'center',
          color: '#7e8b9b'
        }}>
          <div style={{ fontSize: '38px', marginBottom: '12px' }}>🛡️</div>
          <h3 style={{ color: '#fff', fontSize: '17px', fontWeight: 800, margin: '0 0 6px' }}>
            No hay registros en este filtro
          </h3>
          <p style={{ margin: 0, fontSize: '13px', maxWidth: '450px', marginInline: 'auto' }}>
            Cada vez que un administrador retire una deuda, elimine una emisión de recibos o altere parámetros del edificio, aparecerá aquí automáticamente.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {logsFiltrados.map(log => {
            const badge = getTipoBadge(log.tipo_accion)
            const isExpanded = expandedLogId === log.id

            return (
              <div
                key={log.id}
                style={{
                  backgroundColor: '#12141a',
                  border: '1px solid rgba(255, 255, 255, 0.07)',
                  borderRadius: '18px',
                  padding: '18px 22px',
                  boxShadow: '0 6px 20px rgba(0, 0, 0, 0.4)'
                }}
              >
                {/* Cabecera del Log */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      backgroundColor: badge.bg,
                      color: badge.color,
                      border: `1px solid ${badge.border}`,
                      padding: '3px 10px',
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontWeight: 800,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}>
                      <span>{badge.icon}</span>
                      <span>{badge.label}</span>
                    </span>

                    {log.apartamento_numero && (
                      <span style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.06)',
                        color: '#fff',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 700
                      }}>
                        Apto {log.apartamento_numero}
                      </span>
                    )}

                    {log.mes_afectado && (
                      <span style={{ color: '#8e8e93', fontSize: '12px', fontWeight: 600 }}>
                        · Mes: {log.mes_afectado}
                      </span>
                    )}
                  </div>

                  {/* Sello de Fecha y Hora con segundos */}
                  <div style={{ color: '#8e8e93', fontSize: '12px', fontFamily: 'monospace' }}>
                    📅 {new Date(log.fecha).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'medium' })}
                  </div>
                </div>

                {/* Título y Descripción */}
                <h3 style={{ color: '#fff', fontSize: '16px', fontWeight: 800, margin: '0 0 6px' }}>
                  {log.titulo}
                </h3>
                <p style={{ color: '#cbd5e1', fontSize: '13px', margin: '0 0 14px', lineHeight: 1.4 }}>
                  {log.descripcion}
                </p>

                {/* Monto Afectado si existe */}
                {(log.monto_usd !== null && log.monto_usd !== undefined && log.monto_usd > 0) && (
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '12px',
                    backgroundColor: 'var(--color-accent-light, rgba(249, 115, 22, 0.08))',
                    border: '1px solid var(--color-accent-glow, rgba(249, 115, 22, 0.25))',
                    padding: '6px 14px',
                    borderRadius: '10px',
                    marginBottom: '14px'
                  }}>
                    <span style={{ color: '#8e8e93', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>DEUDA RETIRADA:</span>
                    <span style={{ color: 'var(--color-accent, #f97316)', fontSize: '14px', fontWeight: 800 }}>$ {Number(log.monto_usd).toFixed(2)} USD</span>
                    {log.monto_bs && (
                      <span style={{ color: '#22c55e', fontSize: '13px', fontWeight: 700 }}>
                        (Bs. {Number(log.monto_bs).toLocaleString('es-VE', { minimumFractionDigits: 2 })})
                      </span>
                    )}
                  </div>
                )}

                {/* Recuadro de Motivo Obligatorio */}
                <div style={{
                  backgroundColor: '#0a0b0e',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderLeft: `4px solid ${badge.color}`,
                  padding: '12px 16px',
                  borderRadius: '0 12px 12px 0',
                  marginBottom: '12px'
                }}>
                  <div style={{ color: '#7e8b9b', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '2px' }}>
                    JUSTIFICACIÓN / MOTIVO DADO POR EL ADMINISTRADOR:
                  </div>
                  <div style={{ color: '#fff', fontSize: '13px', fontStyle: 'italic', lineHeight: 1.35 }}>
                    "{log.motivo}"
                  </div>
                </div>

                {/* Pie: Autor + Botón para ver snapshot */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      width: '24px', height: '24px', borderRadius: '50%',
                      backgroundColor: 'var(--color-accent-hover, #ea580c)', color: '#fff', fontSize: '10px', fontWeight: 800,
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      {(log.autor_nombre || 'A').charAt(0).toUpperCase()}
                    </div>
                    <span style={{ color: '#94a3b8', fontSize: '12px' }}>
                      Ejecutado por: <strong style={{ color: '#fff' }}>{log.autor_nombre}</strong> {log.autor_email ? `(${log.autor_email})` : ''}
                    </span>
                  </div>

                  {log.datos_anteriores && (
                    <button
                      onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--color-accent, #f97316)',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      {isExpanded ? 'Ocultar arqueo ▲' : 'Ver arqueo original ▼'}
                    </button>
                  )}
                </div>

                {/* Arqueo Desplegable con Snapshot de Datos Originales */}
                {isExpanded && log.datos_anteriores && (
                  <div style={{
                    marginTop: '14px',
                    backgroundColor: '#08080a',
                    border: '1px solid #1f2937',
                    borderRadius: '12px',
                    padding: '14px',
                    fontSize: '12px'
                  }}>
                    <div style={{ color: '#94a3b8', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', marginBottom: '8px' }}>
                      📋 SNAPSHOT DE DATOS ORIGINALES AL MOMENTO DE LA ACCIÓN (PARA AUDITORÍA)
                    </div>
                    <pre style={{
                      margin: 0,
                      color: '#a7f3d0',
                      fontFamily: 'monospace',
                      fontSize: '11px',
                      overflowX: 'auto',
                      maxHeight: '260px',
                      whiteSpace: 'pre-wrap'
                    }}>
                      {JSON.stringify(log.datos_anteriores, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

    </div>
  )
}
