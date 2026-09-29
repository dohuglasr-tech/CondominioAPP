import { supabase } from './supabase'

export type TasaRiesgoMora = 'amarillo' | 'rojo' | 'morado'

export type AccionLegalMora =
  | 'notificacion_amistosa'
  | 'carta_cobro_extrajudicial'
  | 'citacion_junta'
  | 'suspension_servicios'
  | 'bloqueo_administrativo'
  | 'demanda_judicial'

export type MonedaMora = 'USD' | 'BS' | 'MIXTO'

export interface DeudaMoraItem {
  id: string
  apartamento_id: string
  apartamento_numero: string
  piso?: number
  propietario_nombre?: string
  propietario_cedula?: string
  propietario_telefono?: string
  meses_deuda: number
  monto_usd: number
  monto_bs: number
  moneda_principal: MonedaMora
  tasa_riesgo: TasaRiesgoMora
  accion_legal: AccionLegalMora
  estado: 'activo' | 'en_convenio' | 'solventado'
  conceptos_detalle: string
  observaciones?: string
  fecha_corte: string
  created_at?: string
  updated_at?: string
}

export const TASA_RIESGO_CONFIG: Record<
  TasaRiesgoMora,
  {
    label: string
    sublabel: string
    color: string
    colorDark: string
    bg: string
    border: string
    badgeText: string
    prioridad: number
    descripcion: string
  }
> = {
  amarillo: {
    label: 'Riesgo Moderado',
    sublabel: '3 meses de mora',
    color: '#eab308',
    colorDark: '#ca8a04',
    bg: 'rgba(234, 179, 8, 0.12)',
    border: 'rgba(234, 179, 8, 0.35)',
    badgeText: '🟡 Moderado (3m)',
    prioridad: 1,
    descripcion: 'Atraso inicial de 3 meses. Gestión administrativa directa y notificación formal preventiva.'
  },
  rojo: {
    label: 'Riesgo Alto',
    sublabel: '4 a 6 meses de mora',
    color: '#ef4444',
    colorDark: '#dc2626',
    bg: 'rgba(239, 68, 68, 0.15)',
    border: 'rgba(239, 68, 68, 0.4)',
    badgeText: '🔴 Alto Riesgo (4-6m)',
    prioridad: 2,
    descripcion: 'Morosidad prolongada de 4 a 6 meses. Cartera vencida con impacto financiero directo al condominio.'
  },
  morado: {
    label: 'Riesgo Severo / Máximo Deudor',
    sublabel: 'Más de 6 meses de mora',
    color: '#a855f7',
    colorDark: '#9333ea',
    bg: 'rgba(168, 85, 247, 0.18)',
    border: 'rgba(168, 85, 247, 0.45)',
    badgeText: '🟣 Deudor Crónico (>6m)',
    prioridad: 3,
    descripcion: 'Máximo nivel de morosidad (>6 meses). Reincidencia crítica. Sujeto a acciones legales y cobro judicial.'
  }
}

export const ACCION_LEGAL_CONFIG: Record<
  AccionLegalMora,
  {
    titulo: string
    descripcion: string
    gravedad: 'baja' | 'media' | 'alta' | 'judicial'
    icono: string
  }
> = {
  notificacion_amistosa: {
    titulo: 'Recordatorio Amistoso de Cobro',
    descripcion: 'Contacto telefónico y entrega de estado de cuenta preliminar.',
    gravedad: 'baja',
    icono: '✉️'
  },
  carta_cobro_extrajudicial: {
    titulo: 'Carta de Cobro Extrajudicial (Apercibimiento)',
    descripcion: 'Notificación escrita firmada por la Junta con plazo perentorio de 5 días hábiles.',
    gravedad: 'media',
    icono: '📜'
  },
  citacion_junta: {
    titulo: 'Citación a Reunión Extraordinaria de Junta',
    descripcion: 'Convocatoria formal y obligatoria para suscribir convenio de amortización.',
    gravedad: 'media',
    icono: '🏛️'
  },
  suspension_servicios: {
    titulo: 'Suspensión de Áreas Comunes y Servicios No Vitales',
    descripcion: 'Veto de uso para salón de fiesta, estacionamientos de visita y áreas sociales recreativas.',
    gravedad: 'alta',
    icono: '🚫'
  },
  bloqueo_administrativo: {
    titulo: 'Bloqueo Administrativo (Sin Solvencia)',
    descripcion: 'Negativa de constancia de solvencia; imposibilita venta, hipoteca o arrendamiento formal ante notaría.',
    gravedad: 'alta',
    icono: '🔒'
  },
  demanda_judicial: {
    titulo: 'Demanda por Vía Ejecutiva / Cobro Judicial (LPH Art. 14)',
    descripcion: 'Consignación de liquidación de deuda y recibos impagos ante tribunal civil competente con solicitud de medida preventiva.',
    gravedad: 'judicial',
    icono: '⚖️'
  }
}

export function calcularTasaRiesgoPorMeses(meses: number): TasaRiesgoMora {
  if (meses <= 3) return 'amarillo'
  if (meses <= 6) return 'rojo'
  return 'morado'
}

const STORAGE_MORA_KEY = 'condominio_deudas_mora_cache'

// Deudores iniciales de ejemplo representativos
const DEUDAS_SEMILLA: DeudaMoraItem[] = [
  {
    id: 'mora-518',
    apartamento_id: 'mora-apto-518',
    apartamento_numero: '518',
    piso: 3,
    propietario_nombre: 'Alejandro Morales',
    propietario_telefono: '0414-2345678',
    meses_deuda: 3,
    monto_usd: 145.50,
    monto_bs: 0,
    moneda_principal: 'USD',
    tasa_riesgo: 'amarillo',
    accion_legal: 'citacion_junta',
    estado: 'en_convenio',
    conceptos_detalle: 'Cuotas de mantenimiento ordinario Junio, Julio y Agosto 2026',
    observaciones: 'Acudió a reunión. Convenio en proceso de amortización.',
    fecha_corte: '2026-09-25'
  },
  {
    id: 'mora-504',
    apartamento_id: 'mora-apto-504',
    apartamento_numero: '504',
    piso: 1,
    propietario_nombre: 'Beatriz Salazar',
    propietario_telefono: '0424-3456789',
    meses_deuda: 5,
    monto_usd: 285.00,
    monto_bs: 2150.00,
    moneda_principal: 'MIXTO',
    tasa_riesgo: 'rojo',
    accion_legal: 'carta_cobro_extrajudicial',
    estado: 'activo',
    conceptos_detalle: '5 cuotas consecutivas impagas + cuota extraordinaria de bombas hidroneumáticas',
    observaciones: 'Segunda carta extrajudicial entregada bajo firma en conserjería.',
    fecha_corte: '2026-09-20'
  },
  {
    id: 'mora-529',
    apartamento_id: 'mora-apto-529',
    apartamento_numero: '529',
    piso: 5,
    propietario_nombre: 'Héctor Carrillo',
    propietario_telefono: '0412-9871234',
    meses_deuda: 9,
    monto_usd: 540.00,
    monto_bs: 0,
    moneda_principal: 'USD',
    tasa_riesgo: 'morado',
    accion_legal: 'suspension_servicios',
    estado: 'activo',
    conceptos_detalle: '9 meses acumulados de cuota condominial completa (Enero a Septiembre 2026)',
    observaciones: 'Suspensión de acceso a áreas sociales ejecutada. Sin respuesta a intimaciones.',
    fecha_corte: '2026-09-18'
  },
  {
    id: 'mora-5PH2',
    apartamento_id: 'mora-apto-5ph2',
    apartamento_numero: '5PH2',
    piso: 11,
    propietario_nombre: 'Inversiones Globales PH C.A.',
    propietario_telefono: '0416-5550011',
    meses_deuda: 14,
    monto_usd: 1120.00,
    monto_bs: 5800.00,
    moneda_principal: 'MIXTO',
    tasa_riesgo: 'morado',
    accion_legal: 'demanda_judicial',
    estado: 'activo',
    conceptos_detalle: 'Deuda histórica acumulada de alícuota PH (2.59%) y cuotas mayores de impermeabilización',
    observaciones: 'Expediente remitido a consultoría jurídica externa para demanda por vía ejecutiva.',
    fecha_corte: '2026-09-10'
  }
]

function getLocalMoraCache(): DeudaMoraItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_MORA_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch (e) {
    console.warn('[moraService] Error leyendo cache de deudas_mora:', e)
  }
  return DEUDAS_SEMILLA
}

function saveLocalMoraCache(list: DeudaMoraItem[]) {
  try {
    localStorage.setItem(STORAGE_MORA_KEY, JSON.stringify(list))
  } catch (e) {
    console.warn('[moraService] Error guardando cache de deudas_mora:', e)
  }
}

export async function obtenerDeudasMora(): Promise<{ data: DeudaMoraItem[]; error: string | null; fromDb: boolean }> {
  try {
    const { data: dbData, error } = await supabase
      .from('deudas_mora')
      .select('*, apartamentos(id, numero, piso, propietario_nombre, telefono_contacto)')
      .order('meses_deuda', { ascending: false })

    if (error) {
      console.info('[moraService] Usando caché local para deudas_mora:', error.message)
      return { data: getLocalMoraCache(), error: null, fromDb: false }
    }

    const mapped: DeudaMoraItem[] = (dbData || []).map((row: any) => ({
      id: row.id,
      apartamento_id: row.apartamento_id,
      apartamento_numero: row.apartamentos?.numero || 'N/D',
      piso: row.apartamentos?.piso,
      propietario_nombre: row.apartamentos?.propietario_nombre || 'N/D',
      propietario_telefono: row.apartamentos?.telefono_contacto || '',
      meses_deuda: Number(row.meses_deuda || 3),
      monto_usd: Number(row.monto_usd || 0),
      monto_bs: Number(row.monto_bs || 0),
      moneda_principal: row.moneda_principal || 'USD',
      tasa_riesgo: (row.tasa_riesgo as TasaRiesgoMora) || calcularTasaRiesgoPorMeses(Number(row.meses_deuda || 3)),
      accion_legal: (row.accion_legal as AccionLegalMora) || 'notificacion_amistosa',
      estado: row.estado || 'activo',
      conceptos_detalle: row.conceptos_detalle || '',
      observaciones: row.observaciones || '',
      fecha_corte: row.fecha_corte || new Date().toISOString().slice(0, 10),
      created_at: row.created_at,
      updated_at: row.updated_at
    }))

    saveLocalMoraCache(mapped)
    return { data: mapped, error: null, fromDb: true }
  } catch (err: any) {
    console.warn('[moraService] Excepción obteniendo deudas:', err)
    return { data: getLocalMoraCache(), error: null, fromDb: false }
  }
}

export async function guardarDeudaMora(item: Partial<DeudaMoraItem>): Promise<{ data: DeudaMoraItem | null; error: string | null }> {
  try {
    const meses = Number(item.meses_deuda || 3)
    const tasa = item.tasa_riesgo || calcularTasaRiesgoPorMeses(meses)

    const nuevoItem: DeudaMoraItem = {
      id: item.id || `mora-${Date.now()}`,
      apartamento_id: item.apartamento_id || '',
      apartamento_numero: item.apartamento_numero || '',
      piso: item.piso,
      propietario_nombre: item.propietario_nombre,
      propietario_telefono: item.propietario_telefono,
      meses_deuda: meses,
      monto_usd: Number(item.monto_usd || 0),
      monto_bs: Number(item.monto_bs || 0),
      moneda_principal: item.moneda_principal || 'USD',
      tasa_riesgo: tasa,
      accion_legal: item.accion_legal || 'notificacion_amistosa',
      estado: item.estado || 'activo',
      conceptos_detalle: item.conceptos_detalle || '',
      observaciones: item.observaciones || '',
      fecha_corte: item.fecha_corte || new Date().toISOString().slice(0, 10),
      created_at: item.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    // Actualizar cache local
    const cached = getLocalMoraCache()
    const index = cached.findIndex(
      m => m.id === nuevoItem.id || (nuevoItem.apartamento_numero && m.apartamento_numero === nuevoItem.apartamento_numero)
    )
    if (index >= 0) {
      cached[index] = nuevoItem
    } else {
      cached.unshift(nuevoItem)
    }
    // Ordenar de mayor a menor deuda
    cached.sort((a, b) => b.meses_deuda - a.meses_deuda)
    saveLocalMoraCache(cached)

    // Intentar persistir en Supabase si apartamento_id es un UUID válido
    if (nuevoItem.apartamento_id && !nuevoItem.apartamento_id.startsWith('mora-')) {
      try {
        const payload = {
          apartamento_id: nuevoItem.apartamento_id,
          meses_deuda: nuevoItem.meses_deuda,
          monto_usd: nuevoItem.monto_usd,
          monto_bs: nuevoItem.monto_bs,
          moneda_principal: nuevoItem.moneda_principal,
          tasa_riesgo: nuevoItem.tasa_riesgo,
          accion_legal: nuevoItem.accion_legal,
          estado: nuevoItem.estado,
          conceptos_detalle: nuevoItem.conceptos_detalle,
          observaciones: nuevoItem.observaciones,
          fecha_corte: nuevoItem.fecha_corte,
          updated_at: new Date().toISOString()
        }

        const { data: dbData } = await supabase
          .from('deudas_mora')
          .upsert(payload, { onConflict: 'apartamento_id' })
          .select()
          .single()

        if (dbData) {
          nuevoItem.id = dbData.id
        }
      } catch (dbErr) {
        console.info('[moraService] No se pudo guardar en DB remota (se guardó en local):', dbErr)
      }
    }

    return { data: nuevoItem, error: null }
  } catch (err: any) {
    return { data: null, error: err.message || 'Error guardando registro de mora' }
  }
}

export async function eliminarDeudaMora(id: string): Promise<{ success: boolean; error: string | null }> {
  try {
    const cached = getLocalMoraCache().filter(m => m.id !== id)
    saveLocalMoraCache(cached)

    if (!id.startsWith('mora-')) {
      await supabase.from('deudas_mora').delete().eq('id', id)
    }
    return { success: true, error: null }
  } catch (err: any) {
    return { success: false, error: err.message || 'Error eliminando registro' }
  }
}

export function buscarMoraPorApto(aptoNumeroOId: string): DeudaMoraItem | null {
  if (!aptoNumeroOId) return null
  const cache = getLocalMoraCache()
  const clean = aptoNumeroOId.trim().toUpperCase()
  return (
    cache.find(
      m =>
        m.apartamento_numero.trim().toUpperCase() === clean ||
        m.apartamento_id === aptoNumeroOId ||
        m.id === aptoNumeroOId
    ) || null
  )
}
