import { supabase } from './supabase'
import { appCache } from './cacheService'
import { registrarEventoAuditoria } from './auditoriaService'

export interface BcvApiResponse {
  tasa: number
  fechaActualizacion: string
  fuente: string
  nombre?: string
}

export interface ResultadoSincronizacionBcv {
  ok: boolean
  tasa: number
  fecha: string
  cambio: boolean
  mensaje: string
  error?: string
}

/**
 * Consulta la API oficial de DolarAPI con timeout y validación numérica
 */
export async function consultarTasaBcvEnVivo(): Promise<BcvApiResponse | null> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 8000)

  try {
    const res = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    })

    if (!res.ok) {
      throw new Error(`Respuesta HTTP ${res.status}`)
    }

    const json = await res.json()
    const tasa = Number(json?.promedio ?? json?.precio ?? json?.venta)

    if (!tasa || isNaN(tasa) || tasa <= 1) {
      throw new Error('Formato numérico de tasa inválido devuelto por la API')
    }

    return {
      tasa: parseFloat(tasa.toFixed(4)),
      fechaActualizacion: json.fechaActualizacion || new Date().toISOString(),
      fuente: 'Banco Central de Venezuela (vía DolarAPI Oficial)'
    }
  } catch (err: any) {
    console.warn('[BCV Service] Error consultando API en vivo:', err.message || err)
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Guarda una tasa BCV en configuracion_edificio, invalida cachés y registra auditoría
 */
export async function guardarTasaBcvEnDb(
  nuevaTasa: number,
  fechaActualizacion?: string,
  autorNombre = 'Administrador',
  motivo = 'Sincronización de tasa oficial BCV'
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!nuevaTasa || isNaN(nuevaTasa) || nuevaTasa <= 1) {
      return { ok: false, error: 'El valor de la tasa debe ser un número válido mayor a 1.' }
    }

    const { data: config } = await supabase
      .from('configuracion_edificio')
      .select('id, tasa_bcv_actual')
      .limit(1)
      .maybeSingle()

    if (!config?.id) {
      return { ok: false, error: 'No se encontró la configuración del edificio en la base de datos.' }
    }

    const tasaAnterior = config.tasa_bcv_actual || null
    const fecha = fechaActualizacion || new Date().toISOString()

    const { error: updateError } = await supabase
      .from('configuracion_edificio')
      .update({
        tasa_bcv_actual: nuevaTasa,
        tasa_bcv_actualizada: fecha,
        updated_at: new Date().toISOString()
      })
      .eq('id', config.id)

    if (updateError) throw updateError

    // Invalidar caché en memoria y persistente
    appCache.invalidateTags(['config', 'tasa_bcv'])

    // Registrar en auditoría
    try {
      registrarEventoAuditoria({
        tipo_accion: 'ACTUALIZACION_TASA_BCV',
        titulo: `Actualización de Tasa Oficial BCV: Bs. ${nuevaTasa.toFixed(2)}`,
        descripcion: `Tasa actualizada a Bs. ${nuevaTasa.toFixed(4)} por dólar. Tasa previa: ${tasaAnterior ? `Bs. ${Number(tasaAnterior).toFixed(2)}` : 'N/D'}.`,
        motivo,
        autor_nombre: autorNombre,
        datos_anteriores: { tasa_bcv: tasaAnterior },
        datos_nuevos: { tasa_bcv: nuevaTasa, fecha_actualizacion: fecha }
      })
    } catch {}

    return { ok: true }
  } catch (err: any) {
    console.error('[BCV Service] Error guardando tasa:', err)
    return { ok: false, error: err.message || 'Error al persistir tasa en la base de datos' }
  }
}

/**
 * Consulta la API en vivo y actualiza la base de datos de manera sincronizada
 */
export async function sincronizarTasaBcvConApi(
  autorNombre = 'Administrador',
  motivo = 'Sincronización manual desde panel administrativo'
): Promise<ResultadoSincronizacionBcv> {
  const apiData = await consultarTasaBcvEnVivo()

  if (!apiData) {
    return {
      ok: false,
      tasa: 0,
      fecha: '',
      cambio: false,
      mensaje: 'No fue posible conectar con el servidor oficial del BCV. Revisa tu conexión a internet o intenta ingresar la tasa manualmente.',
      error: 'Error de conexión con la API del BCV'
    }
  }

  // Obtener la tasa actual en base de datos para comparar
  let tasaActualDb = 0
  try {
    const { data: config } = await supabase
      .from('configuracion_edificio')
      .select('tasa_bcv_actual')
      .limit(1)
      .maybeSingle()
    if (config?.tasa_bcv_actual) {
      tasaActualDb = Number(config.tasa_bcv_actual)
    }
  } catch {}

  const huboCambio = Math.abs(tasaActualDb - apiData.tasa) > 0.0001

  // Guardar en la base de datos
  const saveRes = await guardarTasaBcvEnDb(apiData.tasa, apiData.fechaActualizacion, autorNombre, motivo)

  if (!saveRes.ok) {
    return {
      ok: false,
      tasa: apiData.tasa,
      fecha: apiData.fechaActualizacion,
      cambio: false,
      mensaje: saveRes.error || 'Error al guardar la tasa en la base de datos.',
      error: saveRes.error
    }
  }

  return {
    ok: true,
    tasa: apiData.tasa,
    fecha: apiData.fechaActualizacion,
    cambio: huboCambio,
    mensaje: huboCambio
      ? `✓ Tasa BCV sincronizada exitosamente: Bs. ${apiData.tasa.toFixed(2)} por USD.`
      : `✓ Tasa BCV vigente confirmada: Bs. ${apiData.tasa.toFixed(2)} (Sin cambios respecto al último registro oficial).`
  }
}

/**
 * Determina si la tasa necesita una actualización automática
 * (si pasaron más de 4 horas o si es un nuevo día hábil)
 */
export function debeSincronizarTasa(tasaBcvActualizada?: string | null): boolean {
  if (!tasaBcvActualizada) return true

  const fechaActualizada = new Date(tasaBcvActualizada).getTime()
  if (isNaN(fechaActualizada) || fechaActualizada <= 0) return true

  const ahora = Date.now()
  const horasTranscurridas = (ahora - fechaActualizada) / (1000 * 60 * 60)

  // Si pasaron más de 4 horas, conviene verificar
  return horasTranscurridas >= 4
}
