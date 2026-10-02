import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../data/supabase'
import { useAuth } from '../../application/contexts/AuthContext'
import { compararApartamentos } from '../../utils/alicuota'
import { AuthHeroPanel } from '../components/AuthHeroPanel'

interface RegisterForm {
  // Paso 1: Datos Personales y Acceso
  nombre_completo: string
  cedula: string
  telefono: string
  email: string
  password: string
  // Paso 2: Apartamento
  apartamento: string
  condicion_habitacional: 'propio' | 'alquilado'
  carga_familiar: string
  // Propietario (si es inquilino)
  propietario_nombre: string
  propietario_cedula: string
  propietario_telefono: string
  propietario_email: string
}

const EMPTY_FORM: RegisterForm = {
  nombre_completo: '',
  cedula: '',
  telefono: '',
  email: '',
  password: '',
  apartamento: '',
  condicion_habitacional: 'propio',
  carga_familiar: '1',
  propietario_nombre: '',
  propietario_cedula: '',
  propietario_telefono: '',
  propietario_email: '',
}

export function Register() {
  const navigate = useNavigate()
  const { refreshPerfil } = useAuth()

  const [form, setForm] = useState<RegisterForm>(EMPTY_FORM)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [loading, setLoading] = useState(false)
  const [validatingApto, setValidatingApto] = useState(false)
  const [apartamentosEdificio, setApartamentosEdificio] = useState<Array<{ id: string; numero: string; piso: number | null }>>([])
  const [error, setError] = useState<string | null>(null)

  // Configuración del edificio
  const [config, setConfig] = useState<{
    nombre_edificio: string
    rif: string | null
    direccion: string | null
    logo_url: string | null
  }>({
    nombre_edificio: 'Mi Edificio',
    rif: null,
    direccion: null,
    logo_url: null,
  })

  // Cargar configuración de edificio y lista oficial de apartamentos
  useEffect(() => {
    supabase
      .from('configuracion_edificio')
      .select('nombre_edificio, rif, direccion, logo_url')
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setConfig({
            nombre_edificio: data.nombre_edificio || 'Mi Edificio',
            rif: data.rif || null,
            direccion: data.direccion || null,
            logo_url: data.logo_url || null,
          })
        }
      })

    supabase
      .from('apartamentos')
      .select('id, numero, piso')
      .then(({ data }) => {
        if (data && data.length > 0) {
          const ordenados = [...data].sort((a, b) => compararApartamentos(a.numero, b.numero))
          setApartamentosEdificio(ordenados)
        }
      })
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  // ── Validaciones por paso ──────────────────────────────────────
  const validateStep1 = () => {
    if (!form.nombre_completo.trim()) return 'El nombre completo es obligatorio.'
    if (!form.cedula.trim()) return 'La cédula de identidad es obligatoria.'
    if (!form.telefono.trim()) return 'El teléfono es obligatorio.'
    if (!form.email.trim()) return 'El correo electrónico es obligatorio.'
    if (!form.email.includes('@') || !form.email.includes('.')) return 'Ingresa un correo electrónico válido.'
    if (!form.password || form.password.length < 6) return 'La contraseña debe tener al menos 6 caracteres.'
    return null
  }

  const validateStep2 = () => {
    if (!form.apartamento.trim()) return 'El número de apartamento es obligatorio.'
    if (!form.carga_familiar || parseInt(form.carga_familiar) < 1) return 'La carga familiar debe ser al menos 1 persona.'
    if (form.condicion_habitacional === 'alquilado') {
      if (!form.propietario_nombre.trim()) return 'El nombre del propietario es obligatorio.'
      if (!form.propietario_cedula.trim()) return 'La cédula del propietario es obligatoria.'
      if (!form.propietario_telefono.trim()) return 'El teléfono del propietario es obligatorio.'
    }
    return null
  }

  const handleNext = async () => {
    setError(null)
    if (step === 1) {
      const err = validateStep1()
      if (err) { setError(err); return }
      setStep(2)
    } else if (step === 2) {
      const err = validateStep2()
      if (err) { setError(err); return }

      // Validar que el apartamento exista en la lista oficial y no esté ocupado
      setValidatingApto(true)
      const aptNum = form.apartamento.trim().toUpperCase()

      try {
        const { data: aptData, error: aptError } = await supabase
          .from('apartamentos')
          .select('id, numero')
          .ilike('numero', aptNum)
          .maybeSingle()

        if (aptError) {
          console.warn('[Register] Aviso verificando apartamento:', aptError)
        }

        if (!aptData) {
          setError(`El apartamento ${form.apartamento} no existe en la lista oficial del edificio. Por favor seleccione o verifique su número.`)
          setValidatingApto(false)
          return
        }

        const { data: existingProfile } = await supabase
          .from('perfiles')
          .select('id, nombre_completo')
          .eq('apartamento_id', aptData.id)
          .maybeSingle()

        if (existingProfile) {
          setError('Este departamento ya tiene un usuario existente, contactese con la adminitracion')
          setValidatingApto(false)
          return
        }
      } catch (e: any) {
        console.warn('[Register] Error en comprobación de apartamento:', e)
      } finally {
        setValidatingApto(false)
      }

      setStep(3)
    }
  }

  // ── Envío final (Creación de cuenta y guardado de perfil completo) ─
  const handleSubmit = async () => {
    setLoading(true)
    setError(null)

    const aptNum = form.apartamento.trim().toUpperCase()

    try {
      // 1. Verificar contra la lista oficial de apartamentos de la Torre
      const { data: aptData, error: aptError } = await supabase
        .from('apartamentos')
        .select('id, numero')
        .ilike('numero', aptNum)
        .maybeSingle()

      if (aptError) {
        console.warn('[Register] Aviso al verificar apartamento:', aptError)
      }

      if (!aptData) {
        setError(`El apartamento ${form.apartamento} no existe en la lista oficial del edificio. Por favor contacte con la administración.`)
        setLoading(false)
        setStep(2)
        return
      }

      // 2. Comprobar si ya existe un perfil registrado para este apartamento
      const { data: existingProfile } = await supabase
        .from('perfiles')
        .select('id, nombre_completo')
        .eq('apartamento_id', aptData.id)
        .maybeSingle()

      if (existingProfile) {
        setError('Este departamento ya tiene un usuario existente, contactese con la adminitracion')
        setLoading(false)
        setStep(2)
        return
      }

      const aptId = aptData.id

      // 2. Registrar usuario en Supabase Auth
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: {
          data: {
            nombre_completo: form.nombre_completo.trim(),
            apartamento_num: aptNum,
            condicion: form.condicion_habitacional,
            carga_familiar: form.carga_familiar,
          },
        },
      })

      if (signUpError) throw signUpError

      // 3. Guardar el perfil COMPLETO (perfil_completo = true)
      //    Así el usuario NUNCA más verá una pantalla redundante de completar perfil
      if (signUpData?.user) {
        const payload: Record<string, any> = {
          id: signUpData.user.id,
          nombre_completo: form.nombre_completo.trim(),
          cedula: form.cedula.trim(),
          telefono: form.telefono.trim(),
          rol: 'residente',
          estado_cuenta: 'activa',
          clave_cambiada: true,
          perfil_completo: true, // ¡Marcado como completo de una vez!
          condicion_habitacional: form.condicion_habitacional,
          carga_familiar: parseInt(form.carga_familiar) || 1,
          apartamento_id: aptId,
        }

        if (form.condicion_habitacional === 'alquilado') {
          payload.propietario_nombre = form.propietario_nombre.trim()
          payload.propietario_cedula = form.propietario_cedula.trim()
          payload.propietario_telefono = form.propietario_telefono.trim()
          if (form.propietario_email.trim()) {
            payload.propietario_email = form.propietario_email.trim()
          }
        } else {
          // Si es propietario ('propio'), el correo con el que se registra ES el email del propietario
          payload.propietario_nombre = form.nombre_completo.trim()
          payload.propietario_cedula = form.cedula.trim()
          payload.propietario_telefono = form.telefono.trim()
          payload.propietario_email = form.email.trim()
        }

        const { error: upsertErr } = await supabase
          .from('perfiles')
          .upsert(payload, { onConflict: 'id' })

        if (upsertErr) {
          console.error('[Register] Error guardando perfil:', upsertErr.message)
        }

        // Anexar la información del residente y propietario al apartamento oficial
        await supabase.from('apartamentos').update({
          propietario_nombre: form.condicion_habitacional === 'propio' ? form.nombre_completo.trim() : form.propietario_nombre.trim(),
          propietario_cedula: form.condicion_habitacional === 'propio' ? form.cedula.trim() : form.propietario_cedula.trim(),
          telefono_contacto: form.condicion_habitacional === 'propio' ? form.telefono.trim() : form.propietario_telefono.trim(),
          estado: 'habitado',
        }).eq('id', aptId)

        await refreshPerfil()
      }

      // 4. Redireccionar directamente al Login al terminar el registro
      await supabase.auth.signOut()
      navigate('/login', {
        state: {
          registered: true,
          email: form.email.trim(),
        },
      })
    } catch (err: any) {
      console.error('[Register] Error general:', err)
      if (err.message?.includes('User already registered')) {
        setError('Ya existe una cuenta con este correo electrónico. Por favor inicia sesión.')
      } else {
        setError(err.message || 'Error al crear la cuenta. Intente nuevamente.')
      }
    } finally {
      setLoading(false)
    }
  }

  // ── Estilos (Mismo look & feel de la pantalla moderna de pasos) ──
  const inp: React.CSSProperties = {
    width: '100%',
    backgroundColor: '#0a0d14',
    border: '1px solid #232d42',
    color: '#fff',
    padding: '12px 14px',
    borderRadius: '10px',
    fontSize: '13.5px',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  }

  const lbl: React.CSSProperties = {
    display: 'block',
    color: '#cbd5e1',
    fontSize: '11.5px',
    fontWeight: 700,
    marginBottom: '6px',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
  }

  const grp: React.CSSProperties = { marginBottom: '16px' }

  const steps = ['DATOS PERSONALES', 'APARTAMENTO', 'CONFIRMAR']

  // ── Render Principal con Split-Screen Hero y Formulario ───────
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      backgroundColor: '#0a0d14',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      color: '#fff',
      flexWrap: 'wrap',
    }}>
      
      {/* ── PANEL IZQUIERDO: HERO NARANJA CON DATOS Y LOGO DEL EDIFICIO ── */}
      <AuthHeroPanel config={config} />

      {/* ── PANEL DERECHO: FORMULARIO DE REGISTRO EN PASOS ── */}
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
        <div style={{ width: '100%', maxWidth: '480px' }}>

          {/* Encabezado del Formulario */}
          <div style={{ marginBottom: '20px' }}>
            <h1 style={{
              fontSize: '26px',
              fontWeight: 800,
              margin: '0 0 6px',
              letterSpacing: '-0.5px',
              color: '#ffffff'
            }}>
              Crear cuenta de residente
            </h1>
            <p style={{
              fontSize: '13px',
              color: '#94a3b8',
              margin: 0,
              lineHeight: 1.4
            }}>
              Regístrate en {config.nombre_edificio} para acceder a tus recibos y pagos.
            </p>
          </div>

          {/* Indicador de Pasos (Step Progress Bar) */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            {steps.map((s, i) => (
              <div key={s} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{
                  height: '3px',
                  borderRadius: '99px',
                  backgroundColor: i + 1 <= step ? 'var(--color-accent, #f97316)' : '#232d42',
                  transition: 'background-color 0.3s ease',
                }} />
                <span style={{
                  fontSize: '9.5px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  color: i + 1 === step ? 'var(--color-accent, #f97316)' : i + 1 < step ? '#94a3b8' : '#475569',
                }}>
                  {s}
                </span>
              </div>
            ))}
          </div>

          {/* Tarjeta del Formulario */}
          <div style={{
            backgroundColor: '#111622',
            border: '1px solid #1e2638',
            borderRadius: '16px',
            padding: '28px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
            marginBottom: '16px'
          }}>

          {error && (
            <div style={{
              backgroundColor: '#ef444418',
              color: '#ef4444',
              border: '1px solid #ef444430',
              padding: '12px 14px',
              borderRadius: '10px',
              fontSize: '13px',
              marginBottom: '20px',
              lineHeight: 1.5,
            }}>
              {error}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════
              PASO 1: DATOS PERSONALES Y ACCESO
          ══════════════════════════════════════════════════════════ */}
          {step === 1 && (
            <>
              <h2 style={{ color: '#fff', fontSize: '16px', fontWeight: 700, marginBottom: '20px', marginTop: 0 }}>
                👤 Tus datos personales
              </h2>

              <div style={grp}>
                <label style={lbl}>Nombre completo *</label>
                <input
                  name="nombre_completo"
                  value={form.nombre_completo}
                  onChange={handleChange}
                  style={inp}
                  placeholder="Ej. María García"
                  autoFocus
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <label style={lbl}>Cédula de identidad *</label>
                  <input
                    name="cedula"
                    value={form.cedula}
                    onChange={handleChange}
                    style={inp}
                    placeholder="Ej. V-12345678"
                  />
                </div>
                <div>
                  <label style={lbl}>Teléfono *</label>
                  <input
                    name="telefono"
                    value={form.telefono}
                    onChange={handleChange}
                    style={inp}
                    placeholder="Ej. 0414-1234567"
                  />
                </div>
              </div>

              <div style={grp}>
                <label style={lbl}>Correo electrónico personal *</label>
                <input
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  style={inp}
                  placeholder="tu@correo.com"
                />
              </div>

              <div style={grp}>
                <label style={lbl}>Contraseña para tu cuenta *</label>
                <input
                  name="password"
                  type="password"
                  value={form.password}
                  onChange={handleChange}
                  style={inp}
                  placeholder="Mínimo 6 caracteres"
                  minLength={6}
                />
              </div>
            </>
          )}

          {/* ══════════════════════════════════════════════════════════
              PASO 2: INFORMACIÓN DEL APARTAMENTO
          ══════════════════════════════════════════════════════════ */}
          {step === 2 && (
            <>
              <h2 style={{ color: '#fff', fontSize: '16px', fontWeight: 700, marginBottom: '8px', marginTop: 0 }}>
                🏠 Información del apartamento
              </h2>

              <p style={{ color: '#666', fontSize: '12px', margin: '0 0 18px 0', lineHeight: 1.5 }}>
                Solo se permite <strong>un usuario por apartamento</strong>.
              </p>

              <div style={grp}>
                <label style={lbl}>Nº Apartamento *</label>
                <input
                  name="apartamento"
                  value={form.apartamento}
                  onChange={handleChange}
                  list="lista-apartamentos-torre"
                  style={inp}
                  placeholder="Selecciona o escribe tu apartamento (ej. 511, 565, 5PH1)"
                  autoFocus
                />
                <datalist id="lista-apartamentos-torre">
                  {apartamentosEdificio.map(a => (
                    <option key={a.id} value={a.numero}>
                      {a.numero.toUpperCase().includes('PH') ? `Penthouse ${a.numero}` : `Apto ${a.numero} (Piso ${a.piso || '-'})`}
                    </option>
                  ))}
                </datalist>
                <span style={{ fontSize: '11px', color: '#888', marginTop: '6px', display: 'block' }}>
                  Solo apartamentos oficiales de la Torre (puedes seleccionarlo de la lista desplegable).
                </span>
              </div>

              <div style={grp}>
                <label style={lbl}>Condición habitacional *</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {(['propio', 'alquilado'] as const).map(opt => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, condicion_habitacional: opt }))}
                      style={{
                        padding: '12px',
                        borderRadius: '10px',
                        border: '2px solid',
                        borderColor: form.condicion_habitacional === opt ? 'var(--color-accent, #f97316)' : '#2a2a2a',
                        backgroundColor: form.condicion_habitacional === opt ? 'var(--color-accent-light, rgba(249,115,22,0.08))' : 'transparent',
                        color: form.condicion_habitacional === opt ? 'var(--color-accent, #f97316)' : '#666',
                        fontSize: '13px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      {opt === 'propio' ? '🏡 Propietario' : '🔑 Inquilino'}
                    </button>
                  ))}
                </div>
              </div>

              <div style={grp}>
                <label style={lbl}>Carga familiar (habitantes) *</label>
                <input
                  type="number"
                  min="1"
                  name="carga_familiar"
                  value={form.carga_familiar}
                  onChange={handleChange}
                  style={inp}
                  placeholder="Ej. 3"
                />
              </div>

              {/* Menú que se despliega si es Inquilino */}
              {form.condicion_habitacional === 'alquilado' && (
                <div style={{
                  backgroundColor: 'rgba(59,130,246,0.06)',
                  border: '1px solid rgba(59,130,246,0.25)',
                  borderRadius: '12px',
                  padding: '16px',
                  marginTop: '16px',
                  marginBottom: '16px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '16px' }}>📋</span>
                    <span style={{ color: '#93c5fd', fontSize: '13px', fontWeight: 700 }}>
                      Datos del Propietario del Apartamento
                    </span>
                  </div>
                  <p style={{ color: '#94a3b8', fontSize: '12px', margin: '0 0 14px 0', lineHeight: 1.4 }}>
                    Como inquilino, es necesario ingresar los datos del dueño del inmueble:
                  </p>

                  <div style={grp}>
                    <label style={{ ...lbl, color: '#cbd5e1' }}>Nombre del propietario *</label>
                    <input
                      name="propietario_nombre"
                      value={form.propietario_nombre}
                      onChange={handleChange}
                      style={inp}
                      placeholder="Nombre y Apellido"
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                    <div>
                      <label style={{ ...lbl, color: '#cbd5e1' }}>Cédula *</label>
                      <input
                        name="propietario_cedula"
                        value={form.propietario_cedula}
                        onChange={handleChange}
                        style={inp}
                        placeholder="V-12345678"
                      />
                    </div>
                    <div>
                      <label style={{ ...lbl, color: '#cbd5e1' }}>Teléfono *</label>
                      <input
                        name="propietario_telefono"
                        value={form.propietario_telefono}
                        onChange={handleChange}
                        style={inp}
                        placeholder="0414-1234567"
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ ...lbl, color: '#cbd5e1' }}>Correo del propietario (opcional)</label>
                    <input
                      type="email"
                      name="propietario_email"
                      value={form.propietario_email}
                      onChange={handleChange}
                      style={inp}
                      placeholder="propietario@email.com"
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {/* ══════════════════════════════════════════════════════════
              PASO 3: CONFIRMACIÓN Y RESUMEN
          ══════════════════════════════════════════════════════════ */}
          {step === 3 && (
            <>
              <h2 style={{ color: '#fff', fontSize: '16px', fontWeight: 700, marginBottom: '16px', marginTop: 0 }}>
                ✅ Confirma tu información
              </h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '20px' }}>
                {[
                  ['Nombre', form.nombre_completo],
                  ['Cédula', form.cedula],
                  ['Teléfono', form.telefono],
                  ['Correo', form.email],
                  ['Apartamento', `Apto ${form.apartamento.trim().toUpperCase()}`],
                  ['Condición', form.condicion_habitacional === 'propio' ? '🏡 Propietario' : '🔑 Inquilino'],
                  ['Carga familiar', `${form.carga_familiar} persona(s)`],
                  ...(form.condicion_habitacional === 'alquilado' ? [
                    ['Propietario', form.propietario_nombre],
                    ['Cédula propietario', form.propietario_cedula],
                    ['Tel. propietario', form.propietario_telefono],
                    ...(form.propietario_email ? [['Correo propietario', form.propietario_email]] : []),
                  ] : []),
                ].map(([label, value]) => (
                  <div key={label} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 0',
                    borderBottom: '1px solid #1e1e1e',
                  }}>
                    <span style={{ color: '#666', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {label}
                    </span>
                    <span style={{ color: '#e0e0e0', fontSize: '13px', fontWeight: 500, textAlign: 'right' }}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>

              {/* Información del Edificio */}
              <div style={{
                backgroundColor: '#0d0d0d',
                border: '1px solid #2a2a2a',
                borderRadius: '12px',
                padding: '14px',
                marginBottom: '16px',
              }}>
                <p style={{ color: 'var(--color-accent, #f97316)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', margin: '0 0 8px 0' }}>
                  🏢 Edificio al que ingresarás
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#888' }}>
                  <span>Edificio:</span>
                  <span style={{ color: '#fff', fontWeight: 600 }}>{config.nombre_edificio}</span>
                </div>
                {config.direccion && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#888', marginTop: '4px' }}>
                    <span>Ubicación:</span>
                    <span style={{ color: '#aaa' }}>{config.direccion}</span>
                  </div>
                )}
              </div>

              <p style={{ color: '#666', fontSize: '12px', textAlign: 'center', lineHeight: 1.5, margin: 0 }}>
                Al registrarte, tu cuenta quedará vinculada al apartamento y tendrás acceso inmediato al portal.
              </p>
            </>
          )}

        </div>

        {/* Botones de Navegación */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
          {step > 1 && (
            <button
              type="button"
              onClick={() => { setError(null); setStep(s => (s - 1) as 1 | 2 | 3) }}
              style={{
                flex: 1,
                padding: '14px',
                borderRadius: '12px',
                backgroundColor: 'transparent',
                border: '1px solid #2a2a2a',
                color: '#888',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              ← Volver
            </button>
          )}

          {step < 3 ? (
            <button
              type="button"
              onClick={handleNext}
              disabled={validatingApto}
              style={{
                flex: 1,
                padding: '14px',
                borderRadius: '12px',
                backgroundColor: 'var(--color-accent, #f97316)',
                border: 'none',
                color: '#fff',
                fontSize: '14px',
                fontWeight: 700,
                cursor: validatingApto ? 'wait' : 'pointer',
                opacity: validatingApto ? 0.7 : 1,
                transition: 'background-color 0.2s',
              }}
            >
              {validatingApto ? 'Verificando...' : 'Siguiente →'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              style={{
                flex: 1,
                padding: '14px',
                borderRadius: '12px',
                backgroundColor: loading ? '#a3520a' : 'var(--color-accent, #f97316)',
                border: 'none',
                color: '#fff',
                fontSize: '14px',
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.2s',
              }}
            >
              {loading ? 'Creando cuenta...' : '🚀 Finalizar Registro'}
            </button>
          )}
        </div>

        {/* ── TARJETA INFERIOR: YA TENGO CUENTA (Estilo callout idéntico a Login) ── */}
        <div style={{
          backgroundColor: '#111622',
          border: '1px solid #1e2638',
          borderRadius: '16px',
          padding: '18px 20px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          flexWrap: 'wrap',
          marginTop: '20px'
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            backgroundColor: 'var(--color-accent-light, rgba(249, 115, 22, 0.15))',
            border: '1px solid var(--border-accent, rgba(249, 115, 22, 0.3))',
            color: 'var(--color-accent, #f97316)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
            flexShrink: 0
          }}>
            🔑
          </div>

          <div style={{ flex: 1, minWidth: '170px' }}>
            <h3 style={{ fontSize: '13.5px', fontWeight: 800, margin: 0, color: '#ffffff' }}>
              ¿Ya tienes una cuenta?
            </h3>
            <p style={{ fontSize: '11.5px', color: '#94a3b8', margin: '2px 0 0', lineHeight: 1.35 }}>
              Inicia sesión para consultar tus recibos y pagos.
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate('/login')}
            style={{
              backgroundColor: 'var(--color-accent, #f97316)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '9px 15px',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'background-color 0.2s',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--color-accent-hover, #ea580c)'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'var(--color-accent, #f97316)'}
          >
            Iniciar Sesión →
          </button>
        </div>

        {/* ── VERSIÓN INFERIOR: ACCESO OCULTO AL PANEL ADMIN ── */}
        <div style={{ textAlign: 'center', marginTop: '22px', paddingBottom: '16px' }}>
          <span
            onClick={() => navigate('/admin-login')}
            style={{
              color: '#334155',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              letterSpacing: '0.8px',
              userSelect: 'none',
              transition: 'color 0.2s'
            }}
            onMouseOver={(e) => (e.target as HTMLElement).style.color = '#64748b'}
            onMouseOut={(e) => (e.target as HTMLElement).style.color = '#334155'}
          >
            v1.0.4
          </span>
        </div>

      </div>
    </div>
  </div>
)
}
