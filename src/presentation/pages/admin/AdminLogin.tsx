import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../data/supabase'
import { useAuth } from '../../../application/contexts/AuthContext'
import { applyTheme } from '../../../utils/themeManager'

export const AdminLogin: React.FC = () => {
  const navigate = useNavigate()
  const { config } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const nombreEdificio = config?.nombre_edificio || 'Domus Condominio'
  const logoUrl = config?.logo_url || null

  // Cargar correo recordado y sincronizar tema al montar
  useEffect(() => {
    const saved = localStorage.getItem('condominio_saved_admin_email')
    if (saved) {
      setEmail(saved)
    }
    if (config?.color_primario) {
      applyTheme(config.color_primario)
    }
  }, [config?.color_primario])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const cleanEmail = email.trim()

    // Guardar o limpiar email recordado
    if (rememberMe) {
      localStorage.setItem('condominio_saved_admin_email', cleanEmail)
    } else {
      localStorage.removeItem('condominio_saved_admin_email')
    }

    try {
      // 1. Autenticar con Supabase Auth real
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      })

      if (authError || !authData.user) {
        setError('Credenciales incorrectas. Verifica tus datos de acceso.')
        setLoading(false)
        return
      }

      // 2. Verificar que el usuario tiene rol de administrador en la tabla perfiles
      const { data: perfil, error: perfilError } = await supabase
        .from('perfiles')
        .select('rol')
        .eq('id', authData.user.id)
        .single()

      if (perfilError || !perfil) {
        await supabase.auth.signOut()
        setError('No tienes perfil de administración registrado en este condominio.')
        setLoading(false)
        return
      }

      if (perfil.rol !== 'administrador') {
        await supabase.auth.signOut()
        setError('Tu cuenta no tiene privilegios de administrador.')
        setLoading(false)
        return
      }

      // 3. Es administrador verificado → redirigir al panel
      navigate('/admin', { replace: true })

    } catch (err: any) {
      setError(err?.message || 'Error de conexión con el servidor. Intenta de nuevo.')
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#07090e',
      backgroundImage: 'radial-gradient(ellipse at 50% 20%, rgba(255, 255, 255, 0.03) 0%, rgba(0, 0, 0, 0) 70%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      padding: '24px',
      boxSizing: 'border-box'
    }}>
      <style>{`
        @keyframes adminGlowPulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 0.9; transform: scale(1.03); }
        }
        .admin-input-focus:focus {
          border-color: var(--color-accent, #f97316) !important;
          box-shadow: 0 0 0 3px var(--color-accent-light, rgba(249, 115, 22, 0.18)) !important;
          background-color: #0b0f19 !important;
        }
      `}</style>

      <div style={{ width: '100%', maxWidth: '420px' }}>
        
        {/* Header con Logo y Título */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            position: 'relative',
            width: '76px',
            height: '76px',
            margin: '0 auto 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <div style={{
              position: 'absolute',
              inset: '-6px',
              borderRadius: '26px',
              background: 'var(--color-brand-gradient, linear-gradient(135deg, #f97316 0%, #ea580c 100%))',
              opacity: 0.25,
              filter: 'blur(12px)',
              animation: 'adminGlowPulse 3s infinite ease-in-out'
            }} />
            
            <div style={{
              position: 'relative',
              width: '76px',
              height: '76px',
              borderRadius: '22px',
              backgroundColor: '#111622',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
              overflow: 'hidden'
            }}>
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: '34px' }}>🏢</span>
              )}
            </div>
          </div>

          <h1 style={{
            color: '#ffffff',
            fontSize: '22px',
            fontWeight: 800,
            letterSpacing: '-0.3px',
            margin: '0 0 6px'
          }}>
            {nombreEdificio}
          </h1>

          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 12px',
            borderRadius: '9999px',
            backgroundColor: 'var(--color-accent-light, rgba(249, 115, 22, 0.12))',
            border: '1px solid var(--border-accent, rgba(249, 115, 22, 0.3))',
            color: 'var(--color-accent, #f97316)',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.8px',
            textTransform: 'uppercase'
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--color-accent, #f97316)' }} />
            Panel Administrador · Restringido
          </div>
        </div>

        {/* Tarjeta del Formulario Principal */}
        <div style={{
          backgroundColor: '#111622',
          border: '1px solid #1e2638',
          borderRadius: '20px',
          padding: '30px 26px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)'
        }}>
          <form onSubmit={handleLogin}>
            
            {/* Campo Correo */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{
                display: 'block',
                color: '#cbd5e1',
                fontSize: '12px',
                fontWeight: 700,
                marginBottom: '7px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                Correo Electrónico
              </label>
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@condominio.com"
                disabled={loading}
                className="admin-input-focus"
                style={{
                  width: '100%',
                  backgroundColor: '#0a0d14',
                  border: '1px solid #232d42',
                  color: '#ffffff',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'all 0.2s ease'
                }}
              />
            </div>

            {/* Campo Contraseña */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{
                display: 'block',
                color: '#cbd5e1',
                fontSize: '12px',
                fontWeight: 700,
                marginBottom: '7px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                Contraseña de Seguridad
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={loading}
                  className="admin-input-focus"
                  style={{
                    width: '100%',
                    backgroundColor: '#0a0d14',
                    border: '1px solid #232d42',
                    color: '#ffffff',
                    padding: '12px 42px 12px 14px',
                    borderRadius: '10px',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'all 0.2s ease'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#64748b',
                    cursor: 'pointer',
                    fontSize: '16px',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {/* Recordar sesión */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '22px' }}>
              <input
                id="adminRemember"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                style={{
                  accentColor: 'var(--color-accent, #f97316)',
                  cursor: 'pointer',
                  width: '15px',
                  height: '15px'
                }}
              />
              <label htmlFor="adminRemember" style={{ fontSize: '12.5px', color: '#94a3b8', cursor: 'pointer' }}>
                Recordar en este equipo
              </label>
            </div>

            {/* Alerta de Error */}
            {error && (
              <div style={{
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                color: '#fca5a5',
                padding: '11px 14px',
                borderRadius: '10px',
                fontSize: '13px',
                marginBottom: '18px',
                lineHeight: 1.4,
                textAlign: 'center',
                fontWeight: 500
              }}>
                {error}
              </div>
            )}

            {/* Botón Ingresar */}
            <button
              type="submit"
              disabled={loading || !email || !password}
              style={{
                width: '100%',
                background: 'var(--color-brand-gradient, linear-gradient(135deg, #f97316 0%, #ea580c 100%))',
                color: '#ffffff',
                border: 'none',
                padding: '13px',
                borderRadius: '10px',
                fontSize: '15px',
                fontWeight: 800,
                cursor: loading || !email || !password ? 'not-allowed' : 'pointer',
                opacity: loading || !email || !password ? 0.7 : 1,
                boxShadow: 'var(--color-brand-shadow, 0 4px 18px rgba(249, 115, 22, 0.4))',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {loading ? (
                <>
                  <span style={{
                    width: '16px',
                    height: '16px',
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: '#fff',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite'
                  }} />
                  <span>Validando credenciales...</span>
                </>
              ) : (
                <span>Ingresar al Sistema Admin</span>
              )}
            </button>
          </form>
        </div>

        {/* Enlace para volver */}
        <div style={{ textAlign: 'center', marginTop: '22px' }}>
          <button
            type="button"
            onClick={() => navigate('/login')}
            style={{
              background: 'none',
              border: 'none',
              color: '#64748b',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'color 0.2s'
            }}
            onMouseOver={(e) => (e.target as HTMLElement).style.color = '#e2e8f0'}
            onMouseOut={(e) => (e.target as HTMLElement).style.color = '#64748b'}
          >
            <span>←</span>
            <span>Volver al portal de residentes</span>
          </button>
        </div>

      </div>
    </div>
  )
}
