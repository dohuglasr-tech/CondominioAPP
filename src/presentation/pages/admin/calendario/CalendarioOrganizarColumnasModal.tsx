import React from 'react'
import { ColumnaCalendarioConfig } from '../../../../data/calendarioDeudasService'

interface CalendarioOrganizarColumnasModalProps {
  open: boolean
  columnasNaranja: ColumnaCalendarioConfig[]
  columnasAzul: ColumnaCalendarioConfig[]
  procesandoAccion: boolean
  onClose: () => void
  onAbrirCrearColumna: (seccion: 'naranja' | 'azul') => void
  onMoverColumna: (colId: string, dir: 'izquierda' | 'derecha') => void
  onCambiarSeccion: (colId: string, nuevaSeccion: 'naranja' | 'azul') => void
  onEliminarColumna: (colId: string, titulo: string) => void
  onRestablecerColumnas: () => void
}

export const CalendarioOrganizarColumnasModal = React.memo<CalendarioOrganizarColumnasModalProps>(({
  open,
  columnasNaranja,
  columnasAzul,
  procesandoAccion,
  onClose,
  onAbrirCrearColumna,
  onMoverColumna,
  onCambiarSeccion,
  onEliminarColumna,
  onRestablecerColumnas
}) => {
  if (!open) return null

  return (
    <div className="calendario-modal-overlay" style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.75)',
      backdropFilter: 'blur(5px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 99999,
      padding: '20px'
    }}>
      <div className="calendario-modal-card" style={{
        backgroundColor: '#111827',
        border: '1px solid #374151',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '820px',
        maxHeight: '85vh',
        boxShadow: '0 25px 60px rgba(0,0,0,0.8)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        <div className="calendario-modal-header" style={{ padding: '18px 24px', borderBottom: '1px solid #1f2937', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#fff' }}>
              ⚙️ Gestionar y Quitar Columnas (Verticales)
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94a3b8' }}>
              Mueve columnas entre "Deudas Pasadas" y el "Calendario Mensual", reordena su posición o quítalas a tu antojo
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '20px', cursor: 'pointer' }}>
            ✕
          </button>
        </div>

        <div className="calendario-modal-body calendario-organizar-grid" style={{ padding: '20px 24px', overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', flex: 1 }}>
          <div style={{ backgroundColor: '#090d16', border: '1px solid rgba(234, 88, 12, 0.3)', borderRadius: '12px', padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', borderBottom: '1px solid rgba(234, 88, 12, 0.2)', paddingBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#fb923c' }}>
                🏛️ Deudas Pasadas ({columnasNaranja.length})
              </span>
              <button
                type="button"
                onClick={() => onAbrirCrearColumna('naranja')}
                style={{ background: 'rgba(234, 88, 12, 0.2)', border: '1px solid rgba(234, 88, 12, 0.4)', color: '#fb923c', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}
              >
                + Agregar
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {columnasNaranja.length === 0 ? (
                <div style={{ color: '#64748b', fontSize: '12px', textAlign: 'center', padding: '20px' }}>
                  No hay columnas en esta sección.
                </div>
              ) : (
                columnasNaranja.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      backgroundColor: '#111827',
                      border: '1px solid #1f2937',
                      borderRadius: '8px',
                      fontSize: '12px'
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 700, color: c.tipo === 'cuota_especial' ? '#facc15' : '#fff' }}>{c.titulo}</span>
                      <span style={{ marginLeft: '6px', fontSize: '10px', color: '#94a3b8' }}>({c.moneda})</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <button
                        type="button"
                        onClick={() => onMoverColumna(c.id, 'izquierda')}
                        style={{ background: '#1f2937', border: 'none', color: '#cbd5e1', borderRadius: '4px', padding: '4px 6px', cursor: 'pointer', fontSize: '10px' }}
                        title="Mover columna a la izquierda"
                      >
                        ◀
                      </button>
                      <button
                        type="button"
                        onClick={() => onMoverColumna(c.id, 'derecha')}
                        style={{ background: '#1f2937', border: 'none', color: '#cbd5e1', borderRadius: '4px', padding: '4px 6px', cursor: 'pointer', fontSize: '10px' }}
                        title="Mover columna a la derecha"
                      >
                        ▶
                      </button>
                      <button
                        type="button"
                        onClick={() => onCambiarSeccion(c.id, 'azul')}
                        style={{
                          background: 'rgba(59, 130, 246, 0.2)',
                          border: '1px solid rgba(59, 130, 246, 0.4)',
                          color: '#60a5fa',
                          borderRadius: '4px',
                          padding: '4px 8px',
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: 700
                        }}
                        title="Pasar esta columna al Calendario Mensual"
                      >
                        ➔ Calendario
                      </button>
                      <button
                        type="button"
                        onClick={() => onEliminarColumna(c.id, c.titulo)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px 4px', fontSize: '12px' }}
                        title="Quitar columna vertical de la tabla"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div style={{ backgroundColor: '#090d16', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '12px', padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', borderBottom: '1px solid rgba(59, 130, 246, 0.2)', paddingBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#60a5fa' }}>
                📅 Calendario Mensual ({columnasAzul.length})
              </span>
              <button
                type="button"
                onClick={() => onAbrirCrearColumna('azul')}
                style={{ background: 'rgba(59, 130, 246, 0.2)', border: '1px solid rgba(59, 130, 246, 0.4)', color: '#60a5fa', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, cursor: 'pointer' }}
              >
                + Agregar
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {columnasAzul.length === 0 ? (
                <div style={{ color: '#64748b', fontSize: '12px', textAlign: 'center', padding: '20px' }}>
                  No hay columnas en esta sección.
                </div>
              ) : (
                columnasAzul.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      backgroundColor: '#111827',
                      border: '1px solid #1f2937',
                      borderRadius: '8px',
                      fontSize: '12px'
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 700, color: c.tipo === 'cuota_especial' ? '#facc15' : '#fff' }}>{c.titulo}</span>
                      <span style={{ marginLeft: '6px', fontSize: '10px', color: '#94a3b8' }}>({c.moneda})</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <button
                        type="button"
                        onClick={() => onMoverColumna(c.id, 'izquierda')}
                        style={{ background: '#1f2937', border: 'none', color: '#cbd5e1', borderRadius: '4px', padding: '4px 6px', cursor: 'pointer', fontSize: '10px' }}
                        title="Mover columna a la izquierda"
                      >
                        ◀
                      </button>
                      <button
                        type="button"
                        onClick={() => onMoverColumna(c.id, 'derecha')}
                        style={{ background: '#1f2937', border: 'none', color: '#cbd5e1', borderRadius: '4px', padding: '4px 6px', cursor: 'pointer', fontSize: '10px' }}
                        title="Mover columna a la derecha"
                      >
                        ▶
                      </button>
                      <button
                        type="button"
                        onClick={() => onCambiarSeccion(c.id, 'naranja')}
                        style={{
                          background: 'rgba(234, 88, 12, 0.2)',
                          border: '1px solid rgba(234, 88, 12, 0.4)',
                          color: '#fb923c',
                          borderRadius: '4px',
                          padding: '4px 8px',
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: 700
                        }}
                        title="Pasar esta columna a Deudas Pasadas"
                      >
                        ➔ Deudas Pasadas
                      </button>
                      <button
                        type="button"
                        onClick={() => onEliminarColumna(c.id, c.titulo)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px 4px', fontSize: '12px' }}
                        title="Quitar columna vertical de la tabla"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="calendario-modal-footer" style={{ padding: '16px 24px', backgroundColor: '#030712', borderTop: '1px solid #1f2937', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            type="button"
            onClick={onRestablecerColumnas}
            disabled={procesandoAccion}
            style={{
              padding: '9px 16px',
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              color: '#f87171',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: procesandoAccion ? 'not-allowed' : 'pointer'
            }}
            title="Restablece las columnas originales por defecto"
          >
            🔄 Restablecer Columnas Originales
          </button>

          <button
            type="button"
            onClick={onClose}
            style={{ padding: '9px 24px', backgroundColor: '#374151', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
})
