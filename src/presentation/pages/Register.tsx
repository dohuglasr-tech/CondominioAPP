import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../data/supabase'

export function Register() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    email: '',
    password: '',
    apartamento: '',
    tipo: 'propio', // 'propio' | 'alquilado'
    cargaFamiliar: '',
    // Datos del propietario si es inquilino
    propietarioNombre: '',
    propietarioCedula: '',
    propietarioTelefono: '',
    propietarioEmail: '',
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

    const aptNum = form.apartamento.trim().toUpperCase()

    // Validar datos de inquilino si aplica
    if (form.tipo === 'alquilado') {
      if (!form.propietarioNombre.trim()) {
        setError('Por favor ingresa el nombre del propietario.')
        setLoading(false)
        return
      }
      if (!form.propietarioCedula.trim()) {
        setError('Por favor ingresa la cédula del propietario.')
        setLoading(false)
        return
      }
      if (!form.propietarioTelefono.trim()) {
        setError('Por favor ingresa el teléfono del propietario.')
        setLoading(false)
        return
      }
    }

    try {
      // 1. Verificar si el apartamento ya existe en la base de datos
      let aptId: string | null = null

      const { data: aptData, error: aptError } = await supabase
        .from('apartamentos')
        .select('id, numero')
        .ilike('numero', aptNum)
        .maybeSingle()

      if (aptError) {
        console.warn('[Register] Aviso al consultar apartamento:', aptError)
        if (aptError.code === '42501' || aptError.message?.includes('permission denied')) {
          setError('Permiso de base de datos denegado. Por favor ejecuta el script migration_v5.sql en Supabase SQL Editor.')
          setLoading(false)
          return
        }
      }

      if (aptData) {
        aptId = aptData.id

        // 2. Verificar que el apartamento NO esté ya reclamado por otro perfil
        const { data: existingProfile, error: profileCheckErr } = await supabase
          .from('perfiles')
          .select('id, nombre_completo')
          .eq('apartamento_id', aptData.id)
          .maybeSingle()

        if (profileCheckErr && profileCheckErr.code !== 'PGRST116') {
          console.warn('[Register] Aviso verificando perfil existente:', profileCheckErr)
        }

        if (existingProfile) {
          setError(
            `El apartamento ${form.apartamento} ya tiene un usuario registrado. ` +
            `Solo se permite un usuario por apartamento.`
          )
          setLoading(false)
          return
        }
      } else {
        // El apartamento no existía previamente, se crea automáticamente para que quede registrado
        const { data: newApt, error: createErr } = await supabase
          .from('apartamentos')
          .insert({
            numero: aptNum,
            alicuota: 0.015625,
            estado: 'habitado'
          })
          .select('id, numero')
          .maybeSingle()

        if (createErr) {
          console.warn('[Register] Aviso creando apartamento:', createErr)
        }
        if (newApt?.id) {
          aptId = newApt.id
        }
      }

      // 3. Registrar usuario en Supabase Auth
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: {
          data: {
            apartamento_num: aptNum,
            condicion: form.tipo,
            carga_familiar: form.cargaFamiliar,
          }
        }
      })

      if (signUpError) throw signUpError

      // 4. Guardar o actualizar perfil inmediatamente
      if (signUpData?.user) {
        const payload: Record<string, any> = {
          id: signUpData.user.id,
          rol: 'residente',
          estado_cuenta: 'activa',
          clave_cambiada: true,
          perfil_completo: false,
          condicion_habitacional: form.tipo,
          carga_familiar: parseInt(form.cargaFamiliar) || 1,
          apartamento_id: aptId,
        }

        if (form.tipo === 'alquilado') {
          payload.propietario_nombre = form.propietarioNombre.trim()
          payload.propietario_cedula = form.propietarioCedula.trim()
          payload.propietario_telefono = form.propietarioTelefono.trim()
          if (form.propietarioEmail.trim()) {
            payload.propietario_email = form.propietarioEmail.trim()
          }
        }

        const { error: upsertErr } = await supabase
          .from('perfiles')
          .upsert(payload, { onConflict: 'id' })

        if (upsertErr) {
          console.error('[Register] Error guardando perfil:', upsertErr.message)
        }
      }

      // 5. Redireccionar o mostrar éxito
      if (signUpData?.session) {
        navigate('/') // Redirige a completar perfil o dashboard
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
      fontFamily: "'Inter', sans-serif",
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      boxSizing: 'border-box' as const,
    },
    header: {
      textAlign: 'center' as const,
      marginBottom: '32px',
    },
    logo: {
      fontSize: '48px',
      marginBottom: '12px',
    },
    title: {
      fontSize: '28px',
      fontWeight: 800,
      color: '#ffffff',
      margin: '0 0 8px 0',
      letterSpacing: '-0.5px',
    },
    subtitle: {
      fontSize: '14px',
      color: '#888888',
      margin: 0,
    },
    formBox: {
      backgroundColor: '#141414',
      border: '1px solid #1e1e1e',
      borderRadius: '16px',
      padding: '32px',
      width: '100%',
      maxWidth: '440px',
      boxSizing: 'border-box' as const,
      boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
    },
    label: {
      display: 'block',
      fontSize: '13px',
      fontWeight: 600,
      color: '#ffffff',
      marginBottom: '8px',
    },
    input: {
      width: '100%',
      backgroundColor: '#050505',
      border: '1px solid #2a2a2a',
      borderRadius: '8px',
      padding: '12px 14px',
      color: '#ffffff',
      fontSize: '14px',
      boxSizing: 'border-box' as const,
      outline: 'none',
      transition: 'border-color 0.2s',
    },
    button: {
      width: '100%',
      backgroundColor: '#f97316',
      color: '#ffffff',
      border: 'none',
      borderRadius: '8px',
      padding: '14px',
      fontSize: '14px',
      fontWeight: 700,
      cursor: 'pointer',
      marginTop: '10px',
      transition: 'background-color 0.2s',
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
      maxWidth: '440px',
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
    },
    ownerBox: {
      backgroundColor: 'rgba(59,130,246,0.06)',
      border: '1px solid rgba(59,130,246,0.25)',
      borderRadius: '12px',
      padding: '16px',
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '14px',
      animation: 'fadeIn 0.3s ease-in-out',
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
              Revisa tu correo <strong>{form.email}</strong> para confirmar tu cuenta y luego inicia sesión.
            </p>
            <button style={styles.button} onClick={() => navigate('/login')}>Ir al Login</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.logo}>🏢</div>
        <h1 style={styles.title}>Crear Cuenta</h1>
        <p style={styles.subtitle}>Portal de Gestión Residencial</p>
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

          {/* Menú desplegable cuando es Inquilino */}
          {form.tipo === 'alquilado' && (
            <div style={styles.ownerBox}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px' }}>📋</span>
                <span style={{ color: '#93c5fd', fontSize: '13px', fontWeight: 700 }}>
                  Datos del Propietario del Apartamento
                </span>
              </div>
              <p style={{ color: '#94a3b8', fontSize: '12px', margin: 0, lineHeight: 1.4 }}>
                Como inquilino, debes indicar la información del dueño del inmueble:
              </p>

              <div>
                <label style={{ ...styles.label, fontSize: '12px', color: '#cbd5e1' }}>Nombre del Propietario *</label>
                <input
                  name="propietarioNombre"
                  placeholder="Nombre y Apellido"
                  style={styles.input}
                  value={form.propietarioNombre}
                  onChange={handleChange}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ ...styles.label, fontSize: '12px', color: '#cbd5e1' }}>Cédula *</label>
                  <input
                    name="propietarioCedula"
                    placeholder="V-12345678"
                    style={styles.input}
                    value={form.propietarioCedula}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div>
                  <label style={{ ...styles.label, fontSize: '12px', color: '#cbd5e1' }}>Teléfono *</label>
                  <input
                    name="propietarioTelefono"
                    placeholder="0414-1234567"
                    style={styles.input}
                    value={form.propietarioTelefono}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>

              <div>
                <label style={{ ...styles.label, fontSize: '12px', color: '#cbd5e1' }}>Correo del Propietario (opcional)</label>
                <input
                  name="propietarioEmail"
                  type="email"
                  placeholder="propietario@correo.com"
                  style={styles.input}
                  value={form.propietarioEmail}
                  onChange={handleChange}
                />
              </div>
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
        ¿Tu apartamento aparece como ya registrado o tienes dudas?<br />
        Comunícate con la <strong>administración del edificio</strong> para recibir ayuda.
      </div>

    </div>
  )
}
