import React, { useState, useEffect, useCallback } from 'react'
import {
  MiembroJunta,
  CategoriaOrganigrama,
  CATEGORIA_ORGANIGRAMA_CONFIG,
  obtenerJunta,
  formatWhatsappUrl
} from '../../data/juntaService'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../data/supabase'

export const JuntaCondominioResidente: React.FC = () => {
  const navigate = useNavigate()
  const [miembros, setMiembros] = useState<MiembroJunta[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroCategoria, setFiltroCategoria] = useState<string>('todos')

  const cargarDatos = useCallback(async () => {
    setLoading(true)
    try {
      const res = await obtenerJunta()
      setMiembros(res.data || [])
    } catch (err) {
      console.warn('[JuntaCondominioResidente] Error cargando datos:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    cargarDatos()

    const channel = supabase
      .channel('realtime_junta_residente')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'junta_condominio' }, () => {
        cargarDatos()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [cargarDatos])

  // Agrupar miembros por categoría jerárquica
  const categoriasOrdenadas: CategoriaOrganigrama[] = [
    'administracion',
    'junta_directiva',
    'comite_vocal',
    'operativo'
  ]

  const miembrosFiltrados = miembros.filter(m => {
    if (filtroCategoria !== 'todos' && m.categoria !== filtroCategoria) return false
    return true
  })

  return (
    <div style={{ padding: '28px 20px', maxWidth: '1100px', margin: '0 auto', color: '#fff', fontFamily: 'Inter, sans-serif' }}>
      {/* Botón de regreso */}
      <button
        onClick={() => navigate('/')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: '#94a3b8',
          padding: '7px 12px',
          borderRadius: '10px',
          fontSize: '12px',
          fontWeight: 600,
          cursor: 'pointer',
          marginBottom: '20px',
          transition: 'all 0.18s'
        }}
        title="Volver al inicio"
      >
        <span style={{ fontSize: '16px' }}>←</span>
        <span>Inicio</span>
      </button>

      {/* HEADER */}
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '8px',
          background: 'var(--color-accent-light, rgba(249, 115, 22, 0.12))', border: '1px solid var(--color-accent-glow, rgba(249, 115, 22, 0.3))',
          padding: '6px 16px', borderRadius: '999px', color: 'var(--color-accent, #f97316)',
          fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '12px'
        }}>
          <span>👥</span>
          <span>Estructura Comunitaria</span>
        </div>

        <h1 style={{ fontSize: '32px', fontWeight: 900, margin: '0 0 8px', letterSpacing: '-0.8px' }}>
          Junta de Condominio y Organigrama
        </h1>

        <p style={{ color: '#888', fontSize: '14px', margin: '0 auto', maxWidth: '640px', lineHeight: 1.6 }}>
          Conoce a los integrantes encargados de la administración, representación y mantenimiento de nuestra comunidad, junto a sus canales directos de contacto.
        </p>

        {/* Filtros de Categoría */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '20px', flexWrap: 'wrap' }}>
          {[
            { key: 'todos', label: 'Todo el Organigrama', icon: '🏛️' },
            { key: 'administracion', label: 'Administración', icon: '💼' },
            { key: 'junta_directiva', label: 'Junta Directiva', icon: '👑' },
            { key: 'comite_vocal', label: 'Comités y Vocales', icon: '🤝' },
            { key: 'operativo', label: 'Personal Operativo', icon: '🛠️' },
          ].map(f => {
            const active = filtroCategoria === f.key
            return (
              <button
                key={f.key}
                onClick={() => setFiltroCategoria(f.key)}
                style={{
                  background: active ? 'var(--color-brand-gradient, #f97316)' : 'rgba(255, 255, 255, 0.05)',
                  border: active ? '1px solid var(--color-accent, #f97316)' : '1px solid rgba(255, 255, 255, 0.08)',
                  color: active ? '#fff' : '#ccc',
                  padding: '7px 14px', borderRadius: '10px', fontSize: '12px',
                  fontWeight: active ? 800 : 500, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.18s'
                }}
              >
                <span>{f.icon}</span>
                <span>{f.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ORGANIGRAMA VIEW */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#888' }}>
          <div style={{ fontSize: '30px', marginBottom: '12px' }}>⏳</div>
          Cargando organigrama del condominio...
        </div>
      ) : miembros.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '60px 20px', background: 'rgba(21, 25, 34, 0.4)',
          borderRadius: '20px', border: '1px dashed rgba(255, 255, 255, 0.1)', color: '#888'
        }}>
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>📭</div>
          <h3 style={{ color: '#fff', margin: '0 0 6px', fontSize: '16px' }}>Organigrama en configuración</h3>
          <p style={{ margin: 0, fontSize: '13px' }}>El administrador está organizando la estructura de cargos del edificio.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '36px' }}>
          {categoriasOrdenadas.map(catKey => {
            const catMeta = CATEGORIA_ORGANIGRAMA_CONFIG[catKey]
            const miembrosCat = miembrosFiltrados.filter(m => m.categoria === catKey)

            if (miembrosCat.length === 0) return null

            return (
              <div key={catKey}>
                {/* Header de la Categoría */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  marginBottom: '18px', paddingBottom: '10px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
                }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '10px',
                    background: catMeta.bg, border: `1px solid ${catMeta.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px'
                  }}>
                    {catMeta.icono}
                  </div>
                  <div>
                    <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: '#fff' }}>
                      {catMeta.titulo}
                    </h2>
                    <p style={{ margin: 0, fontSize: '12px', color: '#888' }}>
                      {catMeta.subtitulo}
                    </p>
                  </div>
                </div>

                {/* Grid de Miembros */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: catKey === 'administracion' && miembrosCat.length === 1
                    ? '1fr'
                    : 'repeat(auto-fit, minmax(300px, 1fr))',
                  gap: '16px'
                }}>
                  {miembrosCat.map(m => {
                    const waUrl = formatWhatsappUrl(m.telefono)

                    return (
                      <div
                        key={m.id}
                        style={{
                          background: 'linear-gradient(180deg, #151922 0%, #0d1117 100%)',
                          border: `1px solid ${catMeta.border}`,
                          borderTop: `2px solid ${catMeta.color}`,
                          borderRadius: '20px', padding: '22px',
                          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                          gap: '16px', boxShadow: `0 10px 30px rgba(0,0,0,0.45), 0 0 15px ${catMeta.color}10`,
                          position: 'relative', overflow: 'hidden'
                        }}
                      >
                        {/* Upper Info */}
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <div style={{
                                width: '48px', height: '48px', borderRadius: '14px',
                                background: catMeta.bg, border: `1px solid ${catMeta.border}`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '22px', flexShrink: 0
                              }}>
                                {catKey === 'administracion' ? '👑' : catKey === 'operativo' ? '🛠️' : '👤'}
                              </div>

                              <div>
                                <span style={{
                                  fontSize: '11px', fontWeight: 800, textTransform: 'uppercase',
                                  color: catMeta.color, background: catMeta.bg,
                                  border: `1px solid ${catMeta.border}`, padding: '2px 8px', borderRadius: '6px'
                                }}>
                                  {m.cargo}
                                </span>

                                <h3 style={{ margin: '6px 0 0', fontSize: '18px', fontWeight: 800, color: '#fff' }}>
                                  {m.nombre}
                                </h3>
                              </div>
                            </div>

                            {m.apartamento && (
                              <span style={{
                                fontSize: '11px', fontWeight: 700, color: '#aaa',
                                background: 'rgba(255,255,255,0.06)', padding: '3px 8px', borderRadius: '6px'
                              }}>
                                📍 {m.apartamento}
                              </span>
                            )}
                          </div>

                          {m.descripcion_rol && (
                            <p style={{
                              margin: '0 0 12px', fontSize: '13px', color: '#cbd5e1', lineHeight: 1.5,
                              background: 'rgba(0,0,0,0.2)', padding: '10px 14px', borderRadius: '10px'
                            }}>
                              {m.descripcion_rol}
                            </p>
                          )}

                          {m.horario_atencion && (
                            <div style={{ fontSize: '12px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                              <span>🕒</span>
                              <span><strong>Horario:</strong> {m.horario_atencion}</span>
                            </div>
                          )}
                        </div>

                        {/* Contact Channels */}
                        <div style={{
                          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                          paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px'
                        }}>
                          {m.telefono && (
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              {/* Botón WhatsApp */}
                              {waUrl && (
                                <a
                                  href={waUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    flex: 1, textDecoration: 'none',
                                    background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                                    color: '#fff', borderRadius: '10px', padding: '9px 12px',
                                    fontSize: '12px', fontWeight: 700, display: 'flex',
                                    alignItems: 'center', justifyContent: 'center', gap: '6px',
                                    boxShadow: '0 2px 10px rgba(34, 197, 94, 0.3)'
                                  }}
                                >
                                  {/* WhatsApp SVG Icon */}
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.664-.698c.969.584 1.776.813 2.796.814 3.183 0 5.77-2.587 5.77-5.767 0-3.181-2.587-5.768-5.77-5.768zm3.393 8.169c-.144.405-.837.774-1.17.824-.312.045-.694.073-2.127-.519-1.834-.757-3.003-2.62-3.094-2.741-.091-.121-.743-.988-.743-1.884 0-.896.471-1.337.638-1.518.167-.182.365-.228.487-.228.121 0 .243.002.349.006.111.005.26-.042.406.309.152.365.517 1.261.562 1.352.045.091.076.197.015.319-.061.121-.092.197-.183.303-.091.106-.192.237-.274.319-.092.091-.188.19-.081.373.106.183.472.779 1.013 1.261.697.621 1.284.814 1.467.905.182.091.289.076.395-.045.106-.122.456-.532.578-.714.121-.182.243-.152.406-.091.163.061 1.034.487 1.211.578.178.091.297.137.342.213.045.076.045.441-.099.846z"/>
                                  </svg>
                                  <span>WhatsApp</span>
                                </a>
                              )}

                              {/* Botón Llamar */}
                              <a
                                href={`tel:${m.telefono.replace(/\s+/g, '')}`}
                                style={{
                                  textDecoration: 'none', background: 'rgba(255, 255, 255, 0.08)',
                                  border: '1px solid rgba(255, 255, 255, 0.14)', color: '#fff',
                                  borderRadius: '10px', padding: '9px 12px', fontSize: '12px',
                                  fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px'
                                }}
                              >
                                <span>📞</span>
                                <span>{m.telefono}</span>
                              </a>
                            </div>
                          )}

                          {m.email && (
                            <a
                              href={`mailto:${m.email}`}
                              style={{
                                textDecoration: 'none', background: 'rgba(255, 255, 255, 0.03)',
                                border: '1px solid rgba(255, 255, 255, 0.06)', color: '#94a3b8',
                                borderRadius: '8px', padding: '7px 10px', fontSize: '11px',
                                display: 'flex', alignItems: 'center', gap: '6px'
                              }}
                            >
                              <span>✉️</span>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.email}</span>
                            </a>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
