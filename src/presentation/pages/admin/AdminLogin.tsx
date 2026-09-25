import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const ADMIN_EMAIL = 'admin@torre5.com'
const ADMIN_PASSWORD = 'admin2026' // En producción esto va en Supabase con rol

export const AdminLogin: React.FC = () => {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    
    setTimeout(() => {
      if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
        localStorage.setItem('admin_auth', 'true')
        // Hard redirect so AdminRoute reads the new localStorage value
        window.location.href = '/admin'
      } else {
        setError('Credenciales incorrectas. Verifica tus datos.')
        setLoading(false)
      }
    }, 800)
  }

  return (
    <div style={{
      minHeight: '100vh', backgroundColor: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Inter, sans-serif', padding: '20px'
    }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🏢</div>
          <h1 style={{ color: '#fff', fontSize: '24px', fontWeight: 800, margin: 0 }}>Torre 5</h1>
          <p style={{ color: '#666', fontSize: '14px', marginTop: '6px' }}>Panel de Administración</p>
          <span style={{
            display: 'inline-block', marginTop: '10px',
            backgroundColor: '#f9731620', color: '#f97316',
            fontSize: '11px', fontWeight: 700, padding: '4px 12px', borderRadius: '999px',
            border: '1px solid #f9731640'
          }}>ACCESO RESTRINGIDO</span>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} style={{ backgroundColor: '#141414', border: '1px solid #1e1e1e', borderRadius: '16px', padding: '32px' }}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', color: '#888', fontSize: '13px', marginBottom: '8px' }}>Correo de Administrador</label>
            <input
              type="email" required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@torre5.com"
              style={{ width: '100%', backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a', color: '#fff', padding: '12px', borderRadius: '8px', fontSize: '14px' }}
            />
          </div>
          <div style={{ marginBottom: '28px' }}>
            <label style={{ display: 'block', color: '#888', fontSize: '13px', marginBottom: '8px' }}>Contraseña</label>
            <input
              type="password" required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{ width: '100%', backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a', color: '#fff', padding: '12px', borderRadius: '8px', fontSize: '14px' }}
            />
          </div>

          {error && (
            <div style={{ backgroundColor: '#ef444415', border: '1px solid #ef444430', color: '#fca5a5', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{
            width: '100%', backgroundColor: '#f97316', color: '#fff', border: 'none',
            padding: '14px', borderRadius: '10px', fontSize: '16px', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1, transition: 'all 0.2s'
          }}>
            {loading ? 'Verificando...' : 'Ingresar'}
          </button>
        </form>

        <p style={{ textAlign: 'center', color: '#555', fontSize: '12px', marginTop: '20px' }}>
          <button onClick={() => navigate('/login')} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', textDecoration: 'underline', fontSize: '12px' }}>
            ← Volver al acceso de residentes
          </button>
        </p>
      </div>
    </div>
  )
}
