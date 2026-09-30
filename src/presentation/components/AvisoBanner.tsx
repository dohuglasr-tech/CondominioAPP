import React, { useState, useEffect } from 'react'
import { obtenerAvisoActivo, AvisoComunidad } from '../../data/avisosService'

export const AvisoBanner: React.FC = () => {
  const [aviso, setAviso] = useState<AvisoComunidad | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let montado = true

    const cargar = async () => {
      const a = await obtenerAvisoActivo()
      if (!montado) return

      if (a) {
        const descartado = localStorage.getItem(`condominio_aviso_dismissed_${a.id}`) === 'true'
        if (!descartado) {
          setAviso(a)
          setVisible(true)
        }
      }
    }

    cargar()
    return () => {
      montado = false
    }
  }, [])

  if (!visible || !aviso) return null

  const handleDismiss = () => {
    setVisible(false)
    if (aviso) {
      localStorage.setItem(`condominio_aviso_dismissed_${aviso.id}`, 'true')
    }
  }

  const isUrgente = aviso.tipo === 'urgente'
  const isMantenimiento = aviso.tipo === 'mantenimiento'

  const configColor = isUrgente
    ? {
        border: 'rgba(239, 68, 68, 0.4)',
        bg: 'linear-gradient(90deg, rgba(239, 68, 68, 0.12) 0%, rgba(20, 21, 25, 0.95) 100%)',
        badgeBg: 'rgba(239, 68, 68, 0.2)',
        badgeText: '#f87171',
        icon: '🚨',
        glow: 'rgba(239, 68, 68, 0.15)',
      }
    : isMantenimiento
    ? {
        border: 'rgba(245, 158, 11, 0.4)',
        bg: 'linear-gradient(90deg, rgba(245, 158, 11, 0.12) 0%, rgba(20, 21, 25, 0.95) 100%)',
        badgeBg: 'rgba(245, 158, 11, 0.2)',
        badgeText: '#fbbf24',
        icon: '🛠️',
        glow: 'rgba(245, 158, 11, 0.15)',
      }
    : {
        border: 'rgba(59, 130, 246, 0.4)',
        bg: 'linear-gradient(90deg, rgba(59, 130, 246, 0.12) 0%, rgba(20, 21, 25, 0.95) 100%)',
        badgeBg: 'rgba(59, 130, 246, 0.2)',
        badgeText: '#60a5fa',
        icon: '📢',
        glow: 'rgba(59, 130, 246, 0.15)',
      }

  return (
    <div
      style={{
        marginBottom: '16px',
        backgroundColor: '#141519',
        background: configColor.bg,
        border: `1px solid ${configColor.border}`,
        borderRadius: '16px',
        padding: '12px 16px',
        boxShadow: `0 8px 24px -4px ${configColor.glow}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        animation: 'fadeIn 0.25s ease-out',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: '18px', flexShrink: 0 }}>{configColor.icon}</span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', minWidth: 0 }}>
          <span
            style={{
              backgroundColor: configColor.badgeBg,
              color: configColor.badgeText,
              fontSize: '10px',
              fontWeight: 800,
              padding: '2px 7px',
              borderRadius: '6px',
              letterSpacing: '0.4px',
              textTransform: 'uppercase',
              flexShrink: 0,
            }}
          >
            {aviso.titulo}
          </span>

          <p
            style={{
              color: '#e4e4e7',
              fontSize: '13px',
              fontWeight: 500,
              margin: 0,
              lineHeight: 1.4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {aviso.mensaje}
          </p>
        </div>
      </div>

      <button
        onClick={handleDismiss}
        aria-label="Cerrar aviso"
        title="Descartar aviso"
        style={{
          background: 'none',
          border: 'none',
          color: '#71717a',
          fontSize: '16px',
          cursor: 'pointer',
          padding: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '6px',
          flexShrink: 0,
          transition: 'color 0.15s',
        }}
        onMouseOver={(e) => (e.currentTarget.style.color = '#fff')}
        onMouseOut={(e) => (e.currentTarget.style.color = '#71717a')}
      >
        ✕
      </button>
    </div>
  )
}
