import React from 'react'

interface GasNivelTanqueModalProps {
  open: boolean
  nuevoNivelTanque: number
  capacidadLitros: number
  onChangeNivel: (val: number) => void
  onClose: () => void
  onSave: () => void
}

export const GasNivelTanqueModal = React.memo<GasNivelTanqueModalProps>(({
  open,
  nuevoNivelTanque,
  capacidadLitros,
  onChangeNivel,
  onClose,
  onSave
}) => {
  if (!open) return null

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100000,
      padding: '16px'
    }}>
      <div style={{
        background: 'var(--color-bg-card, #161820)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '20px',
        width: '100%',
        maxWidth: '420px',
        padding: '24px',
        boxShadow: '0 20px 50px rgba(0,0,0,0.8)'
      }}>
        <h3 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 800 }}>
          ⛽ Ajustar Nivel del Tanque
        </h3>

        <div style={{ textAlign: 'center', margin: '20px 0' }}>
          <div style={{ fontSize: '48px', fontWeight: 900, color: nuevoNivelTanque <= 25 ? '#ef4444' : '#22c55e' }}>
            {nuevoNivelTanque}%
          </div>
          <div style={{ color: '#a1a1aa', fontSize: '13px' }}>
            Aproximadamente {Math.round((capacidadLitros * nuevoNivelTanque) / 100).toLocaleString()} Litros
          </div>
        </div>

        <input
          type="range"
          min="0"
          max="100"
          value={nuevoNivelTanque}
          onChange={e => onChangeNivel(Number(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--color-accent, #f97316)', height: '6px' }}
        />

        <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '10px',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              color: '#fff',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            Cancelar
          </button>
          <button
            onClick={onSave}
            style={{
              flex: 1,
              padding: '10px',
              backgroundColor: 'var(--color-accent, #f97316)',
              color: '#fff',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer',
              fontWeight: 800
            }}
          >
            Guardar Nivel
          </button>
        </div>
      </div>
    </div>
  )
})
