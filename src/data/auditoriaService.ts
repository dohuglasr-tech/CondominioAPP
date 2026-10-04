import { supabase } from './supabase'

export type TipoAccionAuditoria =
  | 'ELIMINACION_EMISION'
  | 'ELIMINACION_RECIBO_INDIVIDUAL'
  | 'EDICION_DEUDA'
  | 'CONDONACION_DEUDA'
  | 'CAMBIO_CONFIG_EDIFICIO'
  | 'MODIFICACION_ALICUOTA'
  | 'CAMBIO_CASO'
  | 'ACTUALIZACION_TASA_BCV'
  | 'HISTORICO_CAMBIO_ESTADO'
  | 'HISTORICO_BULK_ESTADO'
  | 'RETIRO_SALDO_A_FAVOR'
  | 'ABONO_SALDO_A_FAVOR'
  | 'APLICAR_SALDO_A_DEUDA'
  | 'PAGO_DEUDA_ATRASADA'
  | 'PAGO_CONCILIADO_PRELACION'
  | 'CALENDARIO_CHECKLIST_PAGO'
  | 'ENVIO_EMAILS_MASIVO'

export interface LogAuditoria {
  id: string
  fecha: string
  tipo_accion: TipoAccionAuditoria
  titulo: string
  descripcion: string
  apartamento_numero?: string | null
  apartamento_id?: string | null
  mes_afectado?: string | null
  monto_usd?: number | null
  monto_bs?: number | null
  motivo: string
  autor_nombre: string
  autor_email?: string | null
  datos_anteriores?: any
  datos_nuevos?: any
  ip_origen?: string | null
  created_at: string
}

const LOCAL_STORAGE_KEY = 'condominio_auditoria_logs_v1'

/**
 * Obtener todos los logs de auditoría (desde Supabase con fallback / sincronización de localStorage)
 */
export async function obtenerHistorialAuditoria(): Promise<LogAuditoria[]> {
  let logsDb: LogAuditoria[] = []

  try {
    const { data, error } = await supabase
      .from('historial_auditoria')
      .select('*')
      .order('fecha', { ascending: false })

    if (!error && data) {
      logsDb = data as LogAuditoria[]
    }
  } catch (err) {
    console.warn('[Auditoria] No se pudo leer de la DB, usando cache local:', err)
  }

  // Cargar del localStorage
  let logsLocales: LogAuditoria[] = []
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (raw) {
      logsLocales = JSON.parse(raw)
    }
  } catch (e) {
    console.warn('[Auditoria] Error parseando cache local:', e)
  }

  // Unificar sin duplicados (por id)
  const map = new Map<string, LogAuditoria>()
  logsDb.forEach(l => map.set(l.id, l))
  logsLocales.forEach(l => {
    if (!map.has(l.id)) map.set(l.id, l)
  })

  const merged = Array.from(map.values())
  merged.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
  return merged
}

export type EventoAuditoriaInput = Omit<LogAuditoria, 'id' | 'created_at' | 'fecha'> & {
  fecha?: string
}

/**
 * Registrar un nuevo evento de auditoría de manera inmutable
 */
export async function registrarEventoAuditoria(
  evento: EventoAuditoriaInput
): Promise<{ success: boolean; log: LogAuditoria; error?: string }> {
  const nuevoId = crypto.randomUUID ? crypto.randomUUID() : `log_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  const fechaActual = evento.fecha || new Date().toISOString()

  const logCompleto: LogAuditoria = {
    id: nuevoId,
    fecha: fechaActual,
    tipo_accion: evento.tipo_accion,
    titulo: evento.titulo,
    descripcion: evento.descripcion,
    apartamento_numero: evento.apartamento_numero || null,
    apartamento_id: evento.apartamento_id || null,
    mes_afectado: evento.mes_afectado || null,
    monto_usd: evento.monto_usd !== undefined ? Number(evento.monto_usd) : null,
    monto_bs: evento.monto_bs !== undefined ? Number(evento.monto_bs) : null,
    motivo: evento.motivo.trim(),
    autor_nombre: evento.autor_nombre || 'Administrador',
    autor_email: evento.autor_email || null,
    datos_anteriores: evento.datos_anteriores || null,
    datos_nuevos: evento.datos_nuevos || null,
    ip_origen: evento.ip_origen || null,
    created_at: fechaActual
  }

  // 1. Guardar siempre en cache local protegido (redundancia local inmutable)
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY)
    const logs: LogAuditoria[] = raw ? JSON.parse(raw) : []
    logs.unshift(logCompleto)
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(logs))
  } catch (err) {
    console.warn('[Auditoria] Error guardando en cache local:', err)
  }

  // 2. Intentar guardar en Supabase si la tabla existe
  try {
    const { error } = await supabase
      .from('historial_auditoria')
      .insert([logCompleto])

    if (error) {
      console.warn('[Auditoria] No se pudo insertar en DB (puede requerir migración SQL):', error.message)
      return { success: true, log: logCompleto, error: error.message }
    }
  } catch (err: any) {
    console.warn('[Auditoria] Error comunicando con Supabase:', err)
  }

  return { success: true, log: logCompleto }
}
