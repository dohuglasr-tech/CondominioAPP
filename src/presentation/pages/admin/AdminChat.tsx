import React, { useState } from 'react'

const MENSAJES_MOCK = [
  { id: '1', remitente: 'María González', apto: '1-A', texto: 'Buenos días, ¿cuándo van a revisar el ascensor?', timestamp: '2026-09-24T09:15:00Z', esAdmin: false },
  { id: '2', remitente: 'Admin Torre 5', apto: '', texto: 'Buen día vecinos, el técnico del ascensor vendrá el miércoles en la mañana.', timestamp: '2026-09-24T10:00:00Z', esAdmin: true },
  { id: '3', remitente: 'Carlos Rodríguez', apto: '2-B', texto: 'Gracias por la información!', timestamp: '2026-09-24T10:05:00Z', esAdmin: false },
]

export const AdminChat: React.FC = () => {
  const [mensajes, setMensajes] = useState(MENSAJES_MOCK)
  const [input, setInput] = useState('')
  const [anuncio, setAnuncio] = useState('')

  const enviarMensaje = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    setMensajes(prev => [...prev, { id: String(Date.now()), remitente: 'Admin Torre 5', apto: '', texto: input, timestamp: new Date().toISOString(), esAdmin: true }])
    setInput('')
  }

  const enviarAnuncio = (e: React.FormEvent) => {
    e.preventDefault()
    if (!anuncio.trim()) return
    setMensajes(prev => [...prev, { id: String(Date.now()), remitente: '📣 ANUNCIO OFICIAL', apto: '', texto: anuncio, timestamp: new Date().toISOString(), esAdmin: true }])
    setAnuncio('')
    alert('Anuncio enviado a todos los residentes.')
  }

  return (
    <div style={{ padding: '32px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ color: '#fff', fontSize: '24px', fontWeight: 800, margin: 0 }}>💬 Chat Comunitario</h1>
        <p style={{ color: '#666', fontSize: '14px', marginTop: '4px' }}>Gestiona mensajes y envía anuncios</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px', flex: 1, minHeight: 0 }}>
        {/* Chat */}
        <div style={{ backgroundColor: '#141414', border: '1px solid #1e1e1e', borderRadius: '14px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {mensajes.map(m => (
              <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: m.esAdmin ? 'flex-end' : 'flex-start' }}>
                {!m.esAdmin && (
                  <span style={{ color: '#555', fontSize: '11px', marginBottom: '4px' }}>Apto {m.apto} · {m.remitente}</span>
                )}
                <div style={{
                  maxWidth: '70%', padding: '10px 14px', borderRadius: m.esAdmin ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  backgroundColor: m.esAdmin ? '#f97316' : '#1e1e1e',
                  color: '#fff', fontSize: '13px', lineHeight: '1.5'
                }}>
                  {m.texto}
                </div>
                <span style={{ color: '#444', fontSize: '10px', marginTop: '4px' }}>{new Date(m.timestamp).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
          <form onSubmit={enviarMensaje} style={{ padding: '12px', borderTop: '1px solid #1e1e1e', display: 'flex', gap: '8px' }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Responder como administrador..."
              style={{ flex: 1, backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a', color: '#fff', padding: '10px 14px', borderRadius: '8px', fontSize: '13px' }}
            />
            <button type="submit" style={{ backgroundColor: '#f97316', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>
              Enviar
            </button>
          </form>
        </div>

        {/* Panel de Anuncios */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ backgroundColor: '#141414', border: '1px solid #1e1e1e', borderRadius: '14px', padding: '20px' }}>
            <h3 style={{ color: '#fff', fontSize: '14px', fontWeight: 700, marginBottom: '16px' }}>📣 Enviar Anuncio Masivo</h3>
            <p style={{ color: '#666', fontSize: '12px', marginBottom: '12px' }}>Se enviará como notificación a todos los apartamentos.</p>
            <form onSubmit={enviarAnuncio}>
              <textarea
                rows={5}
                value={anuncio}
                onChange={e => setAnuncio(e.target.value)}
                placeholder="Ej: Corte de agua el martes de 8am a 12pm para mantenimiento de tuberías..."
                style={{ width: '100%', backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a', color: '#fff', padding: '10px', borderRadius: '8px', fontSize: '13px', resize: 'none', marginBottom: '12px' }}
              />
              <button type="submit" style={{ width: '100%', backgroundColor: '#f97316', color: '#fff', border: 'none', padding: '12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '14px' }}>
                📤 Publicar Anuncio
              </button>
            </form>
          </div>

          <div style={{ backgroundColor: '#141414', border: '1px solid #1e1e1e', borderRadius: '14px', padding: '20px' }}>
            <h3 style={{ color: '#fff', fontSize: '14px', fontWeight: 700, marginBottom: '12px' }}>📊 Estadísticas</h3>
            {[{ label: 'Mensajes hoy', value: '7' }, { label: 'Residentes activos', value: '18' }, { label: 'Anuncios del mes', value: '3' }].map((s, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < 2 ? '1px solid #1e1e1e' : 'none' }}>
                <span style={{ color: '#888', fontSize: '13px' }}>{s.label}</span>
                <span style={{ color: '#fff', fontWeight: 700 }}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
