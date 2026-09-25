import { supabase } from './supabase'

export interface ChatMensaje {
  id: string
  contenido: string
  adjunto_url: string | null
  adjunto_tipo: string | null
  created_at: string
  autor: {
    nombre_completo: string | null
    apartamento: {
      numero: string
    } | null
    rol: string
  }
}

/**
 * Obtiene los últimos N mensajes del chat global
 */
export async function obtenerMensajes(limite: number = 50): Promise<{ data: ChatMensaje[]; error: string | null }> {
  const { data, error } = await supabase
    .from('chat_mensajes')
    .select(`
      id,
      contenido,
      adjunto_url,
      adjunto_tipo,
      created_at,
      perfiles!chat_mensajes_autor_id_fkey (
        nombre_completo,
        rol,
        apartamento:apartamento_id (
          numero
        )
      )
    `)
    .order('created_at', { ascending: false })
    .limit(limite)

  if (error) {
    console.error('[ChatService] Error obteniendo mensajes:', error)
    return { data: [], error: 'No se pudieron cargar los mensajes.' }
  }

  // Mapeamos los datos para simplificar el uso en UI
  const mensajes = data.map((d: any) => ({
    id: d.id,
    contenido: d.contenido,
    adjunto_url: d.adjunto_url,
    adjunto_tipo: d.adjunto_tipo,
    created_at: d.created_at,
    autor: {
      nombre_completo: d.perfiles?.nombre_completo || 'Usuario',
      apartamento: d.perfiles?.apartamento,
      rol: d.perfiles?.rol || 'residente',
    }
  })).reverse() // Invertimos para que el más nuevo quede abajo

  return { data: mensajes, error: null }
}

/**
 * Envía un nuevo mensaje
 */
export async function enviarMensaje(usuarioId: string, contenido: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('chat_mensajes')
    .insert([
      {
        autor_id: usuarioId,
        contenido: contenido.trim(),
      }
    ])

  if (error) {
    console.error('[ChatService] Error enviando mensaje:', error)
    return { error: error.message }
  }

  return { error: null }
}
