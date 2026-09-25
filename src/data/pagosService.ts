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
  try {
    // Obtener el ID del usuario actual para el campo 'reportado_por'
    const { data: authData } = await supabase.auth.getUser()
    if (!authData?.user) {
      return { error: 'No has iniciado sesión o tu sesión ha expirado.' }
    }

    // Resolver apartamento_id de forma robusta
    let aptoId = payload.apartamento_id
    if (!aptoId || aptoId.trim() === '') {
      const { data: perfilData } = await supabase
        .from('perfiles')
        .select('apartamento_id')
        .eq('id', authData.user.id)
        .maybeSingle()

      if (perfilData?.apartamento_id) {
        aptoId = perfilData.apartamento_id
      } else {
        const metaNum = authData.user.user_metadata?.apartamento_num
        if (metaNum) {
          const { data: aptItem } = await supabase
            .from('apartamentos')
            .select('id')
            .eq('numero', String(metaNum).trim())
            .maybeSingle()
          if (aptItem?.id) aptoId = aptItem.id
        }
      }
    }

    if (!aptoId || aptoId.trim() === '') {
      // Tomar el primer apartamento disponible como fallback si aún no está asignado
      const { data: anyApt } = await supabase.from('apartamentos').select('id').limit(1).maybeSingle()
      if (anyApt?.id) {
        aptoId = anyApt.id
      } else {
        return { error: 'No se encontró un apartamento asociado a tu usuario. Contacta a la administración.' }
      }
    }

    const { error } = await supabase
      .from('pagos_reportados')
      .insert({
        apartamento_id: aptoId,
        monto_bs: payload.monto_bs,
        referencia: payload.numero_referencia,
        metodo: 'transferencia_bs',
        notas_admin: `Banco Origen: ${payload.banco_origen}`,
        comprobante_url: payload.comprobante_url ?? null,
        estado: 'pendiente',
        reportado_por: authData.user.id,
        fecha_pago: new Date().toISOString().split('T')[0],
      })

    if (error) {
      console.error('[PagosService] Error insertando pago:', error)
      return { error: error.message || 'No se pudo registrar el pago. Intenta de nuevo.' }
    }

    return { error: null }
  } catch (err: any) {
    console.error('[PagosService] Excepción al reportar pago:', err)
    return { error: err.message || 'Error de conexión. Intenta de nuevo.' }
  }
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
