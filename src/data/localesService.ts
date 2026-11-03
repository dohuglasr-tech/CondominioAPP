import { supabase } from './supabase'

export type TipoCuotaLocal = 'fija' | 'variable'
export type EstadoLocal = 'activo' | 'inactivo' | 'en_mantenimiento'

export interface LocalComercial {
  id: string
  nombre: string // Ej: 'Local Comercial 1', 'Kiosko Entrada PB'
  codigo?: string // Ej: 'L-01', 'PB-A'
  descripcion?: string // Rubro comercial o uso del espacio
  arrendatario_nombre: string
  arrendatario_cedula?: string
  arrendatario_telefono?: string
  arrendatario_email?: string
  tipo_cuota: TipoCuotaLocal
  monto_usd: number
  monto_bs: number
  inicio_contrato: string // YYYY-MM-DD
  fin_contrato?: string   // YYYY-MM-DD
  apartamento_id: string | null // Apartamento asignado para cargar la deuda
  apartamento_numero?: string   // Ej: '101', 'PB-1'
  apartamento_propietario?: string
  estado: EstadoLocal
  deuda_actual_usd: number // Deuda acumulada de este local
  deuda_actual_bs: number
  deposito_garantia_usd?: number
  notas_admin?: string
  created_at?: string
  updated_at?: string
}

const STORAGE_KEY = 'condominio_locales_comerciales_cache'

// Locales semilla por defecto en caso de no existir registros iniciales
const LOCALES_SEMILLA: LocalComercial[] = [
  {
    id: 'local-semilla-1',
    nombre: 'Local Comercial PB-1 (Minimarket)',
    codigo: 'L-01',
    descripcion: 'Venta de víveres, golosinas y artículos de primera necesidad',
    arrendatario_nombre: 'Inversiones Los Andes C.A.',
    arrendatario_cedula: 'J-40987654-1',
    arrendatario_telefono: '0414-2345678',
    arrendatario_email: 'minimarket.ocutuy@gmail.com',
    tipo_cuota: 'fija',
    monto_usd: 80,
    monto_bs: 0,
    inicio_contrato: '2026-01-01',
    fin_contrato: '2026-12-31',
    apartamento_id: null,
    apartamento_numero: '101',
    apartamento_propietario: 'Propietario Apto 101',
    estado: 'activo',
    deuda_actual_usd: 0,
    deuda_actual_bs: 0,
    deposito_garantia_usd: 160,
    notas_admin: 'Contrato anual. Canon acordado pagadero los primeros 5 días.',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z'
  },
  {
    id: 'local-semilla-2',
    nombre: 'Local Comercial PB-2 (Peluquería)',
    codigo: 'L-02',
    descripcion: 'Peluquería, barbería y servicios de estética unisex',
    arrendatario_nombre: 'María Elena Zambrano',
    arrendatario_cedula: 'V-18456789',
    arrendatario_telefono: '0424-9871234',
    arrendatario_email: 'peluqueria.estilo@gmail.com',
    tipo_cuota: 'fija',
    monto_usd: 50,
    monto_bs: 0,
    inicio_contrato: '2026-02-01',
    fin_contrato: '2026-12-31',
    apartamento_id: null,
    apartamento_numero: '102',
    apartamento_propietario: 'Propietario Apto 102',
    estado: 'activo',
    deuda_actual_usd: 0,
    deuda_actual_bs: 0,
    deposito_garantia_usd: 100,
    notas_admin: 'Uso comercial de área común PB. Solvente a la fecha.',
    created_at: '2026-02-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z'
  }
]

function getLocalCache(): LocalComercial[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
      }
    }
  } catch (e) {
    console.warn('[localesService] Error leyendo cache localStorage:', e)
  }
  return LOCALES_SEMILLA
}

function saveLocalCache(locales: LocalComercial[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(locales))
    window.dispatchEvent(new CustomEvent('condominio:locales_updated', { detail: locales }))
  } catch (e) {
    console.warn('[localesService] Error guardando cache localStorage:', e)
  }
}

// Convertir fila de casos_comunidad a LocalComercial
function mapCasoToLocal(c: any, aptoMap?: Map<string, { numero: string; propietario: string }>): LocalComercial {
  let extra: any = {}
  if (c.descripcion) {
    try {
      extra = JSON.parse(c.descripcion)
    } catch {
      extra = { descripcion: c.descripcion }
    }
  }

  const aptoInfo = c.apartamento_id && aptoMap ? aptoMap.get(c.apartamento_id) : undefined

  return {
    id: c.id,
    nombre: c.titulo || extra.nombre || 'Local Comercial',
    codigo: extra.codigo || '',
    descripcion: extra.descripcion || '',
    arrendatario_nombre: c.involucrado_nombre || extra.arrendatario_nombre || 'Sin arrendatario',
    arrendatario_cedula: extra.arrendatario_cedula || '',
    arrendatario_telefono: c.involucrado_contacto || extra.arrendatario_telefono || '',
    arrendatario_email: extra.arrendatario_email || '',
    tipo_cuota: extra.tipo_cuota || 'fija',
    monto_usd: Number(c.monto_usd) || Number(extra.monto_usd) || 0,
    monto_bs: Number(c.monto_bs) || Number(extra.monto_bs) || 0,
    inicio_contrato: c.fecha || extra.inicio_contrato || new Date().toISOString().slice(0, 10),
    fin_contrato: c.fecha_vencimiento || extra.fin_contrato || undefined,
    apartamento_id: c.apartamento_id || extra.apartamento_id || null,
    apartamento_numero: aptoInfo?.numero || extra.apartamento_numero || '',
    apartamento_propietario: aptoInfo?.propietario || extra.apartamento_propietario || '',
    estado: (c.estado === 'activo' || c.estado === 'inactivo' || c.estado === 'en_mantenimiento')
      ? c.estado
      : (extra.estado || 'activo'),
    deuda_actual_usd: Number(extra.deuda_actual_usd) || 0,
    deuda_actual_bs: Number(extra.deuda_actual_bs) || 0,
    deposito_garantia_usd: Number(extra.deposito_garantia_usd) || 0,
    notas_admin: c.notas_admin || extra.notas_admin || '',
    created_at: c.created_at || extra.created_at,
    updated_at: c.updated_at || extra.updated_at
  }
}

// Convertir LocalComercial a payload de casos_comunidad
function mapLocalToCaso(local: LocalComercial) {
  const extra = {
    nombre: local.nombre,
    codigo: local.codigo,
    descripcion: local.descripcion,
    arrendatario_cedula: local.arrendatario_cedula,
    arrendatario_telefono: local.arrendatario_telefono,
    arrendatario_email: local.arrendatario_email,
    tipo_cuota: local.tipo_cuota,
    monto_usd: local.monto_usd,
    monto_bs: local.monto_bs,
    inicio_contrato: local.inicio_contrato,
    fin_contrato: local.fin_contrato,
    apartamento_id: local.apartamento_id,
    apartamento_numero: local.apartamento_numero,
    apartamento_propietario: local.apartamento_propietario,
    estado: local.estado,
    deuda_actual_usd: local.deuda_actual_usd,
    deuda_actual_bs: local.deuda_actual_bs,
    deposito_garantia_usd: local.deposito_garantia_usd,
    notas_admin: local.notas_admin
  }

  return {
    apartamento_id: local.apartamento_id || null,
    tipo: 'local_comercial',
    titulo: local.nombre,
    descripcion: JSON.stringify(extra),
    monto_usd: local.monto_usd,
    monto_bs: local.monto_bs,
    moneda: 'USD',
    estado: local.estado,
    involucrado_nombre: local.arrendatario_nombre,
    involucrado_contacto: local.arrendatario_telefono || local.arrendatario_email || null,
    fecha: local.inicio_contrato,
    fecha_vencimiento: local.fin_contrato || null,
    notas_admin: local.notas_admin || null,
    updated_at: new Date().toISOString()
  }
}

/**
 * Obtiene todos los locales registrados, combinando Supabase (casos_comunidad) y caché local
 */
export async function obtenerLocales(): Promise<LocalComercial[]> {
  try {
    // 1. Cargar mapa de apartamentos para tener siempre números y propietarios actualizados
    const { data: aptos } = await supabase
      .from('apartamentos')
      .select('id, numero, propietario_nombre')
    
    const aptoMap = new Map<string, { numero: string; propietario: string }>()
    if (aptos) {
      aptos.forEach(a => {
        aptoMap.set(a.id, {
          numero: a.numero,
          propietario: a.propietario_nombre || 'Propietario'
        })
      })
    }

    // 2. Intentar consultar casos_comunidad de tipo 'local_comercial'
    const { data, error } = await supabase
      .from('casos_comunidad')
      .select('*')
      .eq('tipo', 'local_comercial')
      .order('created_at', { ascending: true })

    if (!error && data && data.length > 0) {
      const mapeados = data.map(c => mapCasoToLocal(c, aptoMap))
      saveLocalCache(mapeados)
      return mapeados
    }

    // Si aún no hay registros en la base de datos, guardar los semilla
    if (!error && (!data || data.length === 0)) {
      const cache = getLocalCache()
      // Si la BD está vacía pero tenemos semilla o cache, intentamos sembrar en Supabase
      if (cache.length > 0) {
        for (const loc of cache) {
          try {
            // Asignar apartamento_id si coincide el número
            let aptoId = loc.apartamento_id
            if (!aptoId && loc.apartamento_numero && aptos) {
              const matchedApto = aptos.find(a => a.numero === loc.apartamento_numero)
              if (matchedApto) aptoId = matchedApto.id
            }

            const payload = mapLocalToCaso({ ...loc, apartamento_id: aptoId })
            await supabase.from('casos_comunidad').insert(payload)
          } catch (e) {
            console.warn('[localesService] Error sembrando local inicial en DB:', e)
          }
        }

        // Re-consultar
        const { data: recargados } = await supabase
          .from('casos_comunidad')
          .select('*')
          .eq('tipo', 'local_comercial')
          .order('created_at', { ascending: true })

        if (recargados && recargados.length > 0) {
          const res = recargados.map(c => mapCasoToLocal(c, aptoMap))
          saveLocalCache(res)
          return res
        }
      }
      return cache
    }
  } catch (err) {
    console.warn('[localesService] Error en obtenerLocales, usando fallback local:', err)
  }

  return getLocalCache()
}

/**
 * Crea un nuevo local en Supabase y actualiza la caché
 */
export async function crearLocal(data: Omit<LocalComercial, 'id'>): Promise<LocalComercial> {
  // Asegurar que si tiene apartamento_id, se guarde número y propietario
  let aptoNumero = data.apartamento_numero
  let aptoPropietario = data.apartamento_propietario

  if (data.apartamento_id && (!aptoNumero || !aptoPropietario)) {
    try {
      const { data: apto } = await supabase
        .from('apartamentos')
        .select('numero, propietario_nombre')
        .eq('id', data.apartamento_id)
        .maybeSingle()
      if (apto) {
        aptoNumero = apto.numero
        aptoPropietario = apto.propietario_nombre || ''
      }
    } catch (e) {
      console.warn('[localesService] Error resolviendo apartamento:', e)
    }
  }

  const nuevoLocal: LocalComercial = {
    ...data,
    id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    apartamento_numero: aptoNumero,
    apartamento_propietario: aptoPropietario,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }

  // Guardar en Supabase
  try {
    const payload = mapLocalToCaso(nuevoLocal)
    const { data: insertado, error } = await supabase
      .from('casos_comunidad')
      .insert(payload)
      .select()
      .maybeSingle()

    if (!error && insertado) {
      nuevoLocal.id = insertado.id
    }
  } catch (err) {
    console.warn('[localesService] Error al insertar en Supabase:', err)
  }

  // Actualizar cache local
  const actuales = getLocalCache()
  const actualizados = [...actuales, nuevoLocal]
  saveLocalCache(actualizados)

  return nuevoLocal
}

/**
 * Actualiza un local existente
 */
export async function actualizarLocal(id: string, patch: Partial<LocalComercial>): Promise<LocalComercial> {
  const actuales = getLocalCache()
  const idx = actuales.findIndex(l => l.id === id)
  const localPrev = idx >= 0 ? actuales[idx] : null

  // Si cambia apartamento_id, resolver datos del apartamento
  let aptoNumero = patch.apartamento_numero ?? localPrev?.apartamento_numero
  let aptoPropietario = patch.apartamento_propietario ?? localPrev?.apartamento_propietario

  if (patch.apartamento_id && patch.apartamento_id !== localPrev?.apartamento_id) {
    try {
      const { data: apto } = await supabase
        .from('apartamentos')
        .select('numero, propietario_nombre')
        .eq('id', patch.apartamento_id)
        .maybeSingle()
      if (apto) {
        aptoNumero = apto.numero
        aptoPropietario = apto.propietario_nombre || ''
      }
    } catch (e) {
      console.warn('[localesService] Error resolviendo apartamento en update:', e)
    }
  } else if (patch.apartamento_id === null) {
    aptoNumero = ''
    aptoPropietario = ''
  }

  const fusionado: LocalComercial = {
    ...(localPrev || {} as LocalComercial),
    ...patch,
    id,
    apartamento_numero: aptoNumero,
    apartamento_propietario: aptoPropietario,
    updated_at: new Date().toISOString()
  }

  // Enviar a Supabase
  try {
    const payload = mapLocalToCaso(fusionado)
    await supabase
      .from('casos_comunidad')
      .update(payload)
      .eq('id', id)
  } catch (err) {
    console.warn('[localesService] Error al actualizar en Supabase:', err)
  }

  // Guardar en cache local
  if (idx >= 0) {
    actuales[idx] = fusionado
    saveLocalCache([...actuales])
  } else {
    saveLocalCache([...actuales, fusionado])
  }

  return fusionado
}

/**
 * Elimina un local
 */
export async function eliminarLocal(id: string): Promise<boolean> {
  try {
    await supabase
      .from('casos_comunidad')
      .delete()
      .eq('id', id)
  } catch (err) {
    console.warn('[localesService] Error al eliminar de Supabase:', err)
  }

  const actuales = getLocalCache()
  const filtrados = actuales.filter(l => l.id !== id)
  saveLocalCache(filtrados)
  return true
}

/**
 * Obtiene los locales asignados a un apartamento específico
 */
export async function obtenerLocalesPorApartamento(
  apartamentoId?: string | null,
  apartamentoNumero?: string | null
): Promise<LocalComercial[]> {
  const locales = await obtenerLocales()
  return locales.filter(l => {
    if (apartamentoId && l.apartamento_id === apartamentoId) return true
    if (apartamentoNumero && l.apartamento_numero === apartamentoNumero) return true
    return false
  })
}

/**
 * Suscripción en tiempo real a cambios en los locales
 */
export function suscribirLocales(callback: (locales: LocalComercial[]) => void): () => void {
  const handler = (e: any) => {
    callback(e.detail || getLocalCache())
  }
  window.addEventListener('condominio:locales_updated', handler)

  const channelId = `realtime_locales_${Math.random().toString(36).slice(2, 7)}`
  const channel = supabase
    .channel(channelId)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'casos_comunidad' },
      async payload => {
        const item = payload.new as any || payload.old as any
        if (item?.tipo === 'local_comercial') {
          const recargados = await obtenerLocales()
          callback(recargados)
        }
      }
    )
    .subscribe()

  return () => {
    window.removeEventListener('condominio:locales_updated', handler)
    supabase.removeChannel(channel)
  }
}

