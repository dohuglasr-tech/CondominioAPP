import React, { useState } from 'react'

const REPORTES_MOCK = [
  { id: '1', titulo: 'Bombillo fundido pasillo piso 4', categoria: 'mantenimiento', estado: 'en_progreso', descripcion: 'El bombillo frente al apartamento 42 se fundió.', apartamento: '4-B', created_at: '2026-09-22T08:30:00Z', respuesta_admin: 'El conserje lo cambiará hoy.' },
  { id: '2', titulo: 'Fuga de agua tubería externa', categoria: 'mantenimiento', estado: 'abierto', descripcion: 'Bote de agua constante cerca de los jardines.', apartamento: '7-A', created_at: '2026-09-21T14:00:00Z', respuesta_admin: '' },
  { id: '3', titulo: 'Ruido nocturno piso 8', categoria: 'ruido', estado: 'resuelto', descripcion: 'Fiesta hasta las 3am el viernes.', apartamento: '8-C', created_at: '2026-09-19T22:00:00Z', respuesta_admin: 'Se habló con el residente, comprometido a no repetirlo.' },
]

const ESTADOS: Record<string, { label: string, color: string }> = {
  abierto: { label: 'Abierto', color: '#ef4444' },
  en_progreso: { label: 'En Progreso', color: '#f59e0b' },
  resuelto: { label: 'Resuelto', color: '#10b981' },
}

const inputStyle: React.CSSProperties = { width: '100%', backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a', color: '#fff', padding: '10px 12px', borderRadius: '8px', fontSize: '13px' }

export const AdminReportes: React.FC = () => {
  const [reportes, setReportes] = useState(REPORTES_MOCK)
  const [selected, setSelected] = useState<string | null>(null)
  const [respuesta, setRespuesta] = useState('')
  const [nuevoEstado, setNuevoEstado] = useState('en_progreso')

  const handleResponder = (id: string) => {
    setReportes(prev => prev.map(r => r.id === id ? { ...r, respuesta_admin: respuesta, estado: nuevoEstado } : r))
    setSelected(null)
    setRespuesta('')
  }

  return (
    <div style={{ padding: '32px' }}>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ color: '#fff', fontSize: '24px', fontWeight: 800, margin: 0 }}>📢 Gestión de Reportes</h1>
        <p style={{ color: '#666', fontSize: '14px', marginTop: '4px' }}>Responde las incidencias de los residentes</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {reportes.map(rep => {
          const est = ESTADOS[rep.estado]
          const isSelected = selected === rep.id
          return (
            <div key={rep.id} style={{ backgroundColor: '#141414', border: `1px solid ${isSelected ? '#f97316' : '#1e1e1e'}`, borderRadius: '14px', padding: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <p style={{ color: '#fff', fontSize: '15px', fontWeight: 700 }}>{rep.titulo}</p>
                  <p style={{ color: '#888', fontSize: '12px', marginTop: '4px' }}>Apto {rep.apartamento} · {rep.categoria} · {new Date(rep.created_at).toLocaleDateString()}</p>
                  <p style={{ color: '#aaa', fontSize: '13px', marginTop: '8px', lineHeight: '1.5' }}>{rep.descripcion}</p>
                  {rep.respuesta_admin && (
                    <div style={{ marginTop: '10px', backgroundColor: '#111', padding: '10px', borderRadius: '8px', borderLeft: '3px solid #f97316' }}>
                      <span style={{ display: 'block', fontSize: '11px', color: '#f97316', fontWeight: 700, marginBottom: '4px' }}>RESPUESTA ADMIN:</span>
                      <p style={{ color: '#ccc', fontSize: '12px' }}>{rep.respuesta_admin}</p>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', marginLeft: '16px' }}>
                  <span style={{ backgroundColor: `${est.color}15`, color: est.color, border: `1px solid ${est.color}30`, padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 700 }}>{est.label}</span>
                  <button onClick={() => setSelected(isSelected ? null : rep.id)} style={{ backgroundColor: '#2a2a2a', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' }}>
                    {isSelected ? 'Cancelar' : 'Responder'}
                  </button>
                </div>
              </div>

              {isSelected && (
                <div style={{ marginTop: '16px', borderTop: '1px solid #2a2a2a', paddingTop: '16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', marginBottom: '12px' }}>
                    <div>
                      <label style={{ display: 'block', color: '#888', fontSize: '12px', marginBottom: '6px' }}>Tu respuesta al residente</label>
                      <textarea rows={3} style={{ ...inputStyle, resize: 'none' }} value={respuesta} onChange={e => setRespuesta(e.target.value)} placeholder="Explica las acciones tomadas..." />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: '#888', fontSize: '12px', marginBottom: '6px' }}>Cambiar estado a</label>
                      <select style={inputStyle} value={nuevoEstado} onChange={e => setNuevoEstado(e.target.value)}>
                        <option value="en_progreso">En Progreso</option>
                        <option value="resuelto">Resuelto</option>
                        <option value="cerrado">Cerrado</option>
                      </select>
                    </div>
                  </div>
                  <button onClick={() => handleResponder(rep.id)} style={{ backgroundColor: '#f97316', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>
                    📤 Enviar Respuesta
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
