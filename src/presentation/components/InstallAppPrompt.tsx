import React, { useState, useEffect } from 'react'

export const InstallAppPrompt: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [showAndroidManual, setShowAndroidManual] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isAndroid, setIsAndroid] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    // 1. Verificar si ya se está ejecutando como PWA instalada (Standalone)
    const standaloneActive =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://')

    if (standaloneActive) {
      setIsStandalone(true)
      return // Ya está instalada y abierta como app, no mostrar
    }

    // 2. Detección de dispositivo móvil
    const ua = window.navigator.userAgent.toLowerCase()
    const iosDevice = /iphone|ipad|ipod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    const androidDevice = /android/.test(ua)
    const mobileScreen = window.innerWidth <= 850 || 'ontouchstart' in window

    setIsIOS(iosDevice)
    setIsAndroid(androidDevice)

    if (!iosDevice && !androidDevice && !mobileScreen) {
      return // No mostrar en pantallas de escritorio regulares
    }

    // 3. Capturar el evento nativo de instalación en Android / Chrome
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)

    // Mostrar el modal siempre con animación tras 1.2 segundos en iPhone o Android
    const timer = setTimeout(() => {
      setIsVisible(true)
    }, 1200)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      clearTimeout(timer)
    }
  }, [])

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt()
        const choice = await deferredPrompt.userChoice
        if (choice.outcome === 'accepted') {
          setIsVisible(false)
          setMinimized(false)
          setDeferredPrompt(null)
        }
      } catch (err) {
        console.warn('[PWA] Error en prompt nativo:', err)
        setShowAndroidManual(true)
      }
    } else {
      setShowAndroidManual(true)
    }
  }

  const handleDismiss = () => {
    setIsVisible(false)
    setMinimized(true)
  }

  if (isStandalone) return null
  if (!isVisible && !minimized) return null

  if (minimized && !isVisible) {
    return (
      <div style={{ position: 'fixed', bottom: '20px', right: '16px', zIndex: 99998 }}>
        <button
          onClick={() => {
            setMinimized(false)
            setIsVisible(true)
          }}
          aria-label="Instalar Aplicación"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            borderRadius: '999px',
            background: 'var(--color-brand-gradient, linear-gradient(135deg, var(--color-accent, #f97316) 0%, var(--color-accent-hover, #ea580c) 100%))',
            color: '#fff',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            boxShadow: 'var(--color-brand-shadow, 0 8px 24px rgba(249, 115, 22, 0.55))',
            cursor: 'pointer',
            fontWeight: 800,
            fontSize: '13px',
            animation: 'pwaPillPulse 2.4s infinite ease-in-out',
            outline: 'none'
          }}
        >
          <img
            src="/icon-192.png?v=domus-pure-black-d"
            alt="DOMUS"
            style={{ width: '22px', height: '22px', borderRadius: '6px', objectFit: 'cover' }}
          />
          <span>📲 Instalar DOMUS</span>
        </button>
        <style>{`
          @keyframes pwaPillPulse {
            0%, 100% { transform: scale(1); box-shadow: var(--color-brand-shadow, 0 8px 24px rgba(249, 115, 22, 0.45)); }
            50% { transform: scale(1.05); box-shadow: 0 10px 30px rgba(249, 115, 22, 0.7); }
          }
        `}</style>
      </div>
    )
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(3, 7, 18, 0.82)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        zIndex: 999999,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: '0',
        animation: 'pwaFadeIn 0.35s ease-out'
      }}
    >
      {/* Contenedor Modal / Bottom Sheet Estético de Alta Prioridad */}
      <div
        style={{
          width: '100%',
          maxWidth: '480px',
          backgroundColor: '#0c111d',
          borderTopLeftRadius: '28px',
          borderTopRightRadius: '28px',
          border: '1px solid rgba(249, 115, 22, 0.35)',
          borderBottom: 'none',
          boxShadow: '0 -15px 50px -10px rgba(249, 115, 22, 0.22), 0 -25px 60px 0 rgba(0, 0, 0, 0.9)',
          padding: '24px 20px 28px',
          boxSizing: 'border-box',
          position: 'relative',
          maxHeight: '92vh',
          overflowY: 'auto',
          animation: 'pwaSlideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        {/* Barra superior de agarre táctil */}
        <div style={{ width: '42px', height: '4.5px', backgroundColor: 'rgba(255, 255, 255, 0.22)', borderRadius: '999px', margin: '0 auto 16px' }} />

        {/* Botón de cerrar discreto */}
        <button
          onClick={handleDismiss}
          aria-label="Cerrar"
          style={{
            position: 'absolute',
            top: '18px',
            right: '18px',
            backgroundColor: 'rgba(255, 255, 255, 0.08)',
            border: 'none',
            color: '#94a3b8',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '15px',
            fontWeight: 800
          }}
        >
          ✕
        </button>

        {/* Header con Icono de App y Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
          <div
            style={{
              position: 'relative',
              width: '68px',
              height: '68px',
              borderRadius: '16px',
              backgroundColor: '#000000',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              overflow: 'hidden'
            }}
          >
            <img
              src="/icon-192.png?v=domus-pure-black-d"
              alt="DOMUS"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/apple-touch-icon.png?v=domus-pure-black-d'
              }}
              style={{
                width: '100%',
                height: '100%',
                borderRadius: '16px',
                objectFit: 'cover'
              }}
            />
          </div>

          <div style={{ flex: 1, paddingRight: '24px' }}>
            <span
              style={{
                display: 'inline-block',
                backgroundColor: 'var(--color-accent-light, rgba(249, 115, 22, 0.15))',
                color: 'var(--color-accent, #f97316)',
                border: '1px solid var(--color-accent-glow, rgba(249, 115, 22, 0.35))',
                fontSize: '10.5px',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.6px',
                padding: '2px 8px',
                borderRadius: '6px',
                marginBottom: '4px'
              }}
            >
              📲 {isIOS ? 'App para iPhone' : isAndroid ? 'App para Android' : 'Acceso Directo Móvil'}
            </span>
            <h3 style={{ margin: 0, color: '#ffffff', fontSize: '19px', fontWeight: 900, lineHeight: 1.2 }}>
              Instala la Aplicación
            </h3>
            <p style={{ margin: '2px 0 0', color: 'var(--color-accent, #f97316)', fontSize: '13px', fontWeight: 900, letterSpacing: '0.8px', textTransform: 'uppercase' }}>
              DOMUS
            </p>
          </div>
        </div>

        {/* Mensaje descriptivo */}
        <p style={{ color: '#cbd5e1', fontSize: '13px', lineHeight: 1.45, margin: '0 0 16px' }}>
          Instala <strong>DOMUS</strong> en la pantalla de inicio de tu teléfono para acceder a tus recibos y gestionar tu condominio con máxima velocidad y comodidad.
        </p>

        {/* 3 Mejores Integraciones de DOMUS */}
        <div
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '14px',
            marginBottom: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '11px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '12.5px', color: '#e2e8f0', lineHeight: 1.35 }}>
            <span style={{ fontSize: '17px', lineHeight: 1 }}>🏦</span>
            <span><strong style={{ color: '#fff' }}>Tasa Oficial BCV en Tiempo Real:</strong> Moneda dual automática con conversión oficial instantánea en USD y Bolívares.</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '12.5px', color: '#e2e8f0', lineHeight: 1.35 }}>
            <span style={{ fontSize: '17px', lineHeight: 1 }}>⚡</span>
            <span><strong style={{ color: '#fff' }}>Reporte y Validación Instantánea:</strong> Conciliación ágil de Pago Móvil y transferencias con recibos digitales y solvencia al día.</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '12.5px', color: '#e2e8f0', lineHeight: 1.35 }}>
            <span style={{ fontSize: '17px', lineHeight: 1 }}>🔔</span>
            <span><strong style={{ color: '#fff' }}>Notificaciones Push y Multicanal:</strong> Alertas directas a tu móvil sobre avisos de cobro, incidencias y chat comunitario.</span>
          </div>
        </div>

        {/* ── SECCIÓN ESPECÍFICA SEGÚN SISTEMA OPERATIVO ── */}
        {isIOS ? (
          /* GUÍA INTERACTIVA PARA IPHONE (Safari / Chrome iOS) */
          <div
            style={{
              backgroundColor: 'rgba(30, 41, 59, 0.65)',
              border: '1px solid rgba(59, 130, 246, 0.35)',
              borderRadius: '18px',
              padding: '16px',
              marginBottom: '18px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#60a5fa', fontWeight: 800, fontSize: '13px', marginBottom: '12px' }}>
              <span>🍎 Pasos para iPhone / iPad:</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '12.5px', color: '#f1f5f9' }}>
              {/* Paso 1 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span
                  style={{
                    backgroundColor: '#2563eb',
                    color: '#fff',
                    fontWeight: 900,
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '11px',
                    flexShrink: 0
                  }}
                >
                  1
                </span>
                <span>
                  Toca el botón <strong>Compartir</strong>{' '}
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      backgroundColor: 'rgba(255, 255, 255, 0.15)',
                      padding: '2px 7px',
                      borderRadius: '6px',
                      color: '#38bdf8',
                      fontWeight: 800
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: '4px' }}>
                      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                      <polyline points="16 6 12 2 8 6" />
                      <line x1="12" y1="2" x2="12" y2="15" />
                    </svg>
                    Compartir
                  </span>{' '}
                  en la barra de Safari.
                </span>
              </div>

              {/* Paso 2 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span
                  style={{
                    backgroundColor: '#2563eb',
                    color: '#fff',
                    fontWeight: 900,
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '11px',
                    flexShrink: 0
                  }}
                >
                  2
                </span>
                <span>
                  Desliza hacia abajo y presiona <strong>"Agregar al inicio"</strong>{' '}
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      backgroundColor: 'rgba(255, 255, 255, 0.15)',
                      padding: '2px 7px',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      fontWeight: 800
                    }}
                  >
                    ➕ Agregar al inicio
                  </span>
                </span>
              </div>

              {/* Paso 3 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span
                  style={{
                    backgroundColor: '#2563eb',
                    color: '#fff',
                    fontWeight: 900,
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '11px',
                    flexShrink: 0
                  }}
                >
                  3
                </span>
                <span>
                  Presiona <strong>"Agregar"</strong> en la esquina superior derecha y listo.
                </span>
              </div>
            </div>
          </div>
        ) : (
          /* BOTÓN PRINCIPAL PARA ANDROID / CHROME */
          <div style={{ marginBottom: '14px' }}>
            <button
              onClick={handleInstallClick}
              style={{
                width: '100%',
                background: 'var(--color-brand-gradient, linear-gradient(135deg, #f97316 0%, #ea580c 100%))',
                color: '#ffffff',
                border: 'none',
                borderRadius: '16px',
                padding: '15px 20px',
                fontSize: '15.5px',
                fontWeight: 900,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                boxShadow: 'var(--color-brand-shadow, 0 8px 24px -4px rgba(249, 115, 22, 0.65))',
                transition: 'transform 0.15s ease'
              }}
            >
              <span style={{ fontSize: '18px' }}>📲</span>
              <span>Instalar DOMUS en el Teléfono</span>
            </button>

            {showAndroidManual && (
              <div
                style={{
                  marginTop: '12px',
                  backgroundColor: 'var(--color-accent-light, rgba(249, 115, 22, 0.1))',
                  border: '1px solid var(--color-accent-glow, rgba(249, 115, 22, 0.3))',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  fontSize: '12px',
                  color: '#fed7aa',
                  lineHeight: 1.4
                }}
              >
                ℹ️ <strong>Para instalar manualmente:</strong> Toca el menú de tu navegador (los 3 puntos <strong>⋮</strong> arriba a la derecha) y presiona <strong>"Instalar aplicación"</strong> o <strong>"Agregar a la pantalla principal"</strong>.
              </div>
            )}
          </div>
        )}

        {/* Botón secundario para descartar */}
        <button
          onClick={handleDismiss}
          style={{
            width: '100%',
            backgroundColor: 'transparent',
            color: '#64748b',
            border: 'none',
            fontSize: '12.5px',
            fontWeight: 600,
            cursor: 'pointer',
            padding: '8px 12px',
            textAlign: 'center',
            textDecoration: 'underline'
          }}
        >
          Continuar en el navegador web
        </button>
      </div>

      <style>{`
        @keyframes pwaFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes pwaSlideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
