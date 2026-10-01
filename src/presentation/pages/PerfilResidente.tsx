import React, { useState, useEffect } from 'react'
import { useAuth } from '../../application/contexts/AuthContext'
import { useNavigate } from 'react-router-dom'

export const PerfilResidente: React.FC = () => {
  const navigate = useNavigate()
  const { user, perfil, config, refreshPerfil, refreshConfig, updatePassword } = useAuth()
  const p = perfil as any
  const c = config as any

  // ── Estados para cambio de contraseña ──
  const [showPassModal, setShowPassModal] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [showConfirmPass, setShowConfirmPass] = useState(false)
  const [passLoading, setPassLoading] = useState(false)
  const [passError, setPassError] = useState<string | null>(null)
  const [passSuccess, setPassSuccess] = useState(false)

  // Sincronizar datos frescos al montar la pantalla
  useEffect(() => {
    refreshPerfil?.()
    refreshConfig?.()
  }, [refreshPerfil, refreshConfig])

  // Datos personales del residente
  const nombre    = p?.nombre_completo || p?.nombre || 'Sin nombre'
  const email     = user?.email || p?.email || 'No registrado'
  const cedula    = p?.cedula || 'No registrada'
  const telefono  = p?.telefono || 'No registrado'

  // Datos del apartamento
  const apto      = p?.apartamento?.numero || p?.apartamentos?.numero || p?.apartamento_id || 'N/D'
  const condicion = p?.condicion_habitacional || 'propio'
  const cargaFam  = p?.carga_familiar ?? 'N/D'

  // Datos del edificio configurados por el administrador
  const edificioNombre    = c?.nombre_edificio || c?.nombre || 'Mi Edificio'
  const edificioRif       = c?.rif || c?.rif_edificio || null
  const edificioDireccion = c?.direccion || null
  const edificioTelefono  = c?.telefono || null
  const edificioEmail     = c?.email_contacto || c?.email_admin || null
  const edificioBanco     = c?.banco || null
  const edificioCuenta    = c?.cuenta_bancaria || null
  const edificioTitular   = c?.titular_cuenta || null
  const edificioLogo      = c?.logo_url || null

  const condLabel =
    condicion === 'propio' ? '🏡 Propietario' :
    condicion === 'alquilado' ? '🔑 Inquilino' : condicion

  const Field = ({ label, value }: { label: string; value: string }) => (
    <div style={s.field}>
      <span style={s.flabel}>{label}</span>
      <span style={s.fvalue}>{value}</span>
    </div>
  )

  // ── Manejar actualización de contraseña ──
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPassError(null)

    if (!newPassword || !confirmNewPassword) {
      setPassError('Por favor completa ambos campos.')
      return
    }

    if (newPassword.length < 6) {
      setPassError('La contraseña debe tener al menos 6 caracteres.')
      return
    }

    if (newPassword !== confirmNewPassword) {
      setPassError('Las contraseñas no coinciden. Por favor verifícalas.')
      return
    }

    setPassLoading(true)

    try {
      const { error: err } = await updatePassword(newPassword)
      if (err) {
        setPassError(err)
        setPassLoading(false)
        return
      }

      setPassSuccess(true)
      setNewPassword('')
      setConfirmNewPassword('')
      setTimeout(() => {
        setShowPassModal(false)
        setPassSuccess(false)
      }, 2000)
    } catch (ex: any) {
      setPassError(ex?.message || 'Error inesperado al actualizar la contraseña.')
    } finally {
      setPassLoading(false)
    }
  }

  return (
    <div style={s.page}>
      {/* Botón de regreso */}
      <button
        onClick={() => navigate('/')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: '#94a3b8',
          padding: '7px 12px',
          borderRadius: '10px',
          fontSize: '12px',
          fontWeight: 600,
          cursor: 'pointer',
          marginBottom: '16px',
          transition: 'all 0.18s'
        }}
        title="Volver al inicio"
      >
        <span style={{ fontSize: '16px' }}>←</span>
        <span>Inicio</span>
      </button>

      {/* Avatar + Nombre */}
      <div style={s.avatarWrap}>
        <div style={s.avatar}>
          {edificioLogo ? (
            <img src={edificioLogo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '18px' }} />
          ) : (
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent, #f97316)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4"/>
              <path d="M5 20c0-4 3.5-7 7-7s7 3 7 7"/>
            </svg>
          )}
        </div>
        <div>
          <h1 style={s.name}>{nombre}</h1>
          <p style={s.sub}>Residente · {edificioNombre}</p>
        </div>
      </div>

      {/* Aviso solo lectura */}
      <div style={s.notice}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent, #f97316)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span>Tus datos y los del edificio están sincronizados con la administración</span>
      </div>

      {/* 1. Información personal */}
      <div style={s.card}>
        <p style={s.cardTitle}>👤 Información personal</p>
        <Field label="Nombre completo" value={nombre} />
        <Field label="Cédula de identidad" value={cedula} />
        <Field label="Correo electrónico" value={email} />
        <Field label="Teléfono de contacto" value={telefono} />
      </div>

      {/* 2. Información del apartamento */}
      <div style={s.card}>
        <p style={s.cardTitle}>🏠 Información del apartamento</p>
        <Field label="N.° de apartamento" value={`Apto ${String(apto)}`} />
        <Field label="Condición habitacional" value={condLabel} />
        <Field label="Carga familiar" value={`${String(cargaFam)} persona(s)`} />
      </div>

      {/* 3. Datos del Propietario (si es inquilino) */}
      {condicion === 'alquilado' && (
        <div style={s.card}>
          <p style={{ ...s.cardTitle, color: '#60a5fa' }}>📋 Información del Propietario</p>
          <Field label="Nombre del propietario" value={p?.propietario_nombre || 'No registrado'} />
          <Field label="Cédula del propietario" value={p?.propietario_cedula || 'No registrada'} />
          <Field label="Teléfono del propietario" value={p?.propietario_telefono || 'No registrado'} />
          {p?.propietario_email && (
            <Field label="Correo del propietario" value={p.propietario_email} />
          )}
        </div>
      )}

      {/* 4. Información del Edificio (configurado por el Administrador) */}
      <div style={s.card}>
        <p style={s.cardTitle}>🏢 Información del Edificio</p>
        <Field label="Nombre del edificio" value={edificioNombre} />
        <Field label="RIF del edificio" value={edificioRif || 'No especificado'} />
        <Field label="Dirección" value={edificioDireccion || 'No especificada'} />
        {edificioTelefono && <Field label="Teléfono administración" value={edificioTelefono} />}
        {edificioEmail && <Field label="Correo administración" value={edificioEmail} />}

        {/* Cuentas bancarias del condominio */}
        {(edificioBanco || edificioCuenta) && (
          <div style={{ marginTop: '16px', borderTop: '1px solid #222', paddingTop: '14px' }}>
            <p style={{ color: '#aaa', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 10px 0' }}>
              🏦 Cuenta Bancaria para Pagos
            </p>
            {edificioBanco && <Field label="Banco" value={edificioBanco} />}
            {edificioCuenta && <Field label="Nº de Cuenta" value={edificioCuenta} />}
            {edificioTitular && <Field label="Titular / RIF" value={edificioTitular} />}
          </div>
        )}
      </div>

      {/* 5. Seguridad y Contraseña */}
      <div style={s.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <p style={{ ...s.cardTitle, margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🔐</span> Seguridad de la Cuenta
          </p>
          <span style={{ fontSize: '11px', color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.12)', padding: '3px 8px', borderRadius: '6px', fontWeight: 600 }}>
            Activa
          </span>
        </div>
        <p style={{ color: '#888', fontSize: '13px', margin: '0 0 16px 0', lineHeight: 1.4 }}>
          Puedes actualizar la contraseña de tu cuenta en cualquier momento para mantener tu acceso protegido.
        </p>

        <button
          type="button"
          onClick={() => {
            setPassError(null)
            setPassSuccess(false)
            setNewPassword('')
            setConfirmNewPassword('')
            setShowPassModal(true)
          }}
          style={{
            backgroundColor: 'var(--color-accent-light, rgba(249, 115, 22, 0.12))',
            color: 'var(--color-accent, #f97316)',
            border: '1px solid var(--border-accent, rgba(249, 115, 22, 0.35))',
            borderRadius: '10px',
            padding: '11px 16px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s ease'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--color-accent-light, rgba(249, 115, 22, 0.2))'
            e.currentTarget.style.borderColor = 'var(--color-accent, #f97316)'
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--color-accent-light, rgba(249, 115, 22, 0.12))'
            e.currentTarget.style.borderColor = 'var(--border-accent, rgba(249, 115, 22, 0.35))'
          }}
        >
          <span>🔑</span> Cambiar mi contraseña
        </button>
      </div>

      {/* ── MODAL CAMBIAR CONTRASEÑA ── */}
      {showPassModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          zIndex: 9999,
          boxSizing: 'border-box'
        }}>
          <div style={{
            backgroundColor: '#141414',
            border: '1px solid #262626',
            borderRadius: '20px',
            padding: '28px 24px',
            width: '100%',
            maxWidth: '420px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.7)',
            position: 'relative',
            boxSizing: 'border-box'
          }}>
            {/* Botón cerrar */}
            <button
              onClick={() => setShowPassModal(false)}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'none',
                border: 'none',
                color: '#666',
                fontSize: '20px',
                cursor: 'pointer',
                lineHeight: 1
              }}
            >
              ✕
            </button>

            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{
                width: '50px',
                height: '50px',
                borderRadius: '16px',
                backgroundColor: 'rgba(249, 115, 22, 0.12)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
                marginBottom: '10px'
              }}>
                🔑
              </div>
              <h2 style={{ fontSize: '19px', fontWeight: 800, color: '#fff', margin: '0 0 6px' }}>
                Cambiar Contraseña
              </h2>
              <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>
                Ingresa tu nueva clave de acceso (mínimo 6 caracteres).
              </p>
            </div>

            {passSuccess ? (
              <div style={{
                backgroundColor: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '12px',
                padding: '20px',
                textAlign: 'center',
                color: '#34d399'
              }}>
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>✅</div>
                <strong style={{ display: 'block', fontSize: '15px', marginBottom: '4px' }}>
                  ¡Contraseña actualizada!
                </strong>
                <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
                  Tu nueva contraseña ha sido guardada correctamente.
                </p>
              </div>
            ) : (
              <form onSubmit={handleChangePassword}>
                {passError && (
                  <div style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.12)',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    color: '#fca5a5',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    fontSize: '12.5px',
                    marginBottom: '16px',
                    textAlign: 'center',
                    lineHeight: 1.4
                  }}>
                    {passError}
                  </div>
                )}

                {/* Campo Nueva Contraseña */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', color: '#aaa', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                    Nueva Contraseña
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPass ? 'text' : 'password'}
                      required
                      placeholder="Mínimo 6 caracteres"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      disabled={passLoading}
                      style={{
                        width: '100%',
                        backgroundColor: '#0a0a0a',
                        border: '1px solid #262626',
                        borderRadius: '10px',
                        padding: '12px 40px 12px 14px',
                        color: '#fff',
                        fontSize: '14px',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: '#666',
                        cursor: 'pointer',
                        fontSize: '16px',
                        padding: '4px'
                      }}
                    >
                      {showPass ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>

                {/* Campo Confirmar Contraseña */}
                <div style={{ marginBottom: '22px' }}>
                  <label style={{ display: 'block', color: '#aaa', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                    Confirmar Contraseña
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showConfirmPass ? 'text' : 'password'}
                      required
                      placeholder="Repite la contraseña"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      disabled={passLoading}
                      style={{
                        width: '100%',
                        backgroundColor: '#0a0a0a',
                        border: '1px solid #262626',
                        borderRadius: '10px',
                        padding: '12px 40px 12px 14px',
                        color: '#fff',
                        fontSize: '14px',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPass(!showConfirmPass)}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: '#666',
                        cursor: 'pointer',
                        fontSize: '16px',
                        padding: '4px'
                      }}
                    >
                      {showConfirmPass ? '🙈' : '👁️'}
                    </button>
                  </div>
                  {newPassword && confirmNewPassword && (
                    <div style={{
                      marginTop: '6px',
                      fontSize: '11.5px',
                      color: newPassword === confirmNewPassword ? '#10b981' : '#f87171'
                    }}>
                      {newPassword === confirmNewPassword ? '✓ Las contraseñas coinciden' : '✗ Las contraseñas no coinciden'}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <button
                    type="submit"
                    disabled={passLoading || !newPassword || !confirmNewPassword}
                    style={{
                      width: '100%',
                      backgroundColor: 'var(--color-accent, #f97316)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '10px',
                      padding: '13px',
                      fontSize: '14px',
                      fontWeight: 700,
                      cursor: passLoading || !newPassword || !confirmNewPassword ? 'not-allowed' : 'pointer',
                      opacity: passLoading || !newPassword || !confirmNewPassword ? 0.7 : 1,
                      boxShadow: 'var(--color-brand-shadow, 0 4px 18px var(--color-accent-glow))',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {passLoading ? 'Guardando...' : 'Guardar nueva contraseña'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowPassModal(false)}
                    style={{
                      width: '100%',
                      backgroundColor: 'transparent',
                      color: '#888',
                      border: '1px solid #262626',
                      borderRadius: '10px',
                      padding: '11px',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: '24px 20px 48px', maxWidth: 560, margin: '0 auto', boxSizing: 'border-box' },
  avatarWrap: { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 },
  avatar: {
    width: 68, height: 68, borderRadius: 18,
    background: 'var(--color-accent-light, rgba(249,115,22,0.12))',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    overflow: 'hidden',
  },
  name: { color: '#fff', fontSize: 22, fontWeight: 800, margin: 0 },
  sub:  { color: '#888', fontSize: 13, marginTop: 4 },
  notice: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: 'var(--color-accent-light, rgba(249,115,22,0.07))',
    border: '1px solid var(--border-accent, rgba(249,115,22,0.2))',
    borderRadius: 10, padding: '10px 14px',
    color: 'var(--color-accent, #f97316)', fontSize: 12, fontWeight: 500,
    marginBottom: 20,
  },
  card: {
    background: '#141414', border: '1px solid #1e1e1e',
    borderRadius: 16, padding: '18px 20px', marginBottom: 16,
    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
  },
  cardTitle: {
    color: 'var(--color-accent, #f97316)', fontSize: 12, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 14px',
  },
  field: {
    display: 'flex', flexDirection: 'column', gap: 3,
    padding: '10px 0', borderBottom: '1px solid #1a1a1a',
  },
  flabel: { color: '#666', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 },
  fvalue: { color: '#e0e0e0', fontSize: 14, fontWeight: 500 },
}
