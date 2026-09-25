import React, { useState } from 'react'
import { useAuth } from '../../application/contexts/AuthContext'
import { useNavigate, useLocation } from 'react-router-dom'

export function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as { registered?: boolean; email?: string } | null

  const [email, setEmail] = useState(state?.email || '')
  const [password, setPassword] = useState('')
  const [registeredSuccess, setRegisteredSuccess] = useState(!!state?.registered)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const { signIn } = useAuth()

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

  // Estilos exactos para igualar la imagen de referencia
  const styles = {
    container: {
      minHeight: '100vh',
      backgroundColor: '#0a0a0a',
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      fontFamily: 'Inter, sans-serif'
    },
    headerBox: {
      textAlign: 'center' as const,
      marginBottom: '32px'
    },
    title: {
      color: '#ffffff',
      fontSize: '24px',
      fontWeight: 'bold',
      marginBottom: '8px'
    },
    subtitle: {
      color: '#888888',
      fontSize: '14px'
    },
    linkOrange: {
      color: '#f97316',
      cursor: 'pointer',
      textDecoration: 'none',
      fontWeight: 500
    },
    card: {
      backgroundColor: '#1c1c1c',
      borderRadius: '16px',
      padding: '40px 32px',
      width: '100%',
      maxWidth: '420px',
      boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
      border: '1px solid #2a2a2a'
    },
    label: {
      display: 'block',
      color: '#ffffff',
      fontSize: '13px',
      fontWeight: 600,
      marginBottom: '8px'
    },
    input: {
      width: '100%',
      backgroundColor: '#050505',
      border: '1px solid #2a2a2a',
      borderRadius: '8px',
      padding: '14px 16px',
      color: '#ffffff',
      fontSize: '14px',
      outline: 'none',
      marginBottom: '24px',
      transition: 'border-color 0.2s'
    },
    optionsRow: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '32px',
      fontSize: '13px'
    },
    checkboxRow: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      color: '#888888'
    },
    checkbox: {
      accentColor: '#f97316',
      width: '16px',
      height: '16px',
      cursor: 'pointer'
    },
    button: {
      width: '100%',
      backgroundColor: '#f97316',
      color: '#ffffff',
      border: 'none',
      borderRadius: '8px',
      padding: '14px',
      fontSize: '15px',
      fontWeight: 'bold',
      cursor: 'pointer',
      boxShadow: '0 4px 15px rgba(249, 115, 22, 0.4)',
      transition: 'all 0.2s',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center'
    },
    errorBox: {
      backgroundColor: 'rgba(220, 38, 38, 0.1)',
      border: '1px solid rgba(220, 38, 38, 0.3)',
      color: '#fca5a5',
      padding: '12px',
      borderRadius: '8px',
      fontSize: '13px',
      marginBottom: '20px',
      textAlign: 'center' as const
    }
  }

  return (
    <div style={styles.container}>
      
      <div style={styles.headerBox} className="animate-slide-up">
        <h1 style={styles.title}>Inicia sesión en tu cuenta</h1>
        <p style={styles.subtitle}>
          ¿No tienes una cuenta? <span style={styles.linkOrange} onClick={() => navigate('/register')}>Regístrate aquí</span>
        </p>
      </div>

      <div style={styles.card} className="animate-slide-up">
        <form onSubmit={handleSubmit}>
          
          {registeredSuccess && (
            <div style={{
              backgroundColor: '#10b98118',
              color: '#10b981',
              border: '1px solid #10b98140',
              padding: '12px 14px',
              borderRadius: '8px',
              fontSize: '13px',
              marginBottom: '20px',
              lineHeight: 1.5,
              textAlign: 'center',
            }}>
              ✅ ¡Cuenta creada exitosamente! Ingresa tu contraseña para acceder al portal.
            </div>
          )}

          {error && (
            <div style={styles.errorBox}>
              {error}
            </div>
          )}

          <div>
            <label style={styles.label} htmlFor="email">Correo electrónico</label>
            <input
              id="email"
              type="email"
              placeholder="Ej. juan@correo.com"
              style={styles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              required
              onFocus={(e) => e.target.style.borderColor = '#f97316'}
              onBlur={(e) => e.target.style.borderColor = '#2a2a2a'}
            />
          </div>

          <div>
            <label style={styles.label} htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              style={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
              onFocus={(e) => e.target.style.borderColor = '#f97316'}
              onBlur={(e) => e.target.style.borderColor = '#2a2a2a'}
            />
          </div>

          <div style={styles.optionsRow}>
            <label style={styles.checkboxRow}>
              <input type="checkbox" style={styles.checkbox} />
              Recordarme
            </label>
            <a href="#" style={styles.linkOrange}>¿Olvidaste tu contraseña?</a>
          </div>

          <button 
            type="submit" 
            style={styles.button}
            disabled={loading || !email || !password}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#ea580c'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#f97316'}
          >
            {loading ? <span className="spinner spinner--sm"></span> : 'Ingresar'}
          </button>
        </form>
      </div>

      <div 
        onClick={() => window.open('/app-release.apk', '_blank')}
        style={{
          marginTop: '24px',
          backgroundColor: '#1c1c1c', border: '1px solid #2a2a2a', borderRadius: '12px',
          padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '12px',
          color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
          transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
        }}
        onMouseOver={(e) => { e.currentTarget.style.borderColor = '#10b981'; e.currentTarget.style.color = '#10b981' }}
        onMouseOut={(e) => { e.currentTarget.style.borderColor = '#2a2a2a'; e.currentTarget.style.color = '#fff' }}
      >
        <span style={{ fontSize: '20px' }}>🤖</span>
        Descargar App para Android
      </div>

      <div 
        onClick={() => navigate('/admin-login')} 
        style={{ marginTop: '24px', color: '#333', fontSize: '11px', cursor: 'pointer' }}
        onMouseOver={(e) => e.currentTarget.style.color = '#666'}
        onMouseOut={(e) => e.currentTarget.style.color = '#333'}
      >
        v1.0
      </div>

    </div>
  )
}
