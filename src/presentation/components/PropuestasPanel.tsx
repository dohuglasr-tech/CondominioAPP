import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../application/contexts/AuthContext'
import { obtenerPropuestasActivas, emitirVoto, Propuesta, OpcionVoto } from '../../data/propuestasService'

export const PropuestasPanel: React.FC = () => {
  const navigate = useNavigate()
  const { perfil, user } = useAuth()
  const apartamentoId = perfil?.apartamento_id ?? ''

  const [propuestas, setPropuestas] = useState<Propuesta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [votandoId, setVotandoId] = useState<string | null>(null)

  // Votos ya registrados por este apartamento
  const [votosEmitidos, setVotosEmitidos] = useState<Record<string, string>>({})

  useEffect(() => {
    let active = true
    obtenerPropuestasActivas(apartamentoId || undefined).then(({ data, error: err }) => {
      if (!active) return
      setPropuestas(data)
      const previos: Record<string, string> = {}
      data.forEach(p => {
        if (p.mi_voto) previos[p.id] = p.mi_voto
      })
      setVotosEmitidos(previos)
      if (err) setError(err)
      setLoading(false)
    })
    return () => { active = false }
  }, [apartamentoId])

  const handleVotar = async (propuestaId: string, opcionId: string) => {
    if (votosEmitidos[propuestaId] || votandoId) return

    setVotandoId(propuestaId)
    const { success, error: err } = await emitirVoto(propuestaId, opcionId, apartamentoId, user?.id)
    setVotandoId(null)

    if (success) {
      setVotosEmitidos(prev => ({ ...prev, [propuestaId]: opcionId }))
      setPropuestas(prev => prev.map(p => {
        if (p.id === propuestaId) {
          return {
            ...p,
            mi_voto: opcionId,
            opciones: p.opciones.map(o => o.id === opcionId ? { ...o, votos_count: o.votos_count + 1 } : o)
          }
        }
        return p
      }))
    } else {
      alert('No se pudo registrar el voto: ' + (err || 'Error desconocido'))
    }
  }

  const calcularTotalVotos = (opciones: OpcionVoto[]) => opciones.reduce((acc, op) => acc + op.votos_count, 0)

  const st = {
    overlay: { width: '100%', minHeight: '100%', backgroundColor: '#0a0a0a', display: 'flex', flexDirection: 'column' as const, padding: '20px', boxSizing: 'border-box' as const },
    panel: { flex: 1, backgroundColor: '#1c1c1c', borderRadius: '16px', display: 'flex', flexDirection: 'column' as const, overflow: 'hidden', border: '1px solid #2a2a2a', minWidth: 0 },
    header: { padding: '20px 24px', borderBottom: '1px solid #2a2a2a', backgroundColor: '#141414' },
    title: { color: '#fff', fontSize: '20px', fontWeight: 700, margin: 0 },
    body: { flex: 1, overflowY: 'auto' as const, padding: '16px 24px 28px 24px', minWidth: 0 },
    card: { backgroundColor: '#141414', border: '1px solid #2a2a2a', borderRadius: '14px', padding: '20px', marginBottom: '16px', minWidth: 0 },
    optionBtn: {
      width: '100%', padding: '12px', marginTop: '10px', borderRadius: '8px',
      border: '1px solid #333', backgroundColor: '#1e1e1e', color: '#fff',
      cursor: 'pointer', textAlign: 'left' as const, display: 'flex', justifyContent: 'space-between',
      alignItems: 'center', flexWrap: 'wrap' as const, gap: '8px', transition: 'all 0.2s'
    },
    progressBar: { height: '6px', borderRadius: '4px', backgroundColor: '#333', marginTop: '8px', overflow: 'hidden' },
    progressFill: { height: '100%', backgroundColor: 'var(--color-accent, #f97316)', transition: 'width 0.3s ease' }
  }

  return (
    <div style={st.overlay}>
      <div style={st.panel}>
        <div style={{ height: '4px', background: 'linear-gradient(90deg, transparent, var(--color-accent, #f97316), transparent)' }} />
        <div style={st.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
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
              const enviando = votandoId === prop.id

              return (
                <div key={prop.id} style={st.card} className="animate-slide-up">
                  <h3 style={{ color: '#fff', fontSize: '18px', marginBottom: '8px', overflowWrap: 'break-word' }}>{prop.titulo}</h3>
                  <p style={{ color: '#888', fontSize: '14px', marginBottom: '20px', lineHeight: '1.5', overflowWrap: 'break-word' }}>{prop.descripcion}</p>

                  {prop.opciones.map(op => {
                    const pct = totalVotos > 0 ? Math.round((op.votos_count / totalVotos) * 100) : 0
                    const isSelected = yaVoto === op.id

                    return (
                      <div key={op.id}>
                        <button
                          disabled={!!yaVoto || enviando}
                          onClick={() => handleVotar(prop.id, op.id)}
                          style={{
                            ...st.optionBtn,
                            borderColor: isSelected ? 'var(--color-accent, #f97316)' : '#333',
                            backgroundColor: isSelected ? 'var(--color-accent-light, #f9731615)' : '#1e1e1e',
                            opacity: enviando ? 0.6 : 1,
                          }}
                        >
                          <span style={{ fontWeight: isSelected ? 700 : 400, color: isSelected ? 'var(--color-accent, #f97316)' : '#fff', minWidth: 0, overflowWrap: 'break-word' }}>
                            {op.texto}
                          </span>
                          {yaVoto && (
                            <span style={{ color: '#888', fontSize: '13px', flexShrink: 0 }}>{pct}% ({op.votos_count})</span>
                          )}
                        </button>
                        {yaVoto && (
                          <div style={st.progressBar}>
                            <div style={{ ...st.progressFill, width: `${pct}%`, backgroundColor: isSelected ? 'var(--color-accent, #f97316)' : '#555' }} />
                          </div>
                        )}
                      </div>
                    )
                  })}

                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginTop: '20px', borderTop: '1px solid #2a2a2a', paddingTop: '12px' }}>
                    <span style={{ color: '#666', fontSize: '12px' }}>
                      {prop.fecha_cierre
                        ? `Cierra: ${new Date(prop.fecha_cierre).toLocaleDateString('es-VE')}`
                        : 'Sin fecha de cierre'}
                    </span>
                    <span style={{ color: yaVoto ? '#10b981' : '#f59e0b', fontSize: '12px', fontWeight: 600 }}>
                      {enviando ? 'Registrando voto...' : yaVoto ? '✓ Voto registrado' : 'Pendiente por votar'}
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
