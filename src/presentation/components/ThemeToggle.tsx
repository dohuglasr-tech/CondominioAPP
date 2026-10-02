import React from 'react'
import { useTheme } from '../../application/contexts/ThemeContext'

interface ThemeToggleProps {
  variant?: 'icon' | 'switch' | 'button' | 'pill'
  showLabel?: boolean
  className?: string
  style?: React.CSSProperties
  onToggle?: () => void
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  variant = 'icon',
  className = '',
  style = {},
  onToggle
}) => {
  const { isLight, toggleTheme } = useTheme()

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    toggleTheme()
    onToggle?.()
  }

  // ── Variante 1: Botón de Ícono Minimalista (para Topbar y Sidebar) ──
  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={handleToggle}
        className={`theme-toggle-icon-btn ${className}`}
        title={isLight ? 'Cambiar a Modo Nativo (Oscuro)' : 'Cambiar a Modo Claro'}
        aria-label={isLight ? 'Cambiar a Modo Nativo (Oscuro)' : 'Cambiar a Modo Claro'}
        style={{
          background: isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.06)',
          border: isLight ? '1px solid rgba(0, 0, 0, 0.1)' : '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '50%',
          width: '36px',
          height: '36px',
          padding: 0,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: isLight ? '#0f172a' : '#f8fafc',
          transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          flexShrink: 0,
          outline: 'none',
          ...style,
        }}
      >
        {isLight ? (
          // Ícono de Luna para volver al Modo Nativo / Oscuro
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transition: 'transform 0.3s ease', transform: 'rotate(-15deg)' }}
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        ) : (
          // Ícono de Sol para pasar al Modo Claro
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#f59e0b"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transition: 'transform 0.3s ease' }}
          >
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        )}
      </button>
    )
  }

  // ── Variante 2: Switch iOS con texto (para Drawers y Ajustes) ──
  if (variant === 'switch' || variant === 'pill') {
    return (
      <div
        onClick={handleToggle}
        className={`theme-toggle-switch-wrap ${className}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          cursor: 'pointer',
          padding: '8px 4px',
          userSelect: 'none',
          ...style,
        }}
        role="button"
        tabIndex={0}
        aria-label="Alternar modo claro y oscuro"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: isLight ? '#fef3c7' : 'rgba(255, 255, 255, 0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
            }}
          >
            {isLight ? '☀️' : '🌙'}
          </div>
          <div>
            <div
              style={{
                fontSize: '13px',
                fontWeight: 700,
                color: isLight ? '#0f172a' : '#ffffff',
                lineHeight: 1.2,
              }}
            >
              Modo Claro
            </div>
            <div
              style={{
                fontSize: '11px',
                color: isLight ? '#64748b' : '#888888',
                marginTop: '2px',
              }}
            >
              {isLight ? 'Activo (Fondo claro)' : 'Desactivado (Nativo oscuro)'}
            </div>
          </div>
        </div>

        {/* Interruptor estilo iOS */}
        <div
          style={{
            width: '44px',
            height: '24px',
            borderRadius: '999px',
            backgroundColor: isLight ? 'var(--color-accent, #f97316)' : 'rgba(255, 255, 255, 0.18)',
            padding: '2px',
            boxSizing: 'border-box',
            transition: 'background-color 0.25s ease',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              backgroundColor: '#ffffff',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.25)',
              transform: isLight ? 'translateX(20px)' : 'translateX(0px)',
              transition: 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          />
        </div>
      </div>
    )
  }

  // ── Variante 3: Botón Completo con Etiqueta (para Sidebar Footer) ──
  return (
    <button
      type="button"
      onClick={handleToggle}
      className={`theme-toggle-btn ${className}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        width: '100%',
        padding: '9px 12px',
        backgroundColor: isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.04)',
        border: isLight ? '1px solid rgba(0, 0, 0, 0.08)' : '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '10px',
        color: isLight ? '#0f172a' : '#d4d4d8',
        fontSize: '12.5px',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        ...style,
      }}
    >
      <span style={{ fontSize: '15px' }}>{isLight ? '🌙' : '☀️'}</span>
      <span style={{ flex: 1, textAlign: 'left' }}>
        {isLight ? 'Modo Nativo (Oscuro)' : 'Modo Claro'}
      </span>
      <span
        style={{
          fontSize: '10px',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          padding: '2px 6px',
          borderRadius: '6px',
          backgroundColor: isLight ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.1)',
          color: isLight ? '#475569' : '#a1a1aa',
        }}
      >
        {isLight ? 'CLARO' : 'NATIVO'}
      </span>
    </button>
  )
}
