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
      // 1. Check if apartment already exists and is claimed (basic verification)
      const { data: aptData } = await supabase
        .from('apartamentos')
        .select('id, propietario_nombre')
        .eq('numero', form.apartamento)
        .single()
      
      // We will allow registration even if not found in table yet, as the trigger handles basic creation,
      // but in a strict system we'd enforce it. For now, we just check if it's claimed by checking perfiles.
      const { data: existingProfile } = await supabase
        .from('perfiles')
        .select('id')
        .eq('apartamento_id', aptData?.id)
        .maybeSingle()

      if (existingProfile) {
        setError(`El apartamento ${form.apartamento} ya se encuentra registrado. Si es un error, por favor escribe a administracion para ayudarte con tu registro.`)
        setLoading(false)
        return
      }

      // 2. Sign up user
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            apartamento_num: form.apartamento,
            condicion: form.tipo,
            carga_familiar: form.cargaFamiliar
          }
        }
      })

      if (signUpError) throw signUpError

      if (signUpData?.user) {
        const { error: profileError } = await supabase.from('perfiles').update({
          estado_cuenta: 'activa',
          clave_cambiada: true
        }).eq('id', signUpData.user.id)
        
        if (profileError) {
          console.error("Error actualizando perfil tras registro:", profileError)
        }
      }

      setSuccess(true)
    } catch (err: any) {
      setError(err.message || 'Error al registrar la cuenta. Intente nuevamente.')
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
    formBox: { backgroundColor: '#1a1a1a', padding: '40px', borderRadius: '16px', width: '100%', maxWidth: '400px', boxSizing: 'border-box' as const, display: 'flex', flexDirection: 'column' as const, gap: '20px' },
    label: { display: 'block', color: '#ffffff', fontSize: '14px', fontWeight: 600, marginBottom: '8px' },
    input: { width: '100%', backgroundColor: '#000000', border: '1px solid #2a2a2a', color: '#ffffff', padding: '12px 16px', borderRadius: '8px', fontSize: '14px', outline: 'none', transition: 'border-color 0.2s', boxSizing: 'border-box' as const },
    button: { width: '100%', backgroundColor: '#f97316', color: '#ffffff', border: 'none', padding: '14px', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', transition: 'background-color 0.2s', marginTop: '10px' },
    errorBox: { backgroundColor: '#ef444420', color: '#ef4444', padding: '12px', borderRadius: '8px', fontSize: '13px', border: '1px solid #ef444440' },
    helpBox: { backgroundColor: '#1e1e1e', padding: '16px', borderRadius: '8px', fontSize: '12px', color: '#aaa', marginTop: '24px', textAlign: 'center' as const, border: '1px dashed #333' }
  }

  if (success) {
    return (
      <div style={styles.container}>
        <div style={styles.formBox}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
            <h2 style={{ color: '#fff', marginBottom: '12px' }}>¡Registro Exitoso!</h2>
            <p style={{ color: '#888', fontSize: '14px', lineHeight: '1.5', marginBottom: '24px' }}>
              Se ha enviado un correo electrónico a <strong>{form.email}</strong> con información importante sobre el edificio (normas de convivencia, cuentas para pago, etc.).
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

          <div>
            <label style={styles.label}>Correo Electrónico Personal</label>
            <input name="email" type="email" placeholder="tu@correo.com" style={styles.input} value={form.email} onChange={handleChange} required />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={styles.label}>Nº Apartamento</label>
              <input name="apartamento" placeholder="Ej. 501" style={styles.input} value={form.apartamento} onChange={handleChange} required />
            </div>
            <div>
              <label style={styles.label}>Condición</label>
              <select name="tipo" style={styles.input} value={form.tipo} onChange={handleChange}>
                <option value="propio">Propietario</option>
                <option value="alquilado">Inquilino</option>
              </select>
            </div>
          </div>

          <div>
            <label style={styles.label}>Carga Familiar (Cantidad de habitantes)</label>
            <input name="cargaFamiliar" type="number" min="1" placeholder="Ej. 3" style={styles.input} value={form.cargaFamiliar} onChange={handleChange} required />
          </div>

          <div>
            <label style={styles.label}>Contraseña</label>
            <input name="password" type="password" placeholder="••••••••" style={styles.input} value={form.password} onChange={handleChange} required minLength={6} />
          </div>

          <button type="submit" style={styles.button} disabled={loading}>
            {loading ? 'Verificando...' : 'Registrarse'}
          </button>

        </form>
      </div>

      <div style={styles.helpBox}>
        ¿Tienes problemas para registrarte o tu apartamento aparece como ya registrado?<br/>
        Escribe a <strong>administracion@torre5.com</strong> o comunícate vía WhatsApp al <strong>0414-1234567</strong> para recibir ayuda.
      </div>

    </div>
  )
}
