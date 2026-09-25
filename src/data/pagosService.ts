import { supabase } from './supabase'

export interface ReportePagoPayload {
  apartamento_id: string
  monto_bs: number
  numero_referencia: string
  banco_origen: string
  comprobante_url?: string | null
}

/**
 * Inserta un pago pendiente en la tabla `pagos`.
 * El campo `estado` queda en 'pendiente' por defecto (definido en la BD).
 */
export async function reportarPago(payload: ReportePagoPayload): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('pagos')
    .insert({
      apartamento_id: payload.apartamento_id,
      monto_bs: payload.monto_bs,
      numero_referencia: payload.numero_referencia,
      banco_origen: payload.banco_origen,
      comprobante_url: payload.comprobante_url ?? null,
      estado: 'pendiente',
    })

  if (error) {
    console.error('[PagosService] Error insertando pago:', error.message)
    return { error: 'No se pudo registrar el pago. Intenta de nuevo.' }
  }

  return { error: null }
}

/**
 * Sube un comprobante de pago al bucket de Supabase Storage.
 * Retorna la URL pública o null si falla.
 */
export async function subirComprobante(
  file: File,
  apartamento_id: string
): Promise<{ url: string | null; error: string | null }> {
  const ext = file.name.split('.').pop()
  const path = `comprobantes/${apartamento_id}/${Date.now()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('pagos')
    .upload(path, file, { upsert: false, contentType: file.type })

  if (uploadError) {
    console.error('[PagosService] Error subiendo comprobante:', uploadError.message)
    return { url: null, error: 'No se pudo subir el comprobante.' }
  }

  const { data } = supabase.storage.from('pagos').getPublicUrl(path)
  return { url: data?.publicUrl ?? null, error: null }
}
