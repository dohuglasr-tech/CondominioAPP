import React, { useState } from 'react'
import { useAuth } from '../../application/contexts/AuthContext'
import { useNavigate, useLocation } from 'react-router-dom'
import { AuthHeroPanel } from '../components/AuthHeroPanel'

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
  
  const { signIn, config } = useAuth()
  const nombreEdificio = config?.nombre_edificio || 'Residencias Ocutuy 5'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return

    setLoading(true)
    setError(null)

    const { error: signInError } = await signIn(email, password)
    
    if (signInError) {
      setError(signInError)
      setLoading(false)
    } else {
      navigate('/')
    }
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
                  placeholder="correo@ejemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
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
                    placeholder="Contraseña"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
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

              {/* Recordarme */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '22px' }}>
                <input
                  id="remember"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  style={{ accentColor: '#f97316', cursor: 'pointer', width: '15px', height: '15px' }}
                />
                <label htmlFor="remember" style={{ fontSize: '12.5px', color: '#94a3b8', cursor: 'pointer' }}>
                  Recordar sesión en este dispositivo
                </label>
              </div>

              {/* Botón Iniciar Sesión Naranja */}
              <button
                type="submit"
                disabled={loading || !email || !password}
                style={{
                  width: '100%',
                  backgroundColor: '#f97316',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '13px',
                  fontSize: '14.5px',
                  fontWeight: 800,
                  cursor: loading || !email || !password ? 'not-allowed' : 'pointer',
                  opacity: loading || !email || !password ? 0.7 : 1,
                  boxShadow: '0 4px 18px rgba(249, 115, 22, 0.4)',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
                onMouseOver={(e) => {
                  if (!loading && email && password) e.currentTarget.style.backgroundColor = '#ea580c'
                }}
                onMouseOut={(e) => {
                  if (!loading && email && password) e.currentTarget.style.backgroundColor = '#f97316'
                }}
              >
                {loading ? <span className="spinner spinner--sm"></span> : 'Iniciar Sesión'}
              </button>
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

