import { supabase, ConfigEdificio } from './supabase'
import { appCache } from './cacheService'

export interface TableStats {
  name: string
  label: string
  count: number
  status: 'ok' | 'empty' | 'error'
  icon: string
}

export interface SystemHealthData {
  latencyMs: number
  status: 'healthy' | 'degraded' | 'error' | 'offline'
  statusMessage?: string
  timestamp: string
  tables: TableStats[]
  totalRecords: number
}

export interface MasterUserData {
  id: string
  nombre_completo: string | null
  cedula: string | null
  telefono: string | null
  email: string | null
  rol: 'superadmin' | 'administrador' | 'residente' | 'conserje'
  estado_cuenta: 'activa' | 'suspendida' | 'pendiente_cambio_clave'
  apartamento_numero: string | null
  ultimo_acceso: string | null
  created_at: string
}

export interface FinancialSanityCheck {
  totalRecibosEmitidos: number
  montoTotalRecibosUsd: number
  totalPagosAprobados: number
  montoTotalPagosUsd: number
  totalMoraRegistradaUsd: number
  balanceGeneralUsd: number
  totalApartamentosAlDia: number
  totalApartamentosEnMora: number
}

/**
 * 1. MIDE SALUD DEL SISTEMA Y RECUENTO DE TABLAS EN VIVO
 */
export async function getSystemHealth(): Promise<SystemHealthData> {
  const start = performance.now()
  let isConnected = true

  // Medir latencia con consulta rápida a configuración
  try {
    await supabase.from('configuracion_edificio').select('id').limit(1)
  } catch {
    isConnected = false
  }
  const latencyMs = Math.round(performance.now() - start)

  // Consultar recuentos de tablas maestras concurrentemente
  const tableDefs: { name: string; label: string; icon: string }[] = [
    { name: 'apartamentos',          label: 'Apartamentos',        icon: '🏢' },
    { name: 'perfiles',              label: 'Usuarios / Perfiles', icon: '👤' },
    { name: 'recibos_generados',     label: 'Recibos Emitidos',    icon: '🧾' },
    { name: 'pagos_reportados',      label: 'Pagos Reportados',    icon: '💵' },
    { name: 'gastos_comunes',        label: 'Gastos Comunes',      icon: '📉' },
    { name: 'junta_condominio',      label: 'Organigrama / Junta', icon: '👥' },
    { name: 'casos_comunidad',       label: 'Casos y Multas',      icon: '⚖️' },
    { name: 'deudas_mora',           label: 'Registros de Mora',   icon: '⚠️' },
    { name: 'historial_auditoria',   label: 'Logs de Auditoría',   icon: '🛡️' },
    { name: 'chat_mensajes',         label: 'Mensajes de Chat',    icon: '💬' },
    { name: 'propuestas',            label: 'Propuestas Activas',  icon: '🗳️' }
  ]

  const tableResults: TableStats[] = await Promise.all(
    tableDefs.map(async (t) => {
      try {
        const { count, error } = await supabase
          .from(t.name)
          .select('*', { count: 'exact', head: true })

        if (error) {
          return { name: t.name, label: t.label, count: 0, status: 'error', icon: t.icon }
        }
        return {
          name: t.name,
          label: t.label,
          count: count ?? 0,
          status: (count && count > 0) ? 'ok' : 'empty',
          icon: t.icon
        }
      } catch {
        return { name: t.name, label: t.label, count: 0, status: 'error', icon: t.icon }
      }
    })
  )

  const totalRecords = tableResults.reduce((acc, curr) => acc + (curr.count || 0), 0)
  const hasTableErrors = tableResults.some(t => t.status === 'error')

  let status: 'healthy' | 'degraded' | 'error' | 'offline' = 'healthy'
  let statusMessage = 'Conectada · 100% de tablas y servicios en línea'

  if (!isConnected) {
    status = 'offline'
    statusMessage = 'Sin conexión al servidor PostgREST'
  } else if (hasTableErrors) {
    status = 'error'
    statusMessage = 'Una o más tablas presentan incidencias de lectura'
  } else if (latencyMs > 2500) {
    status = 'degraded'
    statusMessage = 'Conectada · Latencia de red moderada / alta'
  } else {
    status = 'healthy'
    statusMessage = 'Conectada a db.kevslcecttfxifcplgzx · Operativa'
  }

  return {
    latencyMs,
    status,
    statusMessage,
    timestamp: new Date().toLocaleTimeString(),
    tables: tableResults,
    totalRecords
  }
}

/**
 * 2. PURGAR CACHÉ GLOBAL
 */
export function purgeGlobalCache(): void {
  try {
    appCache.invalidateTags(['config', 'apartamentos', 'recibos', 'saldos', 'mora', 'gastos', 'pagos', 'tasa_bcv'])
    sessionStorage.clear()
    console.info('[SuperAdmin] Caché global invalidada con éxito.')
  } catch (e) {
    console.warn('[SuperAdmin] Error purgando caché:', e)
  }
}

/**
 * 3. OBTENER DIRECTORIO MAESTRO DE USUARIOS
 */
export async function getMasterUsers(): Promise<MasterUserData[]> {
  const { data, error } = await supabase
    .from('perfiles')
    .select(`
      id,
      nombre_completo,
      cedula,
      telefono,
      email,
      propietario_email,
      rol,
      estado_cuenta,
      ultimo_acceso,
      created_at,
      apartamento:apartamento_id ( numero )
    `)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[SuperAdmin] Error cargando usuarios:', error.message)
    return []
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    nombre_completo: row.nombre_completo || 'Sin nombre',
    cedula: row.cedula || 'N/A',
    telefono: row.telefono || 'N/A',
    email: row.email || row.propietario_email || 'Sin correo',
    rol: row.rol || 'residente',
    estado_cuenta: row.estado_cuenta || 'activa',
    apartamento_numero: row.apartamento?.numero || null,
    ultimo_acceso: row.ultimo_acceso || null,
    created_at: row.created_at || ''
  }))
}

/**
 * 4. ACTUALIZAR ROL DE USUARIO
 */
export async function updateUserRole(
  userId: string,
  newRole: 'superadmin' | 'administrador' | 'residente' | 'conserje',
  adminEmail: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('perfiles')
      .update({ rol: newRole, updated_at: new Date().toISOString() })
      .eq('id', userId)

    if (error) throw error

    // Registrar en auditoría
    await supabase.from('historial_auditoria').insert([{
      modulo: 'Gobernanza Super Admin',
      accion: `Cambio de Rol a: ${newRole}`,
      detalles: `Usuario modificado: ${userId} por ${adminEmail}`,
      usuario_id: userId,
      fecha_hora: new Date().toISOString()
    }])

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Error actualizando rol' }
  }
}

/**
 * 5. SUSPENDER / ACTIVAR CUENTA
 */
export async function toggleUserStatus(
  userId: string,
  newStatus: 'activa' | 'suspendida',
  adminEmail: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('perfiles')
      .update({ estado_cuenta: newStatus, updated_at: new Date().toISOString() })
      .eq('id', userId)

    if (error) throw error

    // Registrar auditoría
    await supabase.from('historial_auditoria').insert([{
      modulo: 'Seguridad Super Admin',
      accion: `Estado de Cuenta: ${newStatus}`,
      detalles: `Estado cambiado por ${adminEmail}`,
      usuario_id: userId,
      fecha_hora: new Date().toISOString()
    }])

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Error modificando estado' }
  }
}

/**
 * 6. AUDITORÍA FORENSE Y ARQUEO GENERAL
 */
export async function getMasterAuditLogs(limit = 100): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('historial_auditoria')
      .select('*')
      .order('fecha_hora', { ascending: false })
      .limit(limit)

    if (error) return []
    return data || []
  } catch {
    return []
  }
}

export async function getFinancialSanityCheck(): Promise<FinancialSanityCheck> {
  try {
    // 1. Recibos generados
    const { data: recibos } = await supabase
      .from('recibos_generados')
      .select('monto_usd')

    const totalRecibos = recibos?.length || 0
    const montoRecibos = (recibos || []).reduce((acc: number, r: any) => acc + (Number(r.monto_usd) || 0), 0)

    // 2. Pagos aprobados
    const { data: pagos } = await supabase
      .from('pagos_reportados')
      .select('monto_usd')
      .eq('estado', 'aprobado')

    const totalPagos = pagos?.length || 0
    const montoPagos = (pagos || []).reduce((acc: number, p: any) => acc + (Number(p.monto_usd) || 0), 0)

    // 3. Mora
    const { data: mora } = await supabase
      .from('deudas_mora')
      .select('monto_usd')

    const totalMora = (mora || []).reduce((acc: number, m: any) => acc + (Number(m.monto_usd) || 0), 0)

    // 4. Aptos
    const { data: aptos } = await supabase
      .from('apartamentos')
      .select('id, saldo_actual')

    let alDia = 0
    let enMora = 0
    aptos?.forEach((a: any) => {
      if ((a.saldo_actual || 0) > 0.05) enMora++
      else alDia++
    })

    return {
      totalRecibosEmitidos: totalRecibos,
      montoTotalRecibosUsd: Number(montoRecibos.toFixed(2)),
      totalPagosAprobados: totalPagos,
      montoTotalPagosUsd: Number(montoPagos.toFixed(2)),
      totalMoraRegistradaUsd: Number(totalMora.toFixed(2)),
      balanceGeneralUsd: Number((montoPagos - montoRecibos).toFixed(2)),
      totalApartamentosAlDia: alDia,
      totalApartamentosEnMora: enMora
    }
  } catch (err) {
    console.warn('[SuperAdmin] Error calculando balance financiero:', err)
    return {
      totalRecibosEmitidos: 0,
      montoTotalRecibosUsd: 0,
      totalPagosAprobados: 0,
      montoTotalPagosUsd: 0,
      totalMoraRegistradaUsd: 0,
      balanceGeneralUsd: 0,
      totalApartamentosAlDia: 0,
      totalApartamentosEnMora: 0
    }
  }
}

/**
 * 7. GESTIÓN DE EMERGENCIAS Y CONTINGENCIAS
 */
export async function updateEmergencySettings(params: {
  bannerActivo: boolean
  bannerTexto: string
  bannerNivel: 'info' | 'warning' | 'critical'
  modoMantenimiento: boolean
  modoMantenimientoMotivo: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: config } = await supabase
      .from('configuracion_edificio')
      .select('id')
      .limit(1)
      .single()

    if (!config?.id) throw new Error('Configuración de edificio no encontrada')

    const { error } = await supabase
      .from('configuracion_edificio')
      .update({
        banner_emergencia_activo: params.bannerActivo,
        banner_emergencia_texto: params.bannerTexto,
        banner_emergencia_nivel: params.bannerNivel,
        modo_mantenimiento: params.modoMantenimiento,
        modo_mantenimiento_motivo: params.modoMantenimientoMotivo,
        updated_at: new Date().toISOString()
      })
      .eq('id', config.id)

    if (error) throw error

    appCache.invalidateTags(['config'])
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Error guardando emergencia' }
  }
}

export async function forceBcvRate(rate: number): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: config } = await supabase
      .from('configuracion_edificio')
      .select('id')
      .limit(1)
      .single()

    if (!config?.id) throw new Error('Edificio no encontrado')

    const { error } = await supabase
      .from('configuracion_edificio')
      .update({
        tasa_bcv_actual: rate,
        tasa_bcv_actualizada: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', config.id)

    if (error) throw error
    appCache.invalidateTags(['config', 'tasa_bcv'])
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Error forzando tasa BCV' }
  }
}

/**
 * 8. EXPORTADOR SNAPSHOT JSON DE LA BASE DE DATOS
 */
export async function generateFullDatabaseSnapshot(): Promise<{ filename: string; jsonContent: string }> {
  const tables = [
    'configuracion_edificio',
    'apartamentos',
    'perfiles',
    'recibos_generados',
    'pagos_reportados',
    'gastos_comunes',
    'junta_condominio',
    'casos_comunidad',
    'deudas_mora',
    'historial_auditoria',
    'propuestas'
  ]

  const dump: Record<string, any> = {
    exportMetadata: {
      generatedAt: new Date().toISOString(),
      platform: 'DOMUS VE - Super Admin Engine',
      version: '2.0.0',
      totalTables: tables.length
    }
  }

  for (const table of tables) {
    try {
      const { data } = await supabase.from(table).select('*')
      dump[table] = data || []
    } catch {
      dump[table] = []
    }
  }

  const jsonContent = JSON.stringify(dump, null, 2)
  const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `domus_ve_snapshot_${dateStr}.json`

  return { filename, jsonContent }
}
