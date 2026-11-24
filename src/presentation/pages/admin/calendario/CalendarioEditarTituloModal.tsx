import React from 'react'

interface CalendarioEditarTituloModalProps {
  open: boolean
  seccionTituloEditando: 'naranja' | 'azul'
  nuevoTituloInput: string
  procesandoAccion: boolean
  onChangeTitulo: (v: string) => void
  onClose: () => void
  onSave: () => void
}

export const CalendarioEditarTituloModal = React.memo<CalendarioEditarTituloModalProps>(({
  open,
  seccionTituloEditando,
  nuevoTituloInput,
  procesandoAccion,
  onChangeTitulo,
  onClose,
  onSave
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
        maxWidth: '480px',
        boxShadow: '0 25px 60px rgba(0,0,0,0.8)',
        overflow: 'hidden'
      }}>
        <div className="calendario-modal-header" style={{ padding: '18px 24px', borderBottom: '1px solid #1f2937', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#fff' }}>
            ✏️ Editar Título: {seccionTituloEditando === 'naranja' ? 'Deudas Pasadas' : 'Calendario Mensual'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '20px', cursor: 'pointer' }}>
            ✕
          </button>
        </div>
        <div className="calendario-modal-body" style={{ padding: '24px' }}>
          <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '8px', fontWeight: 700 }}>
            Texto del Encabezado
          </label>
          <input
            type="text"
            value={nuevoTituloInput}
            onChange={e => onChangeTitulo(e.target.value)}
            placeholder="Ej: DEUDAS PASADAS / CONCEPTOS EXTRAORDINARIOS (BS)"
            style={{
              width: '100%',
              backgroundColor: '#030712',
              border: '1px solid #374151',
              borderRadius: '8px',
              padding: '10px 12px',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 600,
              boxSizing: 'border-box'
            }}
          />
        </div>
        <div className="calendario-modal-footer" style={{ padding: '16px 24px', backgroundColor: '#030712', borderTop: '1px solid #1f2937', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button
            type="button"
            onClick={onClose}
            style={{ padding: '9px 16px', backgroundColor: 'transparent', color: '#cbd5e1', border: '1px solid #374151', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={procesandoAccion}
            style={{ padding: '9px 20px', backgroundColor: 'var(--color-accent, #f97316)', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: procesandoAccion ? 'not-allowed' : 'pointer' }}
          >
            {procesandoAccion ? 'Guardando...' : 'Guardar Título'}
          </button>
        </div>
      </div>
    </div>
  )
})
