import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../../data/supabase'
import { useAuth } from '../../../application/contexts/AuthContext'
import {
  obtenerTodosLosReportesAdmin,
  actualizarEstadoReporte,
  eliminarReporte,
  ReporteItem,
  EstadoReporte,
  CATEGORIAS_CONFIG,
  PRIORIDADES_CONFIG,
  ESTADOS_CONFIG,
} from '../../../data/reportesService'
import { registrarEventoAuditoria } from '../../../data/auditoriaService'

export const AdminReportes: React.FC = () => {
  const { perfil } = useAuth()
  const [reportes, setReportes] = useState<ReporteItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<string>('todos')
  const [filtroCategoria, setFiltroCategoria] = useState<string>('todas')
  const [filtroPrioridad, setFiltroPrioridad] = useState<string>('todas')

  // Estado del modal de respuesta
  const [selectedReporte, setSelectedReporte] = useState<ReporteItem | null>(null)
  const [respuesta, setRespuesta] = useState('')
  const [nuevoEstado, setNuevoEstado] = useState<EstadoReporte>('en_progreso')
  const [guardando, setGuardando] = useState(false)
  const [toastMsg, setToastMsg] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(null)

  // Lightbox de foto
  const [lightboxFoto, setLightboxFoto] = useState<{ url: string; titulo: string } | null>(null)

  const showToast = (tipo: 'success' | 'error', texto: string) => {
    setToastMsg({ tipo, texto })
    setTimeout(() => setToastMsg(null), 4000)
  }

  // ── Cargar Datos ────────────────────────────────────────────────────────────
  const cargarDatos = useCallback(async () => {
    setLoading(true)
    const res = await obtenerTodosLosReportesAdmin()
    setReportes(res.data)
    setLoading(false)
  }, [])

  useEffect(() => {
    cargarDatos()

    // ── Suscripción en Tiempo Real con ID único ──────────────────────────────
    const channelId = `admin_falencias_live_${Math.random().toString(36).slice(2, 7)}`
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'falencias' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            showToast('success', '🔔 ¡Nueva avería reportada por un residente!')
          }
          cargarDatos()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [cargarDatos])

  // ── Abrir Modal de Respuesta ────────────────────────────────────────────────
  const abrirModalRespuesta = (rep: ReporteItem) => {
    setSelectedReporte(rep)
    setRespuesta(rep.respuesta_admin || '')
    setNuevoEstado(rep.estado === 'reportada' ? 'en_progreso' : rep.estado)
  }

  // ── Guardar Respuesta y Estado ──────────────────────────────────────────────
  const handleGuardarRespuesta = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedReporte) return

    setGuardando(true)

    const adminNombre = perfil?.nombre_completo || 'Administración'
    const res = await actualizarEstadoReporte({
      reporteId: selectedReporte.id,
      nuevoEstado,
      respuestaAdmin: respuesta.trim() || null,
      reporteOriginal: selectedReporte,
      adminNombre,
    })

    setGuardando(false)

    if (res.error) {
      showToast('error', res.error)
    } else {
      showToast('success', `✅ Reporte actualizado a "${ESTADOS_CONFIG[nuevoEstado].label}".`)
      setSelectedReporte(null)
      setRespuesta('')

      // Registrar auditoría
      try {
        await registrarEventoAuditoria({
          tipo_accion: 'CAMBIO_CASO',
          titulo: `Gestión de Avería: ${selectedReporte.titulo}`,
          descripcion: `Estado cambiado a ${nuevoEstado}. Apto: ${selectedReporte.apartamento_numero || 'Área Común'}. Respuesta: ${respuesta.trim() || 'Sin comentarios'}.`,
          apartamento_numero: selectedReporte.apartamento_numero,
          apartamento_id: selectedReporte.apartamento_id,
          motivo: 'Atención de avería e incidencia comunitaria',
          autor_nombre: adminNombre,
        })
      } catch {}

      cargarDatos()
    }
  }

  // ── Cambiar Estado Rápido ───────────────────────────────────────────────────
  const handleCambioRapidoEstado = async (rep: ReporteItem, estado: EstadoReporte) => {
    const adminNombre = perfil?.nombre_completo || 'Administración'
    const res = await actualizarEstadoReporte({
      reporteId: rep.id,
      nuevoEstado: estado,
      respuestaAdmin: rep.respuesta_admin,
      reporteOriginal: rep,
      adminNombre,
    })

    if (res.error) {
      showToast('error', res.error)
    } else {
      showToast('success', `Avería marcada como "${ESTADOS_CONFIG[estado].label}".`)
      cargarDatos()
    }
  }

  // ── Eliminar Reporte ────────────────────────────────────────────────────────
  const handleEliminar = async (rep: ReporteItem) => {
    if (!window.confirm(`¿Seguro que deseas eliminar el reporte "${rep.titulo}"?`)) return

    const res = await eliminarReporte(rep.id)
    if (res.error) {
      showToast('error', res.error)
    } else {
      showToast('success', 'Reporte eliminado.')
      cargarDatos()
    }
  }

  // ── Filtrado y Búsqueda ─────────────────────────────────────────────────────
  const reportesFiltrados = useMemo(() => {
    return reportes.filter((r) => {
      if (filtroEstado !== 'todos' && r.estado !== filtroEstado) return false
      if (filtroCategoria !== 'todas' && r.categoria !== filtroCategoria) return false
      if (filtroPrioridad !== 'todas' && r.prioridad !== filtroPrioridad) return false

      if (busqueda.trim()) {
        const q = busqueda.toLowerCase().trim()
        const matchTitulo = r.titulo.toLowerCase().includes(q)
        const matchDesc = r.descripcion.toLowerCase().includes(q)
        const matchUbi = r.ubicacion.toLowerCase().includes(q)
        const matchApto = r.apartamento_numero?.toLowerCase().includes(q)
        const matchNombre = r.propietario_nombre?.toLowerCase().includes(q)
        if (!matchTitulo && !matchDesc && !matchUbi && !matchApto && !matchNombre) return false
      }

      return true
    })
  }, [reportes, filtroEstado, filtroCategoria, filtroPrioridad, busqueda])

  // Contadores
  const total = reportes.length
  const pendientes = reportes.filter((r) => r.estado === 'reportada').length
  const enProgreso = reportes.filter((r) => r.estado === 'en_progreso').length
  const resueltas = reportes.filter((r) => r.estado === 'resuelta').length
  const criticas = reportes.filter((r) => r.prioridad === 'critica' && r.estado !== 'resuelta').length

  return (
    <div style={{ padding: '32px 24px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>
      {/* Toast Alert */}
      {toastMsg && (
        <div
          style={{
            position: 'fixed',
            top: '24px',
            right: '24px',
            zIndex: 99999,
            backgroundColor: toastMsg.tipo === 'success' ? '#065f46' : '#991b1b',
            color: '#fff',
            padding: '12px 20px',
            borderRadius: '12px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.6)',
            border: `1px solid ${toastMsg.tipo === 'success' ? '#10b981' : '#f87171'}`,
            fontSize: '13.5px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            animation: 'fadeIn 0.25s ease',
          }}
        >
          <span>{toastMsg.tipo === 'success' ? '✓' : '⚠️'}</span>
          <span>{toastMsg.texto}</span>
        </div>
      )}

      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h1 style={{ color: '#ffffff', fontSize: '24px', fontWeight: 800, margin: 0 }}>
            🛠️ Gestión de Averías e Incidencias
          </h1>
          <p style={{ color: '#888', fontSize: '14px', marginTop: '4px' }}>
            Atiende las fallas reportadas por los residentes, asigna personal y mantén informado al edificio en tiempo real.
          </p>
        </div>

        <button
          onClick={cargarDatos}
          style={{
            backgroundColor: '#1e293b',
            color: '#94a3b8',
            border: '1px solid #334155',
            padding: '8px 16px',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          🔄 Actualizar
        </button>
      </div>

      {/* ── KPI METRICS BANNER ───────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '14px',
          marginBottom: '26px',
        }}
      >
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.4) 0%, rgba(15, 23, 42, 0.6) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '14px',
            padding: '16px 20px',
          }}
        >
          <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
            Total Incidencias
          </div>
          <div style={{ color: '#fff', fontSize: '26px', fontWeight: 800, marginTop: '4px' }}>
            {total}
          </div>
        </div>

        <div
          style={{
            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(15, 23, 42, 0.6) 100%)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            borderRadius: '14px',
            padding: '16px 20px',
          }}
        >
          <div style={{ color: '#f87171', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
            🔴 Pendientes de Revisión
          </div>
          <div style={{ color: '#fff', fontSize: '26px', fontWeight: 800, marginTop: '4px' }}>
            {pendientes}
          </div>
        </div>

        <div
          style={{
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(15, 23, 42, 0.6) 100%)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            borderRadius: '14px',
            padding: '16px 20px',
          }}
        >
          <div style={{ color: '#fbbf24', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
            🟡 En Reparación / Progreso
          </div>
          <div style={{ color: '#fff', fontSize: '26px', fontWeight: 800, marginTop: '4px' }}>
            {enProgreso}
          </div>
        </div>

        <div
          style={{
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(15, 23, 42, 0.6) 100%)',
            border: '1px solid rgba(16, 185, 129, 0.35)',
            borderRadius: '14px',
            padding: '16px 20px',
          }}
        >
          <div style={{ color: '#34d399', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
            🟢 Resueltas y Solventadas
          </div>
          <div style={{ color: '#fff', fontSize: '26px', fontWeight: 800, marginTop: '4px' }}>
            {resueltas}
          </div>
        </div>

        {criticas > 0 && (
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(220, 38, 38, 0.25) 0%, rgba(15, 23, 42, 0.6) 100%)',
              border: '2px solid #ef4444',
              borderRadius: '14px',
              padding: '16px 20px',
              animation: 'pulse 2s infinite',
            }}
          >
            <div style={{ color: '#fca5a5', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>
              ⚠️ Urgencias Críticas
            </div>
            <div style={{ color: '#fff', fontSize: '26px', fontWeight: 800, marginTop: '4px' }}>
              {criticas}
            </div>
          </div>
        )}
      </div>

      {/* ── BARRA DE BÚSQUEDA Y FILTROS ──────────────────────────────────────── */}
      <div
        style={{
          backgroundColor: '#11141b',
          border: '1px solid #1e2638',
          borderRadius: '14px',
          padding: '16px',
          marginBottom: '24px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          alignItems: 'center',
        }}
      >
        <div style={{ flex: '1 1 240px', position: 'relative' }}>
          <input
            type="text"
            placeholder="🔍 Buscar por título, apartamento, vecino o ubicación..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            style={{
              width: '100%',
              backgroundColor: '#0a0d14',
              border: '1px solid #232d42',
              borderRadius: '10px',
              padding: '10px 14px',
              color: '#fff',
              fontSize: '13px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          style={{
            backgroundColor: '#0a0d14',
            border: '1px solid #232d42',
            borderRadius: '10px',
            padding: '10px 14px',
            color: '#fff',
            fontSize: '13px',
            outline: 'none',
          }}
        >
          <option value="todos">Todos los Estados</option>
          <option value="reportada">🔴 Reportadas (Pendientes)</option>
          <option value="en_progreso">🟡 En Progreso</option>
          <option value="resuelta">🟢 Resueltas</option>
        </select>

        <select
          value={filtroPrioridad}
          onChange={(e) => setFiltroPrioridad(e.target.value)}
          style={{
            backgroundColor: '#0a0d14',
            border: '1px solid #232d42',
            borderRadius: '10px',
            padding: '10px 14px',
            color: '#fff',
            fontSize: '13px',
            outline: 'none',
          }}
        >
          <option value="todas">Todas las Prioridades</option>
          <option value="critica">🔴 Crítica / Urgente</option>
          <option value="alta">🟠 Alta</option>
          <option value="media">🟡 Media</option>
          <option value="baja">🟢 Baja</option>
        </select>

        <select
          value={filtroCategoria}
          onChange={(e) => setFiltroCategoria(e.target.value)}
          style={{
            backgroundColor: '#0a0d14',
            border: '1px solid #232d42',
            borderRadius: '10px',
            padding: '10px 14px',
            color: '#fff',
            fontSize: '13px',
            outline: 'none',
          }}
        >
          <option value="todas">Todas las Categorías</option>
          <option value="agua">💧 Agua y Plomería</option>
          <option value="electricidad">⚡ Electricidad y Luz</option>
          <option value="ascensor">🛗 Ascensores</option>
          <option value="porton">🚪 Portones y Accesos</option>
          <option value="limpieza">🧹 Limpieza</option>
          <option value="ruido">🔊 Convivencia y Ruido</option>
          <option value="otro">📌 Otro</option>
        </select>
      </div>

      {/* ── LISTADO PRINCIPAL DE REPORTES ────────────────────────────────────── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>⏳</div>
          <div>Cargando incidencias de los residentes...</div>
        </div>
      ) : reportesFiltrados.length === 0 ? (
        <div
          style={{
            backgroundColor: '#11141b',
            border: '1px dashed #232d42',
            borderRadius: '16px',
            padding: '50px 20px',
            textAlign: 'center',
            color: '#888',
          }}
        >
          <div style={{ fontSize: '36px', marginBottom: '8px' }}>🎉</div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>
            No hay reportes que coincidan con la búsqueda
          </div>
          <p style={{ fontSize: '13px', margin: '4px 0 0' }}>
            Todas las incidencias están al día o no aplican para los filtros seleccionados.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {reportesFiltrados.map((rep) => {
            const cat = CATEGORIAS_CONFIG[rep.categoria] || CATEGORIAS_CONFIG.otro
            const pri = PRIORIDADES_CONFIG[rep.prioridad] || PRIORIDADES_CONFIG.media
            const est = ESTADOS_CONFIG[rep.estado] || ESTADOS_CONFIG.reportada

            const waTexto = encodeURIComponent(
              `Hola estimado vecino${rep.propietario_nombre ? ` ${rep.propietario_nombre}` : ''} del Apto ${rep.apartamento_numero || ''}, le escribimos de la Administración respecto a su reporte de avería: "${rep.titulo}". Queremos coordinar la inspección técnica...`
            )
            const waUrl = rep.propietario_telefono
              ? `https://wa.me/${rep.propietario_telefono.replace(/[^0-9]/g, '')}?text=${waTexto}`
              : null

            return (
              <div
                key={rep.id}
                style={{
                  backgroundColor: '#121620',
                  border: `1px solid ${rep.prioridad === 'critica' && rep.estado !== 'resuelta' ? '#ef4444' : 'rgba(255, 255, 255, 0.08)'}`,
                  borderLeft: `5px solid ${pri.color}`,
                  borderRadius: '16px',
                  padding: '20px 24px',
                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                {/* Cabecera de la Fila */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '14px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                      <span
                        style={{
                          backgroundColor: `${cat.color}20`,
                          color: cat.color,
                          border: `1px solid ${cat.color}40`,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 700,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <span>{cat.icon}</span>
                        <span>{cat.label}</span>
                      </span>

                      <span
                        style={{
                          backgroundColor: pri.bg,
                          color: pri.color,
                          border: `1px solid ${pri.border}`,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 800,
                        }}
                      >
                        Prioridad {pri.label}
                      </span>

                      {rep.apartamento_numero && (
                        <span
                          style={{
                            backgroundColor: 'var(--color-accent-light, rgba(249, 115, 22, 0.15))',
                            color: 'var(--color-accent, #f97316)',
                            border: '1px solid var(--color-accent-glow, rgba(249, 115, 22, 0.3))',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 800,
                          }}
                        >
                          🏠 Apto {rep.apartamento_numero}
                        </span>
                      )}

                      {rep.propietario_nombre && (
                        <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 600 }}>
                          · {rep.propietario_nombre}
                        </span>
                      )}
                    </div>

                    <h2 style={{ color: '#ffffff', fontSize: '17px', fontWeight: 800, margin: '4px 0' }}>
                      {rep.titulo}
                    </h2>

                    <div style={{ display: 'flex', gap: '14px', color: '#64748b', fontSize: '12px', marginTop: '4px', flexWrap: 'wrap' }}>
                      <span>📍 <strong>Ubicación:</strong> {rep.ubicacion}</span>
                      <span>📅 {new Date(rep.created_at).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>

                  {/* Estado y Acciones Rápidas */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                    <div
                      style={{
                        backgroundColor: est.bg,
                        color: est.color,
                        border: `1px solid ${est.border}`,
                        padding: '6px 14px',
                        borderRadius: '999px',
                        fontSize: '12px',
                        fontWeight: 800,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <span>{est.icon}</span>
                      <span>{est.label}</span>
                    </div>

                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {waUrl && (
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            backgroundColor: 'rgba(34, 197, 94, 0.15)',
                            color: '#22c55e',
                            border: '1px solid rgba(34, 197, 94, 0.3)',
                            padding: '6px 12px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: 700,
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <span>💬</span> WhatsApp
                        </a>
                      )}

                      <button
                        onClick={() => abrirModalRespuesta(rep)}
                        style={{
                          backgroundColor: 'var(--color-accent, #f97316)',
                          color: '#fff',
                          border: 'none',
                          padding: '6px 14px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        ✏️ Responder / Estado
                      </button>

                      <button
                        onClick={() => handleEliminar(rep)}
                        style={{
                          background: 'none',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          color: '#64748b',
                          padding: '6px 10px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '12px',
                        }}
                        title="Eliminar reporte"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>

                {/* Detalle del reporte */}
                <div style={{ backgroundColor: '#0a0d14', borderRadius: '10px', padding: '12px 16px', border: '1px solid #1e2638' }}>
                  <p style={{ color: '#cbd5e1', fontSize: '13.5px', lineHeight: 1.5, margin: 0, whiteSpace: 'pre-line' }}>
                    {rep.descripcion}
                  </p>
                </div>

                {/* Fotografía de la Avería */}
                {rep.foto_url && (
                  <div>
                    <span style={{ display: 'block', color: '#64748b', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>
                      Evidencia Fotográfica Adjunta:
                    </span>
                    <div
                      onClick={() => setLightboxFoto({ url: rep.foto_url!, titulo: rep.titulo })}
                      style={{
                        position: 'relative',
                        display: 'inline-block',
                        cursor: 'pointer',
                        borderRadius: '10px',
                        overflow: 'hidden',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        maxWidth: '220px',
                        maxHeight: '140px',
                      }}
                      title="Ver foto en tamaño completo"
                    >
                      <img
                        src={rep.foto_url}
                        alt="Evidencia fotográfica"
                        style={{ width: '100%', height: '140px', objectFit: 'cover', display: 'block' }}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          bottom: 0,
                          left: 0,
                          right: 0,
                          backgroundColor: 'rgba(0,0,0,0.7)',
                          color: '#fff',
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '4px 8px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <span>🔍</span> Ampliar Foto
                      </div>
                    </div>
                  </div>
                )}

                {/* Respuesta existente de la administración */}
                {rep.respuesta_admin && (
                  <div
                    style={{
                      backgroundColor: 'var(--color-accent-light, rgba(249, 115, 22, 0.08))',
                      borderLeft: '3px solid var(--color-accent, #f97316)',
                      borderRadius: '8px',
                      padding: '12px 14px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ color: 'var(--color-accent, #f97316)', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>
                        🏢 Respuesta Oficial al Residente
                      </span>
                      <button
                        onClick={() => abrirModalRespuesta(rep)}
                        style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '11px', cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        Modificar respuesta
                      </button>
                    </div>
                    <p style={{ color: '#f1f5f9', fontSize: '13px', margin: 0, lineHeight: 1.45 }}>
                      {rep.respuesta_admin}
                    </p>
                  </div>
                )}

                {/* Botones de acción rápida en 1 clic */}
                <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '10px' }}>
                  {rep.estado !== 'en_progreso' && (
                    <button
                      onClick={() => handleCambioRapidoEstado(rep, 'en_progreso')}
                      style={{
                        backgroundColor: 'rgba(245, 158, 11, 0.1)',
                        border: '1px solid rgba(245, 158, 11, 0.3)',
                        color: '#fbbf24',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      🟡 Pasar a En Progreso
                    </button>
                  )}

                  {rep.estado !== 'resuelta' && (
                    <button
                      onClick={() => handleCambioRapidoEstado(rep, 'resuelta')}
                      style={{
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        color: '#34d399',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      🟢 Marcar como Resuelta
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── MODAL: RESPONDER Y GESTIONAR ESTADO ───────────────────────────────── */}
      {selectedReporte && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            zIndex: 100000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            animation: 'fadeIn 0.2s ease',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !guardando) setSelectedReporte(null)
          }}
        >
          <div
            style={{
              backgroundColor: '#0f1219',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '20px',
              width: '100%',
              maxWidth: '520px',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8)',
              padding: '24px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ color: '#fff', fontSize: '18px', fontWeight: 800, margin: 0 }}>
                  Gestionar y Responder Avería
                </h3>
                <span style={{ color: '#94a3b8', fontSize: '12px' }}>
                  {selectedReporte.apartamento_numero ? `Apto ${selectedReporte.apartamento_numero}` : 'Área Común'} · {selectedReporte.titulo}
                </span>
              </div>

              <button
                type="button"
                onClick={() => !guardando && setSelectedReporte(null)}
                style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '20px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGuardarRespuesta} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Cambiar Estado */}
              <div>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>
                  Estado de la Incidencia *
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {(['reportada', 'en_progreso', 'resuelta'] as EstadoReporte[]).map((estKey) => {
                    const cfg = ESTADOS_CONFIG[estKey]
                    const isSelected = nuevoEstado === estKey
                    return (
                      <button
                        key={estKey}
                        type="button"
                        onClick={() => setNuevoEstado(estKey)}
                        style={{
                          backgroundColor: isSelected ? cfg.bg : '#0a0d14',
                          border: `1px solid ${isSelected ? cfg.color : '#232d42'}`,
                          borderRadius: '10px',
                          padding: '10px 8px',
                          color: isSelected ? '#fff' : '#94a3b8',
                          fontSize: '12px',
                          fontWeight: isSelected ? 800 : 600,
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <span style={{ fontSize: '16px' }}>{cfg.icon}</span>
                        <span>{cfg.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Respuesta Oficial */}
              <div>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>
                  Respuesta Oficial de la Administración (El residente la verá en su portal y recibirá notificación)
                </label>
                <textarea
                  rows={4}
                  placeholder="Ej: Se coordinó con el técnico de ascensores para asistir hoy a las 2:00 PM. Se sustituyó el bombillo por personal de conserjería..."
                  value={respuesta}
                  onChange={(e) => setRespuesta(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: '#0a0d14',
                    border: '1px solid #232d42',
                    borderRadius: '10px',
                    padding: '12px',
                    color: '#fff',
                    fontSize: '13px',
                    outline: 'none',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Botones de acción */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setSelectedReporte(null)}
                  disabled={guardando}
                  style={{
                    flex: 1,
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#94a3b8',
                    padding: '12px',
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: guardando ? 'not-allowed' : 'pointer',
                  }}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={guardando}
                  style={{
                    flex: 2,
                    backgroundColor: 'var(--color-accent, #f97316)',
                    color: '#fff',
                    border: 'none',
                    padding: '12px',
                    borderRadius: '10px',
                    fontSize: '13.5px',
                    fontWeight: 800,
                    cursor: guardando ? 'not-allowed' : 'pointer',
                    boxShadow: 'var(--color-brand-shadow, 0 4px 18px rgba(249, 115, 22, 0.4))',
                  }}
                >
                  {guardando ? 'Guardando...' : 'Guardar y Notificar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── LIGHTBOX PARA AMPLIAR FOTO ───────────────────────────────────────── */}
      {lightboxFoto && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.94)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            zIndex: 1000000,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          onClick={() => setLightboxFoto(null)}
        >
          <div style={{ maxWidth: '90vw', maxHeight: '85vh', position: 'relative' }} onClick={(e) => e.stopPropagation()}>
            <img
              src={lightboxFoto.url}
              alt={lightboxFoto.titulo}
              style={{
                maxWidth: '100%',
                maxHeight: '80vh',
                borderRadius: '12px',
                boxShadow: '0 10px 40px rgba(0, 0, 0, 0.9)',
                display: 'block',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', color: '#fff' }}>
              <span style={{ fontSize: '14px', fontWeight: 700 }}>{lightboxFoto.titulo}</span>
              <button
                onClick={() => setLightboxFoto(null)}
                style={{
                  backgroundColor: 'var(--color-accent, #f97316)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 14px',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Cerrar ✕
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
