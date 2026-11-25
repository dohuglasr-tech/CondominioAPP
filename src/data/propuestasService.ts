import { supabase } from './supabase'
import { getErrorMessage } from '../utils/logger'

export interface OpcionVoto {
  id: 'favor' | 'contra' | 'abstencion'
  texto: string
  votos_count: number
}

export interface Propuesta {
  id: string
  titulo: string
  descripcion: string
  opciones: OpcionVoto[]
  fecha_cierre: string | null
  estado: 'activa' | 'cerrada' | 'aprobada' | 'rechazada'
  created_at: string
  mi_voto?: string | null
}

interface VotoRow {
  propuesta_id?: string
  apartamento_id?: string | null
  voto: string
}

/**
 * Construye el desglose de opciones estándar y sus conteos reales
 * a partir de las filas de `votos_propuestas`.
 */
export function construirOpcionesPropuesta(votos: Array<{ voto: string }>): OpcionVoto[] {
  let favor = 0
  let contra = 0
  let abstencion = 0

  for (const v of votos) {
    if (v.voto === 'favor') favor++
    else if (v.voto === 'contra') contra++
    else if (v.voto === 'abstencion') abstencion++
  }

  return [
    { id: 'favor', texto: 'Sí, estoy de acuerdo', votos_count: favor },
    { id: 'contra', texto: 'No estoy de acuerdo', votos_count: contra },
    { id: 'abstencion', texto: 'Me abstengo', votos_count: abstencion },
  ]
}

async function mapPropuestasConVotos(
  rows: Array<{
    id: string
    titulo: string
    descripcion: string
    estado: string
    fecha_cierre: string | null
    created_at: string
  }>,
  apartamentoId?: string
): Promise<Propuesta[]> {
  if (rows.length === 0) return []

  const ids = rows.map(r => r.id)
  const { data: votosRows } = await supabase
    .from('votos_propuestas')
    .select('propuesta_id, apartamento_id, voto')
    .in('propuesta_id', ids)

  const votosPorProp = new Map<string, VotoRow[]>()
  ;((votosRows as VotoRow[] | null) || []).forEach(v => {
    if (!v.propuesta_id) return
    const list = votosPorProp.get(v.propuesta_id) || []
    list.push(v)
    votosPorProp.set(v.propuesta_id, list)
  })

  return rows.map(r => {
    const votosProp = votosPorProp.get(r.id) || []
    const miVotoRow = apartamentoId
      ? votosProp.find(v => v.apartamento_id === apartamentoId)
      : undefined
    return {
      id: r.id,
      titulo: r.titulo,
      descripcion: r.descripcion,
      opciones: construirOpcionesPropuesta(votosProp),
      fecha_cierre: r.fecha_cierre,
      estado: (r.estado as Propuesta['estado']) || 'activa',
      created_at: r.created_at,
      mi_voto: miVotoRow?.voto ?? null,
    }
  })
}

export async function obtenerPropuestasActivas(
  apartamentoId?: string
): Promise<{ data: Propuesta[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('propuestas')
      .select('id, titulo, descripcion, estado, fecha_cierre, created_at')
      .eq('estado', 'activa')
      .order('created_at', { ascending: false })

    if (error) return { data: [], error: error.message }

    const mapped = await mapPropuestasConVotos(data || [], apartamentoId)
    return { data: mapped, error: null }
  } catch (err: unknown) {
    return { data: [], error: getErrorMessage(err) }
  }
}

export async function obtenerTodasLasPropuestasAdmin(): Promise<{ data: Propuesta[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('propuestas')
      .select('id, titulo, descripcion, estado, fecha_cierre, created_at')
      .order('created_at', { ascending: false })

    if (error) return { data: [], error: error.message }

    const mapped = await mapPropuestasConVotos(data || [])
    return { data: mapped, error: null }
  } catch (err: unknown) {
    return { data: [], error: getErrorMessage(err) }
  }
}

export async function crearPropuestaAdmin(params: {
  titulo: string
  descripcion: string
  fecha_cierre?: string | null
  autor_id?: string | null
}): Promise<{ data: Propuesta | null; error: string | null }> {
  try {
    const tituloLimpio = params.titulo.trim()
    const descripcionLimpia = params.descripcion.trim()
    if (!tituloLimpio || !descripcionLimpia) {
      return { data: null, error: 'El título y la descripción son obligatorios.' }
    }

    let autorId = params.autor_id || null
    if (!autorId) {
      const { data: userData } = await supabase.auth.getUser()
      autorId = userData?.user?.id || null
    }

    const { data, error } = await supabase
      .from('propuestas')
      .insert({
        titulo: tituloLimpio,
        descripcion: descripcionLimpia,
        fecha_cierre: params.fecha_cierre ? new Date(`${params.fecha_cierre}T23:59:59`).toISOString() : null,
        estado: 'activa',
        autor_id: autorId,
      })
      .select('id, titulo, descripcion, estado, fecha_cierre, created_at')
      .single()

    if (error) return { data: null, error: error.message }

    return {
      data: {
        id: data.id,
        titulo: data.titulo,
        descripcion: data.descripcion,
        opciones: construirOpcionesPropuesta([]),
        fecha_cierre: data.fecha_cierre,
        estado: (data.estado as Propuesta['estado']) || 'activa',
        created_at: data.created_at,
      },
      error: null,
    }
  } catch (err: unknown) {
    return { data: null, error: getErrorMessage(err) }
  }
}

export async function cambiarEstadoPropuestaAdmin(
  propuestaId: string,
  estado: 'activa' | 'cerrada'
): Promise<{ success: boolean; error: string | null }> {
  try {
    const { error } = await supabase
      .from('propuestas')
      .update({ estado })
      .eq('id', propuestaId)

    if (error) return { success: false, error: error.message }
    return { success: true, error: null }
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) }
  }
}

export async function eliminarPropuestaAdmin(
  propuestaId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    const { error } = await supabase
      .from('propuestas')
      .delete()
      .eq('id', propuestaId)

    if (error) return { success: false, error: error.message }
    return { success: true, error: null }
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) }
  }
}

export async function emitirVoto(
  propuestaId: string,
  opcionId: string,
  apartamentoId: string,
  usuarioId?: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!apartamentoId) {
      return { success: false, error: 'Tu usuario no tiene un apartamento asignado para votar.' }
    }

    let uid = usuarioId || null
    if (!uid) {
      const { data: userData } = await supabase.auth.getUser()
      uid = userData?.user?.id || null
    }

    const { error } = await supabase
      .from('votos_propuestas')
      .insert({
        propuesta_id: propuestaId,
        apartamento_id: apartamentoId,
        usuario_id: uid,
        voto: opcionId,
      })

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'Este apartamento ya registró su voto en esta propuesta.' }
      }
      return { success: false, error: error.message }
    }

    return { success: true, error: null }
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) }
  }
}
