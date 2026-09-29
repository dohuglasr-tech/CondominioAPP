import { supabase } from './supabase'

export type TipoCaso = 'multa' | 'acuerdo_pago' | 'alquiler_local' | 'asignacion' | 'ingreso_externo'
export type EstadoCaso = 'abierto' | 'en_proceso' | 'resuelto' | 'cancelado'
export type MonedaCaso = 'USD' | 'BS' | 'MIXTO'

export interface CasoComunidad {
  id: string
  apartamento_id?: string | null
  apartamento_numero?: string
  tipo: TipoCaso
  titulo: string
  descripcion: string
  monto_usd: number
  monto_bs: number
  moneda: MonedaCaso
  estado: EstadoCaso
  involucrado_nombre?: string
  involucrado_contacto?: string
  fecha: string
  fecha_vencimiento?: string
  comprobante_url?: string
  notas_admin?: string
  created_at?: string
  updated_at?: string
}

export const TIPO_CASO_INFO: Record<TipoCaso, { label: string; icon: string; color: string; desc: string }> = {
  multa: {
    label: 'Multa o Sanción',
    icon: '🚨',
    color: '#ef4444',
    desc: 'Sanciones por ruidos molestos, áreas comunes, basura o convivencia'
  },
  acuerdo_pago: {
    label: 'Acuerdo de Pago',
    icon: '🤝',
    color: '#3b82f6',
    desc: 'Convenios de pago fraccionado para amortizar deudas acumuladas'
  },
  alquiler_local: {
    label: 'Alquiler de Locales / Áreas',
    icon: '🏢',
    color: '#10b981',
    desc: 'Renta de locales comerciales, salón de fiesta o puestos adicionales'
  },
  asignacion: {
    label: 'Asignación de Espacio / Activo',
    icon: '🏷️',
    color: '#f59e0b',
    desc: 'Asignación formal de puestos de estacionamiento, depósitos o llaves'
  },
  ingreso_externo: {
    label: 'Ingreso Externo del Edificio',
    icon: '📡',
    color: '#8b5cf6',
    desc: 'Renta de antenas en azotea, vallas publicitarias o aportes especiales'
  }
}

export const ESTADO_CASO_INFO: Record<EstadoCaso, { label: string; color: string; bg: string }> = {
  abierto: { label: 'Abierto', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
  en_proceso: { label: 'En Proceso', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)' },
  resuelto: { label: 'Cobrado / Resuelto', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' },
  cancelado: { label: 'Cancelado', color: '#71717a', bg: 'rgba(113, 113, 122, 0.15)' }
}

const STORAGE_KEY = 'condominio_casos_comunidad_cache'

// Casos semilla representativos para el edificio
const CASOS_SEMILLA: CasoComunidad[] = [
  {
    id: 'caso-1',
    apartamento_numero: '504',
    tipo: 'multa',
    titulo: 'Multa por ruido excesivo en horario nocturno',
    descripcion: 'Reiteradas quejas de vecinos por fiesta fuera del horario permitido (LPH Art. 21). Se aplicó sanción acordada en asamblea.',
    monto_usd: 35,
    monto_bs: 0,
    moneda: 'USD',
    estado: 'abierto',
    involucrado_nombre: 'Propietario Apto 504',
    involucrado_contacto: '0414-1234567',
    fecha: '2026-09-20',
    fecha_vencimiento: '2026-10-05',
    notas_admin: 'Notificado vía correo y comunicación impresa en conserjería.',
    created_at: '2026-09-20T10:00:00Z'
  },
  {
    id: 'caso-2',
    apartamento_numero: '518',
    tipo: 'acuerdo_pago',
    titulo: 'Convenio de pago diferido (3 meses de mora)',
    descripcion: 'Compromiso de pago en 3 cuotas quincenales de $50 para solventar deuda de meses anteriores.',
    monto_usd: 150,
    monto_bs: 0,
    moneda: 'USD',
    estado: 'en_proceso',
    involucrado_nombre: 'Residente Apto 518',
    involucrado_contacto: '0424-9876543',
    fecha: '2026-09-15',
    fecha_vencimiento: '2026-10-30',
    notas_admin: '1era cuota abonada el 20/09. Pendiente 2da cuota el 05/10.',
    created_at: '2026-09-15T14:30:00Z'
  },
  {
    id: 'caso-3',
    apartamento_numero: 'Área Común',
    tipo: 'alquiler_local',
    titulo: 'Alquiler del Salón de Fiesta - Evento Infantil',
    descripcion: 'Reserva para evento familiar de 2:00 PM a 9:00 PM. Incluye depósito de garantía de $30 retornable tras inspección.',
    monto_usd: 60,
    monto_bs: 0,
    moneda: 'USD',
    estado: 'resuelto',
    involucrado_nombre: 'Familia Mendoza (Apto 521)',
    involucrado_contacto: '0412-5551234',
    fecha: '2026-09-25',
    notas_admin: 'Cobrado y verificado en cuenta. Área entregada limpia.',
    created_at: '2026-09-25T11:00:00Z'
  },
  {
    id: 'caso-4',
    apartamento_numero: 'Externo',
    tipo: 'ingreso_externo',
    titulo: 'Canon mensual por antena repetidora en Azotea',
    descripcion: 'Pago mensual de telecomunicaciones correspondiente al contrato anual de alquiler de espacio en azotea.',
    monto_usd: 250,
    monto_bs: 0,
    moneda: 'USD',
    estado: 'resuelto',
    involucrado_nombre: 'Operadora Telecom Redes C.A.',
    involucrado_contacto: 'administracion@operadora.com',
    fecha: '2026-09-05',
    notas_admin: 'Ingreso directo al fondo de reserva del condominio.',
    created_at: '2026-09-05T09:00:00Z'
  },
  {
    id: 'caso-5',
    apartamento_numero: '5PH1',
    tipo: 'asignacion',
    titulo: 'Asignación y canon de 2do puesto de estacionamiento (E-14)',
    descripcion: 'Asignación temporal de puesto de estacionamiento común desocupado en sótano 1 bajo régimen de canon mensual.',
    monto_usd: 25,
    monto_bs: 0,
    moneda: 'USD',
    estado: 'en_proceso',
    involucrado_nombre: 'Propietario 5PH1',
    involucrado_contacto: '0416-7778899',
    fecha: '2026-09-01',
    notas_admin: 'Se suma a la cobranza mensual del apartamento.',
    created_at: '2026-09-01T08:00:00Z'
  }
]

function getLocalCache(): CasoComunidad[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch (e) {
    console.warn('[casosService] Error reading localStorage cache:', e)
  }
  return CASOS_SEMILLA
}

function saveLocalCache(casos: CasoComunidad[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(casos))
  } catch (e) {
    console.warn('[casosService] Error saving localStorage cache:', e)
  }
}

export async function obtenerCasos(): Promise<{ data: CasoComunidad[]; error: string | null; fromDb: boolean }> {
  try {
    const { data: dbData, error } = await supabase
      .from('casos_comunidad')
      .select('*, apartamentos(numero)')
      .order('created_at', { ascending: false })

    if (error) {
      console.info('[casosService] Usando caché local para casos_comunidad:', error.message)
      const cached = getLocalCache()
      return { data: cached, error: null, fromDb: false }
    }

    const mapped: CasoComunidad[] = (dbData || []).map((row: any) => ({
      id: row.id,
      apartamento_id: row.apartamento_id,
      apartamento_numero: row.apartamentos?.numero || row.involucrado_nombre || 'N/D',
      tipo: row.tipo,
      titulo: row.titulo,
      descripcion: row.descripcion || '',
      monto_usd: Number(row.monto_usd || 0),
      monto_bs: Number(row.monto_bs || 0),
      moneda: row.moneda || 'USD',
      estado: row.estado || 'abierto',
      involucrado_nombre: row.involucrado_nombre || '',
      involucrado_contacto: row.involucrado_contacto || '',
      fecha: row.fecha || new Date().toISOString().slice(0, 10),
      fecha_vencimiento: row.fecha_vencimiento,
      comprobante_url: row.comprobante_url,
      notas_admin: row.notas_admin,
      created_at: row.created_at,
      updated_at: row.updated_at
    }))

    saveLocalCache(mapped)
    return { data: mapped, error: null, fromDb: true }
  } catch (err: any) {
    console.warn('[casosService] Excepción obteniendo casos:', err)
    return { data: getLocalCache(), error: null, fromDb: false }
  }
}

export async function guardarCaso(caso: Partial<CasoComunidad>): Promise<{ data: CasoComunidad | null; error: string | null }> {
  try {
    const id = caso.id || `caso-${Date.now()}`
    const nuevoCaso: CasoComunidad = {
      id,
      apartamento_id: caso.apartamento_id || null,
      apartamento_numero: caso.apartamento_numero || 'Área Común / Externo',
      tipo: caso.tipo || 'multa',
      titulo: caso.titulo || 'Caso sin título',
      descripcion: caso.descripcion || '',
      monto_usd: Number(caso.monto_usd || 0),
      monto_bs: Number(caso.monto_bs || 0),
      moneda: caso.moneda || 'USD',
      estado: caso.estado || 'abierto',
      involucrado_nombre: caso.involucrado_nombre || '',
      involucrado_contacto: caso.involucrado_contacto || '',
      fecha: caso.fecha || new Date().toISOString().slice(0, 10),
      fecha_vencimiento: caso.fecha_vencimiento || undefined,
      comprobante_url: caso.comprobante_url || undefined,
      notas_admin: caso.notas_admin || '',
      created_at: caso.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    // Actualizar cache local
    const cached = getLocalCache()
    const index = cached.findIndex(c => c.id === id)
    if (index >= 0) {
      cached[index] = nuevoCaso
    } else {
      cached.unshift(nuevoCaso)
    }
    saveLocalCache(cached)

    // Intentar persistir en Supabase
    try {
      const payload: any = {
        apartamento_id: nuevoCaso.apartamento_id || null,
        tipo: nuevoCaso.tipo,
        titulo: nuevoCaso.titulo,
        descripcion: nuevoCaso.descripcion,
        monto_usd: nuevoCaso.monto_usd,
        monto_bs: nuevoCaso.monto_bs,
        moneda: nuevoCaso.moneda,
        estado: nuevoCaso.estado,
        involucrado_nombre: nuevoCaso.involucrado_nombre,
        involucrado_contacto: nuevoCaso.involucrado_contacto,
        fecha: nuevoCaso.fecha,
        fecha_vencimiento: nuevoCaso.fecha_vencimiento || null,
        comprobante_url: nuevoCaso.comprobante_url || null,
        notas_admin: nuevoCaso.notas_admin || null,
        updated_at: new Date().toISOString()
      }

      if (caso.id && !caso.id.startsWith('caso-')) {
        await supabase.from('casos_comunidad').update(payload).eq('id', caso.id)
      } else {
        const { data: dbInsert } = await supabase.from('casos_comunidad').insert(payload).select().single()
        if (dbInsert) {
          nuevoCaso.id = dbInsert.id
        }
      }
    } catch (dbErr) {
      console.info('[casosService] No se pudo guardar en DB remota (se guardó en local):', dbErr)
    }

    return { data: nuevoCaso, error: null }
  } catch (err: any) {
    return { data: null, error: err.message || 'Error guardando caso' }
  }
}

export async function eliminarCaso(id: string): Promise<{ success: boolean; error: string | null }> {
  try {
    const cached = getLocalCache().filter(c => c.id !== id)
    saveLocalCache(cached)

    if (!id.startsWith('caso-')) {
      await supabase.from('casos_comunidad').delete().eq('id', id)
    }
    return { success: true, error: null }
  } catch (err: any) {
    return { success: false, error: err.message || 'Error eliminando caso' }
  }
}
