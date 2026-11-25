import React, { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../../application/contexts/AuthContext'
import {
  Propuesta,
  obtenerTodasLasPropuestasAdmin,
  crearPropuestaAdmin,
  cambiarEstadoPropuestaAdmin,
  eliminarPropuestaAdmin,
} from '../../../data/propuestasService'

const inputStyle: React.CSSProperties = {
  width: '100%',
  backgroundColor: '#0a0a0a',
  border: '1px solid #2a2a2a',
  color: '#fff',
  padding: '10px 12px',
  borderRadius: '8px',
  fontSize: '13px',
  boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = { display: 'block', color: '#888', fontSize: '12px', marginBottom: '6px' }

export const AdminPropuestas: React.FC = () => {
  const { user } = useAuth()
  const [propuestas, setPropuestas] = useState<Propuesta[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ titulo: '', descripcion: '', fecha_cierre: '' })

  const cargarPropuestas = useCallback(async () => {
    setLoading(true)
    const { data, error } = await obtenerTodasLasPropuestasAdmin()
    if (error) setErrorMsg(error)
    else setErrorMsg(null)
    setPropuestas(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    cargarPropuestas()
  }, [cargarPropuestas])

  const handleCrear = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setErrorMsg(null)
    const { data, error } = await crearPropuestaAdmin({
      titulo: form.titulo,
      descripcion: form.descripcion,
      fecha_cierre: form.fecha_cierre || null,
      autor_id: user?.id || null,
    })
    setSaving(false)
    if (error || !data) {
      setErrorMsg(error || 'No se pudo publicar la propuesta.')
      return
    }
    setPropuestas(prev => [data, ...prev])
    setShowForm(false)
    setForm({ titulo: '', descripcion: '', fecha_cierre: '' })
  }

  const toggleEstado = async (p: Propuesta) => {
    const nuevoEstado: 'activa' | 'cerrada' = p.estado === 'activa' ? 'cerrada' : 'activa'
    const { success, error } = await cambiarEstadoPropuestaAdmin(p.id, nuevoEstado)
    if (!success) {
      setErrorMsg(error || 'No se pudo actualizar el estado de la propuesta.')
      return
    }
    setPropuestas(prev => prev.map(item => item.id === p.id ? { ...item, estado: nuevoEstado } : item))
  }

  const handleEliminar = async (p: Propuesta) => {
    if (!window.confirm(`¿Eliminar la propuesta "${p.titulo}" y sus votos registrados?`)) return
    const { success, error } = await eliminarPropuestaAdmin(p.id)
    if (!success) {
      setErrorMsg(error || 'No se pudo eliminar la propuesta.')
      return
    }
    setPropuestas(prev => prev.filter(item => item.id !== p.id))
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '28px' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ color: '#fff', fontSize: '24px', fontWeight: 800, margin: 0 }}>🗳️ Gestión de Propuestas</h1>
          <p style={{ color: '#666', fontSize: '14px', marginTop: '4px' }}>Crea y administra votaciones comunitarias en tiempo real para residentes</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            backgroundColor: 'var(--color-accent, #f97316)',
            color: '#fff',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '10px',
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: '14px',
            flexShrink: 0,
          }}
        >
          {showForm ? 'Cancelar' : '+ Nueva Propuesta'}
        </button>
      </div>

      {errorMsg && (
        <div style={{ backgroundColor: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', color: '#fca5a5', padding: '12px 16px', borderRadius: '10px', marginBottom: '20px', fontSize: '13px' }}>
          ⚠️ {errorMsg}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCrear} style={{ backgroundColor: '#141414', border: '1px solid #2a2a2a', borderRadius: '14px', padding: '24px', marginBottom: '24px' }}>
          <h3 style={{ color: '#fff', marginBottom: '18px', fontSize: '15px', marginTop: 0 }}>Nueva Propuesta</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={labelStyle}>Título *</label>
              <input required style={inputStyle} value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} placeholder="Ej. Impermeabilización de azotea" />
            </div>
            <div>
              <label style={labelStyle}>Descripción *</label>
              <textarea required rows={3} style={{ ...inputStyle, resize: 'vertical' }} value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} placeholder="Describe claramente los alcances y el costo estimado..." />
            </div>
            <div>
              <label style={labelStyle}>Fecha de cierre (opcional)</label>
              <input type="date" style={inputStyle} value={form.fecha_cierre} onChange={e => setForm({ ...form, fecha_cierre: e.target.value })} />
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid #262626', borderRadius: '8px', padding: '10px 12px' }}>
              Opciones estándar habilitadas por apartamento: <strong>Sí, estoy de acuerdo</strong> · <strong>No estoy de acuerdo</strong> · <strong>Me abstengo</strong>.
            </div>
          </div>
          <button
            type="submit"
            disabled={saving}
            style={{ marginTop: '20px', backgroundColor: 'var(--color-accent, #f97316)', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '10px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700, opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Publicando...' : '🗳️ Publicar Propuesta'}
          </button>
        </form>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px', color: '#64748b' }}>Cargando propuestas...</div>
      ) : propuestas.length === 0 ? (
        <div style={{ backgroundColor: '#141414', border: '1px dashed #2a2a2a', borderRadius: '14px', padding: '48px 20px', textAlign: 'center', color: '#888' }}>
          <div style={{ fontSize: '32px', marginBottom: '10px' }}>🗳️</div>
          <div style={{ color: '#fff', fontWeight: 700, marginBottom: '4px' }}>No hay propuestas creadas</div>
          <div style={{ fontSize: '13px' }}>Publica la primera votación para recopilar la opinión de cada apartamento.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {propuestas.map(p => {
            const totalVotos = p.opciones.reduce((acc, o) => acc + o.votos_count, 0)
            const maxVotos = Math.max(...p.opciones.map(o => o.votos_count), 0)
            const isActiva = p.estado === 'activa'

            return (
              <div key={p.id} style={{ backgroundColor: '#141414', border: '1px solid #1e1e1e', borderRadius: '14px', padding: '20px', minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
                  <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                    <p style={{ color: '#fff', fontSize: '15px', fontWeight: 700, margin: 0, overflowWrap: 'break-word' }}>{p.titulo}</p>
                    <p style={{ color: '#94a3b8', fontSize: '12.5px', margin: '4px 0', overflowWrap: 'break-word' }}>{p.descripcion}</p>
                    <p style={{ color: '#888', fontSize: '12px', margin: '4px 0 0' }}>
                      {p.fecha_cierre ? `Cierra: ${new Date(p.fecha_cierre).toLocaleDateString('es-VE')}` : 'Sin fecha de cierre'} · {totalVotos} {totalVotos === 1 ? 'voto total' : 'votos totales'}
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flexShrink: 0 }}>
                    <span style={{
                      backgroundColor: isActiva ? '#10b98115' : '#66666615',
                      color: isActiva ? '#10b981' : '#888',
                      border: `1px solid ${isActiva ? '#10b98130' : '#33333330'}`,
                      padding: '4px 10px',
                      borderRadius: '999px',
                      fontSize: '11px',
                      fontWeight: 700,
                    }}>
                      {isActiva ? 'Activa' : 'Cerrada'}
                    </span>
                    <button onClick={() => toggleEstado(p)} style={{ backgroundColor: '#2a2a2a', color: '#cbd5e1', border: 'none', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>
                      {isActiva ? 'Cerrar' : 'Reabrir'}
                    </button>
                    <button onClick={() => handleEliminar(p)} style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.28)', padding: '6px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>
                      Eliminar
                    </button>
                  </div>
                </div>

                {/* Resultados */}
                {p.opciones.map(op => {
                  const pct = totalVotos > 0 ? Math.round((op.votos_count / totalVotos) * 100) : 0
                  const isWinner = op.votos_count === maxVotos && totalVotos > 0
                  return (
                    <div key={op.id} style={{ marginBottom: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px', fontSize: '12px', marginBottom: '4px' }}>
                        <span style={{ color: isWinner ? 'var(--color-accent, #f97316)' : '#888' }}>{op.texto} {isWinner && '🏆'}</span>
                        <span style={{ color: '#fff', fontWeight: 600 }}>{op.votos_count} votos ({pct}%)</span>
                      </div>
                      <div style={{ height: '6px', backgroundColor: '#222', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, backgroundColor: isWinner ? 'var(--color-accent, #f97316)' : '#444', borderRadius: '3px', transition: 'width 0.5s ease' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
