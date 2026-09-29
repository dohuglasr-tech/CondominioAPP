import { supabase } from './supabase'

export type CategoriaOrganigrama = 'administracion' | 'junta_directiva' | 'comite_vocal' | 'operativo'

export interface MiembroJunta {
  id: string
  nombre: string
  cargo: string
  categoria: CategoriaOrganigrama
  telefono?: string
  email?: string
  apartamento?: string
  descripcion_rol?: string
  horario_atencion?: string
  orden: number
  avatar_url?: string
  created_at?: string
  updated_at?: string
}

export const CATEGORIA_ORGANIGRAMA_CONFIG: Record<
  CategoriaOrganigrama,
  {
    titulo: string
    subtitulo: string
    color: string
    bg: string
    border: string
    icono: string
    nivelJerarquico: number
  }
> = {
  administracion: {
    titulo: 'Administración del Condominio',
    subtitulo: 'Gestión ejecutiva, financiera y operativa del inmueble',
    color: '#f97316',
    bg: 'rgba(249, 115, 22, 0.12)',
    border: 'rgba(249, 115, 22, 0.35)',
    icono: '💼',
    nivelJerarquico: 1
  },
  junta_directiva: {
    titulo: 'Junta de Condominio (Directiva)',
    subtitulo: 'Copropietarios electos para supervisión y decisiones asamblearias',
    color: '#3b82f6',
    bg: 'rgba(59, 130, 246, 0.12)',
    border: 'rgba(59, 130, 246, 0.35)',
    icono: '🏛️',
    nivelJerarquico: 2
  },
  comite_vocal: {
    titulo: 'Comités de Apoyo y Vocales',
    subtitulo: 'Vocales técnicos de mantenimiento, seguridad y convivencia',
    color: '#10b981',
    bg: 'rgba(16, 185, 129, 0.12)',
    border: 'rgba(16, 185, 129, 0.35)',
    icono: '🤝',
    nivelJerarquico: 3
  },
  operativo: {
    titulo: 'Personal Operativo y Servicios',
    subtitulo: 'Conserjería, aseo, mantenimiento preventivo y vigilancia',
    color: '#a855f7',
    bg: 'rgba(168, 85, 247, 0.12)',
    border: 'rgba(168, 85, 247, 0.35)',
    icono: '🛠️',
    nivelJerarquico: 4
  }
}

const STORAGE_JUNTA_KEY = 'condominio_junta_organigrama_cache'

// Datos semilla iniciales
const JUNTA_SEMILLA: MiembroJunta[] = [
  {
    id: 'junta-1',
    nombre: 'Dohuglas Guevara',
    cargo: 'Administrador General',
    categoria: 'administracion',
    telefono: '0414-1234567',
    email: 'administracion@torre5.com',
    apartamento: 'Oficina PB',
    descripcion_rol: 'Gestión administrativa, cobranza, emisión de recibos y contrataciones',
    horario_atencion: 'Lunes a Viernes 8:00 AM - 5:00 PM',
    orden: 1,
    created_at: '2026-09-01T10:00:00Z'
  },
  {
    id: 'junta-2',
    nombre: 'Carlos Eduardo Mendoza',
    cargo: 'Presidente de la Junta',
    categoria: 'junta_directiva',
    telefono: '0424-9876543',
    email: 'presidencia@torre5.com',
    apartamento: 'Apto 521',
    descripcion_rol: 'Representación legal de la comunidad y supervisión de proyectos',
    horario_atencion: 'Previa cita / Reuniones de Junta',
    orden: 2,
    created_at: '2026-09-01T10:00:00Z'
  },
  {
    id: 'junta-3',
    nombre: 'Mariana Castillo',
    cargo: 'Tesorera',
    categoria: 'junta_directiva',
    telefono: '0412-5554321',
    email: 'tesoreria@torre5.com',
    apartamento: 'Apto 510',
    descripcion_rol: 'Control presupuestario, revisión de cuentas y auditoría de egresos',
    horario_atencion: 'Lunes a Jueves 4:00 PM - 6:00 PM',
    orden: 3,
    created_at: '2026-09-01T10:00:00Z'
  },
  {
    id: 'junta-4',
    nombre: 'Roberto Villasmil',
    cargo: 'Secretario',
    categoria: 'junta_directiva',
    telefono: '0416-3332211',
    email: 'secretaria@torre5.com',
    apartamento: 'Apto 506',
    descripcion_rol: 'Redacción de actas de asamblea, citaciones y archivo documental',
    horario_atencion: 'Horario de oficina',
    orden: 4,
    created_at: '2026-09-01T10:00:00Z'
  },
  {
    id: 'junta-5',
    nombre: 'Ing. Fernando Páez',
    cargo: 'Vocal Principal de Mantenimiento',
    categoria: 'comite_vocal',
    telefono: '0414-7778899',
    email: 'mantenimiento@torre5.com',
    apartamento: 'Apto 515',
    descripcion_rol: 'Inspección técnica de ascensores, bombas hidroneumáticas y áreas comunes',
    horario_atencion: 'Atención de emergencias técnicas',
    orden: 5,
    created_at: '2026-09-01T10:00:00Z'
  },
  {
    id: 'junta-6',
    nombre: 'José Ramos',
    cargo: 'Conserje y Mantenimiento Operativo',
    categoria: 'operativo',
    telefono: '0424-1110022',
    apartamento: 'Conserjería PB',
    descripcion_rol: 'Aseo de áreas comunes, control de llaves y mantenimiento diario',
    horario_atencion: 'Lunes a Sábado 7:00 AM - 4:00 PM',
    orden: 6,
    created_at: '2026-09-01T10:00:00Z'
  }
]

function getLocalJuntaCache(): MiembroJunta[] {
  try {
    const raw = localStorage.getItem(STORAGE_JUNTA_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch (e) {
    console.warn('[juntaService] Error reading cache:', e)
  }
  return JUNTA_SEMILLA
}

function saveLocalJuntaCache(list: MiembroJunta[]) {
  try {
    localStorage.setItem(STORAGE_JUNTA_KEY, JSON.stringify(list))
  } catch (e) {
    console.warn('[juntaService] Error saving cache:', e)
  }
}

export function formatWhatsappUrl(phone?: string): string | null {
  if (!phone) return null
  const clean = phone.replace(/\D/g, '')
  if (!clean) return null
  // Formato internacional para Venezuela si comienza con 04
  let intl = clean
  if (clean.startsWith('04')) {
    intl = '58' + clean.slice(1)
  } else if (clean.length === 10 && clean.startsWith('4')) {
    intl = '58' + clean
  }
  return `https://wa.me/${intl}`
}

export async function obtenerJunta(): Promise<{ data: MiembroJunta[]; error: string | null; fromDb: boolean }> {
  try {
    const { data: dbData, error } = await supabase
      .from('junta_condominio')
      .select('*')
      .order('orden', { ascending: true })

    if (error) {
      console.info('[juntaService] Usando caché local para junta_condominio:', error.message)
      return { data: getLocalJuntaCache(), error: null, fromDb: false }
    }

    const mapped: MiembroJunta[] = (dbData || []).map((row: any) => ({
      id: row.id,
      nombre: row.nombre,
      cargo: row.cargo,
      categoria: row.categoria || 'administracion',
      telefono: row.telefono || '',
      email: row.email || '',
      apartamento: row.apartamento || '',
      descripcion_rol: row.descripcion_rol || '',
      horario_atencion: row.horario_atencion || '',
      orden: Number(row.orden || 1),
      avatar_url: row.avatar_url || '',
      created_at: row.created_at,
      updated_at: row.updated_at
    }))

    saveLocalJuntaCache(mapped)
    return { data: mapped, error: null, fromDb: true }
  } catch (err: any) {
    console.warn('[juntaService] Excepción obteniendo junta:', err)
    return { data: getLocalJuntaCache(), error: null, fromDb: false }
  }
}

export async function guardarMiembroJunta(item: Partial<MiembroJunta>): Promise<{ data: MiembroJunta | null; error: string | null }> {
  try {
    const id = item.id || `junta-${Date.now()}`
    const nuevoMiembro: MiembroJunta = {
      id,
      nombre: item.nombre?.trim() || 'Sin nombre',
      cargo: item.cargo?.trim() || 'Sin cargo',
      categoria: item.categoria || 'junta_directiva',
      telefono: item.telefono?.trim() || '',
      email: item.email?.trim() || '',
      apartamento: item.apartamento?.trim() || '',
      descripcion_rol: item.descripcion_rol?.trim() || '',
      horario_atencion: item.horario_atencion?.trim() || '',
      orden: Number(item.orden || 1),
      avatar_url: item.avatar_url || '',
      created_at: item.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    // Actualizar cache local
    const cached = getLocalJuntaCache()
    const index = cached.findIndex(m => m.id === id)
    if (index >= 0) {
      cached[index] = nuevoMiembro
    } else {
      cached.push(nuevoMiembro)
    }
    cached.sort((a, b) => a.orden - b.orden)
    saveLocalJuntaCache(cached)

    // Intentar persistir en Supabase
    try {
      const payload = {
        nombre: nuevoMiembro.nombre,
        cargo: nuevoMiembro.cargo,
        categoria: nuevoMiembro.categoria,
        telefono: nuevoMiembro.telefono || null,
        email: nuevoMiembro.email || null,
        apartamento: nuevoMiembro.apartamento || null,
        descripcion_rol: nuevoMiembro.descripcion_rol || null,
        horario_atencion: nuevoMiembro.horario_atencion || null,
        orden: nuevoMiembro.orden,
        avatar_url: nuevoMiembro.avatar_url || null,
        updated_at: new Date().toISOString()
      }

      if (item.id && !item.id.startsWith('junta-')) {
        await supabase.from('junta_condominio').update(payload).eq('id', item.id)
      } else {
        const { data: dbData } = await supabase.from('junta_condominio').insert([payload]).select().single()
        if (dbData) nuevoMiembro.id = dbData.id
      }
    } catch (dbErr) {
      console.info('[juntaService] No se pudo guardar en Supabase (guardado en local):', dbErr)
    }

    return { data: nuevoMiembro, error: null }
  } catch (err: any) {
    return { data: null, error: err.message || 'Error guardando miembro' }
  }
}

export async function eliminarMiembroJunta(id: string): Promise<{ success: boolean; error: string | null }> {
  try {
    const cached = getLocalJuntaCache().filter(m => m.id !== id)
    saveLocalJuntaCache(cached)

    if (!id.startsWith('junta-')) {
      await supabase.from('junta_condominio').delete().eq('id', id)
    }
    return { success: true, error: null }
  } catch (err: any) {
    return { success: false, error: err.message || 'Error eliminando miembro' }
  }
}
