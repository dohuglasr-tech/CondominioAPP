import React, { useEffect, useState, useRef } from 'react'
import { supabase } from '../../data/supabase'
import {
  ChatMensaje,
  ChatEstadoConfig,
  CHAT_CHANNEL_NAME,
  obtenerMensajes,
  obtenerEstadoSoloLectura,
  enviarMensajeDesdeResidente
} from '../../data/chatService'
import { useAuth } from '../../application/contexts/AuthContext'
import { useNavigate } from 'react-router-dom'

interface ChatPanelProps {
  onClose: () => void
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ onClose }) => {
  const { session, perfil } = useAuth()
  const [mensajes, setMensajes] = useState<ChatMensaje[]>([])
  const [loading, setLoading] = useState(true)
  const [inputVal, setInputVal] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Identificación del Apartamento
  const [miAptoNumero, setMiAptoNumero] = useState<string>(() => {
    return (perfil as any)?.apartamento?.numero || localStorage.getItem('condominio_mi_apto') || ''
  })
  const [editandoApto, setEditandoApto] = useState(false)
  const [inputAptoManual, setInputAptoManual] = useState('')

  // Estado del Modo Solo Lectura
  const [estadoChat, setEstadoChat] = useState<ChatEstadoConfig>({
    solo_lectura: false,
    motivo_bloqueo: 'Modo solo lectura activado por la administración para mantener la sana convivencia.'
  })

  const scrollRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const scrollToBottom = () => {
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }
    }, 100)
  }

  // Resolver número de apartamento del usuario
  useEffect(() => {
    const resolverApto = async () => {
      // 1. Directo desde perfil
      const numFromPerfil = (perfil as any)?.apartamento?.numero
      if (numFromPerfil) {
        setMiAptoNumero(numFromPerfil)
        localStorage.setItem('condominio_mi_apto', numFromPerfil)
        return
      }

      // 2. Si perfil tiene apartamento_id, consultar tabla apartamentos
      if (perfil?.apartamento_id) {
        try {
          const { data } = await supabase
            .from('apartamentos')
            .select('numero')
            .eq('id', perfil.apartamento_id)
            .maybeSingle()
          if (data?.numero) {
            setMiAptoNumero(data.numero)
            localStorage.setItem('condominio_mi_apto', data.numero)
            return
          }
        } catch (err) {
          console.warn('[ChatPanel] Error buscando apartamento por id:', err)
        }
      }

      // 3. Si hay sesión de usuario, buscar en perfiles
      if (session?.user?.id) {
        try {
          const { data: pData } = await supabase
            .from('perfiles')
            .select('apartamento_id, apartamentos:apartamento_id(numero)')
            .eq('id', session.user.id)
            .maybeSingle()
          const numJoin = (pData as any)?.apartamentos?.numero
          if (numJoin) {
            setMiAptoNumero(numJoin)
            localStorage.setItem('condominio_mi_apto', numJoin)
            return
          }
        } catch (err) {
          console.warn('[ChatPanel] Error buscando join perfiles:', err)
        }
      }
    }

    resolverApto()
  }, [perfil, session])

  const cargarDatos = async () => {
    setLoading(true)
    const [msgsRes, estadoRes] = await Promise.all([
      obtenerMensajes(80),
      obtenerEstadoSoloLectura()
    ])

    setMensajes(msgsRes.data)
    setEstadoChat(estadoRes)
    setLoading(false)
    scrollToBottom()
  }

  useEffect(() => {
    cargarDatos()

    // 1. Canal Supabase Realtime (Broadcast + Postgres changes)
    const existing = supabase.getChannels().find(c => c.topic === `realtime:${CHAT_CHANNEL_NAME}`)
    if (existing) {
      try { supabase.removeChannel(existing) } catch {}
    }
    const channel = supabase.channel(CHAT_CHANNEL_NAME)

    channel
      .on('broadcast', { event: 'nuevo_mensaje' }, ({ payload }) => {
        if (payload && payload.id) {
          setMensajes(prev => {
            if (prev.some(m => m.id === payload.id)) return prev
            return [...prev, payload]
          })
          scrollToBottom()
        }
      })
      .on('broadcast', { event: 'mensaje_eliminado' }, ({ payload }) => {
        if (payload && payload.id) {
          setMensajes(prev => prev.filter(m => m.id !== payload.id))
        }
      })
      .on('broadcast', { event: 'modo_solo_lectura' }, ({ payload }) => {
        if (payload) {
          setEstadoChat({
            solo_lectura: !!payload.activo,
            motivo_bloqueo: payload.motivo || 'Modo solo lectura activado por la administración.',
            bloqueado_en: payload.bloqueado_en,
            bloqueado_por: payload.bloqueado_por
          })
          if (payload.activo) {
            setErrorMsg(null)
          }
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_mensajes' }, (payload) => {
        const nuevo = payload.new as any
        if (nuevo && nuevo.id) {
          setMensajes(prev => {
            if (prev.some(m => m.id === nuevo.id)) return prev
            const msg: ChatMensaje = {
              id: nuevo.id,
              contenido: nuevo.contenido,
              adjunto_url: nuevo.adjunto_url,
              adjunto_tipo: nuevo.adjunto_tipo,
              created_at: nuevo.created_at || new Date().toISOString(),
              autor_id: nuevo.autor_id,
              autor_nombre: nuevo.autor_nombre || (nuevo.es_admin ? 'Administración' : (nuevo.apartamento_numero ? `Apto ${nuevo.apartamento_numero}` : 'Vecino')),
              autor_rol: nuevo.autor_rol || (nuevo.es_admin ? 'administrador' : 'residente'),
              apartamento_numero: nuevo.apartamento_numero,
              es_admin: !!nuevo.es_admin,
              es_anuncio: !!nuevo.es_anuncio
            }
            return [...prev, msg]
          })
          scrollToBottom()
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_mensajes' }, (payload) => {
        const idEliminado = payload.old?.id
        if (idEliminado) {
          setMensajes(prev => prev.filter(m => m.id !== idEliminado))
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'configuracion_edificio' }, (payload) => {
        const row = payload.new as any
        if (row && row.chat_solo_lectura !== undefined) {
          setEstadoChat(prev => ({
            ...prev,
            solo_lectura: !!row.chat_solo_lectura,
            motivo_bloqueo: row.chat_motivo_bloqueo || prev.motivo_bloqueo
          }))
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const guardarAptoManual = (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputAptoManual.trim()) return
    const apto = inputAptoManual.trim().toUpperCase()
    setMiAptoNumero(apto)
    localStorage.setItem('condominio_mi_apto', apto)
    setEditandoApto(false)
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputVal.trim() || enviando) return

    if (estadoChat.solo_lectura) {
      setErrorMsg('El chat está en Modo Solo Lectura. No es posible enviar mensajes en este momento.')
      return
    }

    // Si aún no tiene número de apartamento definido
    const aptoFinal = miAptoNumero || localStorage.getItem('condominio_mi_apto') || ''
    if (!aptoFinal) {
      setEditandoApto(true)
      setErrorMsg('Por favor ingresa tu número de apartamento para que tu mensaje quede identificado.')
      return
    }

    setEnviando(true)
    setErrorMsg(null)
    const val = inputVal.trim()
    setInputVal('')

    const nombreUsuario = perfil?.nombre_completo || `Propietario Apto ${aptoFinal}`

    const res = await enviarMensajeDesdeResidente({
      usuarioId: session?.user?.id,
      nombre: nombreUsuario,
      apartamento: aptoFinal,
      contenido: val
    })

    if (res.error) {
      setErrorMsg(res.error)
      // Restaurar el texto para no perder lo escrito
      setInputVal(val)
    } else if (res.data) {
      setMensajes(prev => {
        if (prev.some(m => m.id === res.data!.id)) return prev
        return [...prev, res.data!]
      })
      scrollToBottom()
    }

    setEnviando(false)
  }

  const parseTime = (iso: string) => {
    try {
      const d = new Date(iso)
      let h = d.getHours()
      const m = d.getMinutes().toString().padStart(2, '0')
      const ampm = h >= 12 ? 'PM' : 'AM'
      h = h % 12
      h = h ? h : 12
      return `${h}:${m} ${ampm}`
    } catch {
      return ''
    }
  }

  // --- ESTILOS VISUALES ---
  const st = {
    overlay: {
      width: '100%',
      height: '100%',
      backgroundColor: '#0a0a0a',
      display: 'flex',
      flexDirection: 'column' as const,
      padding: '16px',
      boxSizing: 'border-box' as const
    },
    modal: {
      flex: 1,
      backgroundColor: '#121214',
      border: '1px solid #27272a',
      borderRadius: '20px',
      position: 'relative' as const,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column' as const,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
    },
    topAccent: {
      position: 'absolute' as const,
      top: 0,
      left: '20px',
      right: '20px',
      height: '3px',
      background: estadoChat.solo_lectura
        ? 'linear-gradient(90deg, transparent, #ef4444, transparent)'
        : 'linear-gradient(90deg, transparent, #f97316, transparent)',
      borderRadius: '0 0 4px 4px'
    },
    header: {
      padding: '16px 20px',
      borderBottom: '1px solid #27272a',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexShrink: 0,
      backgroundColor: '#18181b'
    },
    title: {
      color: '#fff',
      fontSize: '18px',
      fontWeight: 700,
      margin: 0,
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    },
    body: {
      flex: 1,
      padding: '20px',
      overflowY: 'auto' as const,
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '16px',
      backgroundColor: '#0c0c0e'
    },
    footer: {
      padding: '14px 20px',
      borderTop: '1px solid #27272a',
      backgroundColor: '#18181b',
      flexShrink: 0
    },
    inputRow: {
      display: 'flex',
      gap: '10px'
    },
    input: {
      flex: 1,
      backgroundColor: estadoChat.solo_lectura ? '#1c1917' : '#222',
      border: estadoChat.solo_lectura ? '1px dashed #7f1d1d' : '1px solid #333',
      color: estadoChat.solo_lectura ? '#a8a29e' : '#fff',
      padding: '12px 16px',
      borderRadius: '12px',
      fontSize: '14px',
      outline: 'none',
      cursor: estadoChat.solo_lectura ? 'not-allowed' : 'text'
    },
    sendBtn: {
      background: estadoChat.solo_lectura ? '#451a03' : '#f97316',
      color: estadoChat.solo_lectura ? '#a8a29e' : '#fff',
      border: 'none',
      borderRadius: '12px',
      padding: '0 20px',
      fontWeight: 600,
      cursor: estadoChat.solo_lectura || !inputVal.trim() || enviando ? 'not-allowed' : 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      opacity: estadoChat.solo_lectura || !inputVal.trim() || enviando ? 0.6 : 1,
      boxShadow: estadoChat.solo_lectura ? 'none' : '0 4px 10px rgba(249,115,22,0.2)'
    }
  }

  return (
    <div style={st.overlay}>
      <div style={st.modal}>
        <div style={st.topAccent} />

        {/* HEADER */}
        <div style={st.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => {
                if (onClose) onClose()
                navigate('/')
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#888',
                fontSize: '22px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4px'
              }}
              title="Volver"
            >
              ←
            </button>
            <div>
              <h2 style={st.title}>💬 Chat Comunitario</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                <span style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  backgroundColor: estadoChat.solo_lectura ? '#ef4444' : '#22c55e'
                }} />
                <span style={{ fontSize: '11px', color: estadoChat.solo_lectura ? '#f87171' : '#a1a1aa' }}>
                  {estadoChat.solo_lectura ? 'Modo Solo Lectura Activado' : 'En vivo · Todos los apartamentos'}
                </span>
              </div>
            </div>
          </div>

          {/* Badge de Identificación del Apartamento actual */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              onClick={() => {
                setInputAptoManual(miAptoNumero)
                setEditandoApto(true)
              }}
              title="Haz clic para modificar tu apartamento"
              style={{
                fontSize: '11px',
                backgroundColor: miAptoNumero ? 'rgba(249, 115, 22, 0.15)' : '#3f3f46',
                color: miAptoNumero ? '#f97316' : '#fff',
                border: miAptoNumero ? '1px solid rgba(249, 115, 22, 0.4)' : '1px solid #52525b',
                padding: '6px 12px',
                borderRadius: '20px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>🏢</span>
              <span>{miAptoNumero ? `Apto ${miAptoNumero}` : 'Asignar Apto'}</span>
            </div>
          </div>
        </div>

        {/* MODAL / BANNER DE ASIGNACIÓN MANUAL DE APARTAMENTO (SI FALTA) */}
        {editandoApto && (
          <div style={{
            backgroundColor: '#1f1a14',
            borderBottom: '1px solid #f97316',
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px' }}>🏢</span>
              <span style={{ color: '#fed7aa', fontSize: '12px', fontWeight: 600 }}>
                Indica tu número de apartamento para que tus mensajes aparezcan identificados:
              </span>
            </div>
            <form onSubmit={guardarAptoManual} style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={inputAptoManual}
                onChange={e => setInputAptoManual(e.target.value)}
                placeholder="Ej: 502, PH-1"
                style={{
                  backgroundColor: '#0a0a0a',
                  border: '1px solid #f97316',
                  color: '#fff',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  width: '100px',
                  outline: 'none',
                  textTransform: 'uppercase'
                }}
              />
              <button
                type="submit"
                style={{
                  backgroundColor: '#f97316',
                  color: '#fff',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                Guardar
              </button>
              <button
                type="button"
                onClick={() => setEditandoApto(false)}
                style={{
                  backgroundColor: '#27272a',
                  color: '#a1a1aa',
                  border: 'none',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                ✕
              </button>
            </form>
          </div>
        )}

        {/* AVISO DE MODO SOLO LECTURA */}
        {estadoChat.solo_lectura && (
          <div style={{
            backgroundColor: 'rgba(220, 38, 38, 0.12)',
            borderBottom: '1px solid rgba(220, 38, 38, 0.3)',
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <span style={{ fontSize: '22px' }}>🔒</span>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <strong style={{ color: '#f87171', fontSize: '13px' }}>
                  Chat en Modo Solo Lectura
                </strong>
                <span style={{ backgroundColor: '#dc2626', color: '#fff', fontSize: '9px', padding: '1px 6px', borderRadius: '4px', fontWeight: 800 }}>
                  PAUSADO
                </span>
              </div>
              <p style={{ color: '#d4d4d8', fontSize: '12px', margin: '2px 0 0 0', lineHeight: '1.4' }}>
                {estadoChat.motivo_bloqueo}
              </p>
            </div>
          </div>
        )}

        {/* ERROR SI INTENTA ENVIAR */}
        {errorMsg && (
          <div style={{
            backgroundColor: 'rgba(239, 68, 68, 0.2)',
            borderBottom: '1px solid #ef4444',
            padding: '8px 20px',
            fontSize: '12px',
            color: '#fca5a5',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span>⚠️ {errorMsg}</span>
            <button
              onClick={() => setErrorMsg(null)}
              style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', fontSize: '14px' }}
            >
              ✕
            </button>
          </div>
        )}

        {/* BODY (Mensajes) */}
        <div style={st.body} ref={scrollRef}>
          {loading && mensajes.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#666', marginTop: '30px', fontSize: '13px' }}>
              Cargando mensajes del condominio...
            </div>
          ) : mensajes.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#666', marginTop: '30px', fontSize: '13px' }}>
              Bienvenido al canal comunitario. Escribe un mensaje para comenzar la conversación.
            </div>
          ) : (
            mensajes.map((m) => {
              const isAdmin = m.es_admin || m.autor_rol === 'administrador'
              const isAnuncio = m.es_anuncio || m.autor_nombre.includes('ANUNCIO') || m.autor_nombre.includes('COMUNICADO')
              const isAvisoLock = m.contenido.startsWith('🔒 MODO SOLO LECTURA') || m.contenido.startsWith('🔓 MODO SOLO LECTURA')

              // Mensajes del sistema de bloqueo/desbloqueo
              if (isAvisoLock) {
                return (
                  <div key={m.id} style={{
                    margin: '8px auto',
                    maxWidth: '92%',
                    padding: '10px 16px',
                    borderRadius: '12px',
                    backgroundColor: m.contenido.includes('ACTIVADO') ? 'rgba(220, 38, 38, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                    border: m.contenido.includes('ACTIVADO') ? '1px dashed #ef4444' : '1px dashed #22c55e',
                    color: '#fff',
                    fontSize: '12px',
                    textAlign: 'center',
                    lineHeight: '1.4'
                  }}>
                    <div style={{ fontWeight: 700, marginBottom: '2px' }}>
                      {m.contenido}
                    </div>
                    <span style={{ fontSize: '10px', color: '#a1a1aa' }}>
                      {parseTime(m.created_at)}
                    </span>
                  </div>
                )
              }

              // Determinar si es mensaje del usuario actual
              const aptoComparar = miAptoNumero || (perfil as any)?.apartamento?.numero || ''
              const isMe = !isAdmin && (
                (aptoComparar && m.apartamento_numero === aptoComparar) ||
                (session?.user?.id && m.autor_id === session.user.id)
              )

              return (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isMe ? 'flex-end' : 'flex-start',
                    width: '100%'
                  }}
                >
                  {/* Encabezado del mensaje con IDENTIFICACIÓN DE APARTAMENTO CLARA */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '11px',
                    color: '#71717a',
                    marginBottom: '5px',
                    flexDirection: isMe ? 'row-reverse' : 'row'
                  }}>
                    {isAdmin ? (
                      <span style={{
                        backgroundColor: isAnuncio ? '#eab308' : '#3b82f6',
                        color: isAnuncio ? '#000' : '#fff',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontWeight: 800,
                        fontSize: '10px',
                        letterSpacing: '0.4px',
                        textTransform: 'uppercase'
                      }}>
                        {isAnuncio ? '📢 OFICIAL' : '🛡️ ADMINISTRACIÓN'}
                      </span>
                    ) : (
                      <span style={{
                        backgroundColor: isMe ? '#f97316' : '#27272a',
                        color: isMe ? '#fff' : '#fb923c',
                        border: isMe ? '1px solid #ea580c' : '1px solid #3f3f46',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontWeight: 800,
                        fontSize: '11px',
                        letterSpacing: '0.3px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        boxShadow: isMe ? '0 2px 6px rgba(249,115,22,0.3)' : 'none'
                      }}>
                        🏢 APTO {m.apartamento_numero || 'S/N'}
                      </span>
                    )}

                    <span style={{
                      fontWeight: 700,
                      color: isAdmin ? '#93c5fd' : (isMe ? '#fdba74' : '#e4e4e7'),
                      fontSize: '12px'
                    }}>
                      {isAdmin ? 'Administración Torre 5' : (isMe ? `Tú (${m.autor_nombre})` : m.autor_nombre)}
                    </span>

                    <span>•</span>
                    <span>{parseTime(m.created_at)}</span>
                  </div>

                  {/* Globo de texto */}
                  <div style={{
                    maxWidth: '85%',
                    padding: '12px 16px',
                    borderRadius: isMe ? '16px 16px 2px 16px' : '16px 16px 16px 2px',
                    backgroundColor: isMe
                      ? '#f97316'
                      : isAnuncio
                        ? 'rgba(234, 179, 8, 0.12)'
                        : isAdmin
                          ? 'rgba(249,115,22,0.12)'
                          : '#202024',
                    border: isAnuncio
                      ? '1px solid rgba(234, 179, 8, 0.35)'
                      : isAdmin && !isMe
                        ? '1px solid rgba(249,115,22,0.3)'
                        : '1px solid transparent',
                    color: isMe ? '#fff' : '#eaeaea',
                    fontSize: '13px',
                    lineHeight: '1.45',
                    boxShadow: isMe ? '0 4px 12px rgba(249,115,22,0.2)' : 'none'
                  }}>
                    {isAnuncio && (
                      <div style={{ fontSize: '10px', fontWeight: 800, color: '#facc15', marginBottom: '4px', textTransform: 'uppercase' }}>
                        📢 AVISO OFICIAL DE LA ADMINISTRACIÓN
                      </div>
                    )}
                    {m.contenido}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* FOOTER (Input o Aviso de Bloqueo) */}
        <div style={st.footer}>
          {estadoChat.solo_lectura ? (
            <div style={{
              backgroundColor: '#1f1315',
              border: '1px solid #7f1d1d',
              borderRadius: '12px',
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '20px' }}>🔒</span>
                <div>
                  <span style={{ color: '#fca5a5', fontSize: '13px', fontWeight: 700 }}>
                    La escritura en el chat está temporalmente pausada
                  </span>
                  <p style={{ color: '#a8a29e', fontSize: '11px', margin: '2px 0 0 0' }}>
                    Por orden de la administración para mantener la armonía comunitaria.
                  </p>
                </div>
              </div>
              <span style={{
                backgroundColor: '#991b1b',
                color: '#fff',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 800
              }}>
                Solo Lectura
              </span>
            </div>
          ) : (
            <div>
              {/* Barra de estado: identificado como Apto XXX */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#a1a1aa' }}>
                  <span>Escribiendo como:</span>
                  <span style={{
                    backgroundColor: '#27272a',
                    color: '#f97316',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    fontWeight: 800
                  }}>
                    🏢 Apto {miAptoNumero || 'Sin asignar'}
                  </span>
                </div>
                {!miAptoNumero && (
                  <button
                    onClick={() => setEditandoApto(true)}
                    style={{ background: 'none', border: 'none', color: '#f97316', fontSize: '11px', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Asignar Apto
                  </button>
                )}
              </div>

              <form onSubmit={handleSend} style={st.inputRow}>
                <input
                  type="text"
                  placeholder={miAptoNumero ? `Escribe un mensaje como Apto ${miAptoNumero}...` : 'Escribe un mensaje al condominio...'}
                  value={inputVal}
                  onChange={e => setInputVal(e.target.value)}
                  style={st.input}
                  onFocus={e => e.target.style.borderColor = '#f97316'}
                  onBlur={e => e.target.style.borderColor = '#333'}
                />
                <button
                  type="submit"
                  style={st.sendBtn}
                  disabled={!inputVal.trim() || enviando}
                >
                  {enviando ? '...' : 'Enviar'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
