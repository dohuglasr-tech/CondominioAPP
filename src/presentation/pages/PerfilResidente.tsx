import React from 'react'
import { useAuth } from '../../application/contexts/AuthContext'

export const PerfilResidente: React.FC = () => {
  const { perfil, config } = useAuth()
  const p = perfil as any
  const c = config as any

  const nombre    = p?.nombre_completo || p?.nombre || 'Sin nombre'
  const email     = p?.email || 'No registrado'
  const apto      = p?.apartamento?.numero || p?.apartamento_id || 'N/D'
  const condicion = p?.condicion_habitacional || 'N/D'
  const cargaFam  = p?.carga_familiar ?? 'N/D'
  const telefono  = p?.telefono || 'No registrado'
  const edificio  = c?.nombre || 'Mi Edificio'

  const condLabel =
    condicion === 'propio' ? 'Propietario' :
    condicion === 'alquilado' ? 'Inquilino' : condicion

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
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="4"/>
            <path d="M5 20c0-4 3.5-7 7-7s7 3 7 7"/>
          </svg>
        </div>
        <div>
          <h1 style={s.name}>{nombre}</h1>
          <p style={s.sub}>Residente · {edificio}</p>
        </div>
      </div>

      {/* Aviso solo lectura */}
      <div style={s.notice}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span>Tus datos solo pueden ser editados por la administración del edificio</span>
      </div>

      {/* Información personal */}
      <div style={s.card}>
        <p style={s.cardTitle}>Información personal</p>
        <Field label="Nombre completo" value={nombre} />
        <Field label="Correo electrónico" value={email} />
        <Field label="Teléfono" value={telefono} />
      </div>

      {/* Apartamento */}
      <div style={s.card}>
        <p style={s.cardTitle}>Información del apartamento</p>
        <Field label="N.° de apartamento" value={String(apto)} />
        <Field label="Condición" value={condLabel} />
        <Field label="Carga familiar" value={String(cargaFam) + ' persona(s)'} />
      </div>

      {/* Edificio */}
      <div style={s.card}>
        <p style={s.cardTitle}>Edificio</p>
        <Field label="Nombre" value={c?.nombre || 'N/D'} />
        <Field label="RIF" value={c?.rif || 'N/D'} />
        <Field label="Dirección" value={c?.direccion || 'N/D'} />
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: '24px 20px 48px', maxWidth: 540, margin: '0 auto' },
  avatarWrap: { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 },
  avatar: {
    width: 72, height: 72, borderRadius: 20,
    background: 'rgba(249,115,22,0.12)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  name: { color: '#fff', fontSize: 22, fontWeight: 800, margin: 0 },
  sub:  { color: '#666', fontSize: 13, marginTop: 4 },
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
    borderRadius: 14, padding: '16px 18px', marginBottom: 14,
  },
  cardTitle: {
    color: '#f97316', fontSize: 11, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 14px',
  },
  field: {
    display: 'flex', flexDirection: 'column', gap: 2,
    padding: '10px 0', borderBottom: '1px solid #1a1a1a',
  },
  flabel: { color: '#555', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 },
  fvalue: { color: '#e0e0e0', fontSize: 15, fontWeight: 500 },
}
