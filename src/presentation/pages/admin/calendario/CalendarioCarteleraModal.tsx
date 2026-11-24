import React from 'react'
import { getTasaBcvNumerica } from '../../../../utils/tasaBcvHelper'

interface CalendarioCarteleraModalProps {
  open: boolean
  carteleraOrientacion: 'portrait' | 'landscape'
  carteleraPaginas: 1 | 2 | 3
  carteleraFiltro: 'todos' | 'con_deuda' | 'solventes'
  carteleraTitulo: string
  carteleraMensaje: string
  totalFilas: number
  totalMorosos: number
  totalSolventes: number
  config: {
    banco?: string | null
    titular_cuenta?: string | null
    nombre_edificio?: string | null
    cedula_cuenta?: string | null
    rif?: string | null
    pago_movil_banco?: string | null
    pago_movil_telefono?: string | null
  } | null
  tasaBcvActual: number | null | undefined
  generandoPdf: boolean
  onClose: () => void
  onChangeOrientacion: (v: 'portrait' | 'landscape') => void
  onChangePaginas: (v: 1 | 2 | 3) => void
  onChangeFiltro: (v: 'todos' | 'con_deuda' | 'solventes') => void
  onChangeTitulo: (v: string) => void
  onChangeMensaje: (v: string) => void
  onDescargarPdf: () => void
}

const fmtBs = (n: number) => (n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const CalendarioCarteleraModal = React.memo<CalendarioCarteleraModalProps>(({
  open,
  carteleraOrientacion,
  carteleraPaginas,
  carteleraFiltro,
  carteleraTitulo,
  carteleraMensaje,
  totalFilas,
  totalMorosos,
  totalSolventes,
  config,
  tasaBcvActual,
  generandoPdf,
  onClose,
  onChangeOrientacion,
  onChangePaginas,
  onChangeFiltro,
  onChangeTitulo,
  onChangeMensaje,
  onDescargarPdf
}) => {
  if (!open) return null

  return (
    <div
      className="calendario-modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.82)',
        backdropFilter: 'blur(6px)',
        zIndex: 100000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
    >
      <div
        className="calendario-modal-card"
        onClick={e => e.stopPropagation()}
        style={{
          backgroundColor: '#111827',
          border: '1px solid #374151',
          borderRadius: '18px',
          width: '100%',
          maxWidth: '560px',
          maxHeight: '90vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.85), 0 0 30px rgba(249, 115, 22, 0.12)'
        }}
      >
        <div style={{
          padding: '18px 24px',
          backgroundColor: '#0f172a',
          borderBottom: '1px solid #1e293b',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>🖨️</span>
            <div>
              <h3 style={{ margin: 0, color: '#fff', fontSize: '16px', fontWeight: 800 }}>
                Cartelera Informativa para el Ascensor
              </h3>
              <p style={{ margin: '3px 0 0', color: 'var(--color-accent, #f97316)', fontSize: '11.5px', fontWeight: 600 }}>
                Tamaño Carta · {carteleraOrientacion === 'landscape' ? 'Horizontal (Apaisado)' : 'Vertical'} · {carteleraPaginas} {carteleraPaginas === 1 ? 'Hoja' : 'Hojas'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '20px',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '6px'
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', color: '#cbd5e1', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>
                Orientación de Impresión:
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => onChangeOrientacion('portrait')}
                  style={{
                    padding: '9px 8px',
                    borderRadius: '9px',
                    border: `1.5px solid ${carteleraOrientacion === 'portrait' ? 'var(--color-accent, #f97316)' : '#374151'}`,
                    backgroundColor: carteleraOrientacion === 'portrait' ? 'rgba(249, 115, 22, 0.12)' : '#030712',
                    color: carteleraOrientacion === 'portrait' ? '#fff' : '#94a3b8',
                    cursor: 'pointer',
                    textAlign: 'center',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    transition: 'all 0.15s ease'
                  }}
                >
                  📄 Vertical
                </button>
                <button
                  type="button"
                  onClick={() => onChangeOrientacion('landscape')}
                  style={{
                    padding: '9px 8px',
                    borderRadius: '9px',
                    border: `1.5px solid ${carteleraOrientacion === 'landscape' ? 'var(--color-accent, #f97316)' : '#374151'}`,
                    backgroundColor: carteleraOrientacion === 'landscape' ? 'rgba(249, 115, 22, 0.12)' : '#030712',
                    color: carteleraOrientacion === 'landscape' ? '#fff' : '#94a3b8',
                    cursor: 'pointer',
                    textAlign: 'center',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    transition: 'all 0.15s ease'
                  }}
                >
                  📑 Horizontal
                </button>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', color: '#cbd5e1', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>
                Distribución de Hojas:
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                {[
                  { num: 1 as const, label: '1 Hoja', sub: 'Compacta' },
                  { num: 2 as const, label: '2 Hojas', sub: 'Mediana' },
                  { num: 3 as const, label: '3 Hojas', sub: 'Mural / Grande' }
                ].map(opt => (
                  <button
                    key={opt.num}
                    type="button"
                    onClick={() => onChangePaginas(opt.num)}
                    style={{
                      padding: '7px 4px',
                      borderRadius: '9px',
                      border: `1.5px solid ${carteleraPaginas === opt.num ? 'var(--color-accent, #f97316)' : '#374151'}`,
                      backgroundColor: carteleraPaginas === opt.num ? 'rgba(249, 115, 22, 0.12)' : '#030712',
                      color: carteleraPaginas === opt.num ? '#fff' : '#94a3b8',
                      cursor: 'pointer',
                      textAlign: 'center',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: '11.5px' }}>{opt.label}</div>
                    <div style={{ fontSize: '9.5px', color: '#64748b' }}>{opt.sub}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div style={{
            backgroundColor: carteleraPaginas === 3 ? 'rgba(249, 115, 22, 0.1)' : 'rgba(59, 130, 246, 0.08)',
            border: `1px solid ${carteleraPaginas === 3 ? 'rgba(249, 115, 22, 0.35)' : 'rgba(59, 130, 246, 0.25)'}`,
            borderRadius: '10px',
            padding: '11px 14px',
            fontSize: '11.5px',
            color: carteleraPaginas === 3 ? '#fdba74' : '#93c5fd',
            lineHeight: 1.45
          }}>
            {carteleraPaginas === 1 && (
              <span>📄 <strong>Modo 1 Hoja (Compacto):</strong> Todos los {totalFilas} apartamentos caben en 1 sola hoja Carta sin márgenes, con 2 columnas paralelas en vertical (o 3 en horizontal) y datos bancarios al pie.</span>
            )}
            {carteleraPaginas === 2 && (
              <span>📑 <strong>Modo 2 Hojas (Legibilidad Media):</strong> Divide el edificio en dos hojas con letra más grande (7.5pt). Página 1: KPIs y mitad de apartamentos; Página 2: segunda mitad y cuentas bancarias.</span>
            )}
            {carteleraPaginas === 3 && (
              <span>🖼️ <strong>Modo 3 Hojas (Unión Mural para Ascensor):</strong> Genera 3 hojas continuas con <strong>letra extra-grande (8.5pt)</strong> y alto contraste. Diseñado especialmente para que el administrador pegue las 3 hojas unidas en el ascensor y la información se lea fácilmente desde lejos.</span>
            )}
          </div>

          <div>
            <label style={{ display: 'block', color: '#cbd5e1', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>
              Inmuebles a incluir en la Cartelera:
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {[
                { id: 'todos' as const, label: '🏢 Todos', sub: `${totalFilas} Aptos` },
                { id: 'con_deuda' as const, label: '🔴 Solo Deuda', sub: `${totalMorosos} Morosos` },
                { id: 'solventes' as const, label: '🟢 Solo Solventes', sub: `${totalSolventes} Al día` }
              ].map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangeFiltro(opt.id)}
                  style={{
                    padding: '10px 8px',
                    borderRadius: '10px',
                    border: `1.5px solid ${carteleraFiltro === opt.id ? 'var(--color-accent, #f97316)' : '#374151'}`,
                    backgroundColor: carteleraFiltro === opt.id ? 'rgba(249, 115, 22, 0.12)' : '#030712',
                    color: carteleraFiltro === opt.id ? '#fff' : '#94a3b8',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '12px' }}>{opt.label}</div>
                  <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>{opt.sub}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', color: '#cbd5e1', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>
              Título del Boletín:
            </label>
            <input
              type="text"
              value={carteleraTitulo}
              onChange={e => onChangeTitulo(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: '#030712',
                border: '1px solid #374151',
                borderRadius: '8px',
                padding: '9px 12px',
                color: '#fff',
                fontSize: '13px',
                boxSizing: 'border-box'
              }}
              placeholder="Ej: BOLETÍN INFORMATIVO DE COBRANZA Y SOLVENCIA"
            />
          </div>

          <div>
            <label style={{ display: 'block', color: '#cbd5e1', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>
              Mensaje Institucional / Llamado al Pago:
            </label>
            <textarea
              rows={3}
              value={carteleraMensaje}
              onChange={e => onChangeMensaje(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: '#030712',
                border: '1px solid #374151',
                borderRadius: '8px',
                padding: '9px 12px',
                color: '#fff',
                fontSize: '12px',
                lineHeight: 1.4,
                boxSizing: 'border-box',
                resize: 'vertical'
              }}
              placeholder="Mensaje para los residentes que se leerá en el ascensor..."
            />
          </div>

          <div style={{
            backgroundColor: '#030712',
            border: '1px solid #1f2937',
            borderRadius: '10px',
            padding: '12px 14px'
          }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#fb923c', marginBottom: '6px' }}>
              💳 CUENTAS BANCARIAS INCLUIDAS EN EL PIE DEL PDF:
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px', color: '#94a3b8' }}>
              <div>
                <strong style={{ color: '#fff' }}>Banco:</strong> {config?.banco || 'Bicentenario'}<br />
                <strong style={{ color: '#fff' }}>Titular:</strong> {config?.titular_cuenta || config?.nombre_edificio || 'Junta Condominio'}<br />
                <strong style={{ color: '#fff' }}>Cédula/RIF:</strong> {config?.cedula_cuenta || config?.rif || 'No registrado'}
              </div>
              <div>
                <strong style={{ color: '#fff' }}>Pago Móvil:</strong> {config?.pago_movil_banco || config?.banco || 'Bicentenario'}<br />
                <strong style={{ color: '#fff' }}>Teléfono:</strong> {config?.pago_movil_telefono || 'No configurado'}<br />
                <strong style={{ color: '#fff' }}>Tasa BCV:</strong> Bs. {fmtBs(getTasaBcvNumerica(tasaBcvActual))}/USD
              </div>
            </div>
          </div>
        </div>

        <div style={{
          padding: '16px 24px',
          backgroundColor: '#0f172a',
          borderTop: '1px solid #1e293b',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '12px'
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '10px 18px',
              backgroundColor: 'transparent',
              color: '#cbd5e1',
              border: '1px solid #374151',
              borderRadius: '10px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Cerrar
          </button>

          <button
            type="button"
            onClick={onDescargarPdf}
            disabled={generandoPdf}
            style={{
              padding: '10px 22px',
              backgroundColor: 'var(--color-accent, #f97316)',
              color: '#fff',
              border: 'none',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 800,
              cursor: generandoPdf ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 15px rgba(249, 115, 22, 0.35)'
            }}
          >
            {generandoPdf ? '⏳ Generando PDF Carta...' : '📥 Descargar PDF para Imprimir (Carta)'}
          </button>
        </div>
      </div>
    </div>
  )
})
