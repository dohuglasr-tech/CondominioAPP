import { supabase } from './supabase'

export interface LogAccesoResidente {
  id: string
  apartamento_numero: string
  apartamento_id?: string | null
  fecha_conexion: string // "DD/MM/YYYY"
  hora_conexion: string  // "HH:MM:SS AM/PM"
  timestamp_raw: string  // ISO String
  autor_nombre?: string | null
}

const SESSION_ACCESS_KEY = 'condo_acceso_registrado_ts'

/**
 * Registra un log de acceso de residente en segundo plano (Fire and Forget).
 * Cero impacto en el rendimiento:
 * - Se ejecuta asíncronamente sin bloquear la UI ni el render.
 * - Incluye throttle con sessionStorage para no duplicar si el usuario navega o refresca.
 */
export function registrarAccesoResidente(
  apartamentoNumero: string,
  apartamentoId?: string | null,
  nombreResidente?: string | null
): void {
  try {
    if (!apartamentoNumero || String(apartamentoNumero).trim() === '') return

    const now = Date.now()
    const lastSessionAccess = typeof sessionStorage !== 'undefined'
      ? sessionStorage.getItem(SESSION_ACCESS_KEY)
      : null

    if (lastSessionAccess) {
      const elapsed = now - Number(lastSessionAccess)
      // Si ya se registró en esta sesión hace menos de 30 minutos, evitar duplicado
      if (!isNaN(elapsed) && elapsed < 30 * 60 * 1000) {
        return
      }
    }

    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(SESSION_ACCESS_KEY, now.toString())
    }

    const nuevoId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `acc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    
    const nowIso = new Date().toISOString()

    // Llamada fire-and-forget: no se hace await para 0 ms de bloqueo
    Promise.resolve(
      supabase
        .from('historial_auditoria')
        .insert([
          {
            id: nuevoId,
            fecha: nowIso,
            tipo_accion: 'ACCESO_RESIDENTE',
            titulo: `Conexión Apto ${apartamentoNumero}`,
            descripcion: `Inicio de sesión de residente Apto ${apartamentoNumero}`,
            apartamento_numero: String(apartamentoNumero).trim(),
            apartamento_id: apartamentoId || null,
            motivo: 'Ingreso al panel de residente',
            autor_nombre: nombreResidente || `Residente Apto ${apartamentoNumero}`,
            created_at: nowIso,
          }
        ])
    )
      .then(({ error }: any) => {
        if (error) {
          console.warn('[accesosService] Aviso registrando log de acceso:', error.message)
        }
      })
      .catch((err: any) => {
        console.warn('[accesosService] Error de red al registrar log:', err)
      })
  } catch (err) {
    console.warn('[accesosService] Error al intentar registrar acceso:', err)
  }
}

/**
 * Obtiene los logs de accesos de residentes ordenados del más reciente al más antiguo.
 */
export async function obtenerLogsAccesosResidentes(limite: number = 200): Promise<LogAccesoResidente[]> {
  try {
    const { data, error } = await supabase
      .from('historial_auditoria')
      .select('id, fecha, apartamento_numero, apartamento_id, autor_nombre, created_at')
      .eq('tipo_accion', 'ACCESO_RESIDENTE')
      .order('fecha', { ascending: false })
      .limit(limite)

    if (error) {
      console.warn('[accesosService] Error obteniendo logs de acceso:', error.message)
      return []
    }

    if (!data || data.length === 0) return []

    return data.map((row: any) => {
      const dateObj = new Date(row.fecha || row.created_at)
      const fechaConexion = !isNaN(dateObj.getTime())
        ? dateObj.toLocaleDateString('es-VE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          })
        : 'Fecha desc.'

      const horaConexion = !isNaN(dateObj.getTime())
        ? dateObj.toLocaleTimeString('es-VE', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
          })
        : 'Hora desc.'

      return {
        id: row.id,
        apartamento_numero: row.apartamento_numero || 'S/N',
        apartamento_id: row.apartamento_id,
        fecha_conexion: fechaConexion,
        hora_conexion: horaConexion,
        timestamp_raw: row.fecha || row.created_at,
        autor_nombre: row.autor_nombre
      }
    })
  } catch (err) {
    console.warn('[accesosService] Error cargando logs:', err)
    return []
  }
}
