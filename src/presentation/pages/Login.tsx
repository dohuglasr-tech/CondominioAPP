import React, { useState, useEffect } from 'react'
import { useAuth } from '../../application/contexts/AuthContext'
import { useNavigate, useLocation, useParams } from 'react-router-dom'
import { supabase } from '../../data/supabase'
import { AuthHeroPanel } from '../components/AuthHeroPanel'
import {
  isBiometricsSupported,
  isBiometricsEnrolled,
  getEnrolledBiometricEmail,
  enrollBiometrics,
  authenticateWithBiometrics,
  disableBiometrics,
  BiometricSupport,
} from '../../utils/biometricAuth'

const FingerprintIcon = ({ size = 20, color = 'var(--color-accent, #f97316)' }: { size?: number; color?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flexShrink: 0 }}
  >
    <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
    <path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
    <path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" />
    <path d="M2 12a10 10 0 0 1 18-6" />
    <path d="M2 16h.01" />
    <path d="M21.8 16c.2-2 .131-5.354 0-6" />
    <path d="M9 6.8a6 6 0 0 1 9 5.2c0 .47 0 1.17-.02 2" />
  </svg>
)

export function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as { registered?: boolean; email?: string } | null

  const [email, setEmail] = useState(state?.email || '')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [registeredSuccess] = useState(!!state?.registered)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sesionExpiradaInactividad = new URLSearchParams(location.search).get('inactivo') === '1'

  // ── Estados para Restablecimiento de Contraseña ──
  const [showResetModal, setShowResetModal] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetSuccess, setResetSuccess] = useState(false)

  // ── Estados para Autenticación Biométrica (Face ID / Huella) ──
  const [bioSupport, setBioSupport] = useState<BiometricSupport>({
    supported: false,
    label: 'Face ID / Huella',
    type: 'biometric',
  })
  const [isBioEnrolled, setIsBioEnrolled] = useState(false)
  const [bioEnrolledEmail, setBioEnrolledEmail] = useState<string | null>(null)
  const [bioLoading, setBioLoading] = useState(false)
  const [bioSuccessMessage, setBioSuccessMessage] = useState<string | null>(null)
  const [enableBiometricOnLogin, setEnableBiometricOnLogin] = useState(true)
  
  const { tenantSlug } = useParams<{ tenantSlug?: string }>()
  const { signIn, config, session, isAdmin, tenantSubdomain, refreshConfig } = useAuth()
  const activeTenantSlug = tenantSlug || tenantSubdomain
  const nombreEdificio = config?.nombre_edificio || 'DOMUS'

  useEffect(() => {
    if (tenantSlug) {
      refreshConfig(false, tenantSlug)
    }
  }, [tenantSlug, refreshConfig])

  // Redirigir si ya existe sesión activa
  useEffect(() => {
    if (session) {
      navigate(isAdmin ? '/admin' : '/', { replace: true })
    }
  }, [session, isAdmin, navigate])

  // Cargar email recordado y disponibilidad biométrica
  useEffect(() => {
    const savedEmail = localStorage.getItem('condominio_saved_email')
    const savedRemember = localStorage.getItem('condominio_remember_me')
    if (!state?.email && savedEmail) {
      setEmail(savedEmail)
    }
    if (savedRemember !== null) {
      setRememberMe(savedRemember === 'true')
    }

    // Verificar compatibilidad y si ya se enroló biometría
    isBiometricsSupported().then((support) => {
      setBioSupport(support)
    })

    const enrolled = isBiometricsEnrolled()
    setIsBioEnrolled(enrolled)
    if (enrolled) {
      setBioEnrolledEmail(getEnrolledBiometricEmail())
    }
  }, [state?.email])

  // ── Iniciar sesión rápido con Face ID / Huella ───────────────────
  const handleBiometricLogin = async () => {
    setError(null)
    setBioLoading(true)
    setBioSuccessMessage(`Escaneando ${bioSupport.label}...`)

    try {
      const res = await authenticateWithBiometrics()
      if (!res.success || !res.email || !res.password) {
        setBioLoading(false)
        setBioSuccessMessage(null)
        if (res.error) {
          setError(res.error)
        }
        return
      }

      // Colocar los datos automáticamente en el formulario
      setEmail(res.email)
      setPassword(res.password)
      setBioSuccessMessage(`¡${bioSupport.label} verificado con éxito! Iniciando sesión...`)

      // Iniciar sesión con Supabase automáticamente
      const { error: signInError } = await signIn(res.email, res.password)
      if (signInError) {
        setError(signInError)
        setBioLoading(false)
        setBioSuccessMessage(null)
      } else {
        navigate('/', { replace: true })
      }
    } catch (err: any) {
      setBioLoading(false)
      setBioSuccessMessage(null)
      setError(err?.message || 'Error durante la verificación biométrica.')
    }
  }

  // ── Desvincular biometría de este dispositivo ────────────────────
  const handleUnlinkBiometrics = () => {
    if (window.confirm(`¿Deseas desvincular ${bioSupport.label} de este dispositivo?`)) {
      disableBiometrics()
      setIsBioEnrolled(false)
      setBioEnrolledEmail(null)
      setPassword('')
    }
  }

  // ── Abrir y procesar restablecimiento de contraseña ───────────────
  const handleOpenResetModal = () => {
    setResetEmail(email.trim())
    setResetError(null)
    setResetSuccess(false)
    setShowResetModal(true)
  }

  const handleSendResetEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    const clean = resetEmail.trim().toLowerCase()
    if (!clean || !clean.includes('@')) {
      setResetError('Por favor ingresa un correo electrónico válido.')
      return
    }

    setResetLoading(true)
    setResetError(null)

    try {
      const redirectUrl = `${window.location.origin}/reset-password`
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(clean, {
        redirectTo: redirectUrl
      })

      if (resetErr) {
        setResetError(resetErr.message || 'No se pudo enviar el correo de recuperación. Verifica el correo e intenta de nuevo.')
        setResetLoading(false)
        return
      }

      setResetSuccess(true)
    } catch (err: any) {
      setResetError(err?.message || 'Error inesperado al solicitar restablecimiento.')
    } finally {
      setResetLoading(false)
    }
  }

  // ── Envío normal de credenciales ────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return

    setLoading(true)
    setError(null)
    const cleanEmail = email.trim()

    // 1. Guardar o remover email según 'Recordar sesión'
    if (rememberMe) {
      localStorage.setItem('condominio_saved_email', cleanEmail)
      localStorage.setItem('condominio_remember_me', 'true')
    } else {
      localStorage.removeItem('condominio_saved_email')
      localStorage.setItem('condominio_remember_me', 'false')
    }

    const { error: signInError } = await signIn(cleanEmail, password)
    
    if (signInError) {
      setError(signInError)
      setLoading(false)
      return
    }

    // 2. Si el usuario activó biometría y el equipo es compatible y aún no está enrolado
    if (bioSupport.supported && enableBiometricOnLogin && !isBioEnrolled) {
      try {
        await enrollBiometrics(cleanEmail, password)
      } catch (e) {
        console.warn('No se pudo enrolar biometría tras login:', e)
      }
    }

    navigate('/', { replace: true })
  }

  // Detección y scroll para efecto Parallax / Bottom Sheet en pantallas móviles
  const [isMobile, setIsMobile] = useState(false)
  const [scrollY, setScrollY] = useState(0)

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 900)
    handleResize()
    const handleScroll = () => {
      if (window.innerWidth < 900) {
        setScrollY(window.scrollY)
      }
    }
    window.addEventListener('resize', handleResize)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  const scrollToForm = () => {
    const el = document.getElementById('login-form-sheet')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <div className="login-root-container">
      {/* Estilos dedicados para el efecto Parallax / Bottom Sheet en móvil */}
      <style>{`
        @keyframes bounceDown {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(4px); }
        }

        .login-root-container {
          min-height: 100vh;
          display: flex;
          background-color: #07090e;
          font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          color: #fff;
          position: relative;
        }

        /* ── Versión Escritorio (>= 900px): Pantalla dividida 50/50 ── */
        @media (min-width: 900px) {
          .login-root-container {
            flex-direction: row;
          }
          .login-hero-wrapper {
            flex: 1 1 50%;
            min-height: 100vh;
            position: relative;
          }
          .login-form-wrapper {
            flex: 1 1 50%;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 40px 24px;
            background-color: #07090e;
            box-sizing: border-box;
          }
          .login-sheet-handle {
            display: none !important;
          }
        }

        /* ── Versión Teléfono (< 900px): Hero naranja sticky en fondo y Formulario oscuro deslizante ── */
        @media (max-width: 899px) {
          .login-root-container {
            display: block !important;
            overflow-x: hidden;
            background-color: #07090e;
          }

          .login-hero-wrapper {
            position: sticky !important;
            top: 0 !important;
            z-index: 1 !important;
            width: 100% !important;
            min-height: 80vh !important;
            display: flex !important;
            flex-direction: column !important;
            will-change: transform, opacity, filter;
            transform-origin: center top;
          }

          .login-form-wrapper {
            position: relative !important;
            z-index: 10 !important;
            width: 100% !important;
            min-height: 100vh !important;
            background: #07090e !important;
            border-top-left-radius: 32px !important;
            border-top-right-radius: 32px !important;
            box-shadow: 0 -24px 60px rgba(0, 0, 0, 0.9), 0 -1px 0 rgba(255, 255, 255, 0.12) !important;
            padding: 16px 20px 60px !important;
            margin-top: -36px !important;
            box-sizing: border-box !important;
          }

          .login-sheet-handle {
            display: flex !important;
            flex-direction: column;
            align-items: center;
            padding: 4px 0 18px;
            cursor: pointer;
          }

          .login-sheet-pill-bar {
            width: 44px;
            height: 4.5px;
            border-radius: 9999px;
            background-color: rgba(255, 255, 255, 0.28);
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
            transition: all 0.2s ease;
          }

          .login-sheet-handle:hover .login-sheet-pill-bar,
          .login-sheet-handle:active .login-sheet-pill-bar {
            background-color: var(--color-accent, #f97316);
            width: 54px;
          }
        }
      `}</style>

      {/* ── PANEL IZQUIERDO: HERO NARANJA CON DATOS Y LOGO DEL EDIFICIO ── */}
      <div
        className="login-hero-wrapper"
        style={isMobile ? {
          transform: `scale(${Math.max(0.92, 1 - scrollY * 0.0003)})`,
          opacity: Math.max(0.35, 1 - scrollY * 0.0018),
          filter: `brightness(${Math.max(0.7, 1 - scrollY * 0.001)})`,
        } : undefined}
      >
        <AuthHeroPanel config={config} onScrollToForm={scrollToForm} />
      </div>

      {/* ── PANEL DERECHO: FORMULARIO DE ACCESO Y TARJETA DE REGISTRO ── */}
      <div id="login-form-sheet" className="login-form-wrapper">
        {/* Barra estilo pill en móvil para dar aspecto de tarjeta deslizante */}
        <div className="login-sheet-handle" onClick={scrollToForm}>
          <div className="login-sheet-pill-bar" />
        </div>

        <div style={{ width: '100%', maxWidth: '440px', margin: '0 auto' }}>
          
          {/* Header del formulario */}
          <div style={{ marginBottom: '24px' }}>
            {activeTenantSlug ? (
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '4px 12px',
                borderRadius: '9999px',
                backgroundColor: 'rgba(56, 189, 248, 0.12)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                color: '#38bdf8',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.4px',
                marginBottom: '10px'
              }}>
                <span>🏢</span>
                <span>{config?.nombre_edificio || activeTenantSlug}</span>
                <span style={{ color: '#94a3b8', fontSize: '10px' }}>
                  ({activeTenantSlug}.domus.ve)
                </span>
              </div>
            ) : (
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '9999px',
                backgroundColor: 'var(--color-accent-light, rgba(249, 115, 22, 0.12))',
                border: '1px solid var(--border-accent, rgba(249, 115, 22, 0.25))',
                color: 'var(--color-accent, #f97316)',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.6px',
                textTransform: 'uppercase',
                marginBottom: '10px'
              }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--color-accent, #f97316)' }} />
                Portal Residente
              </div>
            )}
            <h1 style={{
              fontSize: '28px',
              fontWeight: 800,
              margin: '0 0 6px',
              letterSpacing: '-0.5px',
              color: '#ffffff'
            }}>
              Iniciar sesión
            </h1>
            <p style={{
              fontSize: '13.5px',
              color: '#94a3b8',
              margin: 0,
              lineHeight: 1.4
            }}>
              Accede a tu cuenta y gestiona tus recibos de {nombreEdificio}.
            </p>
          </div>

          {/* Tarjeta del Formulario Principal */}
          <div style={{
            backgroundColor: '#111622',
            border: '1px solid #1e2638',
            borderRadius: '16px',
            padding: '28px',
            boxShadow: '0 16px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
            marginBottom: '16px'
          }}>
            <form onSubmit={handleSubmit}>
              
              {registeredSuccess && (
                <div style={{
                  backgroundColor: '#10b98118',
                  color: '#10b981',
                  border: '1px solid #10b98140',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  marginBottom: '18px',
                  lineHeight: 1.4,
                  textAlign: 'center',
                  fontWeight: 600
                }}>
                  ✅ ¡Cuenta creada exitosamente! Ya puedes iniciar sesión con tu contraseña.
                </div>
              )}

              {bioSuccessMessage && (
                <div style={{
                  backgroundColor: '#10b98118',
                  color: '#10b981',
                  border: '1px solid #10b98140',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  marginBottom: '18px',
                  lineHeight: 1.4,
                  textAlign: 'center',
                  fontWeight: 600,
                }}>
                  ✨ {bioSuccessMessage}
                </div>
              )}

              {sesionExpiradaInactividad && !error && (
                <div style={{
                  backgroundColor: 'rgba(249, 115, 22, 0.12)',
                  border: '1px solid rgba(249, 115, 22, 0.35)',
                  color: '#fed7aa',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  marginBottom: '18px',
                  lineHeight: 1.4,
                  textAlign: 'center',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}>
                  <span>⏱️</span>
                  <span>Tu sesión se cerró automáticamente por 3 minutos de inactividad por tu seguridad.</span>
                </div>
              )}

              {error && (
                <div style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  color: '#fca5a5',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  marginBottom: '18px',
                  textAlign: 'center',
                  fontWeight: 500
                }}>
                  {error}
                </div>
              )}



              {/* Campo Email */}
              <div style={{ marginBottom: '16px' }}>
                <label
                  htmlFor="email"
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#cbd5e1',
                    marginBottom: '6px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.4px'
                  }}
                >
                  Correo Electrónico
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="username webauthn"
                  placeholder="correo@ejemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading || bioLoading}
                  required
                  style={{
                    width: '100%',
                    backgroundColor: '#0a0d14',
                    border: '1px solid #232d42',
                    borderRadius: '10px',
                    padding: '13px 14px',
                    color: '#ffffff',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={(e) => e.target.style.borderColor = 'var(--color-accent, #f97316)'}
                  onBlur={(e) => e.target.style.borderColor = '#232d42'}
                />
              </div>

              {/* Campo Contraseña */}
              <div style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label
                    htmlFor="password"
                    style={{
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#cbd5e1',
                      textTransform: 'uppercase',
                      letterSpacing: '0.4px',
                      margin: 0
                    }}
                  >
                    Contraseña
                  </label>
                  <span
                    onClick={handleOpenResetModal}
                    style={{
                      fontSize: '11.5px',
                      color: 'var(--color-accent, #f97316)',
                      fontWeight: 600,
                      cursor: 'pointer',
                      textDecoration: 'none',
                      transition: 'color 0.2s'
                    }}
                    onMouseOver={(e) => (e.target as HTMLElement).style.color = 'var(--color-accent-hover, #ea580c)'}
                    onMouseOut={(e) => (e.target as HTMLElement).style.color = 'var(--color-accent, #f97316)'}
                  >
                    ¿Olvidó su contraseña?
                  </span>
                </div>

                <div style={{ position: 'relative' }}>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Contraseña"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading || bioLoading}
                    required
                    style={{
                      width: '100%',
                      backgroundColor: '#0a0d14',
                      border: '1px solid #232d42',
                      borderRadius: '10px',
                      padding: '13px 42px 13px 14px',
                      color: '#ffffff',
                      fontSize: '14px',
                      outline: 'none',
                      boxSizing: 'border-box',
                      transition: 'border-color 0.2s',
                    }}
                    onFocus={(e) => e.target.style.borderColor = 'var(--color-accent, #f97316)'}
                    onBlur={(e) => e.target.style.borderColor = '#232d42'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: '#64748b',
                      cursor: 'pointer',
                      fontSize: '16px',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              {/* Opciones: Recordar sesión y Biometría */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '22px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    id="remember"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    style={{ accentColor: 'var(--color-accent, #f97316)', cursor: 'pointer', width: '15px', height: '15px' }}
                  />
                  <label htmlFor="remember" style={{ fontSize: '12.5px', color: '#cbd5e1', cursor: 'pointer' }}>
                    Recordar sesión en este dispositivo
                  </label>
                </div>

                {bioSupport.supported && !isBioEnrolled && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      id="enableBio"
                      type="checkbox"
                      checked={enableBiometricOnLogin}
                      onChange={(e) => setEnableBiometricOnLogin(e.target.checked)}
                      style={{ accentColor: 'var(--color-accent, #f97316)', cursor: 'pointer', width: '15px', height: '15px' }}
                    />
                    <label htmlFor="enableBio" style={{ fontSize: '12px', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <FingerprintIcon size={14} color="var(--color-accent, #f97316)" />
                      <span>Autorizar acceso rápido con huella dactilar / Face ID</span>
                    </label>
                  </div>
                )}
              </div>

              {/* Botón Iniciar Sesión Naranja */}
              <button
                type="submit"
                disabled={loading || bioLoading || !email || !password}
                style={{
                  width: '100%',
                  backgroundColor: 'var(--color-accent, #f97316)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '13px',
                  fontSize: '14.5px',
                  fontWeight: 800,
                  cursor: loading || bioLoading || !email || !password ? 'not-allowed' : 'pointer',
                  opacity: loading || bioLoading || !email || !password ? 0.7 : 1,
                  boxShadow: 'var(--color-brand-shadow, 0 4px 18px var(--color-accent-glow))',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
                onMouseOver={(e) => {
                  if (!loading && !bioLoading && email && password) e.currentTarget.style.backgroundColor = 'var(--color-accent-hover, #ea580c)'
                }}
                onMouseOut={(e) => {
                  if (!loading && !bioLoading && email && password) e.currentTarget.style.backgroundColor = 'var(--color-accent, #f97316)'
                }}
              >
                {loading ? <span className="spinner spinner--sm"></span> : 'Iniciar Sesión'}
              </button>

              {/* ── BOTÓN MINIMALISTA DE ACCESO CON HUELLA DACTILAR (SOLO SI EL USUARIO YA AUTORIZÓ) ── */}
              {isBioEnrolled && (
                <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', width: '100%', marginBottom: '14px', gap: '10px' }}>
                    <div style={{ flex: 1, height: '1px', backgroundColor: '#1e2638' }} />
                    <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.6px', fontWeight: 600 }}>
                      o ingresa con
                    </span>
                    <div style={{ flex: 1, height: '1px', backgroundColor: '#1e2638' }} />
                  </div>

                  <button
                    type="button"
                    onClick={handleBiometricLogin}
                    disabled={bioLoading || loading}
                    title={bioEnrolledEmail ? `Ingresar con ${bioSupport.label} (${bioEnrolledEmail})` : `Ingresar con ${bioSupport.label}`}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '10px',
                      padding: '11px 16px',
                      backgroundColor: '#0a0d14',
                      border: '1px solid #232d42',
                      borderRadius: '10px',
                      color: 'var(--color-accent, #f97316)',
                      fontSize: '13.5px',
                      fontWeight: 700,
                      cursor: bioLoading || loading ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s ease',
                      boxSizing: 'border-box',
                    }}
                    onMouseOver={(e) => {
                      if (!bioLoading && !loading) {
                        e.currentTarget.style.borderColor = 'var(--color-accent, #f97316)'
                        e.currentTarget.style.backgroundColor = 'var(--color-accent-light, rgba(249, 115, 22, 0.08))'
                      }
                    }}
                    onMouseOut={(e) => {
                      if (!bioLoading && !loading) {
                        e.currentTarget.style.borderColor = '#232d42'
                        e.currentTarget.style.backgroundColor = '#0a0d14'
                      }
                    }}
                  >
                    <FingerprintIcon size={20} color="var(--color-accent, #f97316)" />
                    <span>{bioLoading ? 'Verificando huella...' : 'Acceso con Huella / Face ID'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleUnlinkBiometrics}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#475569',
                      fontSize: '11px',
                      marginTop: '8px',
                      cursor: 'pointer',
                      padding: '2px 6px',
                      transition: 'color 0.2s',
                    }}
                    onMouseOver={(e) => (e.target as HTMLElement).style.color = '#ef4444'}
                    onMouseOut={(e) => (e.target as HTMLElement).style.color = '#475569'}
                  >
                    Desvincular huella de este equipo
                  </button>
                </div>
              )}
            </form>

            {/* Descarga App Android (APK) */}
            <div style={{ marginTop: '16px' }}>
              <button
                type="button"
                onClick={() => window.open('/app-release.apk', '_blank')}
                style={{
                  width: '100%',
                  backgroundColor: '#0a0d14',
                  border: '1px solid #1e2638',
                  borderRadius: '10px',
                  padding: '11px 14px',
                  color: '#cbd5e1',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.borderColor = '#10b981'
                  e.currentTarget.style.color = '#10b981'
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.borderColor = '#1e2638'
                  e.currentTarget.style.color = '#cbd5e1'
                }}
              >
                <span>🤖</span> Descargar App Android (APK)
              </button>
            </div>
          </div>

          {/* ── TARJETA INFERIOR: REGISTRO (Exacta a la imagen de referencia) ── */}
          <div style={{
            backgroundColor: '#111622',
            border: '1px solid #1e2638',
            borderRadius: '16px',
            padding: '20px 22px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            flexWrap: 'wrap'
          }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-accent-light, rgba(249, 115, 22, 0.15))',
              border: '1px solid var(--border-accent, rgba(249, 115, 22, 0.3))',
              color: 'var(--color-accent, #f97316)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
              flexShrink: 0
            }}>
              👤+
            </div>

            <div style={{ flex: 1, minWidth: '180px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 800, margin: 0, color: '#ffffff' }}>
                ¿Aún no tienes cuenta?
              </h3>
              <p style={{ fontSize: '11.5px', color: '#94a3b8', margin: '3px 0 0', lineHeight: 1.35 }}>
                Regístrate en nuestro nuevo portal y forma parte de nuestra comunidad.
              </p>
            </div>

            <button
              type="button"
              onClick={() => navigate('/register')}
              style={{
                backgroundColor: 'var(--color-accent, #f97316)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '9px 16px',
                fontSize: '12.5px',
                fontWeight: 800,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'background-color 0.2s',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--color-accent-hover, #ea580c)'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'var(--color-accent, #f97316)'}
            >
              Crear mi cuenta 👤+
            </button>
          </div>

          {/* ── VERSIÓN INFERIOR: ACCESO OCULTO AL PANEL ADMIN ── */}
          <div style={{ textAlign: 'center', marginTop: '22px', paddingBottom: '16px' }}>
            <span
              onClick={() => navigate('/admin-login')}
              style={{
                color: '#334155',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                letterSpacing: '0.8px',
                userSelect: 'none',
                transition: 'color 0.2s'
              }}
              onMouseOver={(e) => (e.target as HTMLElement).style.color = '#64748b'}
              onMouseOut={(e) => (e.target as HTMLElement).style.color = '#334155'}
            >
              v1.0.4
            </span>
          </div>

        </div>
      </div>

      {/* ── MODAL DE RECUPERACIÓN DE CONTRASEÑA ── */}
      {showResetModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          zIndex: 9999,
          boxSizing: 'border-box'
        }}>
          <div style={{
            backgroundColor: '#111622',
            border: '1px solid #1e2638',
            borderRadius: '20px',
            padding: '32px 28px',
            width: '100%',
            maxWidth: '440px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.7)',
            position: 'relative',
            boxSizing: 'border-box'
          }}>
            {/* Botón cerrar X */}
            <button
              onClick={() => setShowResetModal(false)}
              style={{
                position: 'absolute',
                top: '18px',
                right: '18px',
                background: 'none',
                border: 'none',
                color: '#64748b',
                fontSize: '20px',
                cursor: 'pointer',
                padding: '4px',
                lineHeight: 1
              }}
              title="Cerrar"
            >
              ✕
            </button>

            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{
                width: '54px',
                height: '54px',
                borderRadius: '16px',
                backgroundColor: 'rgba(249, 115, 22, 0.12)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '26px',
                marginBottom: '12px'
              }}>
                🔑
              </div>
              <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#fff', margin: '0 0 6px' }}>
                Restablecer contraseña
              </h2>
              <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
                Ingresa el correo electrónico asociado a tu cuenta para recibir un enlace seguro de recuperación.
              </p>
            </div>

            {resetSuccess ? (
              <div>
                <div style={{
                  backgroundColor: 'rgba(16, 185, 129, 0.12)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  borderRadius: '12px',
                  padding: '16px',
                  color: '#34d399',
                  fontSize: '13px',
                  lineHeight: 1.5,
                  textAlign: 'center',
                  marginBottom: '20px'
                }}>
                  <div style={{ fontSize: '24px', marginBottom: '8px' }}>✉️</div>
                  <strong style={{ display: 'block', fontSize: '14px', marginBottom: '4px' }}>
                    ¡Enlace enviado!
                  </strong>
                  Hemos enviado un correo a <span style={{ color: '#fff', fontWeight: 600 }}>{resetEmail}</span> con el enlace para restablecer tu contraseña.
                  <div style={{ marginTop: '8px', color: '#94a3b8', fontSize: '12px' }}>
                    Por favor revisa tu bandeja de entrada y la carpeta de spam o correo no deseado.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowResetModal(false)}
                  style={{
                    width: '100%',
                    backgroundColor: 'var(--color-accent, #f97316)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '12px',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Entendido, volver al login
                </button>
              </div>
            ) : (
              <form onSubmit={handleSendResetEmail}>
                {resetError && (
                  <div style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.12)',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    color: '#fca5a5',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    fontSize: '12.5px',
                    marginBottom: '16px',
                    textAlign: 'center',
                    lineHeight: 1.4
                  }}>
                    {resetError}
                  </div>
                )}

                <div style={{ marginBottom: '18px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#cbd5e1',
                    marginBottom: '6px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.4px'
                  }}>
                    Correo Electrónico
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="correo@ejemplo.com"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    disabled={resetLoading}
                    style={{
                      width: '100%',
                      backgroundColor: '#0a0d14',
                      border: '1px solid #232d42',
                      borderRadius: '10px',
                      padding: '13px 14px',
                      color: '#ffffff',
                      fontSize: '14px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <button
                    type="submit"
                    disabled={resetLoading || !resetEmail}
                    style={{
                      width: '100%',
                      background: 'var(--color-brand-gradient, linear-gradient(135deg, var(--color-accent, #f97316) 0%, var(--color-accent-hover, #ea580c) 100%))',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '10px',
                      padding: '13px',
                      fontSize: '14px',
                      fontWeight: 800,
                      cursor: resetLoading || !resetEmail ? 'not-allowed' : 'pointer',
                      opacity: resetLoading || !resetEmail ? 0.7 : 1,
                      boxShadow: 'var(--color-brand-shadow, 0 4px 18px rgba(249, 115, 22, 0.35))',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    {resetLoading ? 'Enviando enlace...' : 'Enviar enlace de recuperación 🚀'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowResetModal(false)}
                    style={{
                      width: '100%',
                      backgroundColor: 'transparent',
                      color: '#94a3b8',
                      border: '1px solid #232d42',
                      borderRadius: '10px',
                      padding: '11px',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

    </div>
  )
}

