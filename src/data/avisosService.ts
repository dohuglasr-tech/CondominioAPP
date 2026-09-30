import { supabase } from './supabase'
import { notificarTodos } from './notificacionesService'

export type TipoAviso = 'urgente' | 'mantenimiento' | 'info'

export interface AvisoComunidad {
  id: string
  titulo: string
  mensaje: string
  tipo: TipoAviso
  created_at: string
  autor_nombre: string
}

const TIPO_PREFIX: Record<TipoAviso, string> = {
  urgente: '[URGENTE]',
  mantenimiento: '[MANTENIMIENTO]',
  info: '[AVISO]',
}

export function parseAvisoContenido(rawContenido: string): { tipo: TipoAviso; texto: string } {
  if (rawContenido.startsWith('[URGENTE]')) {
    return { tipo: 'urgente', texto: rawContenido.replace('[URGENTE]', '').trim() }
  }
  if (rawContenido.startsWith('[MANTENIMIENTO]')) {
    return { tipo: 'mantenimiento', texto: rawContenido.replace('[MANTENIMIENTO]', '').trim() }
  }
  if (rawContenido.startsWith('[AVISO]')) {
    return { tipo: 'info', texto: rawContenido.replace('[AVISO]', '').trim() }
  }
  return { tipo: 'info', texto: rawContenido.trim() }
}

/**
 * Obtiene el aviso activo más reciente de la administración.
 */
export async function obtenerAvisoActivo(): Promise<AvisoComunidad | null> {
  try {
    const { data, error } = await supabase
      .from('chat_mensajes')
      .select('id, contenido, created_at, autor_nombre')
      .eq('es_anuncio', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error || !data) return null

    // Verificar si el aviso tiene menos de 14 días
    const fechaCreacion = new Date(data.created_at).getTime()
    const ahora = Date.now()
    const dias = (ahora - fechaCreacion) / (1000 * 60 * 60 * 24)
    if (dias > 14) return null

    const { tipo, texto } = parseAvisoContenido(data.contenido)

    return {
      id: data.id,
      titulo: tipo === 'urgente' ? 'Aviso Urgente' : tipo === 'mantenimiento' ? 'Mantenimiento' : 'Aviso General',
      mensaje: texto,
      tipo,
      created_at: data.created_at,
      autor_nombre: data.autor_nombre || 'Junta de Condominio',
    }
  } catch (err) {
    console.warn('[AvisosService] Error obteniendo aviso activo:', err)
    return null
  }
}

/**
 * Publica un nuevo aviso en la cartelera comunitaria y notifica a todos los apartamentos.
 */
export async function publicarAvisoComunidad(params: {
  mensaje: string
  tipo: TipoAviso
  autorNombre?: string
}): Promise<{ data: any; error: string | null }> {
  try {
    const prefix = TIPO_PREFIX[params.tipo] || '[AVISO]'
    const contenidoCompleto = `${prefix} ${params.mensaje.trim()}`

    const { data, error } = await supabase
      .from('chat_mensajes')
      .insert({
        contenido: contenidoCompleto,
        es_anuncio: true,
        es_admin: true,
        autor_nombre: params.autorNombre || '📣 JUNTA DE CONDOMINIO',
        autor_rol: 'administrador',
      })
      .select()
      .single()

    if (error) {
      return { data: null, error: error.message }
    }

    // Notificar a todos los apartamentos
    notificarTodos({
      tipo: 'aviso',
      titulo: params.tipo === 'urgente' ? '🚨 Aviso Urgente del Condominio' : '📣 Aviso de la Junta de Condominio',
      cuerpo: params.mensaje.length > 120 ? params.mensaje.slice(0, 117) + '...' : params.mensaje,
      link: '/',
    }).catch(() => {})

    return { data, error: null }
  } catch (err: any) {
    return { data: null, error: err.message || 'Error al publicar aviso' }
  }
}

/**
 * Elimina o desactiva un aviso de la cartelera comunitaria.
 */
export async function eliminarAvisoComunidad(avisoId: string): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase
      .from('chat_mensajes')
      .delete()
      .eq('id', avisoId)

    if (error) return { error: error.message }
    return { error: null }
  } catch (err: any) {
    return { error: err.message || 'Error al eliminar aviso' }
  }
}
