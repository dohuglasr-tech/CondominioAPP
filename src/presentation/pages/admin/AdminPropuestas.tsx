import React, { useState } from 'react'

const PROPUESTAS_MOCK: any[] = []

const inputStyle: React.CSSProperties = { width: '100%', backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a', color: '#fff', padding: '10px 12px', borderRadius: '8px', fontSize: '13px' }
const labelStyle: React.CSSProperties = { display: 'block', color: '#888', fontSize: '12px', marginBottom: '6px' }

export const AdminPropuestas: React.FC = () => {
  const [propuestas, setPropuestas] = useState(PROPUESTAS_MOCK)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ titulo: '', descripcion: '', fecha_cierre: '', opciones: ['', ''] })

  const addOpcion = () => setForm(prev => ({ ...prev, opciones: [...prev.opciones, ''] }))
  const updateOpcion = (i: number, val: string) => setForm(prev => {
    const opciones = [...prev.opciones]
    opciones[i] = val
    return { ...prev, opciones }
  })

  const handleCrear = (e: React.FormEvent) => {
    e.preventDefault()
    const nueva = { id: String(Date.now()), titulo: form.titulo, descripcion: form.descripcion, fecha_cierre: form.fecha_cierre, estado: 'activa', votos: form.opciones.map(() => 0) }
    setPropuestas(prev => [nueva, ...prev])
    setShowForm(false)
    setForm({ titulo: '', descripcion: '', fecha_cierre: '', opciones: ['', ''] })
  }

  const toggleEstado = (id: string) => {
    setPropuestas(prev => prev.map(p => p.id === id ? { ...p, estado: p.estado === 'activa' ? 'cerrada' : 'activa' } : p))
  }

  return (
    <div style={{ padding: '32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
        <div>
          <h1 style={{ color: '#fff', fontSize: '24px', fontWeight: 800, margin: 0 }}>🗳️ Gestión de Propuestas</h1>
          <p style={{ color: '#666', fontSize: '14px', marginTop: '4px' }}>Crea y administra votaciones para residentes</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} style={{ backgroundColor: '#f97316', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '10px', cursor: 'pointer', fontWeight: 700, fontSize: '14px' }}>
          {showForm ? 'Cancelar' : '+ Nueva Propuesta'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCrear} style={{ backgroundColor: '#141414', border: '1px solid #2a2a2a', borderRadius: '14px', padding: '24px', marginBottom: '24px' }}>
          <h3 style={{ color: '#fff', marginBottom: '20px', fontSize: '15px' }}>Nueva Propuesta</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={labelStyle}>Título *</label>
              <input required style={inputStyle} value={form.titulo} onChange={e => setForm({...form, titulo: e.target.value})} />
            </div>
            <div>
              <label style={labelStyle}>Descripción</label>
              <textarea rows={3} style={{ ...inputStyle, resize: 'none' }} value={form.descripcion} onChange={e => setForm({...form, descripcion: e.target.value})} />
            </div>
            <div>
              <label style={labelStyle}>Fecha de cierre</label>
              <input type="date" style={inputStyle} value={form.fecha_cierre} onChange={e => setForm({...form, fecha_cierre: e.target.value})} />
            </div>
            <div>
              <label style={labelStyle}>Opciones de voto</label>
              {form.opciones.map((op, i) => (
                <input key={i} required style={{ ...inputStyle, marginBottom: '8px' }} value={op} onChange={e => updateOpcion(i, e.target.value)} placeholder={`Opción ${i + 1}`} />
              ))}
              <button type="button" onClick={addOpcion} style={{ backgroundColor: 'transparent', color: '#f97316', border: '1px dashed #f97316', padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', marginTop: '4px' }}>
                + Agregar opción
              </button>
            </div>
          </div>
          <button type="submit" style={{ marginTop: '20px', backgroundColor: '#f97316', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: '10px', cursor: 'pointer', fontWeight: 700 }}>
            🗳️ Publicar Propuesta
          </button>
        </form>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {propuestas.map(p => {
          const totalVotos = p.votos.reduce((a, b) => a + b, 0)
          return (
            <div key={p.id} style={{ backgroundColor: '#141414', border: '1px solid #1e1e1e', borderRadius: '14px', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div>
                  <p style={{ color: '#fff', fontSize: '15px', fontWeight: 700 }}>{p.titulo}</p>
                  <p style={{ color: '#888', fontSize: '12px', marginTop: '2px' }}>Cierra: {new Date(p.fecha_cierre).toLocaleDateString()} · {totalVotos} votos totales</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ backgroundColor: p.estado === 'activa' ? '#10b98115' : '#66666615', color: p.estado === 'activa' ? '#10b981' : '#666', border: `1px solid ${p.estado === 'activa' ? '#10b98130' : '#33333330'}`, padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 700 }}>
                    {p.estado === 'activa' ? 'Activa' : 'Cerrada'}
                  </span>
                  <button onClick={() => toggleEstado(p.id)} style={{ backgroundColor: '#2a2a2a', color: '#888', border: 'none', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' }}>
                    {p.estado === 'activa' ? 'Cerrar' : 'Reabrir'}
                  </button>
                </div>
              </div>
              {/* Resultados */}
              {p.votos.map((v, i) => {
                const pct = totalVotos > 0 ? Math.round((v / totalVotos) * 100) : 0
                const isWinner = v === Math.max(...p.votos) && totalVotos > 0
                return (
                  <div key={i} style={{ marginBottom: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                      <span style={{ color: isWinner ? '#f97316' : '#888' }}>Opción {i + 1} {isWinner && '🏆'}</span>
                      <span style={{ color: '#fff', fontWeight: 600 }}>{v} votos ({pct}%)</span>
                    </div>
                    <div style={{ height: '6px', backgroundColor: '#222', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, backgroundColor: isWinner ? '#f97316' : '#444', borderRadius: '3px', transition: 'width 0.5s ease' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
