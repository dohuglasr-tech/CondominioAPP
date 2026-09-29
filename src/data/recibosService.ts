import { supabase } from './supabase'

export interface Pago {
  id: string
  apartamento_id: string
  monto_bs: number
  monto_usd?: number | null
  numero_referencia: string
  banco_origen: string
  comprobante_url: string | null
  estado: 'pendiente' | 'aprobado' | 'rechazado'
  nota_admin: string | null
  created_at: string
  fecha_pago?: string | null
}

/**
 * Obtiene los pagos de un apartamento desde la tabla `pagos_reportados`, ordenados por más reciente.
 */
export async function obtenerPagos(apartamentoId: string): Promise<{ data: Pago[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('pagos_reportados')
      .select('*')
      .eq('apartamento_id', apartamentoId)
      .order('created_at', { ascending: false })

    if (error) {
      console.warn('[RecibosService] Error consultando pagos_reportados:', error.message)
      return { data: [], error: 'No se pudieron cargar los recibos.' }
    }

    const pagosMapeados: Pago[] = (data || []).map((row: any) => {
      // Extraer banco de notas_admin si se guardó como "Banco Origen: Mercantil"
      let banco = 'Transferencia'
      if (row.notas_admin && row.notas_admin.includes('Banco')) {
        const match = row.notas_admin.match(/Banco(?: Origen)?:\s*([^\n,]+)/i)
        if (match) banco = match[1].trim()
      }

      return {
        id: row.id,
        apartamento_id: row.apartamento_id,
        monto_bs: row.monto_bs || 0,
        monto_usd: row.monto_usd || null,
        numero_referencia: row.referencia || 'S/R',
        banco_origen: banco,
        comprobante_url: row.comprobante_url || null,
        estado: row.estado || 'pendiente',
        nota_admin: row.notas_admin || null,
        created_at: row.created_at || new Date().toISOString(),
        fecha_pago: row.fecha_pago || null,
      }
    })

    return { data: pagosMapeados, error: null }
  } catch (err: any) {
    console.error('[RecibosService] Excepción al obtener pagos:', err)
    return { data: [], error: err.message }
  }
}
