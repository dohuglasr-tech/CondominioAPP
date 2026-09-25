import { supabase } from './supabase'

export interface GastoComun {
  id: string
  descripcion: string
  categoria?: string
  tipo: 'ordinario' | 'fondo_reserva' | 'extraordinario'
  monto_usd: number
  mes_aplicacion: string  // 'YYYY-MM-DD' primer día del mes
  factura_url: string | null
  notas: string | null
  created_at: string
}

/**
 * Obtiene los gastos comunes del mes indicado (o del mes actual si no se indica).
 */
export async function obtenerGastosMes(mes?: string): Promise<{ data: GastoComun[]; total_usd: number; error: string | null }> {
  // Si no se pasa mes, usar primer día del mes actual
  const fecha = mes ?? new Date().toISOString().slice(0, 7) + '-01'

  const { data, error } = await supabase
    .from('gastos_comunes')
    .select('*')
    .eq('mes_aplicacion', fecha)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[GastosService] Error:', error.message)
    return { data: [], total_usd: 0, error: 'No se pudieron cargar los gastos.' }
  }

  const gastos = data ?? []
  const total = gastos.reduce((sum, g) => sum + Number(g.monto_usd), 0)

  return { data: gastos, total_usd: total, error: null }
}

/**
 * Obtiene los meses disponibles que tienen gastos registrados.
 */
export async function obtenerMesesDisponibles(): Promise<string[]> {
  const { data } = await supabase
    .from('gastos_comunes')
    .select('mes_aplicacion')
    .order('mes_aplicacion', { ascending: false })

  if (!data) return []

  // Deduplicate
  const meses = [...new Set(data.map(d => d.mes_aplicacion))]
  return meses
}
