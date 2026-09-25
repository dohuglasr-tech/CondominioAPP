import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../application/contexts/AuthContext'
import { obtenerReportes, crearReporte, Reporte } from '../../data/reportesService'

const CATEGORIAS_CONFIG: Record<string, { label: string, color: string, icon: string }> = {
  mantenimiento: { label: 'Mantenimiento', color: '#3b82f6', icon: '🔧' },
  ruido: { label: 'Ruido', color: '#f59e0b', icon: '🔊' },
  seguridad: { label: 'Seguridad', color: '#ef4444', icon: '🛡️' },
  limpieza: { label: 'Limpieza', color: '#10b981', icon: '🧹' },
  otro: { label: 'Otro', color: '#8b5cf6', icon: '📌' },
}

const ESTADOS_CONFIG: Record<string, { label: string, color: string }> = {
  abierto: { label: 'Abierto', color: '#ef4444' },
  en_progreso: { label: 'En Progreso', color: '#f59e0b' },
  resuelto: { label: 'Resuelto', color: '#10b981' },
  cerrado: { label: 'Cerrado', color: '#6b7280' },
}

export const ReportesPanel: React.FC = () => {
  const navigate = useNavigate()
  const { perfil } = useAuth()
  const apartamentoId = perfil?.apartamento_id ?? ''

  const [reportes, setReportes] = useState<Reporte[]>([])
  const [loading, setLoading] = useState(true)
  const [_error, setError] = useState<string | null>(null)
  
  // Modal State
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ titulo: '', descripcion: '', categoria: 'mantenimiento' as any })
  const [enviando, setEnviando] = useState(false)

  const cargarDatos = () => {
    setLoading(true)
    obtenerReportes(apartamentoId).then(({ data, error: err }) => {
      setReportes(data)
      if (err) setError(err)
      setLoading(false)
    })
  }

  useEffect(() => {
    cargarDatos()
  }, [apartamentoId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.titulo || !formData.descripcion) return
    setEnviando(true)
    
    const res = await crearReporte({ ...formData, apartamento_id: apartamentoId })
    if (res.success) {
      setShowForm(false)
      setFormData({ titulo: '', descripcion: '', categoria: 'mantenimiento' })
      cargarDatos() // Reload mock data (although in mock it wont persist unless we modify the mock, but it shows flow)
      alert("Reporte enviado correctamente. (Mock)")
    } else {
      alert("Error: " + res.error)
    }
    setEnviando(false)
  }

  const st = {
    overlay: { width: '100%', height: '100%', backgroundColor: '#0a0a0a', display: 'flex', flexDirection: 'column' as const, padding: '20px' },
    panel: { flex: 1, backgroundColor: '#1c1c1c', borderRadius: '16px', display: 'flex', flexDirection: 'column' as const, overflow: 'hidden', border: '1px solid #2a2a2a' },
    header: { padding: '24px 28px', borderBottom: '1px solid #2a2a2a', backgroundColor: '#141414', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    title: { color: '#fff', fontSize: '20px', fontWeight: 700 },
    body: { flex: 1, overflowY: 'auto' as const, padding: '16px 28px 28px 28px' },
    card: { backgroundColor: '#141414', border: '1px solid #2a2a2a', borderRadius: '14px', padding: '16px', marginBottom: '12px' },
    badge: (color: string) => ({ display: 'inline-flex', alignItems: 'center', backgroundColor: `${color}15`, border: `1px solid ${color}30`, color, fontSize: '11px', fontWeight: 700, padding: '4px 8px', borderRadius: '6px' }),
    fab: { position: 'absolute' as const, bottom: '30px', right: '30px', width: '56px', height: '56px', borderRadius: '28px', backgroundColor: '#f97316', color: '#fff', fontSize: '24px', display: 'flex', justifyContent: 'center', alignItems: 'center', border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(249, 115, 22, 0.4)' },
    formGroup: { marginBottom: '16px' },
    label: { display: 'block', color: '#888', fontSize: '13px', marginBottom: '6px' },
    input: { width: '100%', backgroundColor: '#141414', border: '1px solid #2a2a2a', color: '#fff', padding: '12px', borderRadius: '8px', fontSize: '14px' },
    btnSubmit: { width: '100%', backgroundColor: '#f97316', color: '#fff', border: 'none', padding: '12px', borderRadius: '8px', fontSize: '15px', fontWeight: 700, cursor: 'pointer' }
  }

  return (
    <div style={st.overlay}>
      <div style={st.panel}>
        <div style={{ height: '4px', background: 'linear-gradient(90deg, transparent, #f97316, transparent)' }} />
        <div style={st.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={() => navigate('/')} style={{ background: 'transparent', border: 'none', color: '#888', fontSize: '24px', cursor: 'pointer', padding: 0 }}>←</button>
            <h2 style={st.title}>📢 Mis Reportes</h2>
          </div>
          <button 
            onClick={() => setShowForm(true)} 
            style={{ backgroundColor: '#2a2a2a', color: '#fff', border: '1px solid #333', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
          >
            + Nuevo
          </button>
        </div>

        <div style={st.body}>
          {showForm ? (
            <form onSubmit={handleSubmit} className="animate-slide-up" style={{ backgroundColor: '#111', padding: '24px', borderRadius: '12px', border: '1px solid #2a2a2a' }}>
              <h3 style={{ color: '#fff', marginBottom: '20px' }}>Crear Nuevo Reporte</h3>
              <div style={st.formGroup}>
                <label style={st.label}>Categoría</label>
                <select 
                  style={st.input} 
                  value={formData.categoria} 
                  onChange={e => setFormData({...formData, categoria: e.target.value})}
                >
                  {Object.entries(CATEGORIAS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                </select>
              </div>
              <div style={st.formGroup}>
                <label style={st.label}>Título corto</label>
                <input required style={st.input} placeholder="Ej. Bombillo fundido" value={formData.titulo} onChange={e => setFormData({...formData, titulo: e.target.value})} />
              </div>
              <div style={st.formGroup}>
                <label style={st.label}>Descripción detallada</label>
                <textarea required rows={4} style={{...st.input, resize: 'none'}} placeholder="Explica el problema..." value={formData.descripcion} onChange={e => setFormData({...formData, descripcion: e.target.value})} />
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button type="button" onClick={() => setShowForm(false)} style={{ flex: 1, backgroundColor: 'transparent', color: '#888', border: '1px solid #333', padding: '12px', borderRadius: '8px', cursor: 'pointer' }}>Cancelar</button>
                <button type="submit" disabled={enviando} style={{ flex: 1, ...st.btnSubmit }}>{enviando ? 'Enviando...' : 'Enviar Reporte'}</button>
              </div>
            </form>
          ) : loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>Cargando reportes...</div>
          ) : reportes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
              <p style={{ fontSize: '32px', marginBottom: '12px' }}>✅</p>
              <p>No tienes reportes activos.</p>
            </div>
          ) : (
            reportes.map(rep => {
              const cat = CATEGORIAS_CONFIG[rep.categoria] || CATEGORIAS_CONFIG.otro
              const est = ESTADOS_CONFIG[rep.estado]

              return (
                <div key={rep.id} style={st.card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <h3 style={{ color: '#fff', fontSize: '15px' }}>{cat.icon} {rep.titulo}</h3>
                    <div style={st.badge(est.color)}>{est.label}</div>
                  </div>
                  <p style={{ color: '#888', fontSize: '13px', lineHeight: '1.5', marginBottom: '12px' }}>{rep.descripcion}</p>
                  
                  {rep.respuesta_admin && (
                    <div style={{ backgroundColor: '#111', padding: '10px', borderRadius: '8px', borderLeft: '3px solid #f97316' }}>
                      <span style={{ display: 'block', fontSize: '11px', color: '#f97316', fontWeight: 600, marginBottom: '4px' }}>RESPUESTA DE ADMINISTRACIÓN:</span>
                      <p style={{ fontSize: '12px', color: '#ccc' }}>{rep.respuesta_admin}</p>
                    </div>
                  )}
                  <div style={{ marginTop: '12px', fontSize: '11px', color: '#555', textAlign: 'right' }}>
                    {new Date(rep.created_at).toLocaleString()}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
