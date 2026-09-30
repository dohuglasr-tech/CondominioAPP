import { supabase } from './supabase'
import { appCache } from './cacheService'

export interface ReportePagoPayload {
  apartamento_id: string
  monto_bs: number
  monto_usd?: number | null
  tasa_bcv?: number | null
  numero_referencia: string
  banco_origen: string
  comprobante_url?: string | null
  es_abono?: boolean
  tipo_deuda_abonada?: 'historica_bs' | 'marzo_usd' | 'general'
  recibo_id?: string | null
  periodo_referencia?: string | null
  saldo_restante_estimado?: number | null
  notas_residente?: string | null
}

/**
 * Inserta un pago pendiente en la tabla `pagos_reportados`.
 * El campo `estado` queda en 'pendiente' por defecto.
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

    const notasAdminPartes: string[] = [`Banco Origen: ${payload.banco_origen}`]
    if (payload.es_abono) {
      const tipoTxt = payload.tipo_deuda_abonada === 'historica_bs'
        ? 'DEUDA HISTÓRICA PRE-MARZO (En Bolívares)'
        : 'DEUDA MARZO 2026 EN ADELANTE (En Dólares a Tasa BCV)'
      notasAdminPartes.push(`[ABONO PARCIAL - ${tipoTxt}]`)
      if (payload.periodo_referencia) {
        notasAdminPartes.push(`Periodo: ${payload.periodo_referencia}`)
      }
      if (payload.monto_usd && payload.monto_usd > 0) {
        notasAdminPartes.push(`USD: $${payload.monto_usd.toFixed(2)}`)
      }
      if (payload.tasa_bcv && payload.tasa_bcv > 0) {
        notasAdminPartes.push(`Tasa BCV: ${payload.tasa_bcv.toFixed(2)} Bs/$`)
      }
      if (payload.saldo_restante_estimado !== undefined && payload.saldo_restante_estimado !== null) {
        notasAdminPartes.push(`Saldo Restante Estimado: ${payload.tipo_deuda_abonada === 'historica_bs' ? `Bs. ${payload.saldo_restante_estimado.toFixed(2)}` : `$${payload.saldo_restante_estimado.toFixed(2)} USD`}`)
      }
    }

    const insertData: Record<string, any> = {
      apartamento_id: aptoId,
      monto_bs: payload.monto_bs,
      referencia: payload.numero_referencia,
      metodo: 'transferencia_bs',
      notas_admin: notasAdminPartes.join(' · '),
      comprobante_url: payload.comprobante_url ?? null,
      estado: 'pendiente',
      reportado_por: authData.user.id,
      fecha_pago: new Date().toISOString().split('T')[0],
    }

    if (payload.monto_usd && payload.monto_usd > 0) {
      insertData.monto_usd = payload.monto_usd
    }
    if (payload.tasa_bcv && payload.tasa_bcv > 0) {
      insertData.tasa_bcv = payload.tasa_bcv
    }
    if (payload.notas_residente) {
      insertData.notas_residente = payload.notas_residente
    }

    const { error } = await supabase
      .from('pagos_reportados')
      .insert(insertData)

    if (error) {
      console.error('[PagosService] Error insertando pago:', error)
      return { error: error.message || 'No se pudo registrar el pago. Intenta de nuevo.' }
    }

    // Invalidar inmediatamente caché de pagos, saldos, recibos y mora para refresco en tiempo real
    appCache.invalidateTags(['pagos', 'saldos', 'recibos', 'mora'])

    return { error: null }
  } catch (err: any) {
    console.error('[PagosService] Excepción al reportar pago:', err)
    return { error: err.message || 'Error de conexión. Intenta de nuevo.' }
  }
}

import { comprimirImagen } from '../utils/imageCompressor'

/**
 * Sube un comprobante de pago al bucket de Supabase Storage.
 * Comprime la imagen en el cliente para ahorrar más del 90% de almacenamiento en Supabase.
 * Retorna la URL pública o null si falla.
 */
export async function subirComprobante(
  file: File,
  apartamento_id: string
): Promise<{ url: string | null; error: string | null }> {
  // Comprimir imagen si es archivo de imagen (JPEG, PNG, WebP, etc.)
  let archivoParaSubir = file
  if (file.type.startsWith('image/')) {
    try {
      const res = await comprimirImagen(file, {
        maxWidth: 1280,
        maxHeight: 1280,
        quality: 0.8,
        mimeType: 'image/webp'
      })
      archivoParaSubir = res.file
    } catch (e) {
      console.warn('[PagosService] No se pudo comprimir la imagen, usando original:', e)
    }
  }

  const ext = archivoParaSubir.name.split('.').pop() || 'webp'
  const path = `comprobantes/${apartamento_id}/${Date.now()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('pagos')
    .upload(path, archivoParaSubir, { upsert: false, contentType: archivoParaSubir.type })

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
      reader.readAsDataURL(archivoParaSubir)
    })
  }

  const { data } = supabase.storage.from('pagos').getPublicUrl(path)
  return { url: data?.publicUrl ?? null, error: null }
}
