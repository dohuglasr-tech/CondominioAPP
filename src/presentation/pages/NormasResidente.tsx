import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../application/contexts/AuthContext'
import { obtenerJunta, MiembroJunta } from '../../data/juntaService'
import {
  NORMAS_REGLAMENTO,
  PREAMBULO_TEXTO,
  CLAUSULA_CIERRE_TEXTO,
  descargarNormasPDF,
  abrirNormasPDF,
  DatosNormasCondominio
} from '../../utils/normasPdfGenerator'

export const NormasResidente: React.FC = () => {
  const navigate = useNavigate()
  const { config, perfil } = useAuth()

  const [junta, setJunta] = useState<MiembroJunta[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<number | 'todas'>('todas')
  const [copiadoId, setCopiadoId] = useState<number | null>(null)
  const [descargando, setDescargando] = useState(false)

  const c = config as any
  const p = perfil as any

  // Cargar junta para extraer administrador y presidente del edificio
  useEffect(() => {
    let montado = true
    obtenerJunta()
      .then(res => {
        if (montado && res.data) {
          setJunta(res.data)
        }
      })
      .catch(err => console.warn('[NormasResidente] Error cargando junta:', err))

    return () => {
      montado = false
    }
  }, [])

  const adminMiembro = useMemo(() => {
    return junta.find(m => m.categoria === 'administracion' || m.cargo.toLowerCase().includes('administrad'))
  }, [junta])

  const presidenteMiembro = useMemo(() => {
    return junta.find(m => m.cargo.toLowerCase().includes('presidente'))
  }, [junta])

  const datosEdificio: DatosNormasCondominio = useMemo(() => {
    return {
      nombreEdificio: c?.nombre_edificio || c?.nombre || p?.edificio?.nombre || 'Residencias Ocutuy 5',
      rif: c?.rif || 'J-296749485',
      direccion: c?.direccion || 'Urbanización Casa Blanca, Residencias Ocutuy 5',
      ciudad: c?.ciudad || 'Charallave, Miranda',
      emailContacto: c?.email_contacto || 'juntacondominioocutuy5@gmail.com',
      telefono: c?.telefono || adminMiembro?.telefono || null,
      administradorNombre: adminMiembro?.nombre || 'Dohuglas Guevara',
      presidenteNombre: presidenteMiembro?.nombre || 'Rafael Eduardo Malvares',
      fechaEmision: new Date().toLocaleDateString('es-VE', { year: 'numeric', month: 'long', day: 'numeric' })
    }
  }, [c, p, adminMiembro, presidenteMiembro])

  // Filtrado de normas por texto o categoría
  const normasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return NORMAS_REGLAMENTO.filter(norma => {
      if (categoriaSeleccionada !== 'todas' && norma.numero !== categoriaSeleccionada) {
        return false
      }
      if (!q) return true

      const coincideTitulo = norma.titulo.toLowerCase().includes(q)
      const coincideBase = norma.baseLegal.toLowerCase().includes(q)
      const coincideItems = norma.items.some(
        it => it.subtitulo.toLowerCase().includes(q) || it.texto.toLowerCase().includes(q)
      )

      return coincideTitulo || coincideBase || coincideItems
    })
  }, [busqueda, categoriaSeleccionada])

  // Manejar descarga de PDF
  const handleDescargarPDF = useCallback(() => {
    try {
      setDescargando(true)
      descargarNormasPDF(datosEdificio)
    } catch (err) {
      console.error('[NormasResidente] Error al generar PDF:', err)
      alert('Hubo un error al compilar el PDF de las normas.')
    } finally {
      setTimeout(() => setDescargando(false), 600)
    }
  }, [datosEdificio])

  // Manejar previsualización o impresión directa de PDF
  const handleAbrirPDF = useCallback(() => {
    try {
      abrirNormasPDF(datosEdificio)
    } catch (err) {
      console.error('[NormasResidente] Error abriendo visor:', err)
      alert('No se pudo abrir el visor de PDF.')
    }
  }, [datosEdificio])

  // Copiar el texto de una norma al portapapeles
  const handleCopiarNorma = (norma: typeof NORMAS_REGLAMENTO[0]) => {
    const textoCompleto = `*${norma.numero}. ${norma.titulo.toUpperCase()}*\n_${norma.baseLegal}_\n\n` +
      norma.items.map(it => `• *${it.subtitulo}:* ${it.texto}`).join('\n\n') +
      `\n\n📌 *${datosEdificio.nombreEdificio}* · Reglamento Interno`

    navigator.clipboard.writeText(textoCompleto)
      .then(() => {
        setCopiadoId(norma.numero)
        setTimeout(() => setCopiadoId(null), 2500)
      })
      .catch(() => alert('No se pudo copiar al portapapeles.'))
  }

  // Compartir norma por WhatsApp
  const handleCompartirWhatsApp = (norma: typeof NORMAS_REGLAMENTO[0]) => {
    const mensaje = encodeURIComponent(
      `🏛️ *${datosEdificio.nombreEdificio}* - Normas de Convivencia\n\n` +
      `*${norma.numero}. ${norma.titulo.toUpperCase()}*\n` +
      `_${norma.baseLegal}_\n\n` +
      norma.items.map(it => `📌 *${it.subtitulo}:* ${it.texto}`).join('\n\n') +
      `\n\n⚖️ _Su cumplimiento es de carácter obligatorio para todos los residentes y visitantes._`
    )
    window.open(`https://api.whatsapp.com/send?text=${mensaje}`, '_blank')
  }

  // Iconos temáticos para cada número de norma
  const getIconoNorma = (num: number) => {
    switch (num) {
      case 1: return '🏠'
      case 2: return '🚪'
      case 3: return '🔇'
      case 4: return '🔨'
      case 5: return '🗑️'
      case 6: return '🚗'
      case 7: return '🐾'
      case 8: return '💰'
      default: return '📜'
    }
  }

  return (
    <div className="normas-page-container">
      {/* ── BOTÓN VOLVER ────────────────────────────────────────────── */}
      <div style={{ marginBottom: '18px' }}>
        <button
          onClick={() => navigate('/')}
          className="normas-btn-back"
          title="Regresar al inicio"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          <span>Inicio</span>
        </button>
      </div>

      {/* ── HERO BANNER INSTITUCIONAL ───────────────────────────────── */}
      <section className="normas-hero-card">
        <div className="normas-hero-left">
          <div className="normas-tag-pill">
            <span style={{ fontSize: '13px' }}>📜</span>
            <span>RÉGIMEN INTERNO Y CONVIVENCIA</span>
          </div>

          <h1 className="normas-hero-title">
            Normas de Convivencia y Reglamento Oficial
          </h1>

          <p className="normas-hero-subtitle">
            Edificio <span style={{ color: 'var(--color-accent, #f97316)', fontWeight: 700 }}>{datosEdificio.nombreEdificio}</span> · Amparado en la Ley de Propiedad Horizontal, Código Civil y Ley de Convivencia Ciudadana.
          </p>

          <div className="normas-hero-actions">
            <button
              onClick={handleDescargarPDF}
              disabled={descargando}
              className="normas-btn-primary"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              <span>{descargando ? 'Generando PDF...' : 'Descargar PDF Oficial'}</span>
            </button>

            <button
              onClick={handleAbrirPDF}
              className="normas-btn-secondary"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              <span>Ver / Imprimir</span>
            </button>
          </div>
        </div>

        {/* Insignia lateral derecha en Desktop */}
        <div className="normas-hero-badge-box">
          <div className="normas-badge-icon">🏛️</div>
          <div className="normas-badge-title">Documento Certificado</div>
          <div className="normas-badge-sub">Mismo formato oficial de los recibos de condominio</div>
          <div className="normas-badge-date">
            Vigente · {datosEdificio.fechaEmision}
          </div>
        </div>
      </section>

      {/* ── 3 INDICADORES RÁPIDOS (HORARIOS CLAVE Y OBLIGATORIEDAD) ── */}
      <div className="normas-kpi-grid">
        {/* KPI 1: Horario de Silencio */}
        <div className="normas-kpi-card" onClick={() => setCategoriaSeleccionada(3)}>
          <div className="normas-kpi-header">
            <span className="normas-kpi-icon">🌙</span>
            <span className="normas-kpi-tag">Art. 3 · Silencio</span>
          </div>
          <div className="normas-kpi-val">10:00 PM – 7:00 AM</div>
          <div className="normas-kpi-desc">
            Lun a Vie (Fines de semana y feriados hasta las 9:00 AM).
          </div>
        </div>

        {/* KPI 2: Obras y Remodelaciones */}
        <div className="normas-kpi-card" onClick={() => setCategoriaSeleccionada(4)}>
          <div className="normas-kpi-header">
            <span className="normas-kpi-icon">🔨</span>
            <span className="normas-kpi-tag">Art. 4 · Trabajos</span>
          </div>
          <div className="normas-kpi-val">8:00 AM – 5:00 PM</div>
          <div className="normas-kpi-desc">
            Solo Lun a Vie. Prohibido estrictamente sábados, domingos y feriados.
          </div>
        </div>

        {/* KPI 3: Obligatoriedad */}
        <div className="normas-kpi-card" onClick={() => setCategoriaSeleccionada(8)}>
          <div className="normas-kpi-header">
            <span className="normas-kpi-icon">⚖️</span>
            <span className="normas-kpi-tag">LPH & Código Civil</span>
          </div>
          <div className="normas-kpi-val">Carácter Obligatorio</div>
          <div className="normas-kpi-desc">
            Aplica a propietarios, inquilinos, contratistas y visitantes.
          </div>
        </div>
      </div>

      {/* ── PREÁMBULO INSTITUCIONAL ─────────────────────────────────── */}
      <div className="normas-preambulo-card">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
          <div className="normas-preambulo-quote">“</div>
          <div>
            <div className="normas-preambulo-title">
              DECLARACIÓN DE PRINCIPIOS Y PROPÓSITO COMUNITARIO
            </div>
            <p className="normas-preambulo-text">
              {PREAMBULO_TEXTO}
            </p>
          </div>
        </div>
      </div>

      {/* ── BUSCADOR Y FILTROS POR CATEGORÍA ────────────────────────── */}
      <div className="normas-search-section">
        {/* Barra de búsqueda interactiva */}
        <div className="normas-search-box">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar norma, artículo o palabra clave... (ej. mascotas, taladro, basura, mora, horario)"
            className="normas-search-input"
          />
          {busqueda && (
            <button
              onClick={() => setBusqueda('')}
              className="normas-search-clear"
              title="Borrar búsqueda"
            >
              ✕
            </button>
          )}
        </div>

        {/* Chips de filtro */}
        <div className="normas-chips-wrap">
          <button
            onClick={() => setCategoriaSeleccionada('todas')}
            className={`normas-chip ${categoriaSeleccionada === 'todas' ? 'active' : ''}`}
          >
            Todas las Normas ({NORMAS_REGLAMENTO.length})
          </button>
          {NORMAS_REGLAMENTO.map((n) => (
            <button
              key={n.numero}
              onClick={() => setCategoriaSeleccionada(n.numero)}
              className={`normas-chip ${categoriaSeleccionada === n.numero ? 'active' : ''}`}
            >
              <span>{getIconoNorma(n.numero)}</span>
              <span>{n.numero}. {n.titulo.split(' ')[0]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── LISTADO DE NORMAS (CARDS MODERNAS) ──────────────────────── */}
      <div className="normas-cards-container">
        {normasFiltradas.length === 0 ? (
          <div className="normas-empty-state">
            <span style={{ fontSize: '38px', marginBottom: '8px' }}>🔍</span>
            <h3 style={{ margin: '0 0 6px', color: '#fff', fontSize: '17px' }}>
              No se encontraron coincidencias
            </h3>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: '13px' }}>
              No hay normas que contengan el término "{busqueda}". Intenta con otra palabra.
            </p>
            <button
              onClick={() => { setBusqueda(''); setCategoriaSeleccionada('todas') }}
              style={{
                marginTop: '14px',
                background: 'var(--color-accent, #f97316)',
                color: '#fff',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              Restablecer filtros
            </button>
          </div>
        ) : (
          normasFiltradas.map((norma) => (
            <article key={norma.numero} className="norma-card">
              {/* Card Header */}
              <div className="norma-card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                  <div className="norma-card-num-badge">
                    <span style={{ fontSize: '15px' }}>{getIconoNorma(norma.numero)}</span>
                    <span style={{ fontWeight: 800, fontSize: '13px' }}>{norma.numero}</span>
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <h2 className="norma-card-title">
                      {norma.numero}. {norma.titulo}
                    </h2>
                    <div className="norma-card-legal">
                      ⚖️ {norma.baseLegal}
                    </div>
                  </div>
                </div>

                {/* Acciones de la norma */}
                <div className="norma-card-actions">
                  <button
                    onClick={() => handleCopiarNorma(norma)}
                    className="norma-action-btn"
                    title="Copiar texto de esta norma"
                  >
                    {copiadoId === norma.numero ? (
                      <span style={{ color: '#22c55e', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        ✓ Copiado
                      </span>
                    ) : (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                        <span>Copiar</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => handleCompartirWhatsApp(norma)}
                    className="norma-action-btn whatsapp"
                    title="Compartir por WhatsApp"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
                    </svg>
                    <span>WhatsApp</span>
                  </button>
                </div>
              </div>

              {/* Card Body: Items de la norma */}
              <div className="norma-card-body">
                {norma.items.map((item, idx) => (
                  <div key={idx} className="norma-item-row">
                    <div className="norma-item-label">
                      <span className="norma-bullet">▪</span>
                      <span>{item.subtitulo}</span>
                    </div>
                    <div className="norma-item-text">
                      {item.texto}
                    </div>
                  </div>
                ))}
              </div>

              {/* Callouts contextuales según el tema */}
              {norma.numero === 3 && (
                <div className="norma-callout-box">
                  <div className="norma-callout-icon">🔇</div>
                  <div className="norma-callout-content">
                    <div className="norma-callout-title">Resumen de Silencio Estricto:</div>
                    <div className="norma-callout-desc">
                      Lunes a Viernes: <strong>10:00 p.m. – 7:00 a.m.</strong> · Sábados, Domingos y Feriados: hasta las <strong>9:00 a.m.</strong>
                    </div>
                  </div>
                </div>
              )}

              {norma.numero === 4 && (
                <div className="norma-callout-box warning">
                  <div className="norma-callout-icon">⚠️</div>
                  <div className="norma-callout-content">
                    <div className="norma-callout-title">Horario de Trabajos Ruidosos:</div>
                    <div className="norma-callout-desc">
                      Lunes a Viernes: <strong>8:00 a.m. a 12:00 m.</strong> y <strong>1:00 p.m. a 5:00 p.m.</strong> Prohibido fines de semana y feriados.
                    </div>
                  </div>
                </div>
              )}
            </article>
          ))
        )}
      </div>

      {/* ── CLÁUSULA DE CIERRE Y ADVERTENCIA LEGAL ──────────────────── */}
      <div className="normas-aviso-cierre">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '24px' }}>⚖️</span>
          <div>
            <div className="normas-aviso-cierre-title">
              AVISO DE RESPONSABILIDAD LEGAL Y CUMPLIMIENTO VINCULANTE
            </div>
            <div className="normas-aviso-cierre-text">
              {CLAUSULA_CIERRE_TEXTO}
            </div>
          </div>
        </div>
      </div>

      {/* ── PIE INSTITUCIONAL CON PERSONALIZACIÓN POR EDIFICIO ──────── */}
      <footer className="normas-footer-card">
        <div className="normas-footer-grid">
          <div>
            <div className="normas-footer-label">ADMINISTRACIÓN RESPONSABLE</div>
            <div className="normas-footer-val">{datosEdificio.administradorNombre}</div>
            <div className="normas-footer-sub">Gestión ejecutiva y cumplimiento reglamentario</div>
          </div>

          <div>
            <div className="normas-footer-label">JUNTA DE CONDOMINIO</div>
            <div className="normas-footer-val">{datosEdificio.presidenteNombre}</div>
            <div className="normas-footer-sub">Representación de la asamblea de copropietarios</div>
          </div>

          <div>
            <div className="normas-footer-label">EDIFICIO Y SEDE</div>
            <div className="normas-footer-val">{datosEdificio.nombreEdificio}</div>
            <div className="normas-footer-sub">RIF: {datosEdificio.rif} · {datosEdificio.ciudad}</div>
          </div>
        </div>

        <div className="normas-footer-bar">
          <span>{datosEdificio.nombreEdificio} · Documento Oficial de Régimen Interno</span>
          <button onClick={handleDescargarPDF} className="normas-footer-link">
            Descargar Documento PDF Oficial ↑
          </button>
        </div>
      </footer>

      {/* ── ESTILOS CSS INLINE PARA MÁXIMA CONSISTENCIA Y RICH AESTHETICS ── */}
      <style>{`
        .normas-page-container {
          padding: 24px 20px 48px;
          max-width: 1040px;
          margin: 0 auto;
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          color: var(--text-primary, #f8fafc);
        }

        .normas-btn-back {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: var(--text-secondary, #94a3b8);
          padding: 7px 14px;
          border-radius: 10px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.18s ease;
        }
        .normas-btn-back:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
          transform: translateX(-2px);
        }

        /* ── HERO BANNER ───────────────────────────────── */
        .normas-hero-card {
          background: linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.85) 100%);
          border: 1px solid rgba(249, 115, 22, 0.3);
          border-radius: 20px;
          padding: 28px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          margin-bottom: 24px;
          box-shadow: 0 12px 36px rgba(0, 0, 0, 0.45);
          position: relative;
          overflow: hidden;
        }
        .normas-hero-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0; height: 3px;
          background: linear-gradient(90deg, #f97316 0%, #ea580c 50%, #f97316 100%);
        }
        .normas-hero-left {
          flex: 1;
        }
        .normas-tag-pill {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          background: rgba(249, 115, 22, 0.15);
          border: 1px solid rgba(249, 115, 22, 0.35);
          color: var(--color-accent, #f97316);
          padding: 5px 12px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.6px;
          margin-bottom: 12px;
        }
        .normas-hero-title {
          font-size: 26px;
          font-weight: 900;
          margin: 0 0 8px;
          letter-spacing: -0.5px;
          line-height: 1.25;
          color: #ffffff;
        }
        .normas-hero-subtitle {
          color: #cbd5e1;
          font-size: 13.5px;
          margin: 0 0 20px;
          line-height: 1.5;
          max-width: 640px;
        }
        .normas-hero-actions {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .normas-btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
          color: #ffffff;
          border: none;
          padding: 11px 22px;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 6px 20px rgba(249, 115, 22, 0.35);
          transition: all 0.2s ease;
        }
        .normas-btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(249, 115, 22, 0.5);
        }
        .normas-btn-primary:active {
          transform: translateY(0);
        }
        .normas-btn-secondary {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: rgba(255, 255, 255, 0.06);
          color: #f1f5f9;
          border: 1px solid rgba(255, 255, 255, 0.15);
          padding: 11px 20px;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .normas-btn-secondary:hover {
          background: rgba(255, 255, 255, 0.12);
          border-color: rgba(255, 255, 255, 0.25);
        }

        .normas-hero-badge-box {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          padding: 18px;
          text-align: center;
          width: 220px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .normas-badge-icon {
          font-size: 32px;
          margin-bottom: 6px;
        }
        .normas-badge-title {
          font-size: 13px;
          font-weight: 800;
          color: #fff;
          margin-bottom: 4px;
        }
        .normas-badge-sub {
          font-size: 11px;
          color: #94a3b8;
          line-height: 1.4;
          margin-bottom: 8px;
        }
        .normas-badge-date {
          font-size: 10px;
          color: var(--color-accent, #f97316);
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        /* ── KPIS ───────────────────────────────────────── */
        .normas-kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 14px;
          margin-bottom: 24px;
        }
        .normas-kpi-card {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 16px;
          padding: 16px 18px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .normas-kpi-card:hover {
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(249, 115, 22, 0.35);
          transform: translateY(-2px);
        }
        .normas-kpi-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
        }
        .normas-kpi-icon {
          font-size: 20px;
        }
        .normas-kpi-tag {
          font-size: 10.5px;
          font-weight: 700;
          color: var(--color-accent, #f97316);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .normas-kpi-val {
          font-size: 16px;
          font-weight: 800;
          color: #fff;
          margin-bottom: 4px;
        }
        .normas-kpi-desc {
          font-size: 11.5px;
          color: #94a3b8;
          line-height: 1.4;
        }

        /* ── PREÁMBULO ──────────────────────────────────── */
        .normas-preambulo-card {
          background: rgba(249, 115, 22, 0.04);
          border-left: 4px solid var(--color-accent, #f97316);
          border-radius: 0 14px 14px 0;
          padding: 18px 20px;
          margin-bottom: 24px;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          border-right: 1px solid rgba(255, 255, 255, 0.05);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        .normas-preambulo-quote {
          font-size: 38px;
          line-height: 0.8;
          color: var(--color-accent, #f97316);
          font-family: Georgia, serif;
          opacity: 0.8;
        }
        .normas-preambulo-title {
          font-size: 11px;
          font-weight: 800;
          color: var(--color-accent, #f97316);
          letter-spacing: 0.7px;
          margin-bottom: 6px;
          text-transform: uppercase;
        }
        .normas-preambulo-text {
          font-size: 13.5px;
          color: #e2e8f0;
          line-height: 1.6;
          margin: 0;
          font-style: italic;
        }

        /* ── BÚSQUEDA Y FILTROS ─────────────────────────── */
        .normas-search-section {
          margin-bottom: 24px;
        }
        .normas-search-box {
          position: relative;
          display: flex;
          align-items: center;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 14px;
          padding: 0 16px;
          margin-bottom: 14px;
          transition: all 0.2s ease;
        }
        .normas-search-box:focus-within {
          border-color: var(--color-accent, #f97316);
          background: rgba(255, 255, 255, 0.06);
          box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.15);
        }
        .normas-search-input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          color: #fff;
          font-size: 13.5px;
          padding: 12px 10px;
        }
        .normas-search-input::placeholder {
          color: #64748b;
        }
        .normas-search-clear {
          background: transparent;
          border: none;
          color: #94a3b8;
          font-size: 14px;
          cursor: pointer;
          padding: 4px;
        }
        .normas-chips-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
          overflow-x: auto;
          padding-bottom: 6px;
          scrollbar-width: none;
        }
        .normas-chips-wrap::-webkit-scrollbar {
          display: none;
        }
        .normas-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #94a3b8;
          padding: 6px 14px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.18s ease;
        }
        .normas-chip:hover {
          color: #fff;
          border-color: rgba(255, 255, 255, 0.2);
        }
        .normas-chip.active {
          background: var(--color-accent, #f97316);
          border-color: var(--color-accent, #f97316);
          color: #fff;
          font-weight: 700;
          box-shadow: 0 4px 14px rgba(249, 115, 22, 0.3);
        }

        /* ── CARDS DE NORMAS ────────────────────────────── */
        .normas-cards-container {
          display: flex;
          flex-direction: column;
          gap: 18px;
          margin-bottom: 28px;
        }
        .norma-card {
          background: rgba(18, 22, 32, 0.95);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 18px;
          padding: 22px;
          transition: all 0.2s ease;
          box-shadow: 0 4px 18px rgba(0, 0, 0, 0.25);
        }
        .norma-card:hover {
          border-color: rgba(249, 115, 22, 0.3);
          box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35);
        }
        .norma-card-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          padding-bottom: 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          margin-bottom: 16px;
        }
        .norma-card-num-badge {
          width: 38px;
          height: 38px;
          border-radius: 12px;
          background: rgba(249, 115, 22, 0.15);
          border: 1px solid rgba(249, 115, 22, 0.3);
          color: var(--color-accent, #f97316);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          flex-shrink: 0;
        }
        .norma-card-title {
          font-size: 17px;
          font-weight: 800;
          margin: 0 0 4px;
          color: #ffffff;
          line-height: 1.3;
        }
        .norma-card-legal {
          font-size: 11.5px;
          color: var(--color-accent, #f97316);
          font-weight: 600;
        }
        .norma-card-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }
        .norma-action-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #cbd5e1;
          padding: 6px 12px;
          border-radius: 9px;
          font-size: 11.5px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.18s ease;
        }
        .norma-action-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }
        .norma-action-btn.whatsapp:hover {
          background: rgba(34, 197, 94, 0.15);
          border-color: rgba(34, 197, 94, 0.35);
          color: #22c55e;
        }

        .norma-card-body {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .norma-item-row {
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }
        .norma-item-label {
          width: 170px;
          flex-shrink: 0;
          font-size: 13px;
          font-weight: 700;
          color: #f1f5f9;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .norma-bullet {
          color: var(--color-accent, #f97316);
          font-size: 10px;
        }
        .norma-item-text {
          flex: 1;
          font-size: 13px;
          color: #cbd5e1;
          line-height: 1.55;
        }

        .norma-callout-box {
          margin-top: 16px;
          background: rgba(59, 130, 246, 0.08);
          border: 1px solid rgba(59, 130, 246, 0.25);
          border-radius: 12px;
          padding: 12px 16px;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .norma-callout-box.warning {
          background: rgba(245, 158, 11, 0.08);
          border-color: rgba(245, 158, 11, 0.25);
        }
        .norma-callout-icon {
          font-size: 20px;
          flex-shrink: 0;
        }
        .norma-callout-content {
          font-size: 12.5px;
          line-height: 1.45;
        }
        .norma-callout-title {
          font-weight: 800;
          color: #fff;
          margin-bottom: 2px;
        }
        .norma-callout-desc {
          color: #cbd5e1;
        }

        /* ── ESTADO VACÍO ───────────────────────────────── */
        .normas-empty-state {
          background: rgba(255, 255, 255, 0.02);
          border: 1px dashed rgba(255, 255, 255, 0.12);
          border-radius: 16px;
          padding: 40px 20px;
          text-align: center;
        }

        /* ── AVISO CIERRE ───────────────────────────────── */
        .normas-aviso-cierre {
          background: linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(217, 119, 6, 0.08) 100%);
          border: 1px solid rgba(245, 158, 11, 0.35);
          border-radius: 16px;
          padding: 18px 20px;
          margin-bottom: 28px;
        }
        .normas-aviso-cierre-title {
          font-size: 11.5px;
          font-weight: 800;
          color: #fbbf24;
          letter-spacing: 0.6px;
          margin-bottom: 4px;
        }
        .normas-aviso-cierre-text {
          font-size: 13px;
          color: #fef3c7;
          line-height: 1.5;
          font-weight: 500;
        }

        /* ── FOOTER ─────────────────────────────────────── */
        .normas-footer-card {
          background: rgba(15, 23, 42, 0.85);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 18px;
          padding: 24px;
        }
        .normas-footer-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 20px;
          margin-bottom: 20px;
        }
        .normas-footer-label {
          font-size: 10px;
          font-weight: 800;
          color: var(--color-accent, #f97316);
          letter-spacing: 0.8px;
          margin-bottom: 4px;
        }
        .normas-footer-val {
          font-size: 14.5px;
          font-weight: 800;
          color: #fff;
          margin-bottom: 2px;
        }
        .normas-footer-sub {
          font-size: 11.5px;
          color: #94a3b8;
        }
        .normas-footer-bar {
          padding-top: 16px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 11.5px;
          color: #64748b;
          flex-wrap: wrap;
          gap: 10px;
        }
        .normas-footer-link {
          background: transparent;
          border: none;
          color: var(--color-accent, #f97316);
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          padding: 0;
        }
        .normas-footer-link:hover {
          text-decoration: underline;
        }

        /* ── MÓVIL RESPONSIVE ───────────────────────────── */
        @media (max-width: 768px) {
          .normas-page-container {
            padding: 16px 14px 40px;
          }
          .normas-hero-card {
            flex-direction: column;
            align-items: flex-start;
            padding: 22px 18px;
          }
          .normas-hero-badge-box {
            display: none;
          }
          .normas-hero-title {
            font-size: 21px;
          }
          .norma-item-row {
            flex-direction: column;
            gap: 4px;
          }
          .norma-item-label {
            width: 100%;
          }
          .norma-card-header {
            flex-direction: column;
            align-items: flex-start;
          }
          .norma-card-actions {
            width: 100%;
            justify-content: flex-start;
            margin-top: 6px;
          }
        }
      `}</style>
    </div>
  )
}

export default NormasResidente
