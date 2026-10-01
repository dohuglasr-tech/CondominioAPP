import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../application/contexts/AuthContext'
import { supabase } from '../../data/supabase'
import {
  obtenerReportesResidente,
  crearReporte,
  ReporteItem,
  CategoriaReporte,
  PrioridadReporte,
  CATEGORIAS_CONFIG,
  PRIORIDADES_CONFIG,
  ESTADOS_CONFIG,
} from '../../data/reportesService'

export const ReportesPanel: React.FC = () => {
  const navigate = useNavigate()
  const { perfil, user } = useAuth()

  const p = perfil as any
  const apartamentoId = perfil?.apartamento_id ?? ''
  const aptoNumero = p?.apartamento?.numero || p?.apartamentos?.numero || perfil?.apartamento_id || ''

  const [reportes, setReportes] = useState<ReporteItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroEstado, setFiltroEstado] = useState<string>('todos')
  const [filtroCategoria, setFiltroCategoria] = useState<string>('todas')

  // Estado del Modal de Nuevo Reporte
  const [showForm, setShowForm] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [toastMsg, setToastMsg] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(null)

  // Campos del formulario
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [ubicacion, setUbicacion] = useState('')
  const [categoria, setCategoria] = useState<CategoriaReporte>('agua')
  const [prioridad, setPrioridad] = useState<PrioridadReporte>('media')
  const [fotoArchivo, setFotoArchivo] = useState<File | null>(null)
  const [fotoPreview, setFotoPreview] = useState<string | null>(null)
  const [fotoTamanoStr, setFotoTamanoStr] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Lightbox modal para ver foto ampliada
  const [lightboxFoto, setLightboxFoto] = useState<{ url: string; titulo: string } | null>(null)

  const showToast = (tipo: 'success' | 'error', texto: string) => {
    setToastMsg({ tipo, texto })
    setTimeout(() => setToastMsg(null), 4000)
  }

  // ── Cargar Datos ────────────────────────────────────────────────────────────
  const cargarDatos = useCallback(async () => {
    setLoading(true)
    const res = await obtenerReportesResidente(user?.id, apartamentoId, aptoNumero)
    setReportes(res.data)
    setLoading(false)
  }, [user?.id, apartamentoId, aptoNumero])

  useEffect(() => {
    cargarDatos()

    // ── Suscripción en Tiempo Real con ID único por instancia ────────────────
    const channelId = `residente_falencias_${apartamentoId || 'gen'}_${Math.random().toString(36).slice(2, 7)}`
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'falencias' },
        () => {
          cargarDatos()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [cargarDatos, apartamentoId])

  // ── Manejar selección de foto con cámara o archivo ─────────────────────────
  const handleSeleccionarFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      showToast('error', 'Por favor selecciona un archivo de imagen válido.')
      return
    }

    setFotoArchivo(file)
    const previewUrl = URL.createObjectURL(file)
    setFotoPreview(previewUrl)

    const kb = (file.size / 1024).toFixed(0)
    setFotoTamanoStr(file.size > 1024 * 1024 ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : `${kb} KB`)
  }

  const handleRemoverFoto = () => {
    setFotoArchivo(null)
    if (fotoPreview) URL.revokeObjectURL(fotoPreview)
    setFotoPreview(null)
    setFotoTamanoStr(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── Enviar Formulario de Avería ────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!titulo.trim() || !descripcion.trim() || !ubicacion.trim()) {
      showToast('error', 'Por favor completa el título, la ubicación y la descripción.')
      return
    }

    setEnviando(true)

    const res = await crearReporte({
      titulo: titulo.trim(),
      descripcion: descripcion.trim(),
      ubicacion: ubicacion.trim(),
      categoria,
      prioridad,
      fotoArchivo,
      usuarioId: user?.id,
      apartamentoNumero: aptoNumero,
      apartamentoId,
    })

    setEnviando(false)

    if (res.error) {
      showToast('error', res.error)
    } else {
      showToast('success', '✅ Reporte enviado a la administración con éxito.')
      setShowForm(false)
      // Resetear campos
      setTitulo('')
      setDescripcion('')
      setUbicacion('')
      setCategoria('agua')
      setPrioridad('media')
      handleRemoverFoto()
      cargarDatos()
    }
  }

  // ── Filtrado ───────────────────────────────────────────────────────────────
  const reportesFiltrados = reportes.filter((r) => {
    if (filtroEstado !== 'todos' && r.estado !== filtroEstado) return false
    if (filtroCategoria !== 'todas' && r.categoria !== filtroCategoria) return false
    return true
  })

  // Conteo de métricas
  const totalReportados = reportes.length
  const enProgreso = reportes.filter((r) => r.estado === 'en_progreso').length
  const resueltos = reportes.filter((r) => r.estado === 'resuelta').length
  const pendientes = reportes.filter((r) => r.estado === 'reportada').length

  return (
    <div style={{ padding: '24px 20px 80px', maxWidth: '1000px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>
      {/* Toast Notification */}
      {toastMsg && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 99999,
            backgroundColor: toastMsg.tipo === 'success' ? '#065f46' : '#991b1b',
            color: '#fff',
            padding: '12px 20px',
            borderRadius: '12px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
            border: `1px solid ${toastMsg.tipo === 'success' ? '#10b981' : '#f87171'}`,
            fontSize: '13.5px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            animation: 'fadeIn 0.3s ease',
          }}
        >
          <span>{toastMsg.tipo === 'success' ? '✓' : '⚠️'}</span>
          <span>{toastMsg.texto}</span>
        </div>
      )}

      {/* ── HEADER SUPERIOR ─────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={() => navigate('/')}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                color: '#94a3b8',
                padding: '6px 10px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              ← Inicio
            </button>
            <h1 style={{ color: '#ffffff', fontSize: '24px', fontWeight: 800, margin: 0, letterSpacing: '-0.3px' }}>
              🛠️ Buzón de Averías e Incidencias
            </h1>
          </div>
          <p style={{ color: '#94a3b8', fontSize: '13px', margin: '6px 0 0', lineHeight: 1.4 }}>
            Reporta desperfectos en áreas comunes, fallas de servicios o novedades de tu piso con fotos en tiempo real.
          </p>
        </div>

        <button
          onClick={() => setShowForm(true)}
          style={{
            backgroundColor: 'var(--color-accent, #f97316)',
            color: '#ffffff',
            border: 'none',
            borderRadius: '12px',
            padding: '12px 22px',
            fontSize: '14px',
            fontWeight: 800,
            cursor: 'pointer',
            boxShadow: 'var(--color-brand-shadow, 0 4px 18px var(--color-accent-glow))',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s',
          }}
          onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-accent-hover, #ea580c)')}
          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-accent, #f97316)')}
        >
          <span style={{ fontSize: '16px' }}>📷</span>
          <span>+ Reportar Avería</span>
        </button>
      </div>

      {/* ── KPI STATS CARDS ─────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '12px',
          marginBottom: '24px',
        }}
      >
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.5) 0%, rgba(15, 23, 42, 0.6) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '14px',
            padding: '14px 16px',
          }}
        >
          <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
            Mis Reportes
          </div>
          <div style={{ color: '#fff', fontSize: '24px', fontWeight: 800, marginTop: '4px' }}>
            {totalReportados}
          </div>
        </div>

        <div
          style={{
            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.12) 0%, rgba(15, 23, 42, 0.6) 100%)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '14px',
            padding: '14px 16px',
          }}
        >
          <div style={{ color: '#f87171', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
            🔴 Pendientes
          </div>
          <div style={{ color: '#fff', fontSize: '24px', fontWeight: 800, marginTop: '4px' }}>
            {pendientes}
          </div>
        </div>

        <div
          style={{
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(15, 23, 42, 0.6) 100%)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: '14px',
            padding: '14px 16px',
          }}
        >
          <div style={{ color: '#fbbf24', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
            🟡 En Progreso
          </div>
          <div style={{ color: '#fff', fontSize: '24px', fontWeight: 800, marginTop: '4px' }}>
            {enProgreso}
          </div>
        </div>

        <div
          style={{
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(15, 23, 42, 0.6) 100%)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: '14px',
            padding: '14px 16px',
          }}
        >
          <div style={{ color: '#34d399', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
            🟢 Resueltas
          </div>
          <div style={{ color: '#fff', fontSize: '24px', fontWeight: 800, marginTop: '4px' }}>
            {resueltos}
          </div>
        </div>
      </div>

      {/* ── FILTROS Y CATEGORÍAS ─────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          overflowX: 'auto',
          paddingBottom: '12px',
          marginBottom: '16px',
        }}
      >
        <button
          onClick={() => setFiltroEstado('todos')}
          style={{
            backgroundColor: filtroEstado === 'todos' ? 'var(--color-accent, #f97316)' : 'rgba(255, 255, 255, 0.05)',
            color: filtroEstado === 'todos' ? '#fff' : '#94a3b8',
            border: '1px solid',
            borderColor: filtroEstado === 'todos' ? 'var(--color-accent, #f97316)' : 'rgba(255, 255, 255, 0.1)',
            padding: '6px 14px',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Todos ({totalReportados})
        </button>

        <button
          onClick={() => setFiltroEstado('reportada')}
          style={{
            backgroundColor: filtroEstado === 'reportada' ? '#ef4444' : 'rgba(255, 255, 255, 0.05)',
            color: filtroEstado === 'reportada' ? '#fff' : '#94a3b8',
            border: '1px solid',
            borderColor: filtroEstado === 'reportada' ? '#ef4444' : 'rgba(255, 255, 255, 0.1)',
            padding: '6px 14px',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          🔴 Reportadas ({pendientes})
        </button>

        <button
          onClick={() => setFiltroEstado('en_progreso')}
          style={{
            backgroundColor: filtroEstado === 'en_progreso' ? '#f59e0b' : 'rgba(255, 255, 255, 0.05)',
            color: filtroEstado === 'en_progreso' ? '#fff' : '#94a3b8',
            border: '1px solid',
            borderColor: filtroEstado === 'en_progreso' ? '#f59e0b' : 'rgba(255, 255, 255, 0.1)',
            padding: '6px 14px',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          🟡 En Progreso ({enProgreso})
        </button>

        <button
          onClick={() => setFiltroEstado('resuelta')}
          style={{
            backgroundColor: filtroEstado === 'resuelta' ? '#10b981' : 'rgba(255, 255, 255, 0.05)',
            color: filtroEstado === 'resuelta' ? '#fff' : '#94a3b8',
            border: '1px solid',
            borderColor: filtroEstado === 'resuelta' ? '#10b981' : 'rgba(255, 255, 255, 0.1)',
            padding: '6px 14px',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          🟢 Resueltas ({resueltos})
        </button>

        <select
          value={filtroCategoria}
          onChange={(e) => setFiltroCategoria(e.target.value)}
          style={{
            backgroundColor: '#090b10',
            border: '1px solid #1e2638',
            borderRadius: '20px',
            padding: '6px 14px',
            color: '#94a3b8',
            fontSize: '12px',
            fontWeight: 700,
            outline: 'none',
            cursor: 'pointer',
            marginLeft: 'auto',
          }}
        >
          <option value="todas">Todas las Categorías</option>
          <option value="agua">💧 Agua</option>
          <option value="electricidad">⚡ Electricidad</option>
          <option value="ascensor">🛗 Ascensor</option>
          <option value="porton">🚪 Portón</option>
          <option value="limpieza">🧹 Limpieza</option>
          <option value="ruido">🔊 Convivencia</option>
          <option value="otro">📌 Otro</option>
        </select>
      </div>

      {/* ── LISTADO DE REPORTES ─────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
          <div style={{ fontSize: '28px', marginBottom: '8px' }}>⏳</div>
          <div>Cargando averías e incidencias...</div>
        </div>
      ) : reportesFiltrados.length === 0 ? (
        <div
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.02)',
            border: '1px dashed rgba(255, 255, 255, 0.12)',
            borderRadius: '16px',
            padding: '48px 24px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>✨</div>
          <h3 style={{ color: '#fff', fontSize: '16px', fontWeight: 700, margin: '0 0 6px' }}>
            No hay reportes en esta categoría
          </h3>
          <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 18px' }}>
            Todo el edificio se encuentra en óptimas condiciones. Si notas algún desperfecto, repórtalo aquí.
          </p>
          <button
            onClick={() => setShowForm(true)}
            style={{
              backgroundColor: 'var(--color-accent, #f97316)',
              color: '#fff',
              border: 'none',
              borderRadius: '10px',
              padding: '10px 18px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            + Crear Primer Reporte
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {reportesFiltrados.map((rep) => {
            const cat = CATEGORIAS_CONFIG[rep.categoria] || CATEGORIAS_CONFIG.otro
            const pri = PRIORIDADES_CONFIG[rep.prioridad] || PRIORIDADES_CONFIG.media
            const est = ESTADOS_CONFIG[rep.estado] || ESTADOS_CONFIG.reportada

            return (
              <div
                key={rep.id}
                style={{
                  background: 'linear-gradient(180deg, #131722 0%, #0d1017 100%)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderLeft: `4px solid ${pri.color}`,
                  borderRadius: '16px',
                  padding: '20px',
                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                {/* Cabecera de la tarjeta */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
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
                          fontWeight: 700,
                        }}
                      >
                        Prioridad {pri.label}
                      </span>
                    </div>

                    <h3 style={{ color: '#ffffff', fontSize: '16px', fontWeight: 800, margin: '8px 0 4px' }}>
                      {rep.titulo}
                    </h3>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#64748b', fontSize: '12px', flexWrap: 'wrap' }}>
                      <span>📍 <strong>Ubicación:</strong> {rep.ubicacion}</span>
                      {rep.apartamento_numero && (
                        <span>🏠 <strong>Apto:</strong> {rep.apartamento_numero}</span>
                      )}
                      <span>📅 {new Date(rep.created_at).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>

                  {/* Badge de Estado */}
                  <div
                    style={{
                      backgroundColor: est.bg,
                      color: est.color,
                      border: `1px solid ${est.border}`,
                      padding: '6px 12px',
                      borderRadius: '999px',
                      fontSize: '12px',
                      fontWeight: 800,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      flexShrink: 0,
                    }}
                  >
                    <span>{est.icon}</span>
                    <span>{est.label}</span>
                  </div>
                </div>

                {/* Descripción detallada */}
                <p style={{ color: '#cbd5e1', fontSize: '13.5px', lineHeight: 1.5, margin: 0, whiteSpace: 'pre-line' }}>
                  {rep.descripcion}
                </p>

                {/* Fotografía adjunta (si existe) */}
                {rep.foto_url && (
                  <div style={{ marginTop: '4px' }}>
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
                      title="Haz clic para ver la fotografía en tamaño completo"
                    >
                      <img
                        src={rep.foto_url}
                        alt="Foto de la avería"
                        style={{
                          width: '100%',
                          height: '140px',
                          objectFit: 'cover',
                          display: 'block',
                          transition: 'transform 0.2s',
                        }}
                        onMouseOver={(e) => (e.currentTarget.style.transform = 'scale(1.04)')}
                        onMouseOut={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          bottom: 0,
                          left: 0,
                          right: 0,
                          backgroundColor: 'rgba(0, 0, 0, 0.65)',
                          color: '#fff',
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '4px 8px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <span>🔍</span> Ver Foto
                      </div>
                    </div>
                  </div>
                )}

                {/* Respuesta oficial de la Administración */}
                {rep.respuesta_admin && (
                  <div
                    style={{
                      marginTop: '6px',
                      backgroundColor: 'var(--color-accent-light, rgba(249, 115, 22, 0.08))',
                      borderLeft: '3px solid var(--color-accent, #f97316)',
                      borderRadius: '8px',
                      padding: '12px 14px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '13px' }}>🏢</span>
                      <span style={{ color: 'var(--color-accent, #f97316)', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                        Respuesta Oficial de la Administración
                      </span>
                    </div>
                    <p style={{ color: '#f1f5f9', fontSize: '13px', margin: 0, lineHeight: 1.45 }}>
                      {rep.respuesta_admin}
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── MODAL: NUEVO REPORTE CON FOTO ────────────────────────────────────── */}
      {showForm && (
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
            if (e.target === e.currentTarget && !enviando) setShowForm(false)
          }}
        >
          <div
            style={{
              backgroundColor: '#0f1219',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '20px',
              width: '100%',
              maxWidth: '540px',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8)',
              padding: '24px',
              position: 'relative',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    backgroundColor: 'var(--color-accent-light, rgba(249, 115, 22, 0.15))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--color-accent, #f97316)',
                    fontSize: '18px',
                  }}
                >
                  📷
                </div>
                <div>
                  <h2 style={{ color: '#fff', fontSize: '17px', fontWeight: 800, margin: 0 }}>
                    Reportar Avería o Incidencia
                  </h2>
                  <span style={{ color: '#64748b', fontSize: '12px' }}>
                    {aptoNumero ? `Apartamento ${aptoNumero}` : 'Residente'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => !enviando && setShowForm(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  fontSize: '20px',
                  cursor: 'pointer',
                  padding: '4px',
                }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Título */}
              <div>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>
                  Título del problema *
                </label>
                <input
                  type="text"
                  placeholder="Ej: Bote continuo de agua en pasillo piso 4"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    backgroundColor: '#090b10',
                    border: '1px solid #1e2638',
                    borderRadius: '10px',
                    padding: '11px 14px',
                    color: '#fff',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Categoría */}
              <div>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>
                  Categoría de la avería *
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
                  {(Object.keys(CATEGORIAS_CONFIG) as CategoriaReporte[]).map((catKey) => {
                    const cfg = CATEGORIAS_CONFIG[catKey]
                    const isSelected = categoria === catKey
                    return (
                      <button
                        key={catKey}
                        type="button"
                        onClick={() => setCategoria(catKey)}
                        style={{
                          backgroundColor: isSelected ? `${cfg.color}25` : '#090b10',
                          border: `1px solid ${isSelected ? cfg.color : '#1e2638'}`,
                          borderRadius: '10px',
                          padding: '8px 10px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'all 0.15s',
                        }}
                      >
                        <span style={{ fontSize: '15px' }}>{cfg.icon}</span>
                        <span style={{ color: isSelected ? '#fff' : '#94a3b8', fontSize: '12px', fontWeight: isSelected ? 700 : 500 }}>
                          {cfg.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Ubicación y Prioridad */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>
                    Ubicación exacta *
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Pasillo Piso 4 / Ascensor 2"
                    value={ubicacion}
                    onChange={(e) => setUbicacion(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      backgroundColor: '#090b10',
                      border: '1px solid #1e2638',
                      borderRadius: '10px',
                      padding: '11px 14px',
                      color: '#fff',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>
                    Nivel de urgencia *
                  </label>
                  <select
                    value={prioridad}
                    onChange={(e) => setPrioridad(e.target.value as PrioridadReporte)}
                    style={{
                      width: '100%',
                      backgroundColor: '#090b10',
                      border: '1px solid #1e2638',
                      borderRadius: '10px',
                      padding: '11px 14px',
                      color: '#fff',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="baja">🟢 Baja (Detalle menor)</option>
                    <option value="media">🟡 Media (Requiere revisión)</option>
                    <option value="alta">🟠 Alta (Afecta el uso)</option>
                    <option value="critica">🔴 Crítica / Urgente</option>
                  </select>
                </div>
              </div>

              {/* Descripción */}
              <div>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>
                  Detalle de lo que ocurre *
                </label>
                <textarea
                  rows={3}
                  placeholder="Describe con precisión qué sucede, desde cuándo y cualquier indicio relevante para el técnico o conserje..."
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    backgroundColor: '#090b10',
                    border: '1px solid #1e2638',
                    borderRadius: '10px',
                    padding: '11px 14px',
                    color: '#fff',
                    fontSize: '13px',
                    outline: 'none',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Adjuntar Fotografía (Cámara / Galería) */}
              <div>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>
                  Fotografía de la avería (Opcional pero recomendado)
                </label>

                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  ref={fileInputRef}
                  onChange={handleSeleccionarFoto}
                  style={{ display: 'none' }}
                />

                {!fotoPreview ? (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      width: '100%',
                      backgroundColor: '#090b10',
                      border: '1px dashed #232d42',
                      borderRadius: '12px',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      cursor: 'pointer',
                      transition: 'border-color 0.2s',
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.borderColor = 'var(--color-accent, #f97316)')}
                    onMouseOut={(e) => (e.currentTarget.style.borderColor = '#232d42')}
                  >
                    <span style={{ fontSize: '24px' }}>📸</span>
                    <span style={{ color: 'var(--color-accent, #f97316)', fontSize: '13px', fontWeight: 700 }}>
                      Tomar foto o subir desde la galería
                    </span>
                    <span style={{ color: '#64748b', fontSize: '11px' }}>
                      Se optimiza automáticamente en WebP para ahorrar tus datos
                    </span>
                  </button>
                ) : (
                  <div
                    style={{
                      backgroundColor: '#090b10',
                      border: '1px solid #232d42',
                      borderRadius: '12px',
                      padding: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                      <img
                        src={fotoPreview}
                        alt="Previsualización"
                        style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '8px' }}
                      />
                      <div>
                        <div style={{ color: '#fff', fontSize: '12px', fontWeight: 700 }}>
                          Foto lista para adjuntar
                        </div>
                        <div style={{ color: '#10b981', fontSize: '11px' }}>
                          ✓ Tamaño optimizado ({fotoTamanoStr})
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleRemoverFoto}
                      style={{
                        backgroundColor: 'rgba(239, 68, 68, 0.15)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        color: '#ef4444',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Quitar
                    </button>
                  </div>
                )}
              </div>

              {/* Botón de Enviar */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  disabled={enviando}
                  style={{
                    flex: 1,
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#94a3b8',
                    padding: '12px',
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: enviando ? 'not-allowed' : 'pointer',
                  }}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={enviando || !titulo.trim() || !descripcion.trim() || !ubicacion.trim()}
                  style={{
                    flex: 2,
                    backgroundColor: 'var(--color-accent, #f97316)',
                    color: '#fff',
                    border: 'none',
                    padding: '12px',
                    borderRadius: '10px',
                    fontSize: '13.5px',
                    fontWeight: 800,
                    cursor: enviando ? 'not-allowed' : 'pointer',
                    boxShadow: 'var(--color-brand-shadow, 0 4px 18px var(--color-accent-glow))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  {enviando ? 'Enviando e indexando foto...' : 'Enviar Reporte a Administración'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── LIGHTBOX PARA AMPLIAR FOTOGRAFÍA ─────────────────────────────────── */}
      {lightboxFoto && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.92)',
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
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '10px',
                color: '#fff',
              }}
            >
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
