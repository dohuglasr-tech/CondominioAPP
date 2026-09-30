/**
 * Helper para Notificaciones Push en Web y Móviles (Web Notifications API & PWA).
 * Permite que los residentes reciban alertas nativas en su teléfono y computadora
 * cuando se emiten recibos, se validan pagos o hay avisos urgentes.
 */

export function esSoportadoPush(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function obtenerEstadoPermiso(): NotificationPermission | 'no_soportado' {
  if (!esSoportadoPush()) return 'no_soportado'
  return Notification.permission
}

/**
 * Solicita permiso de notificaciones al usuario de forma no intrusiva.
 */
export async function solicitarPermisoNotificaciones(): Promise<boolean> {
  if (!esSoportadoPush()) return false

  try {
    const permission = await Notification.requestPermission()
    return permission === 'granted'
  } catch (err) {
    console.warn('[PushHelper] Error solicitando permiso:', err)
    return false
  }
}

/**
 * Dispara una notificación nativa en el dispositivo si el usuario otorgó permiso.
 */
export function dispararNotificacionLocal(
  titulo: string,
  opciones: {
    body?: string
    icon?: string
    badge?: string
    tag?: string
    url?: string
  } = {}
): void {
  if (!esSoportadoPush() || Notification.permission !== 'granted') return

  try {
    const notif = new Notification(titulo, {
      body: opciones.body || '',
      icon: opciones.icon || '/icon-192.png',
      badge: opciones.badge || '/icon-192.png',
      tag: opciones.tag || 'condominio-notif',
    })

    if (opciones.url) {
      notif.onclick = () => {
        window.focus()
        if (window.location.pathname !== opciones.url) {
          window.location.href = opciones.url!
        }
        notif.close()
      }
    }
  } catch (err) {
    console.warn('[PushHelper] Error al disparar notificación local:', err)
  }
}
