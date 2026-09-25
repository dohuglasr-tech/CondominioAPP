import React, { useEffect, useState, useRef } from 'react'
import { supabase } from '../../data/supabase'
import { obtenerMensajes, enviarMensaje, ChatMensaje } from '../../data/chatService'
import { useAuth } from '../../application/contexts/AuthContext'
import { useNavigate } from 'react-router-dom'

interface ChatPanelProps {
  onClose: () => void
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ onClose }) => {
  const { session, profile, apartamento } = useAuth()
  const [mensajes, setMensajes] = useState<ChatMensaje[]>([])
  const [loading, setLoading] = useState(true)
  const [inputVal, setInputVal] = useState('')
  const [enviando, setEnviando] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  
  const navigate = useNavigate()

  const cargarMensajes = async () => {
    setLoading(true)
    const { data } = await obtenerMensajes(50)
    
    // Si no hay datos (ej. DB vacía), inyectamos unos mocks para demostrar diseño
    if (data.length === 0) {
      setMensajes([
        {
          id: '1',
          contenido: '¡Hola vecinos! Bienvenidos al chat comunitario de Torre 5.',
          adjunto_url: null, adjunto_tipo: null,
          created_at: new Date(Date.now() - 3600000).toISOString(),
          autor: { nombre_completo: 'Administración', rol: 'administrador', apartamento: null }
        },
        {
          id: '2',
          contenido: 'Hola, ¿Saben a qué hora racionan el agua hoy?',
          adjunto_url: null, adjunto_tipo: null,
          created_at: new Date(Date.now() - 1800000).toISOString(),
          autor: { nombre_completo: 'María Pérez', rol: 'residente', apartamento: { numero: '510' } }
        }
      ])
    } else {
      setMensajes(data)
    }
    setLoading(false)
    scrollToBottom()
  }

  useEffect(() => {
    cargarMensajes()

    // Suscripción a Realtime
    const channel = supabase
      .channel('chat_publico')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_mensajes' }, (payload) => {
        // Al recibir, recargamos (o insertamos). Lo más fácil es recargar por las relaciones (nombre, apto).
        cargarMensajes()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const scrollToBottom = () => {
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }
    }, 100)
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputVal.trim() || !session?.user.id) return

    setEnviando(true)
    const val = inputVal
    setInputVal('')

    // Insertar localmente para UX instantánea
    const tempMsg: ChatMensaje = {
      id: Math.random().toString(),
      contenido: val,
      adjunto_url: null, adjunto_tipo: null,
      created_at: new Date().toISOString(),
      autor: {
        nombre_completo: profile?.nombre_completo || 'Yo',
        rol: profile?.rol || 'residente',
        apartamento: apartamento ? { numero: apartamento.numero } : null
      }
    }
    setMensajes(prev => [...prev, tempMsg])
    scrollToBottom()

    // Enviar a Supabase
    await enviarMensaje(session.user.id, val)
    setEnviando(false)
  }

  // --- ESTILOS ---
  const st = {
    overlay: {
      width: '100%', height: '100%',
      backgroundColor: '#0a0a0a',
      display: 'flex', flexDirection: 'column' as const,
      padding: '20px'
    },
    modal: {
      flex: 1,
      backgroundColor: '#141414',
      border: '1px solid #2a2a2a',
      borderRadius: '20px',
      position: 'relative' as const, overflow: 'hidden',
      display: 'flex', flexDirection: 'column' as const
    },
    topAccent: {
      position: 'absolute' as const, top: 0, left: '20px', right: '20px', height: '3px',
      background: 'linear-gradient(90deg, transparent, #f97316, transparent)',
      borderRadius: '0 0 4px 4px',
    },
    header: {
      padding: '24px',
      borderBottom: '1px solid #2a2a2a',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      flexShrink: 0
    },
    title: { color: '#fff', fontSize: '20px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' },
    closeBtn: {
      background: '#2a2a2a', border: 'none', color: '#666',
      width: '34px', height: '34px', borderRadius: '50%',
      cursor: 'pointer', fontSize: '14px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'all 0.2s', flexShrink: 0
    },
    body: {
      flex: 1, padding: '20px',
      overflowY: 'auto' as const,
      display: 'flex', flexDirection: 'column' as const, gap: '16px'
    },
    messageRow: (isMe: boolean) => ({
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: isMe ? 'flex-end' : 'flex-start',
      width: '100%'
    }),
    bubble: (isMe: boolean, isAdmin: boolean) => ({
      maxWidth: '85%',
      padding: '12px 16px',
      borderRadius: isMe ? '16px 16px 2px 16px' : '16px 16px 16px 2px',
      backgroundColor: isMe ? '#f97316' : (isAdmin ? 'rgba(249,115,22,0.1)' : '#222'),
      border: isAdmin && !isMe ? '1px solid rgba(249,115,22,0.3)' : '1px solid transparent',
      color: isMe ? '#fff' : '#eaeaea',
      fontSize: '14px', lineHeight: '1.4',
      position: 'relative' as const,
      boxShadow: isMe ? '0 4px 12px rgba(249,115,22,0.2)' : 'none'
    }),
    meta: {
      fontSize: '11px', color: '#666', marginTop: '4px',
      display: 'flex', gap: '6px', alignItems: 'center'
    },
    badge: {
      background: 'rgba(249,115,22,0.15)', color: '#f97316',
      padding: '2px 6px', borderRadius: '4px', fontWeight: 700, fontSize: '9px',
      textTransform: 'uppercase' as const, letterSpacing: '0.5px'
    },
    footer: {
      padding: '16px 20px',
      borderTop: '1px solid #2a2a2a',
      backgroundColor: '#1a1a1a',
      flexShrink: 0
    },
    inputRow: {
      display: 'flex', gap: '10px'
    },
    input: {
      flex: 1,
      backgroundColor: '#222', border: '1px solid #333', color: '#fff',
      padding: '12px 16px', borderRadius: '12px', fontSize: '14px',
      outline: 'none', transition: 'border-color 0.2s'
    },
    sendBtn: {
      background: '#f97316', color: '#fff',
      border: 'none', borderRadius: '12px', padding: '0 20px',
      fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'all 0.2s', boxShadow: '0 4px 10px rgba(249,115,22,0.2)'
    }
  }

  const parseTime = (iso: string) => {
    const d = new Date(iso)
    let h = d.getHours()
    const m = d.getMinutes().toString().padStart(2, '0')
    const ampm = h >= 12 ? 'PM' : 'AM'
    h = h % 12
    h = h ? h : 12
    return `${h}:${m} ${ampm}`
  }

  return (
    <div style={st.overlay}>
      <div style={st.modal}>
        <div style={st.topAccent} />

        {/* HEADER */}
        <div style={st.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => navigate('/')}
              style={{
                background: 'transparent', border: 'none', color: '#888',
                fontSize: '24px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 0
              }}
            >
              ←
            </button>
            <h2 style={st.title}>💬 Chat Comunitario</h2>
          </div>
        </div>

        {/* BODY (Mensajes) */}
        <div style={st.body} ref={scrollRef}>
          {loading && mensajes.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#666', marginTop: '20px' }}>Cargando mensajes...</div>
          ) : (
            mensajes.map((m) => {
              const isAdmin = m.autor.rol === 'administrador'
              // Determinamos si es "mío" verificando el nombre o si tenemos el ID del autor
              // Como en este modelo 'autor_id' no siempre lo traemos en la respuesta mockeada igual al session.user.id,
              // hacemos match por el apto para los residentes.
              const isMe = m.autor.apartamento?.numero === apartamento?.numero && m.autor.rol === profile?.rol
              
              return (
                <div key={m.id} style={st.messageRow(isMe)} className="animate-slide-up">
                  <div style={st.bubble(isMe, isAdmin)}>
                    {m.contenido}
                  </div>
                  <div style={{ ...st.meta, flexDirection: isMe ? 'row-reverse' : 'row' }}>
                    <span style={{ fontWeight: 600, color: '#888' }}>
                      {isAdmin ? 'Admin' : (m.autor.apartamento?.numero ? `Apto ${m.autor.apartamento.numero}` : m.autor.nombre_completo)}
                    </span>
                    <span>•</span>
                    <span>{parseTime(m.created_at)}</span>
                    {isAdmin && !isMe && <span style={st.badge}>Oficial</span>}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* FOOTER (Input) */}
        <div style={st.footer}>
          <form onSubmit={handleSend} style={st.inputRow}>
            <input
              type="text"
              placeholder="Escribe un mensaje a la comunidad..."
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              style={st.input}
              onFocus={(e) => e.target.style.borderColor = '#f97316'}
              onBlur={(e) => e.target.style.borderColor = '#333'}
            />
            <button 
              type="submit" 
              style={{ ...st.sendBtn, opacity: (!inputVal.trim() || enviando) ? 0.6 : 1, cursor: (!inputVal.trim() || enviando) ? 'not-allowed' : 'pointer' }}
              disabled={!inputVal.trim() || enviando}
            >
              Enviar
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
