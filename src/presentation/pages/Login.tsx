import React, { useState, useEffect } from 'react'
import { useAuth } from '../../application/contexts/AuthContext'
import { useNavigate, useLocation } from 'react-router-dom'
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

const FingerprintIcon = ({ size = 20, color = '#f97316' }: { size?: number; color?: string }) => (
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
  
  const { signIn, config, session, isAdmin } = useAuth()
  const nombreEdificio = config?.nombre_edificio || 'Residencias Ocutuy 5'

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

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      backgroundColor: '#0a0d14',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      color: '#fff',
      flexWrap: 'wrap',
    }}>
      
      {/* ── PANEL IZQUIERDO: HERO NARANJA CON DATOS Y LOGO DEL EDIFICIO ── */}
      <AuthHeroPanel config={config} />

      {/* ── PANEL DERECHO: FORMULARIO DE ACCESO Y TARJETA DE REGISTRO ── */}
      <div style={{
        flex: '1 1 50%',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
        backgroundColor: '#07090e',
        boxSizing: 'border-box',
      }}>
        <div style={{ width: '100%', maxWidth: '440px' }}>
          
          {/* Header del formulario */}
          <div style={{ marginBottom: '24px' }}>
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
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
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
                  onFocus={(e) => e.target.style.borderColor = '#f97316'}
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
                    onClick={() => alert('Por favor contacte a la administración del edificio para reestablecer su contraseña.')}
                    style={{
                      fontSize: '11.5px',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      textDecoration: 'none',
                      transition: 'color 0.2s'
                    }}
                    onMouseOver={(e) => (e.target as HTMLElement).style.color = '#f97316'}
                    onMouseOut={(e) => (e.target as HTMLElement).style.color = '#94a3b8'}
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
                    onFocus={(e) => e.target.style.borderColor = '#f97316'}
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
                    style={{ accentColor: '#f97316', cursor: 'pointer', width: '15px', height: '15px' }}
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
                      style={{ accentColor: '#f97316', cursor: 'pointer', width: '15px', height: '15px' }}
                    />
                    <label htmlFor="enableBio" style={{ fontSize: '12px', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <FingerprintIcon size={14} color="#f97316" />
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
                  backgroundColor: '#f97316',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '13px',
                  fontSize: '14.5px',
                  fontWeight: 800,
                  cursor: loading || bioLoading || !email || !password ? 'not-allowed' : 'pointer',
                  opacity: loading || bioLoading || !email || !password ? 0.7 : 1,
                  boxShadow: '0 4px 18px rgba(249, 115, 22, 0.4)',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
                onMouseOver={(e) => {
                  if (!loading && !bioLoading && email && password) e.currentTarget.style.backgroundColor = '#ea580c'
                }}
                onMouseOut={(e) => {
                  if (!loading && !bioLoading && email && password) e.currentTarget.style.backgroundColor = '#f97316'
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
                    title="Ingresar con Huella dactilar o Face ID"
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
                      color: '#f97316',
                      fontSize: '13.5px',
                      fontWeight: 700,
                      cursor: bioLoading || loading ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s ease',
                      boxSizing: 'border-box',
                    }}
                    onMouseOver={(e) => {
                      if (!bioLoading && !loading) {
                        e.currentTarget.style.borderColor = '#f97316'
                        e.currentTarget.style.backgroundColor = 'rgba(249, 115, 22, 0.08)'
                      }
                    }}
                    onMouseOut={(e) => {
                      if (!bioLoading && !loading) {
                        e.currentTarget.style.borderColor = '#232d42'
                        e.currentTarget.style.backgroundColor = '#0a0d14'
                      }
                    }}
                  >
                    <FingerprintIcon size={20} color="#f97316" />
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
              backgroundColor: 'rgba(249, 115, 22, 0.15)',
              border: '1px solid rgba(249, 115, 22, 0.3)',
              color: '#f97316',
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
                backgroundColor: '#f97316',
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
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#ea580c'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#f97316'}
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

    </div>
  )
}

