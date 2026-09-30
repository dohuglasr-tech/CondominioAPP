import { supabase } from './supabase'
import { notificarApartamento } from './notificacionesService'
import { comprimirImagen } from '../utils/imageCompressor'

// ── Tipos y Enums ────────────────────────────────────────────────────────────
export type CategoriaReporte =
  | 'agua'
  | 'electricidad'
  | 'ascensor'
  | 'porton'
  | 'limpieza'
  | 'ruido'
  | 'otro'

export type PrioridadReporte = 'baja' | 'media' | 'alta' | 'critica'

export type EstadoReporte = 'reportada' | 'en_progreso' | 'resuelta'

export interface ReporteItem {
  id: string
  titulo: string
  descripcion: string
  ubicacion: string
  categoria: CategoriaReporte
  prioridad: PrioridadReporte
  estado: EstadoReporte
  foto_url?: string | null
  creado_por?: string | null
  apartamento_numero?: string | null
  apartamento_id?: string | null
  propietario_nombre?: string | null
  propietario_telefono?: string | null
  respuesta_admin?: string | null
  created_at: string
  updated_at?: string | null
}

export const CATEGORIAS_CONFIG: Record<
  CategoriaReporte,
  { label: string; color: string; icon: string; desc: string }
> = {
  agua: {
    label: 'Agua y Plomería',
    color: '#06b6d4',
    icon: '💧',
    desc: 'Filtraciones, tuberías, bombas o tanques',
  },
  electricidad: {
    label: 'Electricidad y Luz',
    color: '#eab308',
    icon: '⚡',
    desc: 'Bombillos, brequeras, fallas de iluminación en pasillos',
  },
  ascensor: {
    label: 'Ascensores',
    color: '#a855f7',
    icon: '🛗',
    desc: 'Fallas mecánicas, puertas trabadas, botoneras o ruidos',
  },
  porton: {
    label: 'Portones y Accesos',
    color: '#f97316',
    icon: '🚪',
    desc: 'Motor de portón, cerraduras, rejas o intercomunicador',
  },
  limpieza: {
    label: 'Limpieza y Áreas Comunes',
    color: '#10b981',
    icon: '🧹',
    desc: 'Mantenimiento de pasillos, ductos de basura o jardines',
  },
  ruido: {
    label: 'Ruido y Convivencia',
    color: '#ec4899',
    icon: '🔊',
    desc: 'Ruidos molestos, mascotas o infracciones a normas',
  },
  otro: {
    label: 'Otro / General',
    color: '#8b5cf6',
    icon: '📌',
    desc: 'Cualquier otro requerimiento del edificio',
  },
}

export const PRIORIDADES_CONFIG: Record<
  PrioridadReporte,
  { label: string; color: string; bg: string; border: string; icon: string }
> = {
  baja: {
    label: 'Baja',
    color: '#10b981',
    bg: 'rgba(16, 185, 129, 0.12)',
    border: 'rgba(16, 185, 129, 0.3)',
    icon: '🟢',
  },
  media: {
    label: 'Media',
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.12)',
    border: 'rgba(245, 158, 11, 0.3)',
    icon: '🟡',
  },
  alta: {
    label: 'Alta',
    color: '#f97316',
    bg: 'rgba(249, 115, 22, 0.12)',
    border: 'rgba(249, 115, 22, 0.3)',
    icon: '🟠',
  },
  critica: {
    label: 'Crítica / Urgente',
    color: '#ef4444',
    bg: 'rgba(239, 68, 68, 0.16)',
    border: 'rgba(239, 68, 68, 0.4)',
    icon: '🔴',
  },
}

export const ESTADOS_CONFIG: Record<
  EstadoReporte,
  { label: string; color: string; bg: string; border: string; icon: string; desc: string }
> = {
  reportada: {
    label: 'Reportada',
    color: '#ef4444',
    bg: 'rgba(239, 68, 68, 0.12)',
    border: 'rgba(239, 68, 68, 0.3)',
    icon: '🔴',
    desc: 'Pendiente de inspección por administración o conserje',
  },
  en_progreso: {
    label: 'En Progreso',
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.12)',
    border: 'rgba(245, 158, 11, 0.3)',
    icon: '🟡',
    desc: 'Personal técnico asignado o en proceso de reparación',
  },
  resuelta: {
    label: 'Resuelta',
    color: '#10b981',
    bg: 'rgba(16, 185, 129, 0.12)',
    border: 'rgba(16, 185, 129, 0.3)',
    icon: '🟢',
    desc: 'Avería subsanada satisfactoriamente',
  },
}

const LOCAL_STORAGE_KEY_REPORTES = 'condominio_reportes_local_v1'

// ── Helpers de Codificación y Decodificación de Metadatos ────────────────────
export function codificarDescripcion(params: {
  categoria: CategoriaReporte
  descripcion: string
  apartamentoNumero?: string | null
  apartamentoId?: string | null
  respuestaAdmin?: string | null
}): string {
  let header = `[CAT:${params.categoria}]`
  if (params.apartamentoNumero) {
    header += `[APTO:${params.apartamentoNumero}]`
  }
  if (params.apartamentoId) {
    header += `[APTO_ID:${params.apartamentoId}]`
  }
  let texto = `${header}\n${params.descripcion.trim()}`
  if (params.respuestaAdmin && params.respuestaAdmin.trim()) {
    texto += `\n\n--- [RESPUESTA DE LA ADMINISTRACIÓN] ---\n${params.respuestaAdmin.trim()}`
  }
  return texto
}

export function decodificarDescripcion(texto: string): {
  categoria: CategoriaReporte
  apartamentoNumero: string | null
  apartamentoId: string | null
  descripcion: string
  respuestaAdmin: string | null
} {
  let categoria: CategoriaReporte = 'otro'
  let apartamentoNumero: string | null = null
  let apartamentoId: string | null = null
  let cuerpo = texto || ''
  let respuestaAdmin: string | null = null

  const separator = '\n\n--- [RESPUESTA DE LA ADMINISTRACIÓN] ---\n'
  if (cuerpo.includes(separator)) {
    const parts = cuerpo.split(separator)
    cuerpo = parts[0]
    respuestaAdmin = parts[1]?.trim() || null
  }

  const catMatch = cuerpo.match(/\[CAT:([a-zA-Z_]+)\]/)
  if (catMatch && catMatch[1]) {
    categoria = catMatch[1] as CategoriaReporte
    cuerpo = cuerpo.replace(catMatch[0], '')
  }

  const aptoMatch = cuerpo.match(/\[APTO:([a-zA-Z0-9_\-\s]+)\]/)
  if (aptoMatch && aptoMatch[1]) {
    apartamentoNumero = aptoMatch[1].trim()
    cuerpo = cuerpo.replace(aptoMatch[0], '')
  }

  const aptoIdMatch = cuerpo.match(/\[APTO_ID:([a-zA-Z0-9_\-]+)\]/)
  if (aptoIdMatch && aptoIdMatch[1]) {
    apartamentoId = aptoIdMatch[1].trim()
    cuerpo = cuerpo.replace(aptoIdMatch[0], '')
  }

  return {
    categoria,
    apartamentoNumero,
    apartamentoId,
    descripcion: cuerpo.trim(),
    respuestaAdmin,
  }
}

// ── Subida de Fotos con Compresión WebP ──────────────────────────────────────
export async function subirFotoAveria(
  file: File,
  identificador: string
): Promise<{ url: string | null; error: string | null }> {
  let archivoParaSubir = file

  // 1. Comprimir en cliente a formato WebP para máxima velocidad en datos móviles
  if (file.type.startsWith('image/')) {
    try {
      const res = await comprimirImagen(file, {
        maxWidth: 1280,
        maxHeight: 1280,
        quality: 0.8,
        mimeType: 'image/webp',
      })
      archivoParaSubir = res.file
    } catch (e) {
      console.warn('[ReportesService] Falló compresión de foto, usando original:', e)
    }
  }

  const ext = archivoParaSubir.name.split('.').pop() || 'webp'
  const path = `reportes/${identificador}/${Date.now()}.${ext}`

  // 2. Intentar subir al bucket de Storage de Supabase
  try {
    const { error: uploadError } = await supabase.storage
      .from('pagos')
      .upload(path, archivoParaSubir, { upsert: false, contentType: archivoParaSubir.type })

    if (!uploadError) {
      const { data } = supabase.storage.from('pagos').getPublicUrl(path)
      if (data?.publicUrl) return { url: data.publicUrl, error: null }
    }
  } catch (err) {
    console.warn('[ReportesService] Storage no disponible, usando DataURL Base64:', err)
  }

  // 3. Fallback infalible: Base64 comprimido
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string
      if (base64 && base64.length < 500000) {
        resolve({ url: base64, error: null })
      } else {
        resolve({ url: null, error: 'La fotografía es demasiado pesada para guardar. Intenta tomarla de nuevo.' })
      }
    }
    reader.onerror = () => resolve({ url: null, error: 'No se pudo leer la imagen.' })
    reader.readAsDataURL(archivoParaSubir)
  })
}

// ── Cargar Reportes para el Residente (filtrados por su apartamento/usuario) ─
export async function obtenerReportesResidente(
  usuarioId?: string,
  apartamentoId?: string,
  aptoNumero?: string
): Promise<{ data: ReporteItem[]; error: string | null }> {
  try {
    // 1. Consultar tabla falencias en Supabase
    let query = supabase
      .from('falencias')
      .select('*')
      .order('created_at', { ascending: false })

    const { data: dbRows, error: dbError } = await query

    if (!dbError && dbRows) {
      const mapped: ReporteItem[] = dbRows.map((r: any) => {
        const decoded = decodificarDescripcion(r.descripcion || '')
        return {
          id: r.id,
          titulo: r.titulo || 'Sin título',
          descripcion: decoded.descripcion,
          categoria: decoded.categoria,
          ubicacion: r.ubicacion || 'Área común',
          prioridad: (r.prioridad as PrioridadReporte) || 'media',
          estado: (r.estado as EstadoReporte) || 'reportada',
          foto_url: r.foto_url || null,
          creado_por: r.creado_por || null,
          apartamento_numero: decoded.apartamentoNumero || aptoNumero || null,
          apartamento_id: decoded.apartamentoId || apartamentoId || null,
          respuesta_admin: decoded.respuestaAdmin,
          created_at: r.created_at || new Date().toISOString(),
          updated_at: r.updated_at || null,
        }
      })

      // Filtrar para el residente: sus propios reportes o reportes de áreas comunes
      const filtrados = mapped.filter((item) => {
        if (!usuarioId && !apartamentoId && !aptoNumero) return true
        if (item.creado_por && item.creado_por === usuarioId) return true
        if (item.apartamento_id && apartamentoId && item.apartamento_id === apartamentoId) return true
        if (item.apartamento_numero && aptoNumero && item.apartamento_numero.trim().toUpperCase() === aptoNumero.trim().toUpperCase()) return true
        return false
      })

      // Guardar en cache local para uso offline
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY_REPORTES, JSON.stringify(mapped))
      } catch {}

      return { data: filtrados, error: null }
    }
  } catch (err: any) {
    console.warn('[ReportesService] Excepción al leer de Supabase, usando respaldo local:', err)
  }

  // Fallback local
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_REPORTES)
    if (raw) {
      const parsed: ReporteItem[] = JSON.parse(raw)
      return { data: parsed, error: null }
    }
  } catch {}

  return { data: [], error: null }
}

// ── Cargar Todos los Reportes (para el Administrador) ────────────────────────
export async function obtenerTodosLosReportesAdmin(): Promise<{ data: ReporteItem[]; error: string | null }> {
  try {
    const { data: dbRows, error: dbError } = await supabase
      .from('falencias')
      .select('*')
      .order('created_at', { ascending: false })

    if (!dbError && dbRows) {
      // Obtener perfiles para enriquecer con datos del residente
      const { data: perfiles } = await supabase
        .from('perfiles')
        .select('id, nombre_completo, telefono, apartamento:apartamento_id(numero)')

      const perfilesMap = new Map<string, any>()
      if (perfiles) {
        perfiles.forEach((p) => perfilesMap.set(p.id, p))
      }

      const mapped: ReporteItem[] = dbRows.map((r: any) => {
        const decoded = decodificarDescripcion(r.descripcion || '')
        const perfil = r.creado_por ? perfilesMap.get(r.creado_por) : null

        return {
          id: r.id,
          titulo: r.titulo || 'Sin título',
          descripcion: decoded.descripcion,
          categoria: decoded.categoria,
          ubicacion: r.ubicacion || 'Área general',
          prioridad: (r.prioridad as PrioridadReporte) || 'media',
          estado: (r.estado as EstadoReporte) || 'reportada',
          foto_url: r.foto_url || null,
          creado_por: r.creado_por || null,
          apartamento_numero: decoded.apartamentoNumero || perfil?.apartamento?.numero || null,
          apartamento_id: decoded.apartamentoId || null,
          propietario_nombre: perfil?.nombre_completo || 'Residente',
          propietario_telefono: perfil?.telefono || null,
          respuesta_admin: decoded.respuestaAdmin,
          created_at: r.created_at || new Date().toISOString(),
          updated_at: r.updated_at || null,
        }
      })

      try {
        localStorage.setItem(LOCAL_STORAGE_KEY_REPORTES, JSON.stringify(mapped))
      } catch {}

      return { data: mapped, error: null }
    }
  } catch (err: any) {
    console.warn('[ReportesService] Excepción al leer de Supabase (Admin):', err)
  }

  // Fallback local
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_REPORTES)
    if (raw) {
      return { data: JSON.parse(raw), error: null }
    }
  } catch {}

  return { data: [], error: null }
}

// ── Crear Nuevo Reporte (Residente o Admin) ──────────────────────────────────
export async function crearReporte(params: {
  titulo: string
  descripcion: string
  ubicacion: string
  categoria: CategoriaReporte
  prioridad: PrioridadReporte
  fotoArchivo?: File | null
  usuarioId?: string | null
  apartamentoNumero?: string | null
  apartamentoId?: string | null
}): Promise<{ data: ReporteItem | null; error: string | null }> {
  try {
    let fotoUrl: string | null = null
    const idUnico = `fal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

    // Subir y comprimir foto si se adjuntó
    if (params.fotoArchivo) {
      const subida = await subirFotoAveria(params.fotoArchivo, params.apartamentoNumero || 'general')
      if (subida.url) fotoUrl = subida.url
    }

    const descripcionFinal = codificarDescripcion({
      categoria: params.categoria,
      descripcion: params.descripcion,
      apartamentoNumero: params.apartamentoNumero,
      apartamentoId: params.apartamentoId,
    })

    const payload: any = {
      titulo: params.titulo.trim(),
      descripcion: descripcionFinal,
      ubicacion: params.ubicacion.trim(),
      prioridad: params.prioridad,
      estado: 'reportada',
      foto_url: fotoUrl,
      creado_por: params.usuarioId || null,
    }

    const { data: inserted, error: insertError } = await supabase
      .from('falencias')
      .insert([payload])
      .select()
      .maybeSingle()

    const itemCreado: ReporteItem = {
      id: inserted?.id || idUnico,
      titulo: params.titulo.trim(),
      descripcion: params.descripcion.trim(),
      ubicacion: params.ubicacion.trim(),
      categoria: params.categoria,
      prioridad: params.prioridad,
      estado: 'reportada',
      foto_url: fotoUrl,
      creado_por: params.usuarioId || null,
      apartamento_numero: params.apartamentoNumero || null,
      apartamento_id: params.apartamentoId || null,
      respuesta_admin: null,
      created_at: inserted?.created_at || new Date().toISOString(),
      updated_at: null,
    }

    // Actualizar cache local
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY_REPORTES)
      const list: ReporteItem[] = raw ? JSON.parse(raw) : []
      localStorage.setItem(LOCAL_STORAGE_KEY_REPORTES, JSON.stringify([itemCreado, ...list]))
    } catch {}

    if (insertError) {
      console.warn('[ReportesService] Insert falló en DB por RLS, guardado localmente:', insertError.message)
    }

    return { data: itemCreado, error: null }
  } catch (err: any) {
    console.error('[ReportesService] Excepción al crear reporte:', err)
    return { data: null, error: err.message || 'Error de conexión al enviar reporte.' }
  }
}

// ── Actualizar Estado y Responder Reporte (Admin) ───────────────────────────
export async function actualizarEstadoReporte(params: {
  reporteId: string
  nuevoEstado: EstadoReporte
  respuestaAdmin?: string | null
  reporteOriginal: ReporteItem
  adminNombre?: string
}): Promise<{ error: string | null }> {
  try {
    const descripcionFinal = codificarDescripcion({
      categoria: params.reporteOriginal.categoria,
      descripcion: params.reporteOriginal.descripcion,
      apartamentoNumero: params.reporteOriginal.apartamento_numero,
      apartamentoId: params.reporteOriginal.apartamento_id,
      respuestaAdmin: params.respuestaAdmin || params.reporteOriginal.respuesta_admin,
    })

    const { error: updateError } = await supabase
      .from('falencias')
      .update({
        estado: params.nuevoEstado,
        descripcion: descripcionFinal,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.reporteId)

    // Notificar al residente si tenemos el apartamento
    if (params.reporteOriginal.apartamento_id) {
      const cfgEstado = ESTADOS_CONFIG[params.nuevoEstado]
      const cuerpoNotif = params.respuestaAdmin
        ? `Estado actualizado a "${cfgEstado.label}". Respuesta: ${params.respuestaAdmin}`
        : `El estado de tu reporte ha cambiado a "${cfgEstado.label}".`

      await notificarApartamento({
        apartamento_id: params.reporteOriginal.apartamento_id,
        tipo: 'aviso',
        titulo: `🛠️ Actualización: ${params.reporteOriginal.titulo}`,
        cuerpo: cuerpoNotif,
        link: '/reportes',
      })
    }

    // Actualizar cache local
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY_REPORTES)
      if (raw) {
        const list: ReporteItem[] = JSON.parse(raw)
        const updatedList = list.map((item) =>
          item.id === params.reporteId
            ? {
                ...item,
                estado: params.nuevoEstado,
                respuesta_admin: params.respuestaAdmin || item.respuesta_admin,
                updated_at: new Date().toISOString(),
              }
            : item
        )
        localStorage.setItem(LOCAL_STORAGE_KEY_REPORTES, JSON.stringify(updatedList))
      }
    } catch {}

    if (updateError) {
      console.warn('[ReportesService] Error en DB update (falencias):', updateError.message)
    }

    return { error: null }
  } catch (err: any) {
    console.error('[ReportesService] Excepción al actualizar reporte:', err)
    return { error: err.message || 'No se pudo actualizar el reporte.' }
  }
}

// ── Eliminar Reporte ────────────────────────────────────────────────────────
export async function eliminarReporte(reporteId: string): Promise<{ error: string | null }> {
  try {
    await supabase.from('falencias').delete().eq('id', reporteId)

    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY_REPORTES)
      if (raw) {
        const list: ReporteItem[] = JSON.parse(raw)
        const updated = list.filter((r) => r.id !== reporteId)
        localStorage.setItem(LOCAL_STORAGE_KEY_REPORTES, JSON.stringify(updated))
      }
    } catch {}

    return { error: null }
  } catch (err: any) {
    return { error: err.message || 'Error eliminando reporte.' }
  }
}
