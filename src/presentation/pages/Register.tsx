import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../data/supabase'

export function Register() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    email: '',
    password: '',
    apartamento: '',
    tipo: 'propio',
    cargaFamiliar: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // 1. Verificar que el apartamento existe en la base de datos
      const { data: aptData, error: aptError } = await supabase
        .from('apartamentos')
        .select('id, numero')
        .eq('numero', form.apartamento.trim())
        .maybeSingle()

      if (aptError) {
        setError('Error al verificar el apartamento. Intente de nuevo.')
        setLoading(false)
        return
      }

      if (!aptData) {
        setError(`El apartamento ${form.apartamento} no está registrado en el sistema. Contacta a la administración.`)
        setLoading(false)
        return
      }

      // 2. Verificar que el apartamento NO esté ya reclamado por otro perfil
      const { data: existingProfile, error: profileCheckErr } = await supabase
        .from('perfiles')
        .select('id, nombre_completo')
        .eq('apartamento_id', aptData.id)
        .maybeSingle()

      if (profileCheckErr) {
        setError('Error al verificar el apartamento. Intente de nuevo.')
        setLoading(false)
        return
      }

      if (existingProfile) {
        setError(
          `El apartamento ${form.apartamento} ya tiene un usuario registrado. ` +
          `Si crees que es un error, comunícate con la administración.`
        )
        setLoading(false)
        return
      }

      // 3. Registrar usuario en Supabase Auth
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: {
          data: {
            apartamento_num: form.apartamento.trim(),
            condicion: form.tipo,
            carga_familiar: form.cargaFamiliar,
          }
        }
      })

      if (signUpError) throw signUpError

      // 4. Si se creó el usuario, esperar brevemente a que el trigger genere el perfil
      //    y luego actualizar el perfil con los datos correctos y vincular el apartamento.
      if (signUpData?.user) {
        // Pequeño delay para que el trigger de Supabase cree el perfil primero
        await new Promise(resolve => setTimeout(resolve, 1500))

        const { error: updateErr } = await supabase
          .from('perfiles')
          .update({
            estado_cuenta: 'activa',
            clave_cambiada: true,           // evita la pantalla de cambio de contraseña
            perfil_completo: false,          // fuerza el flujo de completar perfil
            condicion_habitacional: form.tipo,
            carga_familiar: parseInt(form.cargaFamiliar) || 1,
            apartamento_id: aptData.id,      // vincular el apartamento directamente
          })
          .eq('id', signUpData.user.id)

        if (updateErr) {
          console.error('[Register] Error actualizando perfil:', updateErr.message)
        }
      }

      // 5. Si la confirmación de email está desactivada → sesión inmediata
      //    El AuthContext detectará perfil_completo=false → redirige a /completar-perfil
      if (signUpData?.session) {
        navigate('/')  // PrivateRoute lo redirigirá a /completar-perfil automáticamente
      } else {
        setSuccess(true)
      }

    } catch (err: any) {
      if (err.message?.includes('User already registered')) {
        setError('Ya existe una cuenta con este correo electrónico.')
      } else {
        setError(err.message || 'Error al registrar la cuenta. Intente nuevamente.')
      }
    } finally {
      setLoading(false)
    }
  }

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
    headerBox: { textAlign: 'center' as const, marginBottom: '32px' },
    title: { color: '#ffffff', fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' },
    subtitle: { color: '#888888', fontSize: '14px' },
    linkOrange: { color: '#f97316', cursor: 'pointer', textDecoration: 'none', fontWeight: 600 },
    formBox: {
      backgroundColor: '#1a1a1a',
      padding: '40px',
      borderRadius: '16px',
      width: '100%',
      maxWidth: '420px',
      boxSizing: 'border-box' as const,
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '20px',
      border: '1px solid #2a2a2a',
    },
    label: { display: 'block', color: '#ffffff', fontSize: '14px', fontWeight: 600, marginBottom: '8px' },
    input: {
      width: '100%',
      backgroundColor: '#000000',
      border: '1px solid #2a2a2a',
      color: '#ffffff',
      padding: '12px 16px',
      borderRadius: '8px',
      fontSize: '14px',
      outline: 'none',
      transition: 'border-color 0.2s',
      boxSizing: 'border-box' as const,
    },
    button: {
      width: '100%',
      backgroundColor: loading ? '#a3520a' : '#f97316',
      color: '#ffffff',
      border: 'none',
      padding: '14px',
      borderRadius: '8px',
      fontSize: '16px',
      fontWeight: 'bold',
      cursor: loading ? 'not-allowed' : 'pointer',
      transition: 'background-color 0.2s',
      marginTop: '10px'
    },
    errorBox: {
      backgroundColor: '#ef444420',
      color: '#ef4444',
      padding: '12px',
      borderRadius: '8px',
      fontSize: '13px',
      border: '1px solid #ef444440',
      lineHeight: 1.5,
    },
    helpBox: {
      backgroundColor: '#1e1e1e',
      padding: '16px',
      borderRadius: '8px',
      fontSize: '12px',
      color: '#aaa',
      marginTop: '24px',
      textAlign: 'center' as const,
      border: '1px dashed #333',
      maxWidth: '420px',
      width: '100%',
    },
    infoBox: {
      backgroundColor: 'rgba(249,115,22,0.06)',
      border: '1px solid rgba(249,115,22,0.2)',
      borderRadius: '10px',
      padding: '12px 14px',
      fontSize: '12px',
      color: '#f97316',
      lineHeight: 1.6,
    }
  }

  if (success) {
    return (
      <div style={styles.container}>
        <div style={styles.formBox}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
            <h2 style={{ color: '#fff', marginBottom: '12px' }}>¡Registro Exitoso!</h2>
            <p style={{ color: '#888', fontSize: '14px', lineHeight: '1.5', marginBottom: '24px' }}>
              Revisa tu correo <strong>{form.email}</strong> para confirmar tu cuenta y luego completa tu perfil.
            </p>
            <button style={styles.button} onClick={() => navigate('/login')}>Ir al Login</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.headerBox}>
        <h1 style={styles.title}>Crea tu cuenta</h1>
        <p style={styles.subtitle}>
          ¿Ya tienes una cuenta? <span style={styles.linkOrange} onClick={() => navigate('/login')}>Inicia sesión aquí</span>
        </p>
      </div>

      <div style={styles.formBox}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {error && <div style={styles.errorBox}>{error}</div>}

          <div style={styles.infoBox}>
            🏢 Al registrarte, recibirás acceso al portal de gestión del edificio.
            Solo se permite <strong>un usuario por apartamento</strong>.
          </div>

          <div>
            <label style={styles.label}>Correo Electrónico Personal</label>
            <input
              name="email"
              type="email"
              placeholder="tu@correo.com"
              style={styles.input}
              value={form.email}
              onChange={handleChange}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={styles.label}>Nº Apartamento</label>
              <input
                name="apartamento"
                placeholder="Ej. 501"
                style={styles.input}
                value={form.apartamento}
                onChange={handleChange}
                required
              />
            </div>
            <div>
              <label style={styles.label}>Condición</label>
              <select
                name="tipo"
                style={{ ...styles.input, cursor: 'pointer' }}
                value={form.tipo}
                onChange={handleChange}
              >
                <option value="propio">🏡 Propietario</option>
                <option value="alquilado">🔑 Inquilino</option>
              </select>
            </div>
          </div>

          {/* Aviso si es inquilino: llenarás los datos del propietario después */}
          {form.tipo === 'alquilado' && (
            <div style={{
              backgroundColor: 'rgba(59,130,246,0.08)',
              border: '1px solid rgba(59,130,246,0.25)',
              borderRadius: '10px',
              padding: '12px 14px',
              fontSize: '12px',
              color: '#93c5fd',
              lineHeight: 1.6,
            }}>
              📋 Como <strong>inquilino</strong>, después de registrarte deberás completar también los datos del propietario del apartamento (nombre, cédula y teléfono).
            </div>
          )}

          <div>
            <label style={styles.label}>Carga Familiar (Cantidad de habitantes)</label>
            <input
              name="cargaFamiliar"
              type="number"
              min="1"
              placeholder="Ej. 3"
              style={styles.input}
              value={form.cargaFamiliar}
              onChange={handleChange}
              required
            />
          </div>

          <div>
            <label style={styles.label}>Contraseña</label>
            <input
              name="password"
              type="password"
              placeholder="••••••••"
              style={styles.input}
              value={form.password}
              onChange={handleChange}
              required
              minLength={6}
            />
          </div>

          <button type="submit" style={styles.button} disabled={loading}>
            {loading ? '⏳ Verificando...' : 'Registrarse'}
          </button>

        </form>
      </div>

      <div style={styles.helpBox}>
        ¿Tu apartamento aparece como ya registrado o no existe en el sistema?<br />
        Comunícate con la <strong>administración del edificio</strong> para recibir ayuda.
      </div>

    </div>
  )
}
