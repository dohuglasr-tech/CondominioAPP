import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../../../data/supabase'
import {
  ChatMensaje,
  ChatEstadoConfig,
  CHAT_CHANNEL_NAME,
  obtenerMensajes,
  obtenerEstadoSoloLectura,
  cambiarEstadoSoloLectura,
  enviarMensajeDesdeAdmin,
  eliminarMensajeChat
} from '../../../data/chatService'

const PRESET_MOTIVOS = [
  'Discusión y altercado entre propietarios que altera la convivencia.',
  'Uso indebido del chat comunitario y falta de respeto a las normas.',
  'Pausa nocturna por horas de descanso del edificio.',
  'Comunicado prioritario en curso por la junta de condominio.'
]

export const AdminChat: React.FC = () => {
  const [mensajes, setMensajes] = useState<ChatMensaje[]>([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [anuncio, setAnuncio] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviandoAnuncio, setEnviandoAnuncio] = useState(false)

  // Estado del Modo Solo Lectura
  const [estadoChat, setEstadoChat] = useState<ChatEstadoConfig>({
    solo_lectura: false,
    motivo_bloqueo: 'Modo solo lectura activado por la administración para mantener la sana convivencia.'
  })
  const [modalSoloLectura, setModalSoloLectura] = useState(false)
  const [motivoSeleccionado, setMotivoSeleccionado] = useState(PRESET_MOTIVOS[0])
  const [motivoPersonalizado, setMotivoPersonalizado] = useState('')
  const [procesandoModo, setProcesandoModo] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }
    }, 100)
  }

  // Cargar estado inicial y mensajes
  const cargarDatos = async () => {
    setLoading(true)
    const [msgsRes, estadoRes] = await Promise.all([
      obtenerMensajes(100),
      obtenerEstadoSoloLectura()
    ])

    setMensajes(msgsRes.data)
    setEstadoChat(estadoRes)
    setLoading(false)
    scrollToBottom()
  }

  useEffect(() => {
    cargarDatos()

    // 1. Canal Supabase Realtime para Broadcast directo entre pantallas
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
            motivo_bloqueo: payload.motivo || 'Modo solo lectura activado.',
            bloqueado_en: payload.bloqueado_en,
            bloqueado_por: payload.bloqueado_por
          })
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_mensajes' }, (payload) => {
        // Asegurar que si viene por postgres también se agregue
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
              autor_nombre: nuevo.autor_nombre || (nuevo.es_admin ? 'Administración' : 'Vecino'),
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

  // Enviar mensaje como Administrador
  const handleEnviarMensaje = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || enviando) return

    setEnviando(true)
    const texto = input.trim()
    setInput('')

    const res = await enviarMensajeDesdeAdmin(texto, false)
    if (res.data) {
      setMensajes(prev => {
        if (prev.some(m => m.id === res.data!.id)) return prev
        return [...prev, res.data!]
      })
      scrollToBottom()
    }
    setEnviando(false)
  }

  // Publicar Anuncio Oficial
  const handleEnviarAnuncio = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!anuncio.trim() || enviandoAnuncio) return

    setEnviandoAnuncio(true)
    const texto = anuncio.trim()
    setAnuncio('')

    const res = await enviarMensajeDesdeAdmin(texto, true)
    if (res.data) {
      setMensajes(prev => {
        if (prev.some(m => m.id === res.data!.id)) return prev
        return [...prev, res.data!]
      })
      scrollToBottom()
    }
    setEnviandoAnuncio(false)
  }

  // Alternar o Activar Modo Solo Lectura
  const abrirModalSoloLectura = () => {
    setMotivoPersonalizado('')
    setMotivoSeleccionado(PRESET_MOTIVOS[0])
    setModalSoloLectura(true)
  }

  const confirmarActivarSoloLectura = async () => {
    setProcesandoModo(true)
    const motivoFinal = motivoPersonalizado.trim() ? motivoPersonalizado.trim() : motivoSeleccionado
    await cambiarEstadoSoloLectura(true, motivoFinal, 'Administración')
    setEstadoChat({
      solo_lectura: true,
      motivo_bloqueo: motivoFinal
    })
    setModalSoloLectura(false)
    setProcesandoModo(false)
  }

  const desactivarSoloLectura = async () => {
    if (!window.confirm('¿Deseas reabrir el chat comunitario para que todos los residentes puedan escribir nuevamente?')) {
      return
    }
    setProcesandoModo(true)
    await cambiarEstadoSoloLectura(false, '', 'Administración')
    setEstadoChat({
      solo_lectura: false,
      motivo_bloqueo: ''
    })
    setProcesandoModo(false)
  }

  // Moderar / Eliminar mensaje individual
  const handleEliminarMensaje = async (id: string, remitente: string) => {
    if (!window.confirm(`¿Estás seguro de eliminar este mensaje de ${remitente}? Se removerá para todos los usuarios en vivo.`)) {
      return
    }
    setMensajes(prev => prev.filter(m => m.id !== id))
    await eliminarMensajeChat(id)
  }

  // Estadísticas
  const mensajesHoy = mensajes.filter(m => new Date(m.created_at).toDateString() === new Date().toDateString()).length
  const anunciosDelMes = mensajes.filter(m => m.es_anuncio).length
  const residentesActivos = new Set(mensajes.filter(m => !m.es_admin).map(m => m.autor_nombre)).size

  return (
    <div style={{ padding: '28px', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', backgroundColor: '#0a0a0a', color: '#fff' }}>
      {/* Título y Estado Global */}
      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ color: '#fff', fontSize: '24px', fontWeight: 800, margin: 0 }}>💬 Chat Comunitario en Vivo</h1>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '20px',
              fontSize: '11px',
              fontWeight: 700,
              backgroundColor: 'rgba(34, 197, 94, 0.12)',
              color: '#22c55e',
              border: '1px solid rgba(34, 197, 94, 0.3)'
            }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#22c55e', animation: 'pulse 1.5s infinite' }} />
              Sincronizado con Apartamentos
            </span>
          </div>
          <p style={{ color: '#888', fontSize: '13px', marginTop: '4px', marginBottom: 0 }}>
            Visualiza en tiempo real las conversaciones de los residentes, modera el chat y emite comunicados oficiales.
          </p>
        </div>

        {/* Botón de Modo Solo Lectura */}
        <div>
          {estadoChat.solo_lectura ? (
            <button
              onClick={desactivarSoloLectura}
              disabled={procesandoModo}
              style={{
                backgroundColor: '#16a34a',
                color: '#fff',
                border: 'none',
                padding: '10px 18px',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(22, 163, 74, 0.35)',
                transition: 'all 0.2s'
              }}
            >
              🔓 Reabrir Chat para Todos
            </button>
          ) : (
            <button
              onClick={abrirModalSoloLectura}
              disabled={procesandoModo}
              style={{
                backgroundColor: '#dc2626',
                color: '#fff',
                border: 'none',
                padding: '10px 18px',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(220, 38, 38, 0.35)',
                transition: 'all 0.2s'
              }}
            >
              🔒 Activar Modo Solo Lectura
            </button>
          )}
        </div>
      </div>

      {/* BANNER DE ESTADO DEL MODO SOLO LECTURA */}
      {estadoChat.solo_lectura ? (
        <div style={{
          backgroundColor: 'rgba(220, 38, 38, 0.12)',
          border: '1px solid rgba(220, 38, 38, 0.4)',
          borderRadius: '12px',
          padding: '14px 20px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '24px' }}>🛑</span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <strong style={{ color: '#f87171', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Modo Solo Lectura Activo (Silenciado para Propietarios)
                </strong>
                <span style={{ backgroundColor: '#dc2626', color: '#fff', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: 800 }}>
                  BLOQUEADO
                </span>
              </div>
              <p style={{ color: '#e5e5e5', fontSize: '12px', margin: '4px 0 0 0' }}>
                <strong>Motivo para residentes:</strong> {estadoChat.motivo_bloqueo}
              </p>
            </div>
          </div>
          <button
            onClick={desactivarSoloLectura}
            style={{
              backgroundColor: '#27272a',
              color: '#fff',
              border: '1px solid #3f3f46',
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Quitar restricción
          </button>
        </div>
      ) : (
        <div style={{
          backgroundColor: 'rgba(34, 197, 94, 0.08)',
          border: '1px solid rgba(34, 197, 94, 0.2)',
          borderRadius: '12px',
          padding: '10px 18px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '12px',
          color: '#86efac'
        }}>
          <span>🟢</span>
          <span>
            <strong>Chat Abierto:</strong> Todos los residentes pueden enviar mensajes y compartir inquietudes. Si ocurre alguna discusión o conflicto, activa el <strong>Modo Solo Lectura</strong> para detener los mensajes de inmediato.
          </span>
        </div>
      )}

      {/* Grid Principal: Chat Feed + Sidebar de Anuncios y Control */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px', flex: 1, minHeight: 0 }}>
        {/* Chat en Vivo */}
        <div style={{
          backgroundColor: '#141414',
          border: '1px solid #222',
          borderRadius: '16px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 8px 30px rgba(0,0,0,0.4)'
        }}>
          {/* Header del Chat */}
          <div style={{
            padding: '14px 20px',
            borderBottom: '1px solid #222',
            backgroundColor: '#18181b',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#e4e4e7' }}>Canal General de Torre 5</span>
              <span style={{ fontSize: '11px', color: '#71717a' }}>({mensajes.length} mensajes)</span>
            </div>
            <button
              onClick={cargarDatos}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#a1a1aa',
                cursor: 'pointer',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
              title="Recargar mensajes"
            >
              🔄 Actualizar
            </button>
          </div>

          {/* Feed de mensajes */}
          <div
            ref={scrollRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              backgroundColor: '#0f0f11'
            }}
          >
            {loading && mensajes.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#666', marginTop: '40px', fontSize: '13px' }}>
                Cargando historial de chat en vivo...
              </div>
            ) : mensajes.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#666', marginTop: '40px', fontSize: '13px' }}>
                No hay mensajes aún en la comunidad. Envía el primer mensaje o anuncio.
              </div>
            ) : (
              mensajes.map(m => {
                const isAdmin = m.es_admin || m.autor_rol === 'administrador'
                const isAnuncio = m.es_anuncio || m.autor_nombre.includes('ANUNCIO') || m.autor_nombre.includes('COMUNICADO')
                const isAvisoLock = m.contenido.startsWith('🔒 MODO SOLO LECTURA') || m.contenido.startsWith('🔓 MODO SOLO LECTURA')

                if (isAvisoLock) {
                  return (
                    <div key={m.id} style={{
                      margin: '8px auto',
                      maxWidth: '90%',
                      padding: '10px 16px',
                      borderRadius: '10px',
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
                        {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  )
                }

                return (
                  <div
                    key={m.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: isAdmin ? 'flex-end' : 'flex-start',
                      position: 'relative'
                    }}
                    className="group"
                  >
                    {/* Encabezado del remitente */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      marginBottom: '4px',
                      fontSize: '11px',
                      color: '#a1a1aa'
                    }}>
                      {isAdmin ? (
                        <>
                          <span style={{
                            backgroundColor: isAnuncio ? '#eab308' : '#f97316',
                            color: '#000',
                            fontSize: '9px',
                            fontWeight: 800,
                            padding: '1px 6px',
                            borderRadius: '4px',
                            textTransform: 'uppercase'
                          }}>
                            {isAnuncio ? 'OFICIAL' : 'ADMIN'}
                          </span>
                          <strong style={{ color: '#fb923c' }}>{m.autor_nombre}</strong>
                        </>
                      ) : (
                        <>
                          <span style={{
                            backgroundColor: '#27272a',
                            color: '#e4e4e7',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            fontWeight: 700
                          }}>
                            {m.apartamento_numero ? `Apto ${m.apartamento_numero}` : 'Residente'}
                          </span>
                          <span style={{ color: '#d4d4d8', fontWeight: 600 }}>{m.autor_nombre}</span>
                        </>
                      )}
                      <span>·</span>
                      <span style={{ color: '#52525b', fontSize: '10px' }}>
                        {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>

                      {/* Botón de Moderación para Admin */}
                      <button
                        onClick={() => handleEliminarMensaje(m.id, m.autor_nombre)}
                        title="Eliminar mensaje (Moderación)"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#ef4444',
                          cursor: 'pointer',
                          fontSize: '11px',
                          padding: '0 4px',
                          opacity: 0.6,
                          transition: 'opacity 0.2s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                        onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}
                      >
                        🗑️
                      </button>
                    </div>

                    {/* Globo del Mensaje */}
                    <div style={{
                      maxWidth: '75%',
                      padding: '11px 16px',
                      borderRadius: isAdmin ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      backgroundColor: isAnuncio
                        ? 'rgba(234, 179, 8, 0.15)'
                        : isAdmin
                          ? '#f97316'
                          : '#1e1e24',
                      border: isAnuncio
                        ? '1px solid rgba(234, 179, 8, 0.4)'
                        : isAdmin
                          ? '1px solid #ea580c'
                          : '1px solid #27272a',
                      color: isAdmin && !isAnuncio ? '#fff' : '#f4f4f5',
                      fontSize: '13px',
                      lineHeight: '1.5',
                      boxShadow: isAdmin && !isAnuncio ? '0 4px 12px rgba(249, 115, 22, 0.25)' : 'none'
                    }}>
                      {isAnuncio && (
                        <div style={{ fontSize: '11px', fontWeight: 800, color: '#facc15', marginBottom: '4px', textTransform: 'uppercase' }}>
                          📢 COMUNICADO ADMINISTRATIVO
                        </div>
                      )}
                      {m.contenido}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Formulario de Respuesta Rápida como Admin */}
          <form
            onSubmit={handleEnviarMensaje}
            style={{
              padding: '14px 16px',
              borderTop: '1px solid #222',
              backgroundColor: '#141416',
              display: 'flex',
              gap: '10px'
            }}
          >
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Escribe una respuesta oficial como administración..."
              style={{
                flex: 1,
                backgroundColor: '#0a0a0c',
                border: '1px solid #27272a',
                color: '#fff',
                padding: '12px 16px',
                borderRadius: '10px',
                fontSize: '13px',
                outline: 'none'
              }}
              onFocus={e => e.currentTarget.style.borderColor = '#f97316'}
              onBlur={e => e.currentTarget.style.borderColor = '#27272a'}
            />
            <button
              type="submit"
              disabled={!input.trim() || enviando}
              style={{
                backgroundColor: '#f97316',
                color: '#fff',
                border: 'none',
                padding: '0 20px',
                borderRadius: '10px',
                cursor: !input.trim() || enviando ? 'not-allowed' : 'pointer',
                fontWeight: 700,
                fontSize: '13px',
                opacity: !input.trim() || enviando ? 0.5 : 1,
                transition: 'all 0.2s',
                boxShadow: '0 4px 12px rgba(249, 115, 22, 0.3)'
              }}
            >
              {enviando ? 'Enviando...' : 'Enviar'}
            </button>
          </form>
        </div>

        {/* Panel Lateral: Anuncio Masivo y Moderación */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Tarjeta de Anuncio Masivo */}
          <div style={{
            backgroundColor: '#141414',
            border: '1px solid #222',
            borderRadius: '16px',
            padding: '20px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span style={{ fontSize: '18px' }}>📣</span>
              <h3 style={{ color: '#fff', fontSize: '15px', fontWeight: 700, margin: 0 }}>
                Emitir Anuncio Oficial
              </h3>
            </div>
            <p style={{ color: '#71717a', fontSize: '12px', margin: '0 0 14px 0', lineHeight: '1.4' }}>
              Se destacará con insignia especial y encabezado en el chat de todos los apartamentos.
            </p>
            <form onSubmit={handleEnviarAnuncio}>
              <textarea
                rows={4}
                value={anuncio}
                onChange={e => setAnuncio(e.target.value)}
                placeholder="Ejemplo: Se informa a los propietarios que el servicio de agua estará temporalmente suspendido el jueves de 9:00 AM a 2:00 PM por sustitución de bomba principal..."
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  backgroundColor: '#0a0a0c',
                  border: '1px solid #27272a',
                  color: '#fff',
                  padding: '12px',
                  borderRadius: '10px',
                  fontSize: '12px',
                  lineHeight: '1.5',
                  resize: 'none',
                  marginBottom: '12px',
                  outline: 'none'
                }}
                onFocus={e => e.currentTarget.style.borderColor = '#facc15'}
                onBlur={e => e.currentTarget.style.borderColor = '#27272a'}
              />
              <button
                type="submit"
                disabled={!anuncio.trim() || enviandoAnuncio}
                style={{
                  width: '100%',
                  backgroundColor: '#eab308',
                  color: '#000',
                  border: 'none',
                  padding: '12px',
                  borderRadius: '10px',
                  cursor: !anuncio.trim() || enviandoAnuncio ? 'not-allowed' : 'pointer',
                  fontWeight: 800,
                  fontSize: '13px',
                  opacity: !anuncio.trim() || enviandoAnuncio ? 0.5 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(234, 179, 8, 0.25)'
                }}
              >
                {enviandoAnuncio ? 'Publicando...' : '📢 Publicar Comunicado'}
              </button>
            </form>
          </div>

          {/* Tarjeta de Control Rápido de Moderación */}
          <div style={{
            backgroundColor: '#141414',
            border: '1px solid #222',
            borderRadius: '16px',
            padding: '20px'
          }}>
            <h3 style={{ color: '#fff', fontSize: '14px', fontWeight: 700, margin: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              🛡️ Moderación de Convivencia
            </h3>
            <p style={{ color: '#888', fontSize: '12px', margin: '0 0 14px 0', lineHeight: '1.4' }}>
              Si ocurre alguna discusión acalorada o conflicto vecinal, puedes congelar temporalmente la escritura con un solo clic.
            </p>

            {estadoChat.solo_lectura ? (
              <button
                onClick={desactivarSoloLectura}
                style={{
                  width: '100%',
                  backgroundColor: 'rgba(34, 197, 94, 0.15)',
                  color: '#4ade80',
                  border: '1px solid #22c55e',
                  padding: '10px',
                  borderRadius: '10px',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                🔓 Desbloquear y Reabrir Chat
              </button>
            ) : (
              <button
                onClick={abrirModalSoloLectura}
                style={{
                  width: '100%',
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  color: '#f87171',
                  border: '1px solid #ef4444',
                  padding: '10px',
                  borderRadius: '10px',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                🔒 Pausar Chat (Modo Solo Lectura)
              </button>
            )}
          </div>

          {/* Estadísticas */}
          <div style={{
            backgroundColor: '#141414',
            border: '1px solid #222',
            borderRadius: '16px',
            padding: '20px'
          }}>
            <h3 style={{ color: '#fff', fontSize: '14px', fontWeight: 700, margin: '0 0 12px 0' }}>
              📊 Actividad en Vivo
            </h3>
            {[
              { label: 'Mensajes totales hoy', value: mensajesHoy },
              { label: 'Propietarios participando', value: residentesActivos },
              { label: 'Anuncios oficiales emitidos', value: anunciosDelMes },
              { label: 'Estado del canal', value: estadoChat.solo_lectura ? 'Solo Lectura 🛑' : 'Abierto 🟢' }
            ].map((s, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '10px 0',
                  borderBottom: i < 3 ? '1px solid #1f1f23' : 'none'
                }}
              >
                <span style={{ color: '#71717a', fontSize: '12px' }}>{s.label}</span>
                <span style={{ color: '#fff', fontWeight: 700, fontSize: '12px' }}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* MODAL PARA ACTIVAR MODO SOLO LECTURA */}
      {modalSoloLectura && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.8)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#18181b',
            border: '1px solid #3f3f46',
            borderRadius: '18px',
            maxWidth: '480px',
            width: '100%',
            padding: '24px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.6)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <span style={{ fontSize: '28px' }}>🔒</span>
              <div>
                <h2 style={{ color: '#fff', fontSize: '18px', fontWeight: 800, margin: 0 }}>
                  Activar Modo Solo Lectura
                </h2>
                <span style={{ color: '#f87171', fontSize: '12px' }}>
                  Silenciará la escritura a todos los apartamentos inmediatamente
                </span>
              </div>
            </div>

            <p style={{ color: '#a1a1aa', fontSize: '13px', lineHeight: '1.5', margin: '0 0 16px 0' }}>
              Selecciona o redacta el motivo que verán los propietarios en su pantalla para explicar la suspensión temporal de la participación:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              {PRESET_MOTIVOS.map((motivo, idx) => (
                <label
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    backgroundColor: motivoSeleccionado === motivo && !motivoPersonalizado ? 'rgba(239, 68, 68, 0.15)' : '#27272a',
                    border: motivoSeleccionado === motivo && !motivoPersonalizado ? '1px solid #ef4444' : '1px solid transparent',
                    cursor: 'pointer',
                    fontSize: '12px',
                    color: '#e4e4e7',
                    lineHeight: '1.4'
                  }}
                  onClick={() => {
                    setMotivoSeleccionado(motivo)
                    setMotivoPersonalizado('')
                  }}
                >
                  <input
                    type="radio"
                    name="motivo"
                    checked={motivoSeleccionado === motivo && !motivoPersonalizado}
                    onChange={() => {}}
                    style={{ marginTop: '2px' }}
                  />
                  <span>{motivo}</span>
                </label>
              ))}
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#d4d4d8', marginBottom: '6px' }}>
                O escribe un motivo personalizado:
              </label>
              <input
                type="text"
                value={motivoPersonalizado}
                onChange={e => setMotivoPersonalizado(e.target.value)}
                placeholder="Ej: Se suspende temporalmente el chat por discusión sobre el uso de la piscina..."
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  backgroundColor: '#09090b',
                  border: '1px solid #3f3f46',
                  color: '#fff',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  fontSize: '13px'
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setModalSoloLectura(false)}
                disabled={procesandoModo}
                style={{
                  backgroundColor: '#27272a',
                  color: '#d4d4d8',
                  border: 'none',
                  padding: '10px 16px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '13px'
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarActivarSoloLectura}
                disabled={procesandoModo}
                style={{
                  backgroundColor: '#dc2626',
                  color: '#fff',
                  border: 'none',
                  padding: '10px 18px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: '13px',
                  boxShadow: '0 4px 12px rgba(220, 38, 38, 0.4)'
                }}
              >
                {procesandoModo ? 'Activando...' : '🔒 Activar Silencio Ahora'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
