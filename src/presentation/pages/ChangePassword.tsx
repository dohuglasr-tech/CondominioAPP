import React, { useState, useEffect } from 'react'
import { useAuth } from '../../application/contexts/AuthContext'
import { useNavigate } from 'react-router-dom'

export function ChangePassword() {
  const { needsPasswordChange, signOut, updatePassword } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!needsPasswordChange) {
      navigate('/', { replace: true })
    }
  }, [needsPasswordChange, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password || !confirmPassword) return

    if (!email.includes('@')) {
      setError('Por favor ingresa un correo electrónico válido')
      return
    }

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres')
      return
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden')
      return
    }

    setLoading(true)
    setError(null)

    const { error: updateError } = await updatePassword(password, email)

    if (updateError) {
      setError(updateError)
      setLoading(false)
      return
    }
      
    setSuccess(true)
    setTimeout(() => {
      window.location.href = '/'
    }, 2000)
  }

  // Estilos base de la nueva línea de diseño oscuro sólido
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
      fontSize: '14px',
      maxWidth: '380px',
      margin: '0 auto',
      lineHeight: '1.5'
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
      alignItems: 'center',
      marginBottom: '12px'
    },
    buttonGhost: {
      width: '100%',
      backgroundColor: 'transparent',
      color: '#888888',
      border: '1px solid #2a2a2a',
      borderRadius: '8px',
      padding: '14px',
      fontSize: '14px',
      fontWeight: 600,
      cursor: 'pointer',
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
    },
    successBox: {
      textAlign: 'center' as const,
      color: '#fff'
    }
  }

  if (success) {
    return (
      <div style={styles.container}>
        <div style={styles.card} className="animate-fade-in-scale">
          <div style={styles.successBox}>
            <div style={{ fontSize: '48px', marginBottom: '16px', color: '#10b981' }}>✓</div>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '8px' }}>¡Configuración Completa!</h2>
            <p style={{ color: '#888888', fontSize: '14px' }}>Tu cuenta ha sido asegurada. Redirigiendo...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      
      <div style={styles.headerBox} className="animate-slide-up">
        <h1 style={styles.title}>Seguridad de tu Cuenta</h1>
        <p style={styles.subtitle}>
          Debes cambiar la contraseña que te asignaron y dejarnos tu correo para enviarte comprobantes.
        </p>
      </div>

      <div style={styles.card} className="animate-slide-up">
        <form onSubmit={handleSubmit}>
          
          {error && (
            <div style={styles.errorBox}>
              {error}
            </div>
          )}

          <div>
            <label style={styles.label} htmlFor="email">Correo Electrónico Personal</label>
            <input
              id="email"
              type="email"
              placeholder="tu@email.com"
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
            <label style={styles.label} htmlFor="new-password">Nueva Contraseña</label>
            <input
              id="new-password"
              type="password"
              placeholder="Mínimo 6 caracteres"
              style={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
              onFocus={(e) => e.target.style.borderColor = '#f97316'}
              onBlur={(e) => e.target.style.borderColor = '#2a2a2a'}
            />
          </div>

          <div>
            <label style={styles.label} htmlFor="confirm-password">Confirmar Contraseña</label>
            <input
              id="confirm-password"
              type="password"
              placeholder="Repite tu contraseña"
              style={styles.input}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={loading}
              required
              onFocus={(e) => e.target.style.borderColor = '#f97316'}
              onBlur={(e) => e.target.style.borderColor = '#2a2a2a'}
            />
          </div>

          <button 
            type="submit" 
            style={styles.button}
            disabled={loading || !email || !password || !confirmPassword}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#ea580c'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#f97316'}
          >
            {loading ? <span className="spinner spinner--sm"></span> : 'Guardar y Continuar'}
          </button>
          
          <button 
            type="button" 
            onClick={() => signOut()}
            style={styles.buttonGhost}
            disabled={loading}
            onMouseOver={(e) => { e.currentTarget.style.borderColor = '#444'; e.currentTarget.style.color = '#fff' }}
            onMouseOut={(e) => { e.currentTarget.style.borderColor = '#2a2a2a'; e.currentTarget.style.color = '#888' }}
          >
            Cerrar Sesión
          </button>

        </form>
      </div>

    </div>
  )
}
