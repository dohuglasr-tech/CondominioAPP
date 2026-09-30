import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../data/supabase'
import { useAuth } from '../../application/contexts/AuthContext'
import { AuthHeroPanel } from '../components/AuthHeroPanel'

export const ResetPassword: React.FC = () => {
  const navigate = useNavigate()
  const { config, refreshPerfil, clearPasswordRecovery } = useAuth()

  // Estados para formulario de nueva contraseña
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  
  const [loading, setLoading] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [hasValidSession, setHasValidSession] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Estados para solicitud de nuevo enlace o código OTP
  const [resendEmail, setResendEmail] = useState('')
  const [resendLoading, setResendLoading] = useState(false)
  const [resendSuccess, setResendSuccess] = useState(false)
  const [resendError, setResendError] = useState<string | null>(null)

  // Estado para verificar con código de 6 dígitos
  const [showOtpInput, setShowOtpInput] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [otpEmail, setOtpEmail] = useState('')
  const [otpLoading, setOtpLoading] = useState(false)
  const [otpError, setOtpError] = useState<string | null>(null)

  // ── 1. Verificar si hay sesión de recuperación válida ─────────────
  useEffect(() => {
    let mounted = true

    const verifySession = async () => {
      try {
        // A. Revisar si hay tokens en el hash de la URL (#access_token=...&type=recovery)
        if (window.location.hash) {
          const hash = window.location.hash.substring(1)
          const params = new URLSearchParams(hash)
          const accessToken = params.get('access_token')
          const refreshToken = params.get('refresh_token')
          const errorCode = params.get('error_code')

          if (accessToken && refreshToken) {
            const { data: setRes, error: sessionErr } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            })
            if (!sessionErr && setRes?.session && mounted) {
              sessionStorage.setItem('condominio_is_recovery', 'true')
              setHasValidSession(true)
              setCheckingSession(false)
              return
            }
          }

          // Si vino un error en el hash (ej: otp_expired porque ya fue consumido el token),
          // verificar si en el navegador ya quedó guardada la sesión activa
          if (errorCode) {
            const { data: { session } } = await supabase.auth.getSession()
            if (session && mounted) {
              sessionStorage.setItem('condominio_is_recovery', 'true')
              setHasValidSession(true)
              setCheckingSession(false)
              return
            }
          }
        }

        // B. Extraer código PKCE si vino por query params (?code=...)
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

        // C. Verificar si ya hay una sesión activa de Supabase
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

    // D. Escuchar eventos de autenticación
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED'))) {
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

  // ── 2. Guardar nueva contraseña ───────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!password || !confirmPassword) {
      setError('Por favor completa ambos campos de contraseña.')
      return
    }

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
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
        setError(updateErr.message || 'No se pudo actualizar la contraseña. Por favor solicita un nuevo enlace.')
        setLoading(false)
        return
      }

      // Marcar perfil como activo y clave cambiada
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

      clearPasswordRecovery?.()
      sessionStorage.removeItem('condominio_is_recovery')

      setSuccess(true)
      setTimeout(() => {
        navigate('/', { replace: true })
      }, 2000)
    } catch (err: any) {
      setError(err?.message || 'Error inesperado al guardar la contraseña.')
    } finally {
      setLoading(false)
    }
  }

  // ── 3. Reenviar enlace de recuperación ───────────────────────────
  const handleResendLink = async (e: React.FormEvent) => {
    e.preventDefault()
    const clean = resendEmail.trim().toLowerCase()
    if (!clean || !clean.includes('@')) {
      setResendError('Por favor ingresa un correo electrónico válido.')
      return
    }

    setResendLoading(true)
    setResendError(null)

    try {
      const redirectUrl = `${window.location.origin}/reset-password`
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(clean, {
        redirectTo: redirectUrl,
      })

      if (resetErr) {
        setResendError(resetErr.message || 'No se pudo enviar el correo de recuperación.')
        setResendLoading(false)
        return
      }

      setResendSuccess(true)
    } catch (err: any) {
      setResendError(err?.message || 'Error inesperado al enviar el enlace.')
    } finally {
      setResendLoading(false)
    }
  }

  // ── 4. Validar código de 6 dígitos recibido por correo ────────────
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanMail = otpEmail.trim().toLowerCase()
    const cleanCode = otpCode.trim()

    if (!cleanMail || !cleanCode) {
      setOtpError('Por favor ingresa tu correo y el código recibido.')
      return
    }

    setOtpLoading(true)
    setOtpError(null)

    try {
      const { data, error: otpErr } = await supabase.auth.verifyOtp({
        email: cleanMail,
        token: cleanCode,
        type: 'recovery',
      })

      if (otpErr) {
        setOtpError(otpErr.message || 'Código incorrecto o expirado.')
        setOtpLoading(false)
        return
      }

      if (data?.session) {
        sessionStorage.setItem('condominio_is_recovery', 'true')
        setHasValidSession(true)
      }
    } catch (err: any) {
      setOtpError(err?.message || 'Error verificando el código.')
    } finally {
      setOtpLoading(false)
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
              Establecer Contraseña
            </h1>
            <p style={{
              fontSize: '13.5px',
              color: '#94a3b8',
              margin: 0,
              lineHeight: 1.4
            }}>
              Crea tu nueva clave para acceder a tu cuenta de condominio.
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
                  Comprobando enlace de seguridad...
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
                  ¡Contraseña actualizada con éxito!
                </h3>
                <p style={{ color: '#94a3b8', fontSize: '13px', lineHeight: 1.5, margin: '0 0 20px' }}>
                  Tu nueva clave ha sido guardada. Estamos ingresando a tu cuenta...
                </p>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <div className="spinner spinner--sm"></div>
                </div>
              </div>
            ) : !hasValidSession ? (
              /* CASO: Enlace expirado o sin sesión activa */
              <div>
                <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                  <div style={{
                    width: '54px',
                    height: '54px',
                    borderRadius: '16px',
                    backgroundColor: 'rgba(239, 68, 68, 0.12)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '26px',
                    marginBottom: '12px'
                  }}>
                    ⚠️
                  </div>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#fff', margin: '0 0 6px' }}>
                    El enlace expiró o ya fue utilizado
                  </h3>
                  <p style={{ color: '#94a3b8', fontSize: '12.5px', lineHeight: 1.5, margin: 0 }}>
                    Por seguridad, los enlaces de recuperación solo funcionan una vez. Puedes solicitar uno nuevo o ingresar tu código a continuación:
                  </p>
                </div>

                {/* Alternar entre solicitar nuevo enlace o ingresar código */}
                <div style={{ display: 'flex', gap: '6px', marginBottom: '18px', backgroundColor: '#0a0d14', padding: '4px', borderRadius: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setShowOtpInput(false)}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 700,
                      border: 'none',
                      cursor: 'pointer',
                      backgroundColor: !showOtpInput ? '#f97316' : 'transparent',
                      color: !showOtpInput ? '#fff' : '#888',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    Nuevo Enlace
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowOtpInput(true)}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 700,
                      border: 'none',
                      cursor: 'pointer',
                      backgroundColor: showOtpInput ? '#f97316' : 'transparent',
                      color: showOtpInput ? '#fff' : '#888',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    Tengo un Código OTP
                  </button>
                </div>

                {!showOtpInput ? (
                  /* Formulario de reenvío de enlace */
                  resendSuccess ? (
                    <div style={{
                      backgroundColor: 'rgba(16, 185, 129, 0.12)',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      borderRadius: '10px',
                      padding: '16px',
                      color: '#34d399',
                      fontSize: '13px',
                      textAlign: 'center',
                      lineHeight: 1.4
                    }}>
                      <div style={{ fontSize: '24px', marginBottom: '6px' }}>✉️</div>
                      <strong>¡Nuevo enlace enviado!</strong>
                      <p style={{ margin: '6px 0 0', color: '#94a3b8', fontSize: '12px' }}>
                        Revisa la bandeja de entrada o spam de <strong>{resendEmail}</strong> y ábrelo directamente.
                      </p>
                    </div>
                  ) : (
                    <form onSubmit={handleResendLink}>
                      {resendError && (
                        <div style={{
                          backgroundColor: 'rgba(239, 68, 68, 0.12)',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          color: '#fca5a5',
                          padding: '10px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          marginBottom: '14px',
                          textAlign: 'center'
                        }}>
                          {resendError}
                        </div>
                      )}

                      <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px', textTransform: 'uppercase' }}>
                          Tu Correo Electrónico
                        </label>
                        <input
                          type="email"
                          required
                          placeholder="correo@ejemplo.com"
                          value={resendEmail}
                          onChange={(e) => setResendEmail(e.target.value)}
                          disabled={resendLoading}
                          style={{
                            width: '100%',
                            backgroundColor: '#0a0d14',
                            border: '1px solid #232d42',
                            borderRadius: '10px',
                            padding: '12px 14px',
                            color: '#fff',
                            fontSize: '14px',
                            outline: 'none',
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={resendLoading || !resendEmail}
                        style={{
                          width: '100%',
                          backgroundColor: '#f97316',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '10px',
                          padding: '12px',
                          fontSize: '14px',
                          fontWeight: 700,
                          cursor: resendLoading || !resendEmail ? 'not-allowed' : 'pointer',
                          opacity: resendLoading || !resendEmail ? 0.7 : 1,
                          boxShadow: '0 4px 18px rgba(249, 115, 22, 0.35)'
                        }}
                      >
                        {resendLoading ? 'Enviando...' : 'Enviar nuevo enlace 🚀'}
                      </button>
                    </form>
                  )
                ) : (
                  /* Formulario de código de 6 dígitos */
                  <form onSubmit={handleVerifyOtp}>
                    {otpError && (
                      <div style={{
                        backgroundColor: 'rgba(239, 68, 68, 0.12)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        color: '#fca5a5',
                        padding: '10px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        marginBottom: '14px',
                        textAlign: 'center'
                      }}>
                        {otpError}
                      </div>
                    )}

                    <div style={{ marginBottom: '14px' }}>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px', textTransform: 'uppercase' }}>
                        Correo Electrónico
                      </label>
                      <input
                        type="email"
                        required
                        placeholder="correo@ejemplo.com"
                        value={otpEmail}
                        onChange={(e) => setOtpEmail(e.target.value)}
                        disabled={otpLoading}
                        style={{
                          width: '100%',
                          backgroundColor: '#0a0d14',
                          border: '1px solid #232d42',
                          borderRadius: '10px',
                          padding: '12px 14px',
                          color: '#fff',
                          fontSize: '14px',
                          outline: 'none',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>

                    <div style={{ marginBottom: '18px' }}>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px', textTransform: 'uppercase' }}>
                        Código de 6 dígitos
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={8}
                        placeholder="123456"
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value)}
                        disabled={otpLoading}
                        style={{
                          width: '100%',
                          backgroundColor: '#0a0d14',
                          border: '1px solid #232d42',
                          borderRadius: '10px',
                          padding: '12px 14px',
                          color: '#f97316',
                          fontSize: '18px',
                          fontWeight: 800,
                          textAlign: 'center',
                          letterSpacing: '4px',
                          outline: 'none',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={otpLoading || !otpEmail || !otpCode}
                      style={{
                        width: '100%',
                        backgroundColor: '#f97316',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '10px',
                        padding: '12px',
                        fontSize: '14px',
                        fontWeight: 700,
                        cursor: otpLoading || !otpEmail || !otpCode ? 'not-allowed' : 'pointer',
                        opacity: otpLoading || !otpEmail || !otpCode ? 0.7 : 1
                      }}
                    >
                      {otpLoading ? 'Verificando código...' : 'Validar Código 🔑'}
                    </button>
                  </form>
                )}
              </div>
            ) : (
              /* CASO: Sesión de recuperación válida -> Formulario de nueva contraseña */
              <form onSubmit={handleSubmit}>
                <div style={{
                  backgroundColor: 'rgba(249, 115, 22, 0.1)',
                  border: '1px solid rgba(249, 115, 22, 0.25)',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  fontSize: '12.5px',
                  color: '#f97316',
                  marginBottom: '18px',
                  lineHeight: 1.4,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span>🔒</span>
                  <span>Ingresa la nueva contraseña para tu cuenta:</span>
                </div>

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
