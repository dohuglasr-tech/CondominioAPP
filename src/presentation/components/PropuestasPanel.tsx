import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../application/contexts/AuthContext'
import { obtenerPropuestasActivas, emitirVoto, Propuesta, OpcionVoto } from '../../data/propuestasService'

export const PropuestasPanel: React.FC = () => {
  const navigate = useNavigate()
  const { perfil } = useAuth()
  const apartamentoId = perfil?.apartamento_id ?? ''

  const [propuestas, setPropuestas] = useState<Propuesta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Guardar qué opciones ha votado el usuario localmente
  const [votosEmitidos, setVotosEmitidos] = useState<Record<string, string>>({})

  useEffect(() => {
    obtenerPropuestasActivas().then(({ data, error: err }) => {
      setPropuestas(data)
      if (err) setError(err)
      setLoading(false)
    })
  }, [])

  const handleVotar = async (propuestaId: string, opcionId: string) => {
    if (votosEmitidos[propuestaId]) return; // Ya votó en esta sesión

    const { success, error: err } = await emitirVoto(propuestaId, opcionId, apartamentoId)
    if (success) {
      setVotosEmitidos(prev => ({ ...prev, [propuestaId]: opcionId }))
      // Actualizar conteo local
      setPropuestas(prev => prev.map(p => {
        if (p.id === propuestaId) {
          return {
            ...p,
            opciones: p.opciones.map(o => o.id === opcionId ? { ...o, votos_count: o.votos_count + 1 } : o)
          }
        }
        return p
      }))
    } else {
      alert('Error al votar: ' + err)
    }
  }

  const calcularTotalVotos = (opciones: OpcionVoto[]) => opciones.reduce((acc, op) => acc + op.votos_count, 0)

  const st = {
    overlay: { width: '100%', height: '100%', backgroundColor: '#0a0a0a', display: 'flex', flexDirection: 'column' as const, padding: '20px' },
    panel: { flex: 1, backgroundColor: '#1c1c1c', borderRadius: '16px', display: 'flex', flexDirection: 'column' as const, overflow: 'hidden', border: '1px solid #2a2a2a' },
    header: { padding: '24px 28px', borderBottom: '1px solid #2a2a2a', backgroundColor: '#141414' },
    title: { color: '#fff', fontSize: '20px', fontWeight: 700 },
    body: { flex: 1, overflowY: 'auto' as const, padding: '16px 28px 28px 28px' },
    card: { backgroundColor: '#141414', border: '1px solid #2a2a2a', borderRadius: '14px', padding: '20px', marginBottom: '16px' },
    optionBtn: {
      width: '100%', padding: '12px', marginTop: '10px', borderRadius: '8px', 
      border: '1px solid #333', backgroundColor: '#1e1e1e', color: '#fff',
      cursor: 'pointer', textAlign: 'left' as const, display: 'flex', justifyContent: 'space-between', transition: 'all 0.2s'
    },
    progressBar: { height: '6px', borderRadius: '4px', backgroundColor: '#333', marginTop: '8px', overflow: 'hidden' },
    progressFill: { height: '100%', backgroundColor: '#f97316', transition: 'width 0.3s ease' }
  }

  return (
    <div style={st.overlay}>
      <div style={st.panel}>
        <div style={{ height: '4px', background: 'linear-gradient(90deg, transparent, #f97316, transparent)' }} />
        <div style={st.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => navigate('/')}
              style={{ background: 'transparent', border: 'none', color: '#888', fontSize: '24px', cursor: 'pointer', padding: 0 }}
            >
              ←
            </button>
            <h2 style={st.title}>🗳️ Propuestas y Votaciones</h2>
          </div>
        </div>

        <div style={st.body}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>Cargando propuestas...</div>
          ) : error ? (
            <div style={{ color: '#fca5a5', textAlign: 'center', padding: '40px' }}>{error}</div>
          ) : propuestas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
              <p style={{ fontSize: '32px', marginBottom: '12px' }}>💤</p>
              <p>No hay propuestas activas en este momento.</p>
            </div>
          ) : (
            propuestas.map(prop => {
              const totalVotos = calcularTotalVotos(prop.opciones)
              const yaVoto = votosEmitidos[prop.id]

              return (
                <div key={prop.id} style={st.card} className="animate-slide-up">
                  <h3 style={{ color: '#fff', fontSize: '18px', marginBottom: '8px' }}>{prop.titulo}</h3>
                  <p style={{ color: '#888', fontSize: '14px', marginBottom: '20px', lineHeight: '1.5' }}>{prop.descripcion}</p>
                  
                  {prop.opciones.map(op => {
                    const pct = totalVotos > 0 ? Math.round((op.votos_count / totalVotos) * 100) : 0
                    const isSelected = yaVoto === op.id
                    
                    return (
                      <div key={op.id}>
                        <button
                          disabled={!!yaVoto}
                          onClick={() => handleVotar(prop.id, op.id)}
                          style={{
                            ...st.optionBtn,
                            borderColor: isSelected ? '#f97316' : '#333',
                            backgroundColor: isSelected ? '#f9731615' : '#1e1e1e'
                          }}
                        >
                          <span style={{ fontWeight: isSelected ? 700 : 400, color: isSelected ? '#f97316' : '#fff' }}>
                            {op.texto}
                          </span>
                          {yaVoto && (
                            <span style={{ color: '#888', fontSize: '13px' }}>{pct}% ({op.votos_count})</span>
                          )}
                        </button>
                        {yaVoto && (
                          <div style={st.progressBar}>
                            <div style={{ ...st.progressFill, width: `${pct}%`, backgroundColor: isSelected ? '#f97316' : '#555' }} />
                          </div>
                        )}
                      </div>
                    )
                  })}
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px', borderTop: '1px solid #2a2a2a', paddingTop: '12px' }}>
                    <span style={{ color: '#666', fontSize: '12px' }}>Cierra: {new Date(prop.fecha_cierre).toLocaleDateString()}</span>
                    <span style={{ color: yaVoto ? '#10b981' : '#f59e0b', fontSize: '12px', fontWeight: 600 }}>
                      {yaVoto ? '✓ Voto registrado' : 'Pendiente por votar'}
                    </span>
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
