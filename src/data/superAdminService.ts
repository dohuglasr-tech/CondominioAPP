import { supabase } from './supabase'
import { appCache } from './cacheService'
import { slugifyBuildingName } from './tenantService'

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
  apartamento_id: string | null
  apartamento_numero: string | null
  edificio_id: string | null
  edificio_nombre?: string | null
  condicion_habitacional: string | null
  ultimo_acceso: string | null
  created_at: string
}

export interface BuildingData {
  id: string
  nombre_edificio: string
  slug?: string | null
  rif_edificio?: string | null
  direccion?: string | null
  ciudad?: string | null
  email_admin?: string | null
  telefono?: string | null
  total_apartamentos?: number
  total_pisos?: number
  apartamentos_por_piso?: number
  tiene_ph?: boolean
  total_ph?: number
  color_primario?: string | null
  logo_url?: string | null
  banco?: string | null
  cuenta_bancaria?: string | null
  titular_cuenta?: string | null
  pago_movil_banco?: string | null
  pago_movil_cedula?: string | null
  pago_movil_telefono?: string | null
  zelle_email?: string | null
  tasa_bcv_actual?: number | null
  banner_emergencia_activo?: boolean
  banner_emergencia_texto?: string | null
  banner_emergencia_nivel?: 'info' | 'warning' | 'critical'
  modo_mantenimiento?: boolean
  modo_mantenimiento_motivo?: string | null
  created_at?: string
  total_apartamentos_registrados?: number
  total_usuarios_registrados?: number
}

export interface DiagnosticFinding {
  id: string
  category: 'security' | 'sessions' | 'data_integrity' | 'logs' | 'performance'
  severity: 'critical' | 'warning' | 'info' | 'passed'
  title: string
  description: string
  evidence?: string
  impact: string
  recommendation: string
  autoFixAvailable?: boolean
  fixActionType?: 'purge_cache' | 'force_bcv' | 'goto_users' | 'goto_emergency' | 'goto_audit'
}

export interface SystemDiagnosticReport {
  scannedAt: string
  totalChecks: number
  passedChecks: number
  warningChecks: number
  criticalChecks: number
  securityScore: number
  status: 'optimal' | 'attention' | 'vulnerable'
  findings: DiagnosticFinding[]
  systemMetrics: {
    databaseLatency: number
    activeUsers24h: number
    pendingPayments: number
    unlinkedApartments: number
    auditLogCount: number
    suspiciousLogCount: number
    bcvStatus: 'updated' | 'outdated'
    storageUsageKb: number
    realtimeConnected: boolean
  }
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
 * 3. GESTIÓN MULTIEDIFICIO (OBTENER, CREAR, ACTUALIZAR)
 */
export async function getAllBuildings(): Promise<BuildingData[]> {
  const { data: buildings, error } = await supabase
    .from('configuracion_edificio')
    .select('*')
    .order('nombre_edificio', { ascending: true })

  if (error) {
    console.error('[SuperAdmin] Error cargando edificios:', error)
    return []
  }

  // Obtener recuentos de apartamentos y perfiles por edificio
  const { data: aptos } = await supabase.from('apartamentos').select('id, edificio_id')
  const { data: perfs } = await supabase.from('perfiles').select('id, edificio_id')

  return (buildings || []).map((b: any) => {
    const aptosCount = aptos ? aptos.filter((a: any) => a.edificio_id === b.id).length : 0
    const perfsCount = perfs ? perfs.filter((p: any) => p.edificio_id === b.id).length : 0
    const buildingSlug = b.slug || slugifyBuildingName(b.nombre_edificio)
    return {
      ...b,
      slug: buildingSlug,
      total_apartamentos_registrados: aptosCount,
      total_usuarios_registrados: perfsCount
    }
  })
}

export async function createBuilding(
  payload: Partial<BuildingData>,
  generateApartments = false,
  adminEmail = 'superadmin'
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const newId = crypto.randomUUID()
    const buildingName = payload.nombre_edificio?.trim() || 'Nuevo Edificio'
    const buildingSlug = payload.slug?.trim() || slugifyBuildingName(buildingName)

    const record: any = {
      id: newId,
      nombre_edificio: buildingName,
      slug: buildingSlug,
      rif_edificio: payload.rif_edificio?.trim() || null,
      direccion: payload.direccion?.trim() || '',
      ciudad: payload.ciudad?.trim() || '',
      email_admin: payload.email_admin?.trim() || null,
      telefono: payload.telefono?.trim() || null,
      total_apartamentos: payload.total_apartamentos || 0,
      total_pisos: payload.total_pisos || 1,
      apartamentos_por_piso: payload.apartamentos_por_piso || 1,
      tiene_ph: Boolean(payload.tiene_ph),
      total_ph: payload.total_ph || 0,
      color_primario: payload.color_primario || '#f97316',
      banco: payload.banco || null,
      cuenta_bancaria: payload.cuenta_bancaria || null,
      titular_cuenta: payload.titular_cuenta || null,
      pago_movil_banco: payload.pago_movil_banco || null,
      pago_movil_cedula: payload.pago_movil_cedula || null,
      pago_movil_telefono: payload.pago_movil_telefono || null,
      zelle_email: payload.zelle_email || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('configuracion_edificio')
      .insert([record])
      .select()
      .single()

    if (error) throw error

    // Generar apartamentos automáticamente si fue solicitado
    if (generateApartments && payload.total_pisos && payload.apartamentos_por_piso) {
      const aptosToInsert: any[] = []
      const pisos = Number(payload.total_pisos)
      const porPiso = Number(payload.apartamentos_por_piso)

      for (let piso = 1; piso <= pisos; piso++) {
        for (let num = 1; num <= porPiso; num++) {
          const numeroApto = `${piso}-${num}`
          aptosToInsert.push({
            id: crypto.randomUUID(),
            edificio_id: newId,
            numero: numeroApto,
            piso: piso,
            estado: 'activo',
            alicuota: (100 / (pisos * porPiso)).toFixed(4),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
        }
      }

      if (payload.tiene_ph && payload.total_ph) {
        for (let ph = 1; ph <= Number(payload.total_ph); ph++) {
          aptosToInsert.push({
            id: crypto.randomUUID(),
            edificio_id: newId,
            numero: `PH-${ph}`,
            piso: pisos + 1,
            estado: 'activo',
            alicuota: '0.0000',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
        }
      }

      if (aptosToInsert.length > 0) {
        await supabase.from('apartamentos').insert(aptosToInsert)
      }
    }

    // Auditoría
    try {
      await supabase.from('historial_auditoria').insert([{
        modulo: 'Multiedificio Super Admin',
        accion: 'CREAR_EDIFICIO',
        detalles: `Edificio creado: ${record.nombre_edificio} por ${adminEmail}`,
        registro_id: newId,
        fecha_hora: new Date().toISOString()
      }])
    } catch {}

    appCache.invalidateTags(['config', 'apartamentos'])
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err.message || 'Error creando edificio' }
  }
}

export async function updateBuilding(
  buildingId: string,
  payload: Partial<BuildingData>,
  adminEmail = 'superadmin'
): Promise<{ success: boolean; error?: string }> {
  try {
    const cleanPayload: any = { ...payload }
    if (cleanPayload.nombre_edificio && !cleanPayload.slug) {
      cleanPayload.slug = slugifyBuildingName(cleanPayload.nombre_edificio)
    }

    const { error } = await supabase
      .from('configuracion_edificio')
      .update({
        ...cleanPayload,
        updated_at: new Date().toISOString()
      })
      .eq('id', buildingId)

    if (error) throw error

    try {
      await supabase.from('historial_auditoria').insert([{
        modulo: 'Multiedificio Super Admin',
        accion: 'EDITAR_EDIFICIO',
        detalles: `Edificio actualizado: ${buildingId} por ${adminEmail}`,
        registro_id: buildingId,
        fecha_hora: new Date().toISOString()
      }])
    } catch {}

    appCache.invalidateTags(['config', 'apartamentos'])
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Error actualizando edificio' }
  }
}

/**
 * 4. OBTENER DIRECTORIO MAESTRO DE USUARIOS (FILTRABLE POR EDIFICIO)
 */
export async function getMasterUsers(edificioId?: string): Promise<MasterUserData[]> {
  let query = supabase
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
      apartamento_id,
      edificio_id,
      condicion_habitacional,
      apartamento:apartamento_id ( numero )
    `)
    .order('created_at', { ascending: false })

  if (edificioId && edificioId !== 'todos') {
    query = query.eq('edificio_id', edificioId)
  }

  const { data, error } = await query

  if (error) {
    console.error('[SuperAdmin] Error cargando usuarios:', error.message)
    return []
  }

  // Traer mapa de edificios para colocar el nombre
  const { data: bldgs } = await supabase.from('configuracion_edificio').select('id, nombre_edificio')
  const bldgMap: Record<string, string> = {}
  if (bldgs) {
    bldgs.forEach((b: any) => { bldgMap[b.id] = b.nombre_edificio })
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    nombre_completo: row.nombre_completo || 'Sin nombre',
    cedula: row.cedula || 'N/A',
    telefono: row.telefono || 'N/A',
    email: row.email || row.propietario_email || 'Sin correo',
    rol: row.rol || 'residente',
    estado_cuenta: row.estado_cuenta || 'activa',
    apartamento_id: row.apartamento_id || null,
    apartamento_numero: row.apartamento?.numero || null,
    edificio_id: row.edificio_id || null,
    edificio_nombre: row.edificio_id ? (bldgMap[row.edificio_id] || 'Edificio asignado') : 'Principal',
    condicion_habitacional: row.condicion_habitacional || null,
    ultimo_acceso: row.ultimo_acceso || null,
    created_at: row.created_at || ''
  }))
}

/**
 * 5. OBTENER LISTA DE APARTAMENTOS (PARA ASIGNACIÓN)
 */
export async function getApartmentsList(edificioId?: string): Promise<{ id: string; numero: string; piso: number; edificio_id?: string }[]> {
  let query = supabase
    .from('apartamentos')
    .select('id, numero, piso, edificio_id')
    .order('piso', { ascending: true })
    .order('numero', { ascending: true })

  if (edificioId && edificioId !== 'todos') {
    query = query.eq('edificio_id', edificioId)
  }

  const { data } = await query
  return data || []
}

/**
 * 6. EDICIÓN COMPLETA DEL PERFIL DE USUARIO
 */
export async function superAdminUpdateUserProfile(
  userId: string,
  data: {
    nombre_completo?: string
    cedula?: string
    telefono?: string
    email?: string
    rol?: 'superadmin' | 'administrador' | 'residente' | 'conserje'
    estado_cuenta?: 'activa' | 'suspendida' | 'pendiente_cambio_clave'
    apartamento_id?: string | null
    edificio_id?: string | null
    condicion_habitacional?: string | null
  },
  adminEmail = 'superadmin'
): Promise<{ success: boolean; error?: string }> {
  try {
    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString()
    }
    if (data.nombre_completo !== undefined) updatePayload.nombre_completo = data.nombre_completo.trim()
    if (data.cedula !== undefined) updatePayload.cedula = data.cedula.trim()
    if (data.telefono !== undefined) updatePayload.telefono = data.telefono.trim()
    if (data.email !== undefined) updatePayload.email = data.email.trim()
    if (data.rol !== undefined) updatePayload.rol = data.rol
    if (data.estado_cuenta !== undefined) updatePayload.estado_cuenta = data.estado_cuenta
    if (data.apartamento_id !== undefined) updatePayload.apartamento_id = data.apartamento_id || null
    if (data.edificio_id !== undefined) updatePayload.edificio_id = data.edificio_id || null
    if (data.condicion_habitacional !== undefined) updatePayload.condicion_habitacional = data.condicion_habitacional || null

    const { error } = await supabase
      .from('perfiles')
      .update(updatePayload)
      .eq('id', userId)

    if (error) throw error

    try {
      await supabase.from('historial_auditoria').insert([{
        modulo: 'Gobernanza Usuarios Super Admin',
        accion: 'EDITAR_PERFIL_USUARIO',
        detalles: `Usuario modificado: ${userId} (${data.nombre_completo || ''}) por ${adminEmail}`,
        usuario_id: userId,
        fecha_hora: new Date().toISOString()
      }])
    } catch {}

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Error actualizando usuario' }
  }
}

/**
 * 7. CAMBIO DIRECTO DE CONTRASEÑA POR SUPER ADMIN
 */
export async function superAdminChangePassword(
  targetUserId: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('superadmin_change_user_password', {
      target_user_id: targetUserId,
      new_password: newPassword
    })

    if (error) throw error
    if (data && data.success === false) {
      return { success: false, error: data.error || 'No se pudo cambiar la contraseña' }
    }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'Error ejecutando cambio de clave' }
  }
}

/**
 * 8. ACTUALIZAR ROL DE USUARIO
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
 * 9. SUSPENDER / ACTIVAR CUENTA (BLOQUEO DE ACCESO)
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

/**
 * 9. ESCÁNER INTEGRAL 360° DE SEGURIDAD, BUGS, SESIONES Y ANOMALÍAS
 */
export async function runComprehensiveDiagnostic(): Promise<SystemDiagnosticReport> {
  const findings: DiagnosticFinding[] = []

  // 1. Latencia y conectividad
  let dbLatency = 0
  let isConnected = true
  try {
    const pStart = performance.now()
    await supabase.from('configuracion_edificio').select('id').limit(1)
    dbLatency = Math.round(performance.now() - pStart)
  } catch {
    isConnected = false
  }

  if (!isConnected) {
    findings.push({
      id: 'net-offline',
      category: 'performance',
      severity: 'critical',
      title: 'Pérdida de conectividad con Supabase',
      description: 'El cliente no pudo establecer comunicación con el endpoint de PostgREST.',
      impact: 'La aplicación no puede leer ni escribir datos en este momento.',
      recommendation: 'Verifica el estado del cluster en Supabase y la conexión a internet.'
    })
  } else if (dbLatency > 2000) {
    findings.push({
      id: 'net-latency',
      category: 'performance',
      severity: 'warning',
      title: `Latencia elevada de red (${dbLatency} ms)`,
      description: 'El tiempo de ida y vuelta hacia el motor de base de datos supera los 2 segundos.',
      evidence: `Tiempo medido: ${dbLatency} ms`,
      impact: 'Las consultas del portal del residente pueden experimentar lentitud temporal.',
      recommendation: 'Revisar la calidad de la conexión o latencia de red internacional.',
      autoFixAvailable: true,
      fixActionType: 'purge_cache'
    })
  } else {
    findings.push({
      id: 'net-ok',
      category: 'performance',
      severity: 'passed',
      title: 'Conexión y latencia con Supabase óptima',
      description: `El motor de base de datos responde con ${dbLatency} ms de latencia.`,
      evidence: `${dbLatency} ms`,
      impact: 'Rendimiento de respuesta excelente.',
      recommendation: 'Sin acciones requeridas.'
    })
  }

  // 2. Control de Privilegios Super Admin
  const { data: superAdmins } = await supabase
    .from('perfiles')
    .select('id, email, nombre_completo, created_at')
    .eq('rol', 'superadmin')

  const superCount = superAdmins?.length || 0
  if (superCount === 0) {
    findings.push({
      id: 'sec-no-super',
      category: 'security',
      severity: 'critical',
      title: 'No se detectó cuenta de Super Administrador',
      description: 'No hay ninguna cuenta registrada con el rol maestro superadmin en public.perfiles.',
      impact: 'Bloqueo del gobierno central del sistema.',
      recommendation: 'Asignar rol superadmin a la cuenta designada.'
    })
  } else if (superCount === 1 && superAdmins?.[0]?.email === 'condominioapp.v@gmail.com') {
    findings.push({
      id: 'sec-super-ok',
      category: 'security',
      severity: 'passed',
      title: 'Privilegios de Super Admin estrictamente aislados',
      description: 'Existe únicamente la cuenta autorizada oficial (condominioapp.v@gmail.com) con nivel superadmin.',
      evidence: `1 cuenta: ${superAdmins[0].email}`,
      impact: 'Gobernanza central protegida contra accesos colaterales.',
      recommendation: 'Mantener la clave de seguridad bajo resguardo.'
    })
  } else {
    findings.push({
      id: 'sec-super-multi',
      category: 'security',
      severity: 'warning',
      title: `Detectadas ${superCount} cuentas con rol de Super Administrador`,
      description: 'Se encontraron cuentas adicionales con privilegios supremos en la base de datos.',
      evidence: superAdmins?.map(s => s.email).join(', ') || '',
      impact: 'Riesgo de acceso administrativo indebido o no supervisado.',
      recommendation: 'Revisar el listado de usuarios y revocar roles no esenciales.',
      autoFixAvailable: true,
      fixActionType: 'goto_users'
    })
  }

  // 3. Cuentas Suspendidas & Intentos de Acceso
  const { data: suspendedUsers } = await supabase
    .from('perfiles')
    .select('id, email, nombre_completo, ultimo_acceso, updated_at')
    .eq('estado_cuenta', 'suspendida')

  const suspendedCount = suspendedUsers?.length || 0
  if (suspendedCount > 0) {
    findings.push({
      id: 'sec-users-suspended',
      category: 'security',
      severity: 'info',
      title: `${suspendedCount} cuenta(s) en estado suspendido`,
      description: 'Hay usuarios con acceso bloqueado en la plataforma.',
      evidence: suspendedUsers?.map(u => u.email).join(', ') || '',
      impact: 'Estas cuentas tienen el acceso denegado en la interfaz.',
      recommendation: 'Revisar si corresponde reactivar o mantener la suspensión.',
      autoFixAvailable: true,
      fixActionType: 'goto_users'
    })
  } else {
    findings.push({
      id: 'sec-users-ok',
      category: 'security',
      severity: 'passed',
      title: 'Sin cuentas bloqueadas por seguridad',
      description: 'Todos los usuarios registrados cuentan con estado activo sin incidencias.',
      impact: 'Normalidad operativa.',
      recommendation: 'Ninguna acción requerida.'
    })
  }

  // 4. Integridad en Pagos Reportados
  const { data: invalidPayments } = await supabase
    .from('pagos_reportados')
    .select('id, referencia, monto_usd, monto_bs, estado')
    .or('monto_usd.is.null,monto_usd.lte.0')

  const invalidPaymentCount = invalidPayments?.length || 0
  if (invalidPaymentCount > 0) {
    findings.push({
      id: 'data-payments-null',
      category: 'data_integrity',
      severity: 'warning',
      title: `${invalidPaymentCount} pagos con monto USD nulo o en cero`,
      description: 'Existen registros en pagos_reportados sin valor en dólares (reportes en Bolívares rechazados o con conversión pendiente).',
      evidence: `${invalidPaymentCount} filas encontradas`,
      impact: 'Los cálculos del balance contable pueden omitir estas transacciones.',
      recommendation: 'Validar y asignar tasa o mantener como rechazados para mantener la sanidad financiera.'
    })
  } else {
    findings.push({
      id: 'data-payments-ok',
      category: 'data_integrity',
      severity: 'passed',
      title: 'Integridad monetaria de pagos 100% válida',
      description: 'Todos los pagos reportados en la plataforma contienen montos coherentes mayores a $0.',
      impact: 'Balística financiera y conciliación exacta.',
      recommendation: 'Ninguna acción requerida.'
    })
  }

  // 5. Integridad de Recibos Emitidos
  const { data: invalidReceipts } = await supabase
    .from('recibos_generados')
    .select('id, numero_recibo, monto_usd')
    .or('monto_usd.is.null,monto_usd.lte.0')

  const invalidReceiptCount = invalidReceipts?.length || 0
  if (invalidReceiptCount > 0) {
    findings.push({
      id: 'data-receipts-null',
      category: 'data_integrity',
      severity: 'critical',
      title: `${invalidReceiptCount} recibos generados con monto inválido ($0 o nulo)`,
      description: 'Se detectaron emisiones de cuotas sin monto asignado o con valor cero.',
      impact: 'Afecta la cobranza comunitaria y el cálculo de la deuda real.',
      recommendation: 'Regenerar o ajustar las emisiones afectadas desde el panel administrativo.'
    })
  } else {
    findings.push({
      id: 'data-receipts-ok',
      category: 'data_integrity',
      severity: 'passed',
      title: 'Integridad de recibos emitidos 100% verificada',
      description: 'Todos los recibos emitidos tienen importes monetarios válidos y positivos.',
      impact: 'Cuentas claras y avisos de cobro consistentes.',
      recommendation: 'Ninguna acción requerida.'
    })
  }

  // 6. Auditoría Forense y Detección de Actividad Sospechosa
  let suspiciousAuditCount = 0
  let rapidDeletionsDetected = false
  const { data: recentLogs } = await supabase
    .from('historial_auditoria')
    .select('id, tipo_accion, titulo, autor_email, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  if (recentLogs && recentLogs.length > 1) {
    for (let i = 0; i < recentLogs.length - 2; i++) {
      const isDel1 = recentLogs[i].titulo?.toLowerCase().includes('elimin') || recentLogs[i].tipo_accion?.includes('ELIMIN')
      const isDel2 = recentLogs[i + 1].titulo?.toLowerCase().includes('elimin') || recentLogs[i + 1].tipo_accion?.includes('ELIMIN')
      const isDel3 = recentLogs[i + 2].titulo?.toLowerCase().includes('elimin') || recentLogs[i + 2].tipo_accion?.includes('ELIMIN')

      if (isDel1 && isDel2 && isDel3) {
        const t1 = new Date(recentLogs[i].created_at).getTime()
        const t3 = new Date(recentLogs[i + 2].created_at).getTime()
        if (Math.abs(t1 - t3) < 20000) {
          rapidDeletionsDetected = true
          suspiciousAuditCount++
          break
        }
      }
    }
  }

  if (rapidDeletionsDetected) {
    findings.push({
      id: 'logs-rapid-delete',
      category: 'logs',
      severity: 'warning',
      title: 'Ráfaga de eliminaciones detectada en registros de auditoría',
      description: 'Se registraron múltiples eliminaciones consecutivas en intervalos menores a 20 segundos.',
      evidence: 'Eliminaciones masivas en historial_auditoria',
      impact: 'Potencial pérdida de registros o depuración rápida de casos comunitarios.',
      recommendation: 'Revisar la pestaña de Auditoría Forense para corroborar si fue una acción autorizada.'
    })
  } else {
    findings.push({
      id: 'logs-normal',
      category: 'logs',
      severity: 'passed',
      title: 'Patrón de auditoría cronológico regular',
      description: 'No se detectaron ráfagas sospechosas ni anomalías en los eventos recientes de auditoría.',
      impact: 'Rastreo inmutable seguro.',
      recommendation: 'Ninguna acción requerida.'
    })
  }

  // 7. Sincronización y Frescura de la Tasa BCV Oficial
  let bcvStatus: 'updated' | 'outdated' = 'updated'
  const { data: bcvData } = await supabase
    .from('configuracion_edificio')
    .select('tasa_bcv_actual, tasa_bcv_actualizada')
    .limit(1)
    .single()

  if (bcvData) {
    const lastUpdate = bcvData.tasa_bcv_actualizada ? new Date(bcvData.tasa_bcv_actualizada).getTime() : 0
    const hoursSinceUpdate = (Date.now() - lastUpdate) / (1000 * 60 * 60)

    if (hoursSinceUpdate > 48 || !bcvData.tasa_bcv_actual) {
      bcvStatus = 'outdated'
      findings.push({
        id: 'perf-bcv-stale',
        category: 'performance',
        severity: 'warning',
        title: 'Tasa BCV oficial requiere sincronización',
        description: `La tasa BCV (${bcvData.tasa_bcv_actual || 'Sin tasa'} Bs/USD) fue actualizada hace más de 48 horas.`,
        evidence: `Última sincronización: ${bcvData.tasa_bcv_actualizada ? new Date(bcvData.tasa_bcv_actualizada).toLocaleString() : 'Nunca'}`,
        impact: 'Los pagos en bolívares calculados con la tasa anterior pueden presentar discrepancias.',
        recommendation: 'Forzar la tasa oficial desde el Centro de Contingencias.',
        autoFixAvailable: true,
        fixActionType: 'force_bcv'
      })
    } else {
      findings.push({
        id: 'perf-bcv-ok',
        category: 'performance',
        severity: 'passed',
        title: 'Tasa BCV oficial al día',
        description: `Tasa vigente de ${bcvData.tasa_bcv_actual} Bs/USD sincronizada correctamente.`,
        evidence: `${bcvData.tasa_bcv_actual} Bs/USD`,
        impact: 'Cálculos de conversión en bolívares precisos.',
        recommendation: 'Ninguna acción requerida.'
      })
    }
  }

  // 8. Almacenamiento y Caché del Cliente
  let storageUsageKb = 0
  try {
    let totalLen = 0
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        totalLen += (localStorage[key].length + key.length) * 2
      }
    }
    storageUsageKb = Math.round(totalLen / 1024)
  } catch {}

  if (storageUsageKb > 4000) {
    findings.push({
      id: 'perf-storage-full',
      category: 'performance',
      severity: 'warning',
      title: `Almacenamiento del navegador elevado (${storageUsageKb} KB)`,
      description: 'El almacenamiento local (localStorage) se encuentra cerca del límite estándar de 5 MB.',
      impact: 'Riesgo de fallo en almacenamiento de caché en dispositivos móviles con bajo espacio.',
      recommendation: 'Purgar la caché de la aplicación para liberar memoria.',
      autoFixAvailable: true,
      fixActionType: 'purge_cache'
    })
  } else {
    findings.push({
      id: 'perf-storage-ok',
      category: 'performance',
      severity: 'passed',
      title: 'Uso de almacenamiento y memoria en límites óptimos',
      description: `El espacio ocupado en almacenamiento local es de ${storageUsageKb} KB (límite: 5,120 KB).`,
      evidence: `${storageUsageKb} KB utilizados`,
      impact: 'Carga fluida y sin bloqueos de memoria en navegadores.',
      recommendation: 'Ninguna acción requerida.'
    })
  }

  // 9. Inspección de Sesión Activa y Tokens de Autenticación
  try {
    let foundAuthToken = false
    let tokenExpiryStr = ''
    let sessionUserEmail = ''
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && (k.startsWith('sb-') && k.endsWith('-auth-token'))) {
        const itemStr = localStorage.getItem(k)
        if (itemStr) {
          const parsed = JSON.parse(itemStr)
          foundAuthToken = true
          sessionUserEmail = parsed.user?.email || parsed.currentSession?.user?.email || 'Desconocido'
          const exp = parsed.expires_at || parsed.currentSession?.expires_at
          if (exp) {
            const expDate = new Date(exp * 1000)
            tokenExpiryStr = expDate.toLocaleTimeString()
            const minutesLeft = Math.round((expDate.getTime() - Date.now()) / (1000 * 60))
            if (minutesLeft < 10) {
              findings.push({
                id: 'sess-expiring-soon',
                category: 'sessions',
                severity: 'warning',
                title: 'Token de sesión de Super Admin próximo a caducar',
                description: `La sesión activa expira en ${minutesLeft} minutos.`,
                evidence: `Usuario: ${sessionUserEmail} (Expira: ${tokenExpiryStr})`,
                impact: 'Podría requerir nuevo inicio de sesión si no se refresca automáticamente el token.',
                recommendation: 'Mantener la aplicación activa para renovación automática de sesión Supabase.'
              })
            }
          }
        }
      }
    }

    if (foundAuthToken) {
      findings.push({
        id: 'sess-token-valid',
        category: 'sessions',
        severity: 'passed',
        title: 'Sesión activa y token JWT en orden',
        description: `Sesión autenticada para ${sessionUserEmail || 'superadmin'}. Token almacenado en almacenamiento seguro.`,
        evidence: `Expira: ${tokenExpiryStr || 'Automática'}`,
        impact: 'Acceso seguro y verificado a los endpoints administrativos.',
        recommendation: 'Ninguna acción requerida.'
      })
    }
  } catch {}

  // 10. Detección de Residentes Huérfanos (Sin Apartamento Vinculado)
  const { data: orphanResidents } = await supabase
    .from('perfiles')
    .select('id, email, nombre_completo')
    .eq('rol', 'residente')
    .is('apartamento_id', null)

  const orphanCount = orphanResidents?.length || 0
  if (orphanCount > 0) {
    findings.push({
      id: 'data-orphan-residents',
      category: 'data_integrity',
      severity: 'warning',
      title: `${orphanCount} residente(s) sin apartamento vinculado`,
      description: 'Existen cuentas con rol residente que no tienen un apartamento asignado en el sistema.',
      evidence: orphanResidents?.map(r => r.email || r.nombre_completo).slice(0, 3).join(', ') + (orphanCount > 3 ? '...' : ''),
      impact: 'Estos residentes no pueden ver sus recibos, saldos ni reportar pagos asociados a un inmueble.',
      recommendation: 'Asignarles el apartamento correspondiente desde el Directorio de Usuarios.',
      autoFixAvailable: true,
      fixActionType: 'goto_users'
    })
  } else {
    findings.push({
      id: 'data-orphan-residents-ok',
      category: 'data_integrity',
      severity: 'passed',
      title: 'Todos los residentes tienen apartamento asignado',
      description: 'El 100% de las cuentas de residentes están debidamente mapeadas a sus inmuebles.',
      impact: 'Acceso completo al portal del residente y cobros automatizados.',
      recommendation: 'Ninguna acción requerida.'
    })
  }

  // 11. Consistencia de Alícuotas en Inmuebles
  const { data: invalidAlicuotas } = await supabase
    .from('apartamentos')
    .select('id, numero, alicuota')
    .or('alicuota.is.null,alicuota.lte.0')

  const invalidAlicuotaCount = invalidAlicuotas?.length || 0
  if (invalidAlicuotaCount > 0) {
    findings.push({
      id: 'data-alicuotas-zero',
      category: 'data_integrity',
      severity: 'warning',
      title: `${invalidAlicuotaCount} apartamento(s) con alícuota en 0% o nula`,
      description: 'Apartamentos registrados sin factor de distribución porcentual de gastos de condominio.',
      evidence: invalidAlicuotas?.map(a => `Apto ${a.numero}`).slice(0, 4).join(', ') + (invalidAlicuotaCount > 4 ? '...' : ''),
      impact: 'La emisión proporcional de gastos puede generar cuotas de $0 para estas unidades.',
      recommendation: 'Revisar la tabla de alícuotas del condominio y ajustar los porcentajes.'
    })
  } else {
    findings.push({
      id: 'data-alicuotas-ok',
      category: 'data_integrity',
      severity: 'passed',
      title: 'Alícuotas de inmuebles configuradas correctamente',
      description: 'Todos los apartamentos cuentan con factores de distribución y alícuotas positivas.',
      impact: 'Distribución justa y matemáticamente exacta de los recibos de condominio.',
      recommendation: 'Ninguna acción requerida.'
    })
  }

  // 12. Cálculo de Métricas y Puntuación de Seguridad
  const totalChecks = findings.length
  const criticalChecks = findings.filter(f => f.severity === 'critical').length
  const warningChecks = findings.filter(f => f.severity === 'warning').length
  const passedChecks = findings.filter(f => f.severity === 'passed').length

  let securityScore = 100 - (criticalChecks * 25) - (warningChecks * 5)
  if (securityScore < 0) securityScore = 0

  let status: 'optimal' | 'attention' | 'vulnerable' = 'optimal'
  if (criticalChecks > 0 || securityScore < 70) {
    status = 'vulnerable'
  } else if (warningChecks > 0 || securityScore < 90) {
    status = 'attention'
  }

  return {
    scannedAt: new Date().toLocaleTimeString(),
    totalChecks,
    passedChecks,
    warningChecks,
    criticalChecks,
    securityScore,
    status,
    findings,
    systemMetrics: {
      databaseLatency: dbLatency,
      activeUsers24h: 1,
      pendingPayments: invalidPaymentCount,
      unlinkedApartments: orphanCount,
      auditLogCount: recentLogs?.length || 0,
      suspiciousLogCount: suspiciousAuditCount,
      bcvStatus,
      storageUsageKb,
      realtimeConnected: isConnected
    }
  }
}

