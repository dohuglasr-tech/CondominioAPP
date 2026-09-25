// supabase import reservado para cuando se conecte la DB
// import { supabase } from './supabase'

export interface Reporte {
  id: string
  titulo: string
  descripcion: string
  categoria: 'mantenimiento' | 'ruido' | 'seguridad' | 'limpieza' | 'otro'
  estado: 'abierto' | 'en_progreso' | 'resuelto' | 'cerrado'
  created_at: string
  apartamento_id: string
  respuesta_admin?: string
}

export async function obtenerReportes(apartamentoId: string): Promise<{ data: Reporte[]; error: string | null }> {
  try {
    // const { data, error } = await supabase.from('reportes').select('*').eq('apartamento_id', apartamentoId).order('created_at', { ascending: false })
    
    // Mock Data
    const mockReportes: Reporte[] = [
      {
        id: '1',
        titulo: 'Bombillo fundido en pasillo piso 4',
        descripcion: 'El bombillo frente al apartamento 42 se fundió ayer en la noche.',
        categoria: 'mantenimiento',
        estado: 'en_progreso',
        created_at: '2026-09-22T08:30:00Z',
        apartamento_id: apartamentoId,
        respuesta_admin: 'El conserje lo cambiará hoy en la tarde.'
      },
      {
        id: '2',
        titulo: 'Fuga de agua en tubería externa',
        descripcion: 'Hay un bote de agua constante cerca de los jardines de la entrada.',
        categoria: 'mantenimiento',
        estado: 'resuelto',
        created_at: '2026-09-15T14:20:00Z',
        apartamento_id: apartamentoId,
        respuesta_admin: 'Reparado por el plomero el día 16/09.'
      }
    ]

    return { data: mockReportes, error: null }
  } catch (err: any) {
    return { data: [], error: err.message }
  }
}

export async function crearReporte(_reporte: Omit<Reporte, 'id' | 'created_at' | 'estado' | 'respuesta_admin'>): Promise<{ success: boolean; error: string | null }> {
  try {
    // const { error } = await supabase.from('reportes').insert({ ...reporte, estado: 'abierto' })
    return { success: true, error: null }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}
