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
  // Obtener el ID del usuario actual para el campo 'reportado_por'
  const { data: authData } = await supabase.auth.getUser()
  if (!authData?.user) {
    return { error: 'No estás autenticado.' }
  }

  const { error } = await supabase
    .from('pagos_reportados')
    .insert({
      apartamento_id: payload.apartamento_id,
      monto_bs: payload.monto_bs,
      referencia: payload.numero_referencia, // en BD se llama referencia
      metodo: 'transferencia_bs', // campo requerido por la base de datos
      notas_admin: `Banco Origen: ${payload.banco_origen}`, // guardamos el banco aquí temporalmente
      comprobante_url: payload.comprobante_url ?? null,
      estado: 'pendiente',
      reportado_por: authData.user.id, // el usuario que lo reporta
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
    console.warn('[PagosService] Storage no disponible, usando base64:', uploadError.message)
    // Fallback: convertir imagen a base64 para guardar en la DB directamente
    return new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = ev => {
        const base64 = ev.target?.result as string
        // Limitamos a 500KB para evitar rows demasiado grandes
        if (base64 && base64.length < 500000) {
          resolve({ url: base64, error: null })
        } else {
          resolve({ url: null, error: 'La imagen es demasiado grande. Por favor usa una imagen menor a 500KB.' })
        }
      }
      reader.onerror = () => resolve({ url: null, error: 'No se pudo leer el archivo.' })
      reader.readAsDataURL(file)
    })
  }

  const { data } = supabase.storage.from('pagos').getPublicUrl(path)
  return { url: data?.publicUrl ?? null, error: null }
}
