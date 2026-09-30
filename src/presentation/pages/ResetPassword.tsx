import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../data/supabase'
import { useAuth } from '../../application/contexts/AuthContext'
import { AuthHeroPanel } from '../components/AuthHeroPanel'

export const ResetPassword: React.FC = () => {
  const navigate = useNavigate()
  const { config, refreshPerfil } = useAuth()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  
  const [loading, setLoading] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [hasValidSession, setHasValidSession] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // ── Verificar si el enlace de recuperación es válido ─────────────
  useEffect(() => {
    let mounted = true

    const verifySession = async () => {
      try {
        // 1. Extraer tokens del hash de la URL si existen
        if (window.location.hash) {
          const hash = window.location.hash.substring(1)
          const params = new URLSearchParams(hash)
          const accessToken = params.get('access_token')
          const refreshToken = params.get('refresh_token')
          const type = params.get('type')

          if (accessToken && refreshToken) {
            const { error: sessionErr } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            })
            if (!sessionErr && mounted) {
              setHasValidSession(true)
              setCheckingSession(false)
              return
            }
          }
        }

        // 2. Extraer código PKCE si vino por query params (?code=...)
        const queryParams = new URLSearchParams(window.location.search)
        const code = queryParams.get('code')
        if (code) {
          const { error: codeErr } = await supabase.auth.exchangeCodeForSession(code)
          if (!codeErr && mounted) {
            setHasValidSession(true)
            setCheckingSession(false)
            return
          }
        }

        // 3. Verificar si ya hay sesión activa
        const { data: { session } } = await supabase.auth.getSession()
        if (session && mounted) {
          setHasValidSession(true)
        }
      } catch (err) {
        console.warn('[ResetPassword] Error verificando sesión:', err)
      } finally {
        if (mounted) setCheckingSession(false)
      }
    }

    verifySession()

    // 4. Escuchar eventos de recuperación de contraseña de Supabase Auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (session && event === 'SIGNED_IN')) {
        if (mounted) {
          setHasValidSession(true)
          setCheckingSession(false)
        }
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  // ── Enviar nueva contraseña ───────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!password || !confirmPassword) {
      setError('Por favor completa ambos campos de contraseña.')
      return
    }

    if (password.length < 6) {
      setError('La contraseña debe tener un mínimo de 6 caracteres.')
      return
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden. Por favor verifícalas.')
      return
    }

    setLoading(true)

    try {
      const { data, error: updateErr } = await supabase.auth.updateUser({
        password: password,
      })

      if (updateErr) {
        setError(updateErr.message || 'No se pudo actualizar la contraseña. El enlace puede haber caducado.')
        setLoading(false)
        return
      }

      // Marcar perfil como clave cambiada y activa en la base de datos
      if (data?.user?.id) {
        await supabase
          .from('perfiles')
          .update({
            clave_cambiada: true,
            estado_cuenta: 'activa',
          })
          .eq('id', data.user.id)

        await refreshPerfil?.()
      }

      setSuccess(true)
      setTimeout(() => {
        navigate('/', { replace: true })
      }, 2500)
    } catch (err: any) {
      setError(err?.message || 'Error inesperado al guardar la contraseña.')
    } finally {
      setLoading(false)
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
      {/* Panel izquierdo Hero */}
      <AuthHeroPanel config={config} />

      {/* Panel derecho formulario */}
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

          {/* Header */}
          <div style={{ marginBottom: '24px' }}>
            <h1 style={{
              fontSize: '28px',
              fontWeight: 800,
              margin: '0 0 6px',
              letterSpacing: '-0.5px',
              color: '#ffffff'
            }}>
              Nueva Contraseña
            </h1>
            <p style={{
              fontSize: '13.5px',
              color: '#94a3b8',
              margin: 0,
              lineHeight: 1.4
            }}>
              Establece una contraseña segura para acceder a tu cuenta.
            </p>
          </div>

          {/* Tarjeta principal */}
          <div style={{
            backgroundColor: '#111622',
            border: '1px solid #1e2638',
            borderRadius: '16px',
            padding: '28px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
            marginBottom: '16px'
          }}>

            {checkingSession ? (
              <div style={{ textAlign: 'center', padding: '30px 0' }}>
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔄</div>
                <p style={{ color: '#94a3b8', fontSize: '13.5px', margin: 0 }}>
                  Validando enlace de recuperación...
                </p>
              </div>
            ) : success ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{
                  width: '60px',
                  height: '60px',
                  borderRadius: '20px',
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  color: '#10b981',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '32px',
                  marginBottom: '16px'
                }}>
                  ✅
                </div>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#fff', margin: '0 0 8px' }}>
                  ¡Contraseña actualizada!
                </h3>
                <p style={{ color: '#94a3b8', fontSize: '13px', lineHeight: 1.5, margin: '0 0 20px' }}>
                  Tu nueva clave ha sido guardada exitosamente. Estamos redirigiéndote a tu portal...
                </p>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <div className="spinner spinner--sm"></div>
                </div>
              </div>
            ) : !hasValidSession ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{
                  width: '60px',
                  height: '60px',
                  borderRadius: '20px',
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  color: '#ef4444',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '28px',
                  marginBottom: '16px'
                }}>
                  ⚠️
                </div>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#fff', margin: '0 0 8px' }}>
                  Enlace inválido o expirado
                </h3>
                <p style={{ color: '#94a3b8', fontSize: '13px', lineHeight: 1.5, margin: '0 0 24px' }}>
                  Por razones de seguridad, los enlaces de recuperación tienen un tiempo de validez limitado o ya fueron utilizados.
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  style={{
                    width: '100%',
                    backgroundColor: '#f97316',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '13px',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Solicitar un nuevo enlace en el Login
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
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

                {/* Campo Nueva Contraseña */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#cbd5e1',
                    marginBottom: '6px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.4px'
                  }}>
                    Nueva Contraseña
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Mínimo 6 caracteres"
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
                        boxSizing: 'border-box'
                      }}
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
                        padding: '4px'
                      }}
                      title={showPassword ? 'Ocultar' : 'Ver'}
                    >
                      {showPassword ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>

                {/* Campo Confirmar Contraseña */}
                <div style={{ marginBottom: '22px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#cbd5e1',
                    marginBottom: '6px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.4px'
                  }}>
                    Confirmar Nueva Contraseña
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Repite la contraseña"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
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
                        boxSizing: 'border-box'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
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
                        padding: '4px'
                      }}
                      title={showConfirmPassword ? 'Ocultar' : 'Ver'}
                    >
                      {showConfirmPassword ? '🙈' : '👁️'}
                    </button>
                  </div>
                  {password && confirmPassword && (
                    <div style={{
                      marginTop: '6px',
                      fontSize: '12px',
                      color: password === confirmPassword ? '#10b981' : '#f87171',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      {password === confirmPassword ? '✓ Las contraseñas coinciden' : '✗ Las contraseñas no coinciden'}
                    </div>
                  )}
                </div>

                {/* Botón Guardar */}
                <button
                  type="submit"
                  disabled={loading || !password || !confirmPassword}
                  style={{
                    width: '100%',
                    backgroundColor: '#f97316',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '13px',
                    fontSize: '14.5px',
                    fontWeight: 800,
                    cursor: loading || !password || !confirmPassword ? 'not-allowed' : 'pointer',
                    opacity: loading || !password || !confirmPassword ? 0.7 : 1,
                    boxShadow: '0 4px 18px rgba(249, 115, 22, 0.4)',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center'
                  }}
                >
                  {loading ? 'Guardando nueva contraseña...' : 'Actualizar e Iniciar Sesión 🚀'}
                </button>
              </form>
            )}
          </div>

          <div style={{ textAlign: 'center' }}>
            <button
              type="button"
              onClick={() => navigate('/login')}
              style={{
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                fontSize: '12.5px',
                cursor: 'pointer',
                textDecoration: 'underline'
              }}
            >
              ← Volver al inicio de sesión
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}
