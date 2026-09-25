import { supabase } from './supabase'

export interface Pago {
  id: string
  apartamento_id: string
  monto_bs: number
  numero_referencia: string
  banco_origen: string
  comprobante_url: string | null
  estado: 'pendiente' | 'aprobado' | 'rechazado'
  nota_admin: string | null
  created_at: string
}

/**
 * Obtiene los pagos de un apartamento, ordenados por más reciente primero.
 */
export async function obtenerPagos(apartamentoId: string): Promise<{ data: Pago[]; error: string | null }> {
  const { data, error } = await supabase
    .from('pagos')
    .select('*')
    .eq('apartamento_id', apartamentoId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[RecibosService] Error:', error.message)
    return { data: [], error: 'No se pudieron cargar los recibos.' }
  }

  return { data: data ?? [], error: null }
}
