import React, { useState, useEffect, useRef, useCallback } from 'react'
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
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="9" y1="13" x2="15" y2="13"/>
    </svg>
  ),
  mora: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  ),
  chat: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  pago_aprobado: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  pago_rechazado: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
  aviso: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  ),
}

const COLORES: Record<string, string> = {
  recibo_emitido: '#f97316',
  mora: '#ef4444',
  chat: '#3b82f6',
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
  const panelRef = useRef<HTMLDivElement>(null)

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

  // ── Suscripción Realtime ──────────────────────────────────────────────────
  useEffect(() => {
    if (!apartamentoId) return

    let channel: any = null
    try {
      channel = supabase
        .channel(`notif_${apartamentoId}`)
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

            // Notificación del navegador si la app está en segundo plano
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
              mostrarNotificacionLocal(nueva.titulo, nueva.cuerpo, nueva.link)
            }
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

  // ── Cerrar al hacer clic fuera ────────────────────────────────────────────
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // ── Solicitar permisos de push al abrir la campanita por primera vez ───────
  const handleOpen = async () => {
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
  const handleMarcarTodas = async () => {
    if (!apartamentoId) return
    await marcarTodasLeidas(apartamentoId)
    setNotifs((prev) => prev.map((x) => ({ ...x, leida: true })))
    setNoLeidas(0)
  }

  return (
    <div ref={panelRef} style={{ position: 'relative' }}>
      {/* ── Botón campanita ─────────────────────────────────────────── */}
      <button
        onClick={handleOpen}
        title="Notificaciones"
        style={{
          background: 'transparent',
          border: 'none',
          color: iconColor,
          padding: '6px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          borderRadius: '8px',
          transition: 'color 0.2s',
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>

        {/* Badge de no leídas */}
        {noLeidas > 0 && (
          <span style={{
            position: 'absolute',
            top: '2px',
            right: '2px',
            minWidth: '16px',
            height: '16px',
            backgroundColor: '#ef4444',
            color: '#fff',
            fontSize: '9px',
            fontWeight: 900,
            borderRadius: '999px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 3px',
            border: '2px solid #090a0d',
            animation: 'bell-pulse 2s infinite',
          }}>
            {noLeidas > 9 ? '9+' : noLeidas}
          </span>
        )}
      </button>

      {/* ── Panel desplegable ────────────────────────────────────────── */}
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 10px)',
          right: 0,
          width: '340px',
          maxWidth: 'calc(100vw - 24px)',
          backgroundColor: '#111216',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '16px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.05)',
          zIndex: 9999,
          overflow: 'hidden',
        }}>
          {/* Cabecera */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 16px 12px',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
          }}>
            <div>
              <div style={{ color: '#fff', fontSize: '14px', fontWeight: 800 }}>Notificaciones</div>
              {noLeidas > 0 && (
                <div style={{ color: '#f97316', fontSize: '11px', fontWeight: 600, marginTop: '2px' }}>
                  {noLeidas} sin leer
                </div>
              )}
            </div>
            {noLeidas > 0 && (
              <button
                onClick={handleMarcarTodas}
                style={{
                  background: 'rgba(249,115,22,0.12)',
                  border: '1px solid rgba(249,115,22,0.25)',
                  color: '#f97316',
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '4px 10px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                }}
              >
                Marcar todas
              </button>
            )}
          </div>

          {/* Lista */}
          <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
            {notifs.length === 0 ? (
              <div style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: '#555',
              }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔔</div>
                <div style={{ fontSize: '13px' }}>Sin notificaciones aún</div>
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
                    padding: '13px 16px',
                    background: n.leida ? 'transparent' : 'rgba(249,115,22,0.04)',
                    border: 'none',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background 0.15s',
                  }}
                >
                  {/* Ícono del tipo */}
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    backgroundColor: `${COLORES[n.tipo] || '#666'}20`,
                    color: COLORES[n.tipo] || '#666',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: '2px',
                    border: `1px solid ${COLORES[n.tipo] || '#666'}30`,
                  }}>
                    {ICONOS[n.tipo] || ICONOS.aviso}
                  </div>

                  {/* Texto */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      color: n.leida ? '#888' : '#fff',
                      fontSize: '13px',
                      fontWeight: n.leida ? 500 : 700,
                      lineHeight: 1.3,
                      marginBottom: '3px',
                    }}>
                      {n.titulo}
                    </div>
                    <div style={{
                      color: '#666',
                      fontSize: '12px',
                      lineHeight: 1.4,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}>
                      {n.cuerpo}
                    </div>
                    <div style={{ color: '#444', fontSize: '10px', marginTop: '4px', fontWeight: 500 }}>
                      {formatRelativo(n.created_at)}
                    </div>
                  </div>

                  {/* Punto de no leída */}
                  {!n.leida && (
                    <div style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: '#f97316',
                      flexShrink: 0,
                      marginTop: '6px',
                    }} />
                  )}
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: '10px 16px',
            borderTop: '1px solid rgba(255,255,255,0.07)',
            textAlign: 'center',
          }}>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                color: '#555',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Animación del badge */}
      <style>{`
        @keyframes bell-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.15); }
        }
      `}</style>
    </div>
  )
}
