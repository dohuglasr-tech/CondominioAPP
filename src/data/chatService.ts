import { supabase } from './supabase'

export interface ChatMensaje {
  id: string
  contenido: string
  adjunto_url?: string | null
  adjunto_tipo?: string | null
  created_at: string
  autor_id?: string | null
  autor_nombre: string
  autor_rol: string
  apartamento_numero?: string | null
  es_admin: boolean
  es_anuncio: boolean
}

export interface ChatEstadoConfig {
  solo_lectura: boolean
  motivo_bloqueo: string
  bloqueado_en?: string | null
  bloqueado_por?: string | null
}

export const CHAT_CHANNEL_NAME = 'chat_comunitario_live'

const LOCAL_STORAGE_KEY_READONLY = 'condominio_chat_solo_lectura'
const LOCAL_STORAGE_KEY_MOTIVO = 'condominio_chat_motivo'
const MOTIVO_DEFAULT = 'Modo solo lectura activado por la administración para mantener la sana convivencia y el respeto mutuo.'

/**
 * Obtiene el estado actual del Modo Solo Lectura
 */
export async function obtenerEstadoSoloLectura(): Promise<ChatEstadoConfig> {
  try {
    const { data, error } = await supabase
      .from('configuracion_edificio')
      .select('chat_solo_lectura, chat_motivo_bloqueo, chat_bloqueado_en, chat_bloqueado_por')
      .limit(1)
      .maybeSingle()

    if (!error && data && data.chat_solo_lectura !== undefined) {
      const config: ChatEstadoConfig = {
        solo_lectura: !!data.chat_solo_lectura,
        motivo_bloqueo: data.chat_motivo_bloqueo || MOTIVO_DEFAULT,
        bloqueado_en: data.chat_bloqueado_en || null,
        bloqueado_por: data.chat_bloqueado_por || 'Administración'
      }
      localStorage.setItem(LOCAL_STORAGE_KEY_READONLY, config.solo_lectura ? 'true' : 'false')
      localStorage.setItem(LOCAL_STORAGE_KEY_MOTIVO, config.motivo_bloqueo)
      return config
    }
  } catch (err) {
    console.warn('[ChatService] Fallback a localStorage para estado de solo lectura:', err)
  }

  // Fallback local si la columna aún no está en Supabase
  const localVal = localStorage.getItem(LOCAL_STORAGE_KEY_READONLY) === 'true'
  const localMotivo = localStorage.getItem(LOCAL_STORAGE_KEY_MOTIVO) || MOTIVO_DEFAULT

  return {
    solo_lectura: localVal,
    motivo_bloqueo: localMotivo,
    bloqueado_en: null,
    bloqueado_por: 'Administración'
  }
}

/**
 * Cambia el estado del Modo Solo Lectura (Solo Admin)
 */
export async function cambiarEstadoSoloLectura(
  activo: boolean,
  motivo?: string,
  bloqueadoPor: string = 'Administración'
): Promise<{ error: string | null }> {
  const motivoFinal = (motivo && motivo.trim()) ? motivo.trim() : MOTIVO_DEFAULT
  const ahora = new Date().toISOString()

  // Guardar en local storage para disponibilidad offline e inmediata
  localStorage.setItem(LOCAL_STORAGE_KEY_READONLY, activo ? 'true' : 'false')
  localStorage.setItem(LOCAL_STORAGE_KEY_MOTIVO, motivoFinal)

  // 1. Intentar actualizar en base de datos
  try {
    const { data: configRows } = await supabase.from('configuracion_edificio').select('id').limit(1)
    if (configRows && configRows.length > 0) {
      await supabase
        .from('configuracion_edificio')
        .update({
          chat_solo_lectura: activo,
          chat_motivo_bloqueo: motivoFinal,
          chat_bloqueado_en: ahora,
          chat_bloqueado_por: bloqueadoPor
        })
        .eq('id', configRows[0].id)
    }
  } catch (dbErr) {
    console.warn('[ChatService] No se pudo guardar en configuracion_edificio:', dbErr)
  }

  // 2. Transmitir en vivo a todos los clientes conectados mediante Supabase Realtime Broadcast
  try {
    const channel = supabase.channel(CHAT_CHANNEL_NAME)
    channel.send({
      type: 'broadcast',
      event: 'modo_solo_lectura',
      payload: {
        activo,
        motivo: motivoFinal,
        bloqueado_en: ahora,
        bloqueado_por: bloqueadoPor
      }
    })
  } catch (bcErr) {
    console.warn('[ChatService] Error en broadcast:', bcErr)
  }

  // 3. Enviar mensaje del sistema al chat para que quede en el historial de todos
  const textoAviso = activo
    ? `🔒 MODO SOLO LECTURA ACTIVADO: La administración ha pausado los comentarios para preservar el orden y el respeto. Motivo: "${motivoFinal}"`
    : `🔓 MODO SOLO LECTURA DESACTIVADO: La administración ha reabierto el chat comunitario para la libre participación de todos los propietarios.`

  await enviarMensajeDesdeAdmin(textoAviso, true)

  return { error: null }
}

/**
 * Obtiene los últimos N mensajes del chat comunitario, garantizando la identificación por apartamento
 */
export async function obtenerMensajes(limite: number = 80): Promise<{ data: ChatMensaje[]; error: string | null }> {
  try {
    // 1. Consultar mensajes
    const { data, error } = await supabase
      .from('chat_mensajes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limite)

    if (error) {
      console.warn('[ChatService] Intentando consulta con relación perfiles debido a:', error.message)
      // Fallback a consulta previa con join
      const fallbackRes = await supabase
        .from('chat_mensajes')
        .select(`
          id,
          contenido,
          adjunto_url,
          adjunto_tipo,
          created_at,
          autor_id,
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

      if (fallbackRes.error) {
        return { data: [], error: fallbackRes.error.message }
      }

      const parsedLegacy = (fallbackRes.data || []).map((d: any) => ({
        id: d.id,
        contenido: d.contenido,
        adjunto_url: d.adjunto_url,
        adjunto_tipo: d.adjunto_tipo,
        created_at: d.created_at,
        autor_id: d.autor_id,
        autor_nombre: d.perfiles?.nombre_completo || 'Residente',
        autor_rol: d.perfiles?.rol || 'residente',
        apartamento_numero: d.perfiles?.apartamento?.numero || null,
        es_admin: d.perfiles?.rol === 'administrador',
        es_anuncio: false
      })).reverse()

      return { data: parsedLegacy, error: null }
    }

    // 2. Si algunos mensajes no tienen apartamento_numero pero sí autor_id, resolverlos con perfiles
    const autorIdsFaltantes = Array.from(new Set(
      (data || [])
        .filter((d: any) => !d.apartamento_numero && !d.es_admin && d.autor_id)
        .map((d: any) => d.autor_id)
    ))

    const mapaAptosPorAutor = new Map<string, { numero: string; nombre: string }>()
    if (autorIdsFaltantes.length > 0) {
      try {
        const { data: perfs } = await supabase
          .from('perfiles')
          .select('id, nombre_completo, apartamento:apartamento_id(numero)')
          .in('id', autorIdsFaltantes)

        if (perfs) {
          perfs.forEach((p: any) => {
            if (p.apartamento?.numero) {
              mapaAptosPorAutor.set(p.id, {
                numero: p.apartamento.numero,
                nombre: p.nombre_completo || ''
              })
            }
          })
        }
      } catch (errPerf) {
        console.warn('[ChatService] Error resolviendo perfiles faltantes:', errPerf)
      }
    }

    // Mapear los datos directos
    const mensajes: ChatMensaje[] = (data || []).map((d: any) => {
      const infoExtra = d.autor_id ? mapaAptosPorAutor.get(d.autor_id) : null
      const aptoNum = d.apartamento_numero || infoExtra?.numero || null
      const nombreFinal = d.autor_nombre || infoExtra?.nombre || (d.es_admin ? 'Administración' : (aptoNum ? `Propietario Apto ${aptoNum}` : 'Vecino'))

      return {
        id: d.id,
        contenido: d.contenido,
        adjunto_url: d.adjunto_url || null,
        adjunto_tipo: d.adjunto_tipo || null,
        created_at: d.created_at || new Date().toISOString(),
        autor_id: d.autor_id || null,
        autor_nombre: nombreFinal,
        autor_rol: d.autor_rol || (d.es_admin ? 'administrador' : 'residente'),
        apartamento_numero: aptoNum,
        es_admin: !!d.es_admin,
        es_anuncio: !!d.es_anuncio
      }
    }).reverse() // Cronológico: más antiguo primero, más nuevo al final

    return { data: mensajes, error: null }
  } catch (err: any) {
    console.error('[ChatService] Error cargando mensajes:', err)
    return { data: [], error: err.message || 'Error al obtener mensajes' }
  }
}

/**
 * Envía un mensaje desde el portal de un Residente, con identificación OBLIGATORIA de apartamento
 */
export async function enviarMensajeDesdeResidente(params: {
  usuarioId?: string
  nombre: string
  apartamento: string
  contenido: string
}): Promise<{ data?: ChatMensaje; error: string | null }> {
  // 1. Verificar si está en modo solo lectura
  const estado = await obtenerEstadoSoloLectura()
  if (estado.solo_lectura) {
    return {
      error: `El chat se encuentra en Modo Solo Lectura por disposición de la administración. (${estado.motivo_bloqueo})`
    }
  }

  const contenidoLimpio = params.contenido.trim()
  if (!contenidoLimpio) {
    return { error: 'El mensaje no puede estar vacío.' }
  }

  // Garantizar identificación por apartamento
  const aptoLimpio = (params.apartamento && params.apartamento.trim()) ? params.apartamento.trim() : 'S/N'
  const nombreLimpio = (params.nombre && params.nombre.trim()) ? params.nombre.trim() : `Apto ${aptoLimpio}`

  const nuevoId = crypto.randomUUID ? crypto.randomUUID() : `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
  const ahora = new Date().toISOString()

  const nuevoMensaje: ChatMensaje = {
    id: nuevoId,
    contenido: contenidoLimpio,
    created_at: ahora,
    autor_id: params.usuarioId || null,
    autor_nombre: nombreLimpio,
    autor_rol: 'residente',
    apartamento_numero: aptoLimpio,
    es_admin: false,
    es_anuncio: false
  }

  // Guardar en Supabase
  try {
    const payload: any = {
      id: nuevoId,
      contenido: contenidoLimpio,
      autor_nombre: nuevoMensaje.autor_nombre,
      autor_rol: 'residente',
      apartamento_numero: aptoLimpio,
      es_admin: false,
      es_anuncio: false
    }

    if (params.usuarioId) {
      payload.autor_id = params.usuarioId
    }

    const { error } = await supabase.from('chat_mensajes').insert([payload])

    if (error) {
      // Si falló por falta de columnas nuevas en chat_mensajes, intentamos formato básico
      console.warn('[ChatService] Insert avanzado falló, intentando inserción básica:', error.message)
      if (params.usuarioId) {
        await supabase.from('chat_mensajes').insert([{ autor_id: params.usuarioId, contenido: contenidoLimpio }])
      }
    }
  } catch (insertErr) {
    console.error('[ChatService] Error en inserción a DB:', insertErr)
  }

  // Transmitir en vivo a todos por canal Realtime Broadcast
  try {
    const channel = supabase.channel(CHAT_CHANNEL_NAME)
    channel.send({
      type: 'broadcast',
      event: 'nuevo_mensaje',
      payload: nuevoMensaje
    })
  } catch (bcErr) {
    console.warn('[ChatService] Error transmitiendo broadcast:', bcErr)
  }

  return { data: nuevoMensaje, error: null }
}

/**
 * Envía un mensaje o anuncio oficial desde el panel de Administración
 */
export async function enviarMensajeDesdeAdmin(
  contenido: string,
  esAnuncio: boolean = false
): Promise<{ data?: ChatMensaje; error: string | null }> {
  const contenidoLimpio = contenido.trim()
  if (!contenidoLimpio) {
    return { error: 'El mensaje no puede estar vacío.' }
  }

  const nuevoId = crypto.randomUUID ? crypto.randomUUID() : `adm_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
  const ahora = new Date().toISOString()

  const nuevoMensaje: ChatMensaje = {
    id: nuevoId,
    contenido: contenidoLimpio,
    created_at: ahora,
    autor_id: null,
    autor_nombre: esAnuncio ? '📣 ANUNCIO OFICIAL' : 'Administración Torre 5',
    autor_rol: 'administrador',
    apartamento_numero: null,
    es_admin: true,
    es_anuncio: esAnuncio
  }

  // Guardar en Supabase
  try {
    const payload: any = {
      id: nuevoId,
      contenido: contenidoLimpio,
      autor_nombre: nuevoMensaje.autor_nombre,
      autor_rol: 'administrador',
      es_admin: true,
      es_anuncio: esAnuncio
    }

    const { error } = await supabase.from('chat_mensajes').insert([payload])

    if (error) {
      console.warn('[ChatService] Inserción de admin en DB arrojó:', error.message)
    }
  } catch (insertErr) {
    console.error('[ChatService] Error en inserción admin a DB:', insertErr)
  }

  // Transmitir en vivo a todos
  try {
    const channel = supabase.channel(CHAT_CHANNEL_NAME)
    channel.send({
      type: 'broadcast',
      event: 'nuevo_mensaje',
      payload: nuevoMensaje
    })
  } catch (bcErr) {
    console.warn('[ChatService] Error transmitiendo broadcast admin:', bcErr)
  }

  return { data: nuevoMensaje, error: null }
}

/**
 * Elimina un mensaje del chat (Moderación de la Administración)
 */
export async function eliminarMensajeChat(mensajeId: string): Promise<{ error: string | null }> {
  try {
    await supabase.from('chat_mensajes').delete().eq('id', mensajeId)
  } catch (err) {
    console.warn('[ChatService] Error eliminando mensaje en DB:', err)
  }

  // Broadcast para borrar en vivo en las pantallas de todos
  try {
    const channel = supabase.channel(CHAT_CHANNEL_NAME)
    channel.send({
      type: 'broadcast',
      event: 'mensaje_eliminado',
      payload: { id: mensajeId }
    })
  } catch (bcErr) {
    console.warn('[ChatService] Error enviando broadcast de borrado:', bcErr)
  }

  return { error: null }
}
