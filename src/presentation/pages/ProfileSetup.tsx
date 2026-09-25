import React, { useState } from 'react'
import { supabase } from '../../data/supabase'
import { useAuth } from '../../application/contexts/AuthContext'

interface ProfileForm {
  // Personal
  nombre_completo: string
  cedula: string
  telefono: string
  // Apartamento
  condicion_habitacional: 'propio' | 'alquilado'
  carga_familiar: string
  // Propietario (solo si alquilado)
  propietario_nombre: string
  propietario_cedula: string
  propietario_telefono: string
  propietario_email: string
}

const EMPTY: ProfileForm = {
  nombre_completo: '', cedula: '', telefono: '',
  condicion_habitacional: 'propio', carga_familiar: '',
  propietario_nombre: '', propietario_cedula: '',
  propietario_telefono: '', propietario_email: '',
}

export const ProfileSetup: React.FC = () => {
  const { user, perfil, config, refreshPerfil } = useAuth()
  const p = perfil as any
  const c = config as any

  const aptoNumero = p?.apartamento?.numero || p?.apartamento_id || 'N/D'
  const edificioNombre = c?.nombre_edificio || 'Mi Edificio'
  const edificioRif = c?.rif || ''
  const edificioDireccion = c?.direccion || ''
  const edificioLogo = c?.logo_url || null

  // Pre-llenar la condición desde el perfil guardado en el registro
  const condicionInicial: 'propio' | 'alquilado' =
    p?.condicion_habitacional === 'alquilado' ? 'alquilado' : 'propio'

  const [form, setForm] = useState<ProfileForm>({
    ...EMPTY,
    condicion_habitacional: condicionInicial,
    carga_familiar: p?.carga_familiar?.toString() || '',
    propietario_nombre: p?.propietario_nombre || '',
    propietario_cedula: p?.propietario_cedula || '',
    propietario_telefono: p?.propietario_telefono || '',
    propietario_email: p?.propietario_email || '',
  })
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  React.useEffect(() => {
    if (p) {
      setForm(prev => ({
        ...prev,
        condicion_habitacional: p.condicion_habitacional === 'alquilado' ? 'alquilado' : (prev.condicion_habitacional || 'propio'),
        carga_familiar: p.carga_familiar ? p.carga_familiar.toString() : prev.carga_familiar,
        propietario_nombre: p.propietario_nombre || prev.propietario_nombre,
        propietario_cedula: p.propietario_cedula || prev.propietario_cedula,
        propietario_telefono: p.propietario_telefono || prev.propietario_telefono,
        propietario_email: p.propietario_email || prev.propietario_email,
        nombre_completo: p.nombre_completo || prev.nombre_completo,
        cedula: p.cedula || prev.cedula,
        telefono: p.telefono || prev.telefono,
      }))
    }
  }, [p])


  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const validateStep1 = () => {
    if (!form.nombre_completo.trim()) return 'El nombre completo es obligatorio.'
    if (!form.cedula.trim()) return 'La cédula es obligatoria.'
    if (!form.telefono.trim()) return 'El teléfono es obligatorio.'
    return null
  }

  const validateStep2 = () => {
    if (!form.carga_familiar || parseInt(form.carga_familiar) < 1) return 'La carga familiar debe ser al menos 1.'
    if (form.condicion_habitacional === 'alquilado') {
      if (!form.propietario_nombre.trim()) return 'El nombre del propietario es obligatorio.'
      if (!form.propietario_cedula.trim()) return 'La cédula del propietario es obligatoria.'
      if (!form.propietario_telefono.trim()) return 'El teléfono del propietario es obligatorio.'
    }
    return null
  }

  const handleNext = () => {
    setError(null)
    if (step === 1) {
      const err = validateStep1()
      if (err) { setError(err); return }
      setStep(2)
    } else if (step === 2) {
      const err = validateStep2()
      if (err) { setError(err); return }
      setStep(3)
    }
  }

  const handleSubmit = async () => {
    if (!user) return
    setSaving(true)
    setError(null)
    try {
      const payload: Record<string, any> = {
        nombre_completo: form.nombre_completo.trim(),
        cedula: form.cedula.trim(),
        telefono: form.telefono.trim(),
        condicion_habitacional: form.condicion_habitacional,
        carga_familiar: parseInt(form.carga_familiar),
        perfil_completo: true,
      }
      if (form.condicion_habitacional === 'alquilado') {
        payload.propietario_nombre = form.propietario_nombre.trim()
        payload.propietario_cedula = form.propietario_cedula.trim()
        payload.propietario_telefono = form.propietario_telefono.trim()
        payload.propietario_email = form.propietario_email.trim()
      }
      const { error: dbErr } = await supabase
        .from('perfiles')
        .update(payload)
        .eq('id', user.id)
      if (dbErr) throw dbErr
      await refreshPerfil()
    } catch (err: any) {
      setError(err.message || 'Error al guardar. Intenta de nuevo.')
      setSaving(false)
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', backgroundColor: '#0d0d0d',
    border: '1px solid #2a2a2a', color: '#fff',
    padding: '12px 14px', borderRadius: '10px', fontSize: '14px',
    outline: 'none', boxSizing: 'border-box',
  }
  const lbl: React.CSSProperties = {
    display: 'block', color: '#888', fontSize: '12px',
    fontWeight: 600, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px',
  }
  const grp: React.CSSProperties = { marginBottom: '16px' }

  const steps = ['Datos personales', 'Apartamento', 'Confirmar']

  return (
    <div style={{
      minHeight: '100vh', backgroundColor: '#0a0a0a',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px', fontFamily: 'Inter, sans-serif',
    }}>
      <div style={{ width: '100%', maxWidth: '500px' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '72px', height: '72px', borderRadius: '20px', margin: '0 auto 16px',
            background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
          }}>
            {edificioLogo
              ? <img src={edificioLogo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: '32px' }}>🏢</span>
            }
          </div>
          <h1 style={{ color: '#fff', fontSize: '22px', fontWeight: 800, margin: '0 0 4px' }}>
            Completa tu perfil
          </h1>
          <p style={{ color: '#666', fontSize: '13px', margin: 0 }}>
            {edificioNombre} · Apto {aptoNumero}
          </p>
        </div>

        {/* Step indicators */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '28px' }}>
          {steps.map((s, i) => (
            <div key={s} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{
                height: '3px', borderRadius: '99px',
                backgroundColor: i + 1 <= step ? '#f97316' : '#2a2a2a',
                transition: 'background-color 0.3s',
              }} />
              <span style={{
                fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px',
                color: i + 1 === step ? '#f97316' : i + 1 < step ? '#666' : '#333',
              }}>{s}</span>
            </div>
          ))}
        </div>

        {/* Card */}
        <div style={{
          backgroundColor: '#141414', border: '1px solid #1e1e1e',
          borderRadius: '18px', padding: '28px',
        }}>
          {error && (
            <div style={{
              backgroundColor: '#ef444418', color: '#ef4444',
              border: '1px solid #ef444430', padding: '12px 14px',
              borderRadius: '10px', fontSize: '13px', marginBottom: '20px',
            }}>
              {error}
            </div>
          )}

          {/* STEP 1: Datos personales */}
          {step === 1 && (
            <>
              <h2 style={{ color: '#fff', fontSize: '16px', fontWeight: 700, marginBottom: '20px', marginTop: 0 }}>
                👤 Tus datos personales
              </h2>
              <div style={grp}>
                <label style={lbl}>Nombre completo *</label>
                <input name="nombre_completo" value={form.nombre_completo} onChange={handleChange}
                  style={inp} placeholder="Ej. María García" autoFocus />
              </div>
              <div style={grp}>
                <label style={lbl}>Cédula de identidad *</label>
                <input name="cedula" value={form.cedula} onChange={handleChange}
                  style={inp} placeholder="Ej. V-12345678" />
              </div>
              <div style={grp}>
                <label style={lbl}>Teléfono *</label>
                <input name="telefono" value={form.telefono} onChange={handleChange}
                  style={inp} placeholder="Ej. 0414-1234567" />
              </div>
            </>
          )}

          {/* STEP 2: Apartamento */}
          {step === 2 && (
            <>
              <h2 style={{ color: '#fff', fontSize: '16px', fontWeight: 700, marginBottom: '8px', marginTop: 0 }}>
                🏠 Información del apartamento
              </h2>
              <div style={{
                backgroundColor: '#0d0d0d', border: '1px solid #2a2a2a',
                borderRadius: '10px', padding: '12px 14px', marginBottom: '20px',
                display: 'flex', alignItems: 'center', gap: '10px',
              }}>
                <span style={{ fontSize: '18px' }}>📍</span>
                <div>
                  <p style={{ color: '#fff', fontSize: '14px', fontWeight: 700, margin: 0 }}>Apartamento {aptoNumero}</p>
                  <p style={{ color: '#555', fontSize: '12px', margin: 0 }}>{edificioNombre}</p>
                </div>
              </div>
              <div style={grp}>
                <label style={lbl}>Condición habitacional *</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {(['propio', 'alquilado'] as const).map(opt => (
                    <button key={opt} type="button"
                      onClick={() => setForm(prev => ({ ...prev, condicion_habitacional: opt }))}
                      style={{
                        padding: '12px', borderRadius: '10px', border: '2px solid',
                        borderColor: form.condicion_habitacional === opt ? '#f97316' : '#2a2a2a',
                        backgroundColor: form.condicion_habitacional === opt ? 'rgba(249,115,22,0.08)' : 'transparent',
                        color: form.condicion_habitacional === opt ? '#f97316' : '#666',
                        fontSize: '13px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s',
                      }}>
                      {opt === 'propio' ? '🏡 Propietario' : '🔑 Inquilino'}
                    </button>
                  ))}
                </div>
              </div>
              <div style={grp}>
                <label style={lbl}>Carga familiar (habitantes) *</label>
                <input type="number" min="1" name="carga_familiar" value={form.carga_familiar}
                  onChange={handleChange} style={inp} placeholder="Ej. 3" />
              </div>

              {form.condicion_habitacional === 'alquilado' && (
                <>
                  <div style={{
                    borderTop: '1px solid #2a2a2a', paddingTop: '20px', marginTop: '8px', marginBottom: '16px',
                  }}>
                    <p style={{ color: '#f97316', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 16px' }}>
                      📋 Datos del propietario
                    </p>
                  </div>
                  <div style={grp}>
                    <label style={lbl}>Nombre del propietario *</label>
                    <input name="propietario_nombre" value={form.propietario_nombre} onChange={handleChange}
                      style={inp} placeholder="Nombre completo del propietario" />
                  </div>
                  <div style={grp}>
                    <label style={lbl}>Cédula del propietario *</label>
                    <input name="propietario_cedula" value={form.propietario_cedula} onChange={handleChange}
                      style={inp} placeholder="V-00000000" />
                  </div>
                  <div style={grp}>
                    <label style={lbl}>Teléfono del propietario *</label>
                    <input name="propietario_telefono" value={form.propietario_telefono} onChange={handleChange}
                      style={inp} placeholder="0414-0000000" />
                  </div>
                  <div style={grp}>
                    <label style={lbl}>Correo del propietario (opcional)</label>
                    <input type="email" name="propietario_email" value={form.propietario_email} onChange={handleChange}
                      style={inp} placeholder="propietario@email.com" />
                  </div>
                </>
              )}
            </>
          )}

          {/* STEP 3: Confirmar — solo lectura */}
          {step === 3 && (
            <>
              <h2 style={{ color: '#fff', fontSize: '16px', fontWeight: 700, marginBottom: '20px', marginTop: 0 }}>
                ✅ Confirma tu información
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '20px' }}>
                {[
                  ['Nombre', form.nombre_completo],
                  ['Cédula', form.cedula],
                  ['Teléfono', form.telefono],
                  ['Apartamento', aptoNumero],
                  ['Condición', form.condicion_habitacional === 'propio' ? 'Propietario' : 'Inquilino'],
                  ['Carga familiar', form.carga_familiar + ' persona(s)'],
                  ...(form.condicion_habitacional === 'alquilado' ? [
                    ['Propietario', form.propietario_nombre],
                    ['Cédula propietario', form.propietario_cedula],
                    ['Tel. propietario', form.propietario_telefono],
                  ] : []),
                ].map(([label, value]) => (
                  <div key={label} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 0', borderBottom: '1px solid #1e1e1e',
                  }}>
                    <span style={{ color: '#666', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
                    <span style={{ color: '#e0e0e0', fontSize: '14px', fontWeight: 500 }}>{value}</span>
                  </div>
                ))}
              </div>
              {/* Edificio — solo lectura */}
              <div style={{
                backgroundColor: '#0d0d0d', border: '1px solid #2a2a2a',
                borderRadius: '12px', padding: '14px', marginBottom: '20px',
              }}>
                <p style={{ color: '#f97316', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', margin: '0 0 10px' }}>
                  🏢 Edificio (configurado por administración)
                </p>
                {[
                  ['Nombre', edificioNombre],
                  ['RIF', edificioRif || 'Por configurar'],
                  ['Dirección', edificioDireccion || 'Por configurar'],
                ].map(([label, value]) => (
                  <div key={label} style={{
                    display: 'flex', justifyContent: 'space-between', padding: '6px 0',
                    borderBottom: '1px solid #1a1a1a',
                  }}>
                    <span style={{ color: '#555', fontSize: '12px' }}>{label}</span>
                    <span style={{ color: '#888', fontSize: '12px' }}>{value}</span>
                  </div>
                ))}
              </div>
              <p style={{ color: '#555', fontSize: '12px', textAlign: 'center', lineHeight: 1.5 }}>
                ⚠️ Una vez guardado, esta información solo podrá ser editada por la administración del edificio.
              </p>
            </>
          )}
        </div>

        {/* Navigation buttons */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
          {step > 1 && (
            <button onClick={() => setStep(s => (s - 1) as 1 | 2 | 3)}
              style={{
                flex: 1, padding: '14px', borderRadius: '12px',
                backgroundColor: 'transparent', border: '1px solid #2a2a2a',
                color: '#888', fontSize: '14px', fontWeight: 700, cursor: 'pointer',
              }}>
              ← Volver
            </button>
          )}
          {step < 3 ? (
            <button onClick={handleNext} style={{
              flex: 1, padding: '14px', borderRadius: '12px',
              backgroundColor: '#f97316', border: 'none',
              color: '#fff', fontSize: '14px', fontWeight: 700, cursor: 'pointer',
            }}>
              Siguiente →
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={saving} style={{
              flex: 1, padding: '14px', borderRadius: '12px',
              backgroundColor: saving ? '#a3520a' : '#f97316', border: 'none',
              color: '#fff', fontSize: '14px', fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer', transition: 'background-color 0.2s',
            }}>
              {saving ? 'Guardando...' : '💾 Guardar y entrar'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
