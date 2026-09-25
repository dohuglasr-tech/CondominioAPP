// supabase import reservado para cuando se conecte la DB
// import { supabase } from './supabase'

export interface OpcionVoto {
  id: string
  texto: string
  votos_count: number
}

export interface Propuesta {
  id: string
  titulo: string
  descripcion: string
  opciones: OpcionVoto[]
  fecha_cierre: string
  estado: 'activa' | 'cerrada'
  created_at: string
}

export async function obtenerPropuestasActivas(): Promise<{ data: Propuesta[]; error: string | null }> {
  try {
    // Cuando esté lista la BDD:
    // const { data, error } = await supabase.from('propuestas').select('*').order('created_at', { ascending: false })
    
    // Mock Data mientras se conecta la DB
    const mockPropuestas: Propuesta[] = [
      {
        id: '1',
        titulo: 'Pintar la fachada principal',
        descripcion: 'Se propone utilizar el fondo de reserva para pintar la fachada del edificio que da hacia la avenida principal. ¿Estás de acuerdo?',
        opciones: [
          { id: 'op1', texto: 'Sí, estoy de acuerdo', votos_count: 12 },
          { id: 'op2', texto: 'No, priorizar filtraciones', votos_count: 5 },
          { id: 'op3', texto: 'Me abstengo', votos_count: 1 }
        ],
        fecha_cierre: '2026-10-15T23:59:59Z',
        estado: 'activa',
        created_at: '2026-09-20T10:00:00Z'
      },
      {
        id: '2',
        titulo: 'Cambio de empresa de seguridad',
        descripcion: 'Debido a las recientes fallas, se ha recibido una propuesta de la empresa "SecureV" con un costo similar.',
        opciones: [
          { id: 'opA', texto: 'Aprobar cambio a SecureV', votos_count: 22 },
          { id: 'opB', texto: 'Mantener empresa actual', votos_count: 8 }
        ],
        fecha_cierre: '2026-09-30T23:59:59Z',
        estado: 'activa',
        created_at: '2026-09-22T14:30:00Z'
      }
    ]

    return { data: mockPropuestas, error: null }
  } catch (err: any) {
    return { data: [], error: err.message }
  }
}

export async function emitirVoto(_propuestaId: string, _opcionId: string, _apartamentoId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    // Insert en tabla `votos_propuestas`
    // const { error } = await supabase.from('votos_propuestas').insert({ propuesta_id: propuestaId, opcion_id: opcionId, apartamento_id: apartamentoId })
    return { success: true, error: null }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}
