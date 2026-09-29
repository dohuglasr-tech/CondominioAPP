import React, { useEffect } from 'react'
import { useAuth } from '../../application/contexts/AuthContext'

export const PerfilResidente: React.FC = () => {
  const { user, perfil, config, refreshPerfil, refreshConfig } = useAuth()
  const p = perfil as any
  const c = config as any

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

  return (
    <div style={s.page}>
      {/* Avatar + Nombre */}
      <div style={s.avatarWrap}>
        <div style={s.avatar}>
          {edificioLogo ? (
            <img src={edificioLogo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '18px' }} />
          ) : (
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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

    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: '24px 20px 48px', maxWidth: 560, margin: '0 auto', boxSizing: 'border-box' },
  avatarWrap: { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 },
  avatar: {
    width: 68, height: 68, borderRadius: 18,
    background: 'rgba(249,115,22,0.12)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    overflow: 'hidden',
  },
  name: { color: '#fff', fontSize: 22, fontWeight: 800, margin: 0 },
  sub:  { color: '#888', fontSize: 13, marginTop: 4 },
  notice: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: 'rgba(249,115,22,0.07)',
    border: '1px solid rgba(249,115,22,0.2)',
    borderRadius: 10, padding: '10px 14px',
    color: '#f97316', fontSize: 12, fontWeight: 500,
    marginBottom: 20,
  },
  card: {
    background: '#141414', border: '1px solid #1e1e1e',
    borderRadius: 16, padding: '18px 20px', marginBottom: 16,
    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
  },
  cardTitle: {
    color: '#f97316', fontSize: 12, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 14px',
  },
  field: {
    display: 'flex', flexDirection: 'column', gap: 3,
    padding: '10px 0', borderBottom: '1px solid #1a1a1a',
  },
  flabel: { color: '#666', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 },
  fvalue: { color: '#e0e0e0', fontSize: 14, fontWeight: 500 },
}
