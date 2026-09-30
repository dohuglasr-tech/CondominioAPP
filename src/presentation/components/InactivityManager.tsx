import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../application/contexts/AuthContext'

// Tiempos de inactividad
const INACTIVITY_TIMEOUT_MS = 3 * 60 * 1000 // 3 minutos totales (180s)
const ADMIN_WARNING_MS = 2.5 * 60 * 1000    // Advertencia a los 2 min y 30 seg (150s)

export const InactivityManager: React.FC = () => {
  const { session, user, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()

  const [showAdminWarning, setShowAdminWarning] = useState(false)
  const [secondsRemaining, setSecondsRemaining] = useState(30)
  const lastActivityRef = useRef<number>(Date.now())
  const isLoggingOutRef = useRef<boolean>(false)

  // Resetear actividad del usuario cuando hay interacción
  const registrarActividad = useCallback(() => {
    // Si la advertencia del admin ya está activa en pantalla, no la cerramos
    // con un simple movimiento del cursor; requerimos que haga clic explícito en el modal
    if (!showAdminWarning) {
      lastActivityRef.current = Date.now()
    }
  }, [showAdminWarning])

  // Escuchar eventos globales de interacción del usuario
  useEffect(() => {
    if (!session || !user) return

    const events: (keyof WindowEventMap)[] = [
      'mousedown',
      'mousemove',
      'keydown',
      'scroll',
      'touchstart',
      'click',
    ]

    // Debounce ligero para no saturar con mousemove
    let throttleTimeout: NodeJS.Timeout | null = null
    const handleEvent = () => {
      if (!throttleTimeout) {
        throttleTimeout = setTimeout(() => {
          registrarActividad()
          throttleTimeout = null
        }, 300)
      }
    }

    events.forEach(ev => window.addEventListener(ev, handleEvent, { passive: true }))

    return () => {
      events.forEach(ev => window.removeEventListener(ev, handleEvent))
      if (throttleTimeout) clearTimeout(throttleTimeout)
    }
  }, [session, user, registrarActividad])

  // Temporizador principal: verifica inactividad cada segundo
  useEffect(() => {
    if (!session || !user) {
      setShowAdminWarning(false)
      isLoggingOutRef.current = false
      return
    }

    // Resetear al montar si cambió de ruta
    lastActivityRef.current = Date.now()
    isLoggingOutRef.current = false

    const interval = setInterval(async () => {
      if (isLoggingOutRef.current) return

      const now = Date.now()
      const elapsed = now - lastActivityRef.current

      // CASO 1: ADMINISTRADOR
      if (isAdmin) {
        if (elapsed >= INACTIVITY_TIMEOUT_MS) {
          // Expiró el tiempo total de 3 minutos
          isLoggingOutRef.current = true
          setShowAdminWarning(false)
          try {
            await signOut()
          } finally {
            navigate('/admin-login?inactivo=1', { replace: true })
          }
        } else if (elapsed >= ADMIN_WARNING_MS) {
          // Mostrar modal de advertencia durante los últimos 30 segundos
          const remaining = Math.max(0, Math.ceil((INACTIVITY_TIMEOUT_MS - elapsed) / 1000))
          setShowAdminWarning(true)
          setSecondsRemaining(remaining)
        } else {
          // Si el tiempo transcurrido es menor, asegurarse de que el modal esté cerrado
          if (showAdminWarning) {
            setShowAdminWarning(false)
          }
        }
      } 
      // CASO 2: RESIDENTES / CONSERJE
      else {
        if (elapsed >= INACTIVITY_TIMEOUT_MS) {
          // Cierre automático directo a los 3 minutos
          isLoggingOutRef.current = true
          try {
            await signOut()
          } finally {
            navigate('/login?inactivo=1', { replace: true })
          }
        }
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [session, user, isAdmin, signOut, navigate, showAdminWarning])

  // Acción del administrador: continuar sesión
  const handleContinuarSesion = () => {
    lastActivityRef.current = Date.now()
    setShowAdminWarning(false)
  }

  // Acción del administrador: cerrar sesión inmediatamente
  const handleCerrarSesion = async () => {
    isLoggingOutRef.current = true
    setShowAdminWarning(false)
    try {
      await signOut()
    } finally {
      navigate('/admin-login', { replace: true })
    }
  }

  // Si no hay que mostrar modal al admin, no renderizar nada
  if (!showAdminWarning || !isAdmin) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 7, 13, 0.85)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        zIndex: 999999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        animation: 'fadeIn 0.2s ease-out',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="inactivity-title"
        style={{
          width: '100%',
          maxWidth: '440px',
          backgroundColor: '#0d111a',
          border: '1px solid rgba(249, 115, 22, 0.4)',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.9), 0 0 40px -10px var(--color-brand-shadow, rgba(249, 115, 22, 0.25))',
          borderRadius: '20px',
          padding: '28px 24px',
          textAlign: 'center',
          boxSizing: 'border-box',
          position: 'relative',
        }}
      >
        {/* Indicador pulsante */}
        <div
          style={{
            width: '64px',
            height: '64px',
            margin: '0 auto 16px',
            borderRadius: '50%',
            backgroundColor: 'rgba(249, 115, 22, 0.12)',
            border: '2px solid var(--color-accent, #f97316)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '28px',
            boxShadow: '0 0 20px var(--color-brand-shadow, rgba(249, 115, 22, 0.3))',
            animation: 'pulse 1.5s infinite',
          }}
        >
          ⏳
        </div>

        {/* Título */}
        <h3
          id="inactivity-title"
          style={{
            color: '#ffffff',
            fontSize: '20px',
            fontWeight: 800,
            margin: '0 0 8px',
            letterSpacing: '-0.3px',
          }}
        >
          ¿Sigues ahí?
        </h3>

        {/* Mensaje */}
        <p
          style={{
            color: '#94a3b8',
            fontSize: '13px',
            lineHeight: 1.6,
            margin: '0 0 20px',
          }}
        >
          Por razones de seguridad administrativa, tu sesión se cerrará automáticamente por inactividad.
        </p>

        {/* Contador regresivo grande */}
        <div
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '12px',
            padding: '12px 16px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
          }}
        >
          <span style={{ fontSize: '13px', color: '#cbd5e1' }}>Cierre de sesión en:</span>
          <span
            style={{
              fontSize: '20px',
              fontWeight: 800,
              color: secondsRemaining <= 10 ? '#ef4444' : 'var(--color-accent, #f97316)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {secondsRemaining}s
          </span>
        </div>

        {/* Botones de acción */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button
            type="button"
            onClick={handleContinuarSesion}
            style={{
              width: '100%',
              padding: '13px 20px',
              borderRadius: '12px',
              border: 'none',
              background: 'var(--color-brand-gradient, linear-gradient(135deg, #f97316 0%, #ea580c 100%))',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 8px 20px -6px var(--color-brand-shadow, rgba(249, 115, 22, 0.4))',
              transition: 'transform 0.15s ease, filter 0.15s ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-1px)')}
            onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
          >
            ✅ Mantener mi sesión activa
          </button>

          <button
            type="button"
            onClick={handleCerrarSesion}
            style={{
              width: '100%',
              padding: '11px 20px',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              backgroundColor: 'transparent',
              color: '#94a3b8',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'color 0.15s ease, background-color 0.15s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = '#ef4444'
              e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.08)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = '#94a3b8'
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            Cerrar sesión ahora
          </button>
        </div>
      </div>
    </div>
  )
}
