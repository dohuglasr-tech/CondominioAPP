import { supabase } from './supabase'

import { comprimirImagen } from '../utils/imageCompressor'

export interface ComprobantesGasto {
  factura_url?: string | null       // Factura o recibo de conforme
  transferencia_url?: string | null // Comprobante de la transferencia bancaria
}

export interface GastoComun {
  id: string
  descripcion: string
  categoria?: string
  tipo: 'ordinario' | 'fondo_reserva' | 'extraordinario'
  monto_usd: number
  monto_bs?: number
  mes_aplicacion: string  // 'YYYY-MM-DD' primer día del mes
  factura_url: string | null
  notas?: string | null
  fecha_pago?: string | null
  referencia?: string | null
  pagado_por?: string | null
  autorizado_por?: string | null
  veces_editado?: number
  historial_ediciones?: any[]
  created_at: string
}

/**
 * Parsea el campo factura_url de un gasto común.
 * Soporta JSON con factura_url y transferencia_url, arrays de URLs, o URLs únicas directas.
 */
export function parseComprobantesGasto(raw?: string | null): ComprobantesGasto {
  if (!raw || typeof raw !== 'string') return {}
  const trimmed = raw.trim()
  if (!trimmed) return {}

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return {
          factura_url: parsed[0] || null,
          transferencia_url: parsed[1] || null,
        }
      }
      return {
        factura_url: parsed.factura_url || parsed.factura || null,
        transferencia_url: parsed.transferencia_url || parsed.transferencia || parsed.comprobante || null,
      }
    } catch {
      return { factura_url: trimmed }
    }
  }

  return { factura_url: trimmed }
}

/**
 * Serializa los comprobantes para guardarlos en la columna `factura_url`.
 */
export function serializeComprobantesGasto(comp: ComprobantesGasto): string | null {
  const factura = comp.factura_url?.trim() || null
  const transf = comp.transferencia_url?.trim() || null
  if (!factura && !transf) return null
  return JSON.stringify({
    factura_url: factura,
    transferencia_url: transf,
  })
}

/**
 * Sube una imagen de comprobante (factura o transferencia) a Supabase Storage bucket 'pagos'.
 * Comprime la imagen en cliente manteniendo textos nítidos.
 */
export async function subirComprobanteGasto(
  file: File,
  tipo: 'factura' | 'transferencia',
  mesAplicacion: string
): Promise<{ url: string | null; error: string | null }> {
  let archivoParaSubir = file
  if (file.type.startsWith('image/')) {
    try {
      const res = await comprimirImagen(file, {
        maxWidth: 1600,
        maxHeight: 1600,
        quality: 0.82,
        mimeType: 'image/webp'
      })
      archivoParaSubir = res.file
    } catch (e) {
      console.warn('[GastosService] No se pudo comprimir la imagen:', e)
    }
  }

  const cleanMes = (mesAplicacion || 'general').slice(0, 7).replace(/[^a-zA-Z0-9-]/g, '')
  const ext = archivoParaSubir.name.split('.').pop() || 'webp'
  const path = `gastos/${cleanMes}/${tipo}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('pagos')
    .upload(path, archivoParaSubir, { upsert: false, contentType: archivoParaSubir.type })

  if (uploadError) {
    console.warn('[GastosService] Storage error, usando base64 fallback:', uploadError.message)
    return new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = ev => {
        const base64 = ev.target?.result as string
        if (base64 && base64.length < 800000) {
          resolve({ url: base64, error: null })
        } else {
          resolve({ url: null, error: 'La imagen es muy pesada. Usa una imagen menor a 800KB.' })
        }
      }
      reader.onerror = () => resolve({ url: null, error: 'No se pudo leer la imagen localmente.' })
      reader.readAsDataURL(archivoParaSubir)
    })
  }

  const { data } = supabase.storage.from('pagos').getPublicUrl(path)
  return { url: data?.publicUrl ?? null, error: null }
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
