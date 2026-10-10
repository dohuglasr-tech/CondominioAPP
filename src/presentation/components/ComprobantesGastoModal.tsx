import React, { useState, useEffect } from 'react'
import { parseComprobantesGasto, ComprobantesGasto } from '../../data/gastosService'

export interface ComprobantesGastoModalProps {
  isOpen: boolean
  onClose: () => void
  gasto: {
    descripcion: string
    monto_usd?: number
    monto_bs?: number
    categoria?: string
    tipo?: string
    mes_aplicacion?: string
    fecha_pago?: string | null
    referencia?: string | null
    pagado_por?: string | null
    autorizado_por?: string | null
    notas?: string | null
    factura_url?: string | null
  } | null
  initialTipo?: 'factura' | 'transferencia'
}

export const ComprobantesGastoModal: React.FC<ComprobantesGastoModalProps> = ({
  isOpen,
  onClose,
  gasto,
  initialTipo = 'factura',
}) => {
  const [activeTab, setActiveTab] = useState<'factura' | 'transferencia'>('factura')
  const [zoomLevel, setZoomLevel] = useState<number>(1)

  useEffect(() => {
    if (isOpen && gasto) {
      const comp = parseComprobantesGasto(gasto.factura_url)
      if (initialTipo === 'transferencia' && comp.transferencia_url) {
        setActiveTab('transferencia')
      } else if (comp.factura_url) {
        setActiveTab('factura')
      } else if (comp.transferencia_url) {
        setActiveTab('transferencia')
      } else {
        setActiveTab('factura')
      }
      setZoomLevel(1)
    }
  }, [isOpen, gasto, initialTipo])

  // Cerrar con tecla ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen || !gasto) return null

  const comp: ComprobantesGasto = parseComprobantesGasto(gasto.factura_url)
  const tieneFactura = Boolean(comp.factura_url)
  const tieneTransf = Boolean(comp.transferencia_url)
  const currentUrl = activeTab === 'factura' ? comp.factura_url : comp.transferencia_url

  const handleDownload = (url: string, filename: string) => {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.target = '_blank'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(0,0,0,0.88)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.2s ease-out',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '820px',
          maxHeight: '94vh',
          backgroundColor: '#121212',
          border: '1px solid #282828',
          borderRadius: '18px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 60px rgba(0,0,0,0.9), 0 0 0 1px rgba(249,115,22,0.15)',
          margin: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Accent Bar Superior */}
        <div
          style={{
            height: '3px',
            background: 'linear-gradient(90deg, var(--color-accent, #f97316), var(--color-accent-hover, #ea580c), #10b981)',
            width: '100%',
          }}
        />

        {/* Encabezado */}
        <div
          style={{
            padding: '18px 24px 14px',
            borderBottom: '1px solid #222',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '12px',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span
                style={{
                  backgroundColor: 'var(--color-accent-light, #f9731618)',
                  color: 'var(--color-accent, #f97316)',
                  border: '1px solid var(--color-accent-glow, #f9731630)',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                }}
              >
                {gasto.categoria || 'Gasto'}
              </span>
              {gasto.tipo && (
                <span
                  style={{
                    backgroundColor: '#ffffff10',
                    color: '#aaa',
                    border: '1px solid #333',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 600,
                  }}
                >
                  {gasto.tipo}
                </span>
              )}
            </div>

            <h3
              style={{
                color: '#fff',
                fontSize: '18px',
                fontWeight: 700,
                margin: '8px 0 4px',
                letterSpacing: '-0.3px',
              }}
            >
              {gasto.descripcion}
            </h3>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                flexWrap: 'wrap',
                fontSize: '13px',
              }}
            >
              {gasto.monto_usd !== undefined && (
                <span style={{ color: 'var(--color-accent, #f97316)', fontWeight: 800 }}>
                  ${gasto.monto_usd.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
                </span>
              )}
              {gasto.monto_bs !== undefined && (
                <span style={{ color: '#10b981', fontWeight: 700 }}>
                  Bs. {gasto.monto_bs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                </span>
              )}
              {gasto.fecha_pago && (
                <span style={{ color: '#888', fontSize: '12px' }}>
                  📅 Pago: {new Date(gasto.fecha_pago + 'T12:00:00').toLocaleDateString('es-VE')}
                </span>
              )}
              {gasto.referencia && (
                <span style={{ color: '#888', fontSize: '12px' }}>
                  Ref: <strong style={{ color: '#ccc' }}>{gasto.referencia}</strong>
                </span>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              background: '#1e1e1e',
              border: '1px solid #2e2e2e',
              color: '#bbb',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 700,
              flexShrink: 0,
              transition: 'all 0.15s ease',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = '#ef4444'
              e.currentTarget.style.color = '#fff'
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = '#1e1e1e'
              e.currentTarget.style.color = '#bbb'
            }}
          >
            ✕
          </button>
        </div>

        {/* Selector de pestañas si ambos comprobantes existen */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            padding: '12px 24px',
            backgroundColor: '#0c0c0c',
            borderBottom: '1px solid #202020',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          {tieneFactura && (
            <button
              onClick={() => {
                setActiveTab('factura')
                setZoomLevel(1)
              }}
              style={{
                backgroundColor: activeTab === 'factura' ? 'var(--color-accent, #f97316)' : '#181818',
                color: activeTab === 'factura' ? '#fff' : '#aaa',
                border: activeTab === 'factura' ? '1px solid var(--color-accent-hover, #ea580c)' : '1px solid #282828',
                borderRadius: '8px',
                padding: '7px 14px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease',
              }}
            >
              <span>📄</span> Factura / Recibo de Conforme
            </button>
          )}

          {tieneTransf && (
            <button
              onClick={() => {
                setActiveTab('transferencia')
                setZoomLevel(1)
              }}
              style={{
                backgroundColor: activeTab === 'transferencia' ? '#10b981' : '#181818',
                color: activeTab === 'transferencia' ? '#fff' : '#aaa',
                border: activeTab === 'transferencia' ? '1px solid #059669' : '1px solid #282828',
                borderRadius: '8px',
                padding: '7px 14px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease',
              }}
            >
              <span>💳</span> Comprobante de Transferencia
            </button>
          )}

          {!tieneFactura && !tieneTransf && (
            <span style={{ color: '#777', fontSize: '12px' }}>
              Este gasto no posee comprobantes fotográficos adjuntos.
            </span>
          )}

          {/* Controles de zoom y visualización a la derecha */}
          {currentUrl && (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => setZoomLevel((z) => Math.max(0.6, z - 0.25))}
                title="Alejar"
                style={{
                  background: '#1a1a1a',
                  border: '1px solid #2a2a2a',
                  color: '#ccc',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 700,
                }}
              >
                −
              </button>
              <button
                onClick={() => setZoomLevel(1)}
                title="Restablecer tamaño"
                style={{
                  background: '#1a1a1a',
                  border: '1px solid #2a2a2a',
                  color: '#999',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: 600,
                }}
              >
                {Math.round(zoomLevel * 100)}%
              </button>
              <button
                onClick={() => setZoomLevel((z) => Math.min(2.5, z + 0.25))}
                title="Acercar"
                style={{
                  background: '#1a1a1a',
                  border: '1px solid #2a2a2a',
                  color: '#ccc',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 700,
                }}
              >
                +
              </button>

              <button
                onClick={() => window.open(currentUrl, '_blank')}
                title="Ver imagen en pestaña nueva"
                style={{
                  background: '#1e293b',
                  border: '1px solid #334155',
                  color: '#60a5fa',
                  padding: '5px 12px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                🔍 Expandir
              </button>

              <button
                onClick={() =>
                  handleDownload(
                    currentUrl,
                    `comprobante_${activeTab}_${gasto.descripcion.replace(/\s+/g, '_')}.webp`
                  )
                }
                title="Descargar imagen"
                style={{
                  background: '#1a1a1a',
                  border: '1px solid #2a2a2a',
                  color: '#aaa',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                ⬇️
              </button>
            </div>
          )}
        </div>

        {/* Contenedor de Imagen */}
        <div
          style={{
            flex: 1,
            minHeight: '260px',
            maxHeight: '62vh',
            backgroundColor: '#050505',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'auto',
            padding: '16px',
            position: 'relative',
          }}
        >
          {currentUrl ? (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'transform 0.15s ease-out',
                transform: `scale(${zoomLevel})`,
                transformOrigin: 'center center',
              }}
            >
              <img
                src={currentUrl}
                alt={
                  activeTab === 'factura'
                    ? 'Factura o Recibo Conforme'
                    : 'Comprobante de Transferencia'
                }
                style={{
                  maxWidth: '100%',
                  maxHeight: '56vh',
                  objectFit: 'contain',
                  borderRadius: '10px',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.8)',
                  border: '1px solid #222',
                  cursor: zoomLevel > 1 ? 'grab' : 'zoom-in',
                }}
                onClick={() => setZoomLevel((z) => (z === 1 ? 1.6 : 1))}
              />
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: '#555', padding: '40px 20px' }}>
              <span style={{ fontSize: '40px', display: 'block', marginBottom: '8px' }}>📂</span>
              <p style={{ margin: 0, fontSize: '14px', color: '#888' }}>
                No hay {activeTab === 'factura' ? 'factura o recibo' : 'comprobante de transferencia'}{' '}
                cargado para este gasto.
              </p>
            </div>
          )}
        </div>

        {/* Footer con datos de auditoría / entrega */}
        <div
          style={{
            padding: '12px 24px',
            borderTop: '1px solid #1c1c1c',
            backgroundColor: '#101010',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '12px',
            color: '#777',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            {gasto.pagado_por && (
              <span>
                👤 Pagó: <strong style={{ color: '#bbb' }}>{gasto.pagado_por}</strong>
              </span>
            )}
            {gasto.autorizado_por && (
              <span>
                ✍️ Autorizó: <strong style={{ color: '#bbb' }}>{gasto.autorizado_por}</strong>
              </span>
            )}
            {gasto.notas && (
              <span>
                📝 Nota: <em style={{ color: '#999' }}>{gasto.notas}</em>
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#10b981', fontSize: '11px', fontWeight: 600 }}>
              🔒 Documento verificado del condominio
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
