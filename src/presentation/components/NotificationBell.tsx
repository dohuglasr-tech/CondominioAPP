import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../data/supabase'
import {
  Notificacion,
  obtenerNotificaciones,
  contarNoLeidas,
  marcarLeida,
  marcarTodasLeidas,
  registrarPushNotificaciones,
  mostrarNotificacionLocal,
} from '../../data/notificacionesService'

interface NotificationBellProps {
  apartamentoId: string | null | undefined
  /** Color del ícono. Default: '#a1a1aa' */
  iconColor?: string
}

const ICONOS: Record<string, React.ReactNode> = {
  recibo_emitido: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="9" y1="13" x2="15" y2="13"/>
    </svg>
  ),
  mora: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  ),
  chat: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  pago_aprobado: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  pago_rechazado: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
  aviso: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  ),
}

const COLORES: Record<string, string> = {
  recibo_emitido: 'var(--color-accent, #f97316)',
  mora: '#ef4444',
  chat: '#38bdf8',
  pago_aprobado: '#22c55e',
  pago_rechazado: '#ef4444',
  aviso: '#a855f7',
}

function formatRelativo(dateStr: string): string {
  try {
    if (!dateStr) return 'reciente'
    const t = new Date(dateStr).getTime()
    if (isNaN(t)) return 'reciente'
    const diff = Date.now() - t
    const min = Math.floor(diff / 60000)
    if (min < 1) return 'ahora'
    if (min < 60) return `hace ${min}m`
    const h = Math.floor(min / 60)
    if (h < 24) return `hace ${h}h`
    const d = Math.floor(h / 24)
    return `hace ${d}d`
  } catch {
    return 'reciente'
  }
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
  apartamentoId,
  iconColor = '#a1a1aa',
}) => {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [notifs, setNotifs] = useState<Notificacion[]>([])
  const [noLeidas, setNoLeidas] = useState(0)
  const [pushGranted, setPushGranted] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [coords, setCoords] = useState<{ top: number; left?: number; right?: number; isLeft: boolean }>({
    top: 60,
    isLeft: false
  })
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 860)

  // ── Actualizar posición y modo mobile al abrir o redimensionar ─────────────
  const updatePosition = useCallback(() => {
    const mobile = window.innerWidth <= 860
    setIsMobile(mobile)

    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      const isLeft = rect.left < 340
      const top = Math.min(window.innerHeight - 480, Math.max(10, rect.bottom + 8))

      if (isLeft) {
        // Asegurar que no se desborde ni a la izquierda (< 12) ni a la derecha
        const clampedLeft = Math.max(12, Math.min(rect.left, window.innerWidth - 372))
        setCoords({ top, left: clampedLeft, isLeft: true })
      } else {
        const clampedRight = Math.max(12, Math.min(window.innerWidth - rect.right, window.innerWidth - 372))
        setCoords({ top, right: clampedRight, isLeft: false })
      }
    }
  }, [])

  useEffect(() => {
    if (open) {
      updatePosition()
      window.addEventListener('resize', updatePosition)
      window.addEventListener('scroll', updatePosition, true)
      return () => {
        window.removeEventListener('resize', updatePosition)
        window.removeEventListener('scroll', updatePosition, true)
      }
    }
  }, [open, updatePosition])

  // ── Cargar notificaciones ─────────────────────────────────────────────────
  const cargar = useCallback(async () => {
    if (!apartamentoId) return
    try {
      const [items, count] = await Promise.all([
        obtenerNotificaciones(apartamentoId, 30),
        contarNoLeidas(apartamentoId),
      ])
      setNotifs(items)
      setNoLeidas(count)
    } catch (err) {
      console.warn('[NotificationBell] Error cargando:', err)
    }
  }, [apartamentoId])

  useEffect(() => {
    cargar()
  }, [cargar])

  // ── Suscripción Realtime ───────────────────────────────────────────────────
  useEffect(() => {
    if (!apartamentoId) return

    let channel: any = null
    try {
      const channelId = `notif_${apartamentoId}_${Math.random().toString(36).slice(2, 7)}`
      channel = supabase
        .channel(channelId)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notificaciones',
            filter: `apartamento_id=eq.${apartamentoId}`,
          },
          (payload) => {
            const nueva = payload.new as Notificacion
            setNotifs((prev) => [nueva, ...prev].slice(0, 30))
            setNoLeidas((prev) => prev + 1)
            mostrarNotificacionLocal(nueva.titulo, nueva.cuerpo, nueva.link)
          }
        )
        .subscribe()
    } catch (e) {
      console.warn('[NotificationBell] Error suscribiendo a canal realtime:', e)
    }

    return () => {
      if (channel) {
        try { supabase.removeChannel(channel) } catch {}
      }
    }
  }, [apartamentoId])

  // ── Solicitar permisos de push al abrir la campanita por primera vez ───────
  const handleOpen = async () => {
    updatePosition()
    setOpen((v) => !v)
    try {
      const hasNotification = typeof window !== 'undefined' && 'Notification' in window && typeof Notification !== 'undefined'
      if (!pushGranted && hasNotification && Notification.permission !== 'granted') {
        const ok = await registrarPushNotificaciones()
        setPushGranted(ok)
      }
    } catch (e) {
      console.warn('[NotificationBell] Error al pedir permisos push:', e)
    }
  }

  // ── Clic en una notificación ──────────────────────────────────────────────
  const handleClickNotif = async (n: Notificacion) => {
    if (!n.leida) {
      await marcarLeida(n.id)
      setNotifs((prev) => prev.map((x) => x.id === n.id ? { ...x, leida: true } : x))
      setNoLeidas((prev) => Math.max(0, prev - 1))
    }
    setOpen(false)
    navigate(n.link || '/')
  }

  // ── Marcar todas como leídas ─────────────────────────────────────────────
  const handleMarcarTodas = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!apartamentoId) return
    await marcarTodasLeidas(apartamentoId)
    setNotifs((prev) => prev.map((x) => ({ ...x, leida: true })))
    setNoLeidas(0)
  }

  return (
    <>
      {/* ── Botón campanita ─────────────────────────────────────────── */}
      <button
        ref={buttonRef}
        onClick={handleOpen}
        title="Notificaciones"
        style={{
          background: 'transparent',
          border: 'none',
          color: open ? 'var(--color-accent, #f97316)' : iconColor,
          padding: '7px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          borderRadius: '10px',
          transition: 'all 0.18s ease',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>

        {/* Badge de no leídas */}
        {noLeidas > 0 && (
          <span style={{
            position: 'absolute',
            top: '2px',
            right: '2px',
            minWidth: '17px',
            height: '17px',
            backgroundColor: '#ef4444',
            color: '#fff',
            fontSize: '9.5px',
            fontWeight: 900,
            borderRadius: '999px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 4px',
            border: '2px solid #090a0d',
            boxShadow: '0 2px 8px rgba(239, 68, 68, 0.6)',
            animation: 'bell-pulse 2s infinite',
          }}>
            {noLeidas > 9 ? '9+' : noLeidas}
          </span>
        )}
      </button>

      {/* ── Modal Portal para evitar que overflow:hidden o límites del sidebar lo corten ── */}
      {open && typeof document !== 'undefined' && createPortal(
        <>
          {/* Backdrop con Blur */}
          <div
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: isMobile ? 'rgba(0, 0, 0, 0.75)' : 'rgba(0, 0, 0, 0.35)',
              backdropFilter: isMobile ? 'blur(6px)' : 'none',
              WebkitBackdropFilter: isMobile ? 'blur(6px)' : 'none',
              zIndex: 999998,
              animation: 'notif-fade 0.18s ease-out',
            }}
          />

          {/* Panel Flotante de Notificaciones */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: isMobile ? 'calc(env(safe-area-inset-top, 0px) + 68px)' : `${coords.top}px`,
              ...(isMobile
                ? {
                    left: '12px',
                    right: '12px',
                    width: 'calc(100vw - 24px)',
                    maxWidth: '420px',
                    margin: '0 auto',
                  }
                : coords.isLeft
                ? {
                    left: `${coords.left}px`,
                    right: 'auto',
                    width: '360px',
                    maxWidth: 'calc(100vw - 24px)',
                  }
                : {
                    right: `${coords.right}px`,
                    left: 'auto',
                    width: '360px',
                    maxWidth: 'calc(100vw - 24px)',
                  }
              ),
              backgroundColor: '#111318',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: isMobile ? '22px' : '18px',
              boxShadow: '0 24px 64px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.08), 0 8px 24px rgba(0, 0, 0, 0.5)',
              zIndex: 999999,
              display: 'flex',
              flexDirection: 'column',
              maxHeight: isMobile ? 'calc(80vh - 40px)' : '480px',
              overflow: 'hidden',
              animation: 'notif-pop 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            {/* Cabecera */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 18px 14px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              backgroundColor: 'rgba(255, 255, 255, 0.02)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px' }}>🔔</span>
                <div>
                  <div style={{ color: '#fff', fontSize: '15px', fontWeight: 800, letterSpacing: '-0.2px' }}>
                    Notificaciones
                  </div>
                  {noLeidas > 0 ? (
                    <div style={{ color: 'var(--color-accent, #f97316)', fontSize: '11px', fontWeight: 700, marginTop: '1px' }}>
                      {noLeidas} nueva{noLeidas > 1 ? 's' : ''} sin leer
                    </div>
                  ) : (
                    <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 500, marginTop: '1px' }}>
                      Al día
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {noLeidas > 0 && (
                  <button
                    onClick={handleMarcarTodas}
                    style={{
                      background: 'var(--color-accent-light, rgba(249, 115, 22, 0.12))',
                      border: '1px solid var(--border-accent, rgba(249, 115, 22, 0.3))',
                      color: 'var(--color-accent, #f97316)',
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '4px 10px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    Marcar todas
                  </button>
                )}

                <button
                  onClick={() => setOpen(false)}
                  title="Cerrar"
                  style={{
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    color: '#a1a1aa',
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 700,
                    transition: 'all 0.15s',
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Lista con scroll suave */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
              overscrollBehavior: 'contain',
            }}>
              {notifs.length === 0 ? (
                <div style={{
                  padding: '44px 24px',
                  textAlign: 'center',
                  color: '#64748b',
                }}>
                  <div style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '24px',
                    margin: '0 auto 12px',
                  }}>
                    🔔
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#e2e8f0', marginBottom: '4px' }}>
                    Sin notificaciones aún
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.4 }}>
                    Te avisaremos aquí cuando se emita un nuevo recibo, se apruebe un pago o haya avisos comunitarios.
                  </div>
                </div>
              ) : (
                notifs.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleClickNotif(n)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                      padding: '14px 18px',
                      background: n.leida ? 'transparent' : 'rgba(249, 115, 22, 0.04)',
                      border: 'none',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background 0.15s',
                      position: 'relative',
                    }}
                  >
                    {/* Ícono del tipo */}
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '12px',
                      backgroundColor: `${COLORES[n.tipo] || '#666'}18`,
                      color: COLORES[n.tipo] || '#94a3b8',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: '2px',
                      border: `1px solid ${COLORES[n.tipo] || '#666'}35`,
                    }}>
                      {ICONOS[n.tipo] || ICONOS.aviso}
                    </div>

                    {/* Texto */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '6px',
                        marginBottom: '3px',
                      }}>
                        <div style={{
                          color: n.leida ? '#cbd5e1' : '#fff',
                          fontSize: '13.5px',
                          fontWeight: n.leida ? 600 : 800,
                          lineHeight: 1.25,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}>
                          {n.titulo}
                        </div>
                        {!n.leida && (
                          <span style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: 'var(--color-accent, #f97316)',
                            flexShrink: 0,
                            boxShadow: '0 0 8px rgba(249, 115, 22, 0.8)',
                          }} />
                        )}
                      </div>

                      <div style={{
                        color: n.leida ? '#94a3b8' : '#cbd5e1',
                        fontSize: '12px',
                        lineHeight: 1.45,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}>
                        {n.cuerpo}
                      </div>

                      <div style={{
                        color: '#64748b',
                        fontSize: '10.5px',
                        marginTop: '5px',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}>
                        <span>🕒</span> {formatRelativo(n.created_at)}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: '12px 18px',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              backgroundColor: 'rgba(255, 255, 255, 0.02)',
            }}>
              {typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default' ? (
                <button
                  onClick={async () => {
                    const ok = await registrarPushNotificaciones()
                    setPushGranted(ok)
                  }}
                  style={{
                    background: 'var(--color-accent-light, rgba(249, 115, 22, 0.12))',
                    border: '1px solid var(--border-accent, rgba(249, 115, 22, 0.3))',
                    color: 'var(--color-accent, #f97316)',
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '5px 10px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  🔔 Activar alertas push
                </button>
              ) : (
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>
                  {pushGranted || (typeof Notification !== 'undefined' && Notification.permission === 'granted')
                    ? '✓ Alertas push activas'
                    : ''}
                </span>
              )}

              <button
                onClick={() => setOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  padding: '4px 8px',
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </>,
        document.body
      )}

      {/* Estilos de animación globales */}
      <style>{`
        @keyframes bell-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.18); }
        }
        @keyframes notif-fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes notif-pop {
          from {
            opacity: 0;
            transform: scale(0.96) translateY(-6px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </>
  )
}
