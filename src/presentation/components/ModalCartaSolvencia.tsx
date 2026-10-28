import React, { useState } from 'react'
import {
  DatosCartaSolvencia,
  construirContenidoSolvencia,
  descargarSolvenciaPDF,
  abrirSolvenciaPDF,
  normalizarCedula,
  obtenerMesActualEs
} from '../../utils/solvenciaPdfGenerator'
import { supabase } from '../../data/supabase'

interface ModalCartaSolvenciaProps {
  isOpen: boolean
  onClose: () => void
  datos: DatosCartaSolvencia
  perfilId?: string
  onCedulaUpdated?: (nuevaCedula: string) => void
}

// ── Unidades de la vista previa ──
// La hoja carta mide 215.9 mm de ancho: 1cqw (1% del ancho del contenedor) = 2.159 mm.
// Así la vista previa escala proporcionalmente igual que el PDF en cualquier pantalla.
const mm = (v: number) => `${(v / 2.159).toFixed(3)}cqw`
const pt = (v: number) => mm(v * 0.3528)

const NAVY = '#0f172a'
const NAVY2 = '#18233e'
const ORANGE = '#f97316'
const GREEN = '#16a34a'
const SLATE = '#334155'
const MUTED = '#64748b'

/** Réplica fiel de la hoja carta (mismo contenido que se imprime en el PDF). */
const HojaSolvencia: React.FC<{ datos: DatosCartaSolvencia }> = ({ datos }) => {
  const c = construirContenidoSolvencia(datos)

  return (
    <div
      style={{
        containerType: 'inline-size',
        width: '100%',
        aspectRatio: '215.9 / 279.4',
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: '#fff',
        fontFamily: 'Helvetica, Arial, sans-serif',
        borderRadius: '6px',
        boxShadow: '0 10px 34px rgba(0,0,0,0.55)',
        color: SLATE
      } as React.CSSProperties}
    >
      {/* Marca de agua */}
      <svg
        viewBox="0 0 100 100"
        style={{ position: 'absolute', left: '50%', top: mm(160), width: mm(104), height: mm(104), transform: 'translate(-50%, -50%)', opacity: 0.055 }}
      >
        <circle cx="50" cy="50" r="48" fill="none" stroke={GREEN} strokeWidth="6" />
        <circle cx="50" cy="50" r="40" fill="none" stroke={GREEN} strokeWidth="1.6" />
        <polyline points="26,52 44,70 76,32" fill="none" stroke={GREEN} strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
      </svg>


      {/* Encabezado a sangre */}
      <div style={{ position: 'absolute', left: 0, top: 0, right: 0, height: mm(44), backgroundColor: NAVY }} />
      <div
        style={{
          position: 'absolute', right: 0, top: 0, width: mm(78), height: mm(44),
          backgroundColor: NAVY2, clipPath: 'polygon(0 0, 100% 0, 100% 100%)'
        }}
      />
      <div style={{ position: 'absolute', left: 0, right: 0, top: mm(44), height: mm(2.2), backgroundColor: ORANGE }} />

      {/* Emblema */}
      <div
        style={{
          position: 'absolute', left: mm(24), top: mm(12), width: mm(17), height: mm(17),
          borderRadius: mm(3.2), backgroundColor: ORANGE
        }}
      >
        <svg viewBox="0 0 17 17" style={{ width: '100%', height: '100%' }}>
          <rect x="4.6" y="3.6" width="7.8" height="10.4" rx="0.8" fill="#fff" />
          <g fill={ORANGE}>
            <rect x="6.1" y="5.4" width="1.4" height="1.4" />
            <rect x="9.4" y="5.4" width="1.4" height="1.4" />
            <rect x="6.1" y="8.4" width="1.4" height="1.4" />
            <rect x="9.4" y="8.4" width="1.4" height="1.4" />
            <rect x="7.6" y="11.2" width="1.8" height="2.8" />
          </g>
        </svg>
      </div>

      {/* Texto de encabezado */}
      <div style={{ position: 'absolute', left: mm(47), top: mm(10.4), right: mm(70), lineHeight: 1.15 }}>
        <div style={{ fontSize: pt(7.5), fontWeight: 700, letterSpacing: mm(0.5), color: ORANGE }}>{c.etiquetaJunta}</div>
        <div
          style={{
            fontSize: pt(c.nombreEdificio.length > 26 ? 13 : 17), fontWeight: 700, color: '#fff',
            marginTop: mm(1.6), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
          }}
        >
          {c.nombreEdificio}
        </div>
        {c.direccion && (
          <div style={{ fontSize: pt(7.2), color: '#cbd5e1', marginTop: mm(1.8), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {c.direccion}
          </div>
        )}
        {c.rif && (
          <div style={{ fontSize: pt(9.5), fontWeight: 700, color: ORANGE, marginTop: mm(1.6) }}>{c.rif}</div>
        )}
      </div>

      <div style={{ position: 'absolute', right: mm(24), top: mm(10.6), textAlign: 'right', lineHeight: 1.2 }}>
        <div style={{ fontSize: pt(6.5), fontWeight: 700, letterSpacing: mm(0.25), color: '#94a3b8' }}>CONSTANCIA N°</div>
        <div style={{ fontSize: pt(10), fontWeight: 700, color: '#fff', marginTop: mm(1.2) }}>{c.codigo}</div>
        <div style={{ fontSize: pt(7), color: '#cbd5e1', marginTop: mm(2.4) }}>{c.emitidaTxt}</div>
        <div style={{ fontSize: pt(7), color: '#cbd5e1', marginTop: mm(0.6) }}>{c.vigenciaTxt}</div>
      </div>

      {/* Cuerpo */}
      <div
        style={{
          position: 'absolute', left: mm(24), right: mm(24), top: mm(51), bottom: mm(33),
          display: 'flex', flexDirection: 'column'
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: pt(7.5), fontWeight: 700, letterSpacing: mm(0.55), color: ORANGE }}>CONSTANCIA OFICIAL</div>
          <div style={{ fontSize: pt(23), fontWeight: 700, color: NAVY, marginTop: mm(2.2), lineHeight: 1.1 }}>{c.titulo}</div>
          <div style={{ width: mm(28), height: mm(1), borderRadius: mm(0.5), backgroundColor: ORANGE, margin: `${mm(2.6)} auto 0` }} />
          <div style={{ fontSize: pt(8.5), color: MUTED, marginTop: mm(3.2) }}>{c.subtitulo}</div>
        </div>

        <div style={{ marginTop: mm(6), fontSize: pt(10), lineHeight: mm(5.5), textAlign: 'justify' }}>
          {/* Párrafo 1 */}
          <p style={{ margin: 0 }}>
            {c.parrafos[0].map((s, i) => (
              <span key={i} style={s.b ? { fontWeight: 700 } : undefined}>{s.t}</span>
            ))}
          </p>

          {/* Tarjeta de resumen */}
          <div
            style={{
              position: 'relative', marginTop: mm(5), padding: `${mm(3.4)} ${mm(6)} ${mm(2.6)}`,
              backgroundColor: '#f3f6fa', border: '1px solid #e2e8f0', borderRadius: mm(2.5),
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', rowGap: mm(3.6), columnGap: mm(3), textAlign: 'left'
            }}
          >
            {c.celdas.map((cel, i) => (
              <div key={i} style={{ minWidth: 0, lineHeight: 1.25 }}>
                <div style={{ fontSize: pt(6), fontWeight: 700, letterSpacing: mm(0.14), color: MUTED }}>{cel.label}</div>
                <div
                  style={{
                    fontSize: pt(9.5), fontWeight: 700, color: cel.verde ? GREEN : NAVY, marginTop: mm(0.6),
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                  }}
                >
                  {cel.value}
                </div>
                {cel.sub && (
                  <div style={{ fontSize: pt(7), color: MUTED, marginTop: mm(0.3), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {cel.sub}
                  </div>
                )}
              </div>
            ))}
          </div>

          {[1, 2, 3].map(n => (
            <p key={n} style={{ margin: `${mm(5)} 0 0` }}>
              {c.parrafos[n].map((s, i) => (
                <span key={i} style={s.b ? { fontWeight: 700 } : undefined}>{s.t}</span>
              ))}
            </p>
          ))}
        </div>

        {/* Firmas */}
        <div style={{ marginTop: 'auto', textAlign: 'center' }}>
          <div style={{ fontSize: pt(8), fontWeight: 700, letterSpacing: mm(0.35), color: NAVY, textTransform: 'uppercase' }}>
            {c.firmaIntro}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: mm(13), padding: `0 ${mm(11)}` }}>
            {c.firmas.map((f, i) => (
              <div key={i} style={{ width: mm(62) }}>
                <div style={{ borderTop: `${mm(0.4)} solid #475569` }} />
                <div style={{ fontSize: pt(9.5), fontWeight: 700, color: NAVY, marginTop: mm(1.6), whiteSpace: 'nowrap' }}>{f.nombre}</div>
                <div style={{ fontSize: pt(8.5), color: MUTED, marginTop: mm(0.8) }}>{f.cargo}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Pie a sangre */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: mm(20), backgroundColor: NAVY, borderTop: `${mm(1.2)} solid ${ORANGE}`, boxSizing: 'border-box' }}>
        <div style={{ position: 'absolute', left: mm(24), top: mm(6.2), lineHeight: 1.2 }}>
          <div style={{ fontSize: pt(6), fontWeight: 700, letterSpacing: mm(0.28), color: ORANGE }}>VALIDACIÓN DIGITAL</div>
          <div style={{ fontSize: pt(8.5), fontWeight: 700, color: '#fff', marginTop: mm(1) }}>{c.codigo}</div>
        </div>
        <div style={{ position: 'absolute', right: mm(24), top: mm(5.4), textAlign: 'right', fontSize: pt(7.2), color: '#cbd5e1', lineHeight: mm(4.3) }}>
          {c.pieContacto.slice(0, 2).map((l, i) => <div key={i}>{l}</div>)}
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: mm(1.6), textAlign: 'center', fontSize: pt(6.2), color: '#94a3b8' }}>
          {c.pieLegal}
        </div>
      </div>

    </div>
  )
}

export const ModalCartaSolvencia: React.FC<ModalCartaSolvenciaProps> = ({
  isOpen,
  onClose,
  datos,
  perfilId,
  onCedulaUpdated
}) => {
  const [cedulaInput, setCedulaInput] = useState<string>(datos.residenteCedula || '')
  const [editandoCedula, setEditandoCedula] = useState<boolean>(!datos.residenteCedula)
  const [guardandoCedula, setGuardandoCedula] = useState<boolean>(false)
  const [descargando, setDescargando] = useState<boolean>(false)

  if (!isOpen) return null

  const datosActualizados: DatosCartaSolvencia = {
    ...datos,
    residenteCedula: cedulaInput.trim() || datos.residenteCedula || '',
    mesSolvente: datos.mesSolvente || obtenerMesActualEs(),
    anioSolvente: datos.anioSolvente || new Date().getFullYear()
  }

  const handleGuardarCedula = async () => {
    const limpia = normalizarCedula(cedulaInput)
    if (!limpia) return
    setGuardandoCedula(true)
    try {
      if (perfilId) {
        await supabase
          .from('perfiles')
          .update({ cedula: limpia, updated_at: new Date().toISOString() })
          .eq('id', perfilId)
      }
      setCedulaInput(limpia)
      onCedulaUpdated?.(limpia)
      setEditandoCedula(false)
    } catch (err) {
      console.warn('[ModalCartaSolvencia] Error guardando cédula:', err)
      setEditandoCedula(false)
    } finally {
      setGuardandoCedula(false)
    }
  }

  const handleDescargar = () => {
    setDescargando(true)
    try {
      descargarSolvenciaPDF(datosActualizados)
    } finally {
      setTimeout(() => setDescargando(false), 1200)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.78)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        style={{
          backgroundColor: '#0f172a',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '24px',
          width: '100%',
          maxWidth: '720px',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.8), 0 0 40px rgba(34, 197, 94, 0.12)',
          overflow: 'hidden'
        }}
      >
        {/* Cabecera del modal */}
        <div
          style={{
            padding: '18px 24px 14px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(180deg, rgba(34, 197, 94, 0.08) 0%, transparent 100%)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '14px',
                backgroundColor: 'rgba(34, 197, 94, 0.16)',
                border: '1px solid rgba(34, 197, 94, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '22px'
              }}
            >
              📜
            </div>
            <div>
              <h3 style={{ margin: 0, color: '#fff', fontSize: '18px', fontWeight: 800 }}>
                Carta de Solvencia
              </h3>
              <p style={{ margin: '2px 0 0', color: '#94a3b8', fontSize: '12.5px' }}>
                Apto. {datos.residenteApto || 'N/D'} · {datos.nombreEdificio || 'Edificio'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#94a3b8',
              width: '34px',
              height: '34px',
              borderRadius: '10px',
              cursor: 'pointer',
              fontSize: '16px'
            }}
            title="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* Contenido con scroll */}
        <div style={{ padding: '18px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {editandoCedula ? (
            <div
              style={{
                backgroundColor: 'rgba(249, 115, 22, 0.1)',
                border: '1px solid rgba(249, 115, 22, 0.3)',
                borderRadius: '14px',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'space-between',
                gap: '12px',
                flexWrap: 'wrap'
              }}
            >
              <div style={{ flex: 1, minWidth: '220px' }}>
                <span style={{ color: '#fb923c', fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                  🆔 Cédula de identidad del titular (aparecerá en la carta):
                </span>
                <input
                  type="text"
                  placeholder="Ej: V-12345678"
                  value={cedulaInput}
                  onChange={(e) => setCedulaInput(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: '#1e293b',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    color: '#fff',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={handleGuardarCedula}
                  disabled={guardandoCedula || !cedulaInput.trim()}
                  style={{
                    backgroundColor: 'var(--color-accent, #f97316)',
                    color: '#fff',
                    border: 'none',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {guardandoCedula ? 'Guardando...' : 'Aplicar'}
                </button>
                {datos.residenteCedula && (
                  <button
                    onClick={() => setEditandoCedula(false)}
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.08)',
                      color: '#94a3b8',
                      border: 'none',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: '12px',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
                <span style={{ color: '#94a3b8' }}>Titular C.I.:</span>
                <span style={{ color: '#fff', fontWeight: 700 }}>
                  {normalizarCedula(cedulaInput || datos.residenteCedula) || 'No especificada'}
                </span>
              </div>
              <button
                onClick={() => setEditandoCedula(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-accent, #f97316)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                Editar C.I.
              </button>
            </div>
          )}

          {/* Vista previa de la hoja carta */}
          <HojaSolvencia datos={datosActualizados} />
        </div>

        {/* Botones de acción */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '10px',
            backgroundColor: '#0a0f1d',
            flexWrap: 'wrap'
          }}
        >
          <button
            onClick={onClose}
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.06)',
              color: '#94a3b8',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              padding: '10px 18px',
              borderRadius: '12px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Cerrar
          </button>

          <button
            onClick={() => abrirSolvenciaPDF(datosActualizados)}
            style={{
              backgroundColor: 'rgba(59, 130, 246, 0.15)',
              color: '#60a5fa',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              padding: '10px 18px',
              borderRadius: '12px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>🖨️</span> Ver / Imprimir
          </button>

          <button
            onClick={handleDescargar}
            disabled={descargando}
            style={{
              background: 'linear-gradient(135deg, #16a34a 0%, #22c55e 100%)',
              color: '#fff',
              border: 'none',
              padding: '10px 22px',
              borderRadius: '12px',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 16px rgba(34, 197, 94, 0.35)'
            }}
          >
            <span>📥</span> {descargando ? 'Generando PDF...' : 'Descargar Carta (PDF)'}
          </button>
        </div>
      </div>
    </div>
  )
}
