import { supabase } from './supabase'

// ── Tipos ────────────────────────────────────────────────────────────────────
export type TipoNotificacion =
  | 'recibo_emitido'
  | 'mora'
  | 'chat'
  | 'pago_aprobado'
  | 'pago_rechazado'
  | 'aviso'

export interface Notificacion {
  id: string
  apartamento_id: string | null
  perfil_id: string | null
  tipo: TipoNotificacion
  titulo: string
  cuerpo: string
  leida: boolean
  link: string
  meta: Record<string, any> | null
  created_at: string
}

// ── Insertar notificación para un apartamento específico ────────────────────
export async function notificarApartamento(params: {
  apartamento_id: string
  tipo: TipoNotificacion
  titulo: string
  cuerpo: string
  link?: string
  meta?: Record<string, any>
}) {
  const { error } = await supabase.from('notificaciones').insert({
    apartamento_id: params.apartamento_id,
    tipo: params.tipo,
    titulo: params.titulo,
    cuerpo: params.cuerpo,
    link: params.link || '/',
    meta: params.meta || null,
    leida: false,
  })
  if (error) console.error('[Notificaciones] Error al insertar:', error.message)
}

// ── Insertar notificación global (para todos los residentes) ─────────────────
export async function notificarTodos(params: {
  tipo: TipoNotificacion
  titulo: string
  cuerpo: string
  link?: string
  meta?: Record<string, any>
}) {
  // Traemos todos los apartamentos activos
  const { data: aptos, error: aptosError } = await supabase
    .from('apartamentos')
    .select('id')

  if (aptosError || !aptos?.length) {
    console.error('[Notificaciones] No se pudo obtener lista de apartamentos')
    return
  }

  const rows = aptos.map((a: { id: string }) => ({
    apartamento_id: a.id,
    tipo: params.tipo,
    titulo: params.titulo,
    cuerpo: params.cuerpo,
    link: params.link || '/',
    meta: params.meta || null,
    leida: false,
  }))

  const { error } = await supabase.from('notificaciones').insert(rows)
  if (error) console.error('[Notificaciones] Error al insertar masivo:', error.message)
}

// ── Obtener notificaciones de un apartamento ────────────────────────────────
export async function obtenerNotificaciones(apartamento_id: string, limite = 20): Promise<Notificacion[]> {
  const { data, error } = await supabase
    .from('notificaciones')
    .select('*')
    .eq('apartamento_id', apartamento_id)
    .order('created_at', { ascending: false })
    .limit(limite)

  if (error) return []
  return (data || []) as Notificacion[]
}

// ── Contar no leídas de un apartamento ─────────────────────────────────────
export async function contarNoLeidas(apartamento_id: string): Promise<number> {
  const { count, error } = await supabase
    .from('notificaciones')
    .select('*', { count: 'exact', head: true })
    .eq('apartamento_id', apartamento_id)
    .eq('leida', false)

  if (error) return 0
  return count || 0
}

// ── Marcar una notificación como leída ─────────────────────────────────────
export async function marcarLeida(notificacion_id: string) {
  await supabase
    .from('notificaciones')
    .update({ leida: true })
    .eq('id', notificacion_id)
}

// ── Marcar todas como leídas para un apartamento ───────────────────────────
export async function marcarTodasLeidas(apartamento_id: string) {
  await supabase
    .from('notificaciones')
    .update({ leida: true })
    .eq('apartamento_id', apartamento_id)
    .eq('leida', false)
}

// ── Registrar Service Worker y pedir permisos de push ──────────────────────
export async function registrarPushNotificaciones(): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('Notification' in window) || typeof Notification === 'undefined') {
    return false
  }

  try {
    // Registrar el service worker
    await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    await navigator.serviceWorker.ready

    // Pedir permiso al usuario
    const permission = await Notification.requestPermission()
    return permission === 'granted'
  } catch (err) {
    console.warn('[Push] Error al registrar service worker:', err)
    return false
  }
}

// ── Mostrar notificación local (in-browser, sin servidor) ──────────────────
// Útil para notificaciones en tiempo real via Realtime cuando la app está abierta
export function mostrarNotificacionLocal(titulo: string, cuerpo: string, link = '/') {
  if (typeof window === 'undefined' || !('Notification' in window) || typeof Notification === 'undefined') {
    return
  }
  if (Notification.permission !== 'granted') return

  try {
    const n = new Notification(titulo, {
      body: cuerpo,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      tag: 'condominio-local',
      requireInteraction: false,
    })

    n.onclick = () => {
      window.focus()
      window.location.href = link
      n.close()
    }

    // Auto-cerrar tras 6 segundos
    setTimeout(() => {
      try { n.close() } catch {}
    }, 6000)
  } catch (e) {
    console.warn('[Notificaciones] No se pudo mostrar notificación nativa:', e)
  }
}

