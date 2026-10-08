import { supabase } from './supabase'
import { appCache } from './cacheService'
import { notificarApartamento } from './notificacionesService'
import { despacharEmailPagoAprobado } from './emailService'
import { registrarEventoAuditoria } from './auditoriaService'

export type TasaRiesgoMora = 'azul' | 'amarillo' | 'rojo' | 'morado'

export type AccionLegalMora =
  | 'notificacion_amistosa'
  | 'carta_cobro_extrajudicial'
  | 'citacion_junta'
  | 'suspension_servicios'
  | 'bloqueo_administrativo'
  | 'demanda_judicial'

export type MonedaMora = 'USD' | 'BS' | 'MIXTO'

export interface DesgloseReciboItem {
  key: string
  label: string
  monto: number
  moneda: 'BS' | 'USD'
  estado: 'pendiente' | 'pagado'
}

export interface DesgloseConceptoItem {
  id: string
  label: string
  categoria: 'deuda_2025' | 'cuota_especial' | 'recibo_mes'
  monto: number
  moneda: 'BS' | 'USD'
  estado: 'pendiente' | 'pagado'
  icono?: string
  detalle?: string
}

export interface DesgloseDeudaMora {
  deuda_base_2025?: { monto: number; moneda: 'BS' | 'USD' }
  cable_viajero?: { monto: number; moneda: 'BS' | 'USD' }
  guaya?: { monto: number; moneda: 'BS' | 'USD' }
  arreglo?: { monto: number; moneda: 'BS' | 'USD' }
  recibos_bs: DesgloseReciboItem[]
  recibos_usd: DesgloseReciboItem[]
  cuotas_especiales: DesgloseConceptoItem[]
  items: DesgloseConceptoItem[]
  total_bs: number
  total_usd: number
}

export interface DeudaMoraItem {
  id: string
  apartamento_id: string
  apartamento_numero: string
  piso?: number
  propietario_nombre?: string
  propietario_cedula?: string
  propietario_telefono?: string
  propietario_email?: string
  meses_deuda: number
  monto_usd: number
  monto_bs: number
  monto_manual_usd?: number
  monto_manual_bs?: number
  moneda_principal: MonedaMora
  tasa_riesgo: TasaRiesgoMora
  accion_legal: AccionLegalMora
  estado: 'activo' | 'en_convenio' | 'solventado'
  conceptos_detalle: string
  desglose?: DesgloseDeudaMora
  observaciones?: string
  fecha_corte: string
  origen?: 'recibo_emitido' | 'deuda_manual'
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
  azul: {
    label: 'Recibo del Mes',
    sublabel: 'Menos de 1 mes (<1m)',
    color: '#3b82f6',
    colorDark: '#2563eb',
    bg: 'rgba(59, 130, 246, 0.12)',
    border: 'rgba(59, 130, 246, 0.35)',
    badgeText: '🔵 Recibo del Mes (<1m)',
    prioridad: 0,
    descripcion: 'Deuda corriente por recibo emitido del mes en curso (<1 mes de atraso). Gestión regular de cobro.'
  },
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
    descripcion: 'Contacto directo y entrega de estado de cuenta preliminar.',
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
  if (meses <= 1) return 'azul'
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

export function limpiarCacheMora() {
  try {
    localStorage.removeItem(STORAGE_MORA_KEY)
    appCache.invalidateTags(['mora'])
  } catch (e) {
    console.warn('[moraService] Error limpiando cache de mora:', e)
  }
}

function saveLocalMoraCache(list: DeudaMoraItem[]) {
  try {
    localStorage.setItem(STORAGE_MORA_KEY, JSON.stringify(list))
  } catch (e) {
    console.warn('[moraService] Error guardando cache de deudas_mora:', e)
  }
}

/**
 * Obtiene todas las deudas y moras unificadas:
 * 1. Consulta `deudas_mora` (deudas anteriores montadas manualmente / crónicas).
 * 2. Consulta `recibos_generados` donde `estado = 'pendiente'`.
 * 3. Si un apartamento SOLO debe el recibo emitido este mes (< 1 mes), se clasifica como AZUL.
 * 4. Si tiene deudas crónicas anteriores o más de 1 recibo vencido, se categoriza según los meses (Amarillo 3m, Rojo 4-6m, Morado >6m).
 *
 * Utiliza appCache (3 min TTL, deduplicación y tags) para acelerar la carga en 0 ms.
 */
export async function obtenerDeudasMora(
  forceRefresh = false,
  incluirSolventes = false
): Promise<{ data: DeudaMoraItem[]; error: string | null; fromDb: boolean }> {
  const cacheKey = incluirSolventes ? 'deudas_mora_unificadas_todos' : 'deudas_mora_unificadas'
  return appCache.fetch(
    cacheKey,
    async () => {
      try {
        const [dmRes, recibosRes, aptosRes, perfilesRes, configRes] = await Promise.all([
          supabase
            .from('deudas_mora')
            .select('*, apartamentos(id, numero, piso, propietario_nombre, telefono_contacto)'),
          supabase
            .from('recibos_generados')
            .select('id, apartamento_id, mes_facturado, total_usd, total_bs, estado, emitido_at, data_json')
            .order('mes_facturado', { ascending: true }),
          supabase
            .from('apartamentos')
            .select('id, numero, piso, propietario_nombre, telefono_contacto')
            .order('numero'),
          supabase
            .from('perfiles')
            .select('apartamento_id, nombre_completo, condicion_habitacional, propietario_nombre, telefono, propietario_email'),
          supabase
            .from('casos_comunidad')
            .select('descripcion')
            .eq('tipo', 'config_calendario_mora')
            .maybeSingle()
        ])

        // Si hubo error grave en la consulta básica de deudas_mora y tampoco hay recibos
        if (dmRes.error && recibosRes.error) {
          console.info('[moraService] Usando caché local para deudas_mora:', dmRes.error?.message)
          return { data: getLocalMoraCache(), error: null, fromDb: false }
        }

        // Mapas de ayuda
        const aptosMap = new Map<string, any>()
        ;(aptosRes.data || []).forEach(a => aptosMap.set(a.id, a))

        const perfilesMap = new Map<string, any>()
        ;(perfilesRes.data || []).forEach(p => {
          if (p.apartamento_id) {
            const exist = perfilesMap.get(p.apartamento_id)
            if (!exist || (!exist.propietario_email && p.propietario_email)) {
              perfilesMap.set(p.apartamento_id, p)
            }
          }
        })

        const moraMap = new Map<string, any>()
        ;(dmRes.data || []).forEach((row: any) => {
          if (row.apartamento_id) moraMap.set(row.apartamento_id, row)
        })

        const recibosPendientesMap = new Map<string, any[]>()
        ;(recibosRes.data || []).forEach(r => {
          if (!r.apartamento_id) return
          if (r.estado === 'pendiente') {
            if (!recibosPendientesMap.has(r.apartamento_id)) {
              recibosPendientesMap.set(r.apartamento_id, [])
            }
            recibosPendientesMap.get(r.apartamento_id)!.push(r)
          }
        })

        // Columnas o celdas personalizadas del calendario si existen
        let configCalendario: any = null
        if (configRes.data?.descripcion) {
          try {
            configCalendario = JSON.parse(configRes.data.descripcion)
          } catch (e) {}
        }

        const mesesNombres = [
          'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
          'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
        ]

        const listaDeudores: DeudaMoraItem[] = []

        // Recorrer todos los apartamentos para construir el balance exacto
        ;(aptosRes.data || []).forEach(apto => {
          const moraRow = moraMap.get(apto.id)
          const perfil = perfilesMap.get(apto.id)
          const recs = recibosPendientesMap.get(apto.id) || []

          const propNombre =
            perfil?.condicion_habitacional === 'alquilado' && perfil?.propietario_nombre
              ? perfil.propietario_nombre
              : perfil?.nombre_completo || apto.propietario_nombre || 'N/D'
          const propTel = perfil?.telefono || apto.telefono_contacto || ''
          const propEmail = perfil?.propietario_email || undefined

          // 1. Conceptos históricos de 2025
          let conceptosHist: any = {}
          if (moraRow?.conceptos_detalle) {
            try {
              if (moraRow.conceptos_detalle.startsWith('{')) {
                conceptosHist = JSON.parse(moraRow.conceptos_detalle)
              }
            } catch (e) {}
          }

          const esMoraSolventada = moraRow?.estado === 'solventado'
          const deudaBase2025 = esMoraSolventada ? 0 : Number(conceptosHist.deuda_2025 || (moraRow?.monto_bs && !conceptosHist.deuda_2025 ? moraRow.monto_bs : 0))
          const cableViajero  = esMoraSolventada ? 0 : Number(conceptosHist.cable_viajero || 0)
          const guaya         = esMoraSolventada ? 0 : Number(conceptosHist.guaya || 0)
          const arreglo       = esMoraSolventada ? 0 : Number(conceptosHist.arreglo || 0)

          const mDeuda: 'USD' | 'BS' = conceptosHist.deuda_2025_moneda || 'BS'
          const mCable: 'USD' | 'BS' = conceptosHist.cable_viajero_moneda || 'USD'
          const mGuaya: 'USD' | 'BS' = conceptosHist.guaya_moneda || 'USD'
          const mArreglo: 'USD' | 'BS' = conceptosHist.arreglo_moneda || (arreglo > 0 && arreglo < 100 ? 'USD' : 'BS')

          let sumBs = 0
          let sumUsd = 0

          if (mDeuda === 'BS') sumBs += deudaBase2025; else sumUsd += deudaBase2025
          if (mCable === 'BS') sumBs += cableViajero; else sumUsd += cableViajero
          if (mGuaya === 'BS') sumBs += guaya; else sumUsd += guaya
          if (mArreglo === 'BS') sumBs += arreglo; else sumUsd += arreglo

          const recibosBsList: DesgloseReciboItem[] = []
          const recibosUsdList: DesgloseReciboItem[] = []
          const itemsList: DesgloseConceptoItem[] = []

          // Agregar conceptos 2025 si tienen monto
          if (deudaBase2025 > 0.01) {
            itemsList.push({
              id: 'deuda_2025',
              label: 'Deuda Pasada 2025',
              categoria: 'deuda_2025',
              monto: Number(deudaBase2025.toFixed(2)),
              moneda: mDeuda,
              estado: 'pendiente',
              icono: '📌'
            })
          }
          if (cableViajero > 0.01) {
            itemsList.push({
              id: 'cable_viajero',
              label: 'Cable Viajero 2025',
              categoria: 'cuota_especial',
              monto: Number(cableViajero.toFixed(2)),
              moneda: mCable,
              estado: 'pendiente',
              icono: '🛗'
            })
          }
          if (guaya > 0.01) {
            itemsList.push({
              id: 'guaya',
              label: 'Guayas Ascensor 2025',
              categoria: 'cuota_especial',
              monto: Number(guaya.toFixed(2)),
              moneda: mGuaya,
              estado: 'pendiente',
              icono: '⛓️'
            })
          }
          if (arreglo > 0.01) {
            itemsList.push({
              id: 'arreglo',
              label: 'Arreglo Ascensor',
              categoria: 'cuota_especial',
              monto: Number(arreglo.toFixed(2)),
              moneda: mArreglo,
              estado: 'pendiente',
              icono: '🔧'
            })
          }

          // 2. Procesar recibos pendientes (distinguiendo Bolívares y Dólares)
          recs.forEach((r: any) => {
            const parts = (r.mes_facturado || '').split('-')
            const anio = parts[0]
            const mesNum = parseInt(parts[1], 10) || 1
            const label = `${mesesNombres[mesNum - 1] || parts[1]} ${anio}`
            // Enero y Febrero 2026 son en BS (o cualquier recibo emitido con solo total_bs > 0)
            const esReciboBs = (anio === '2026' && mesNum <= 2) || (Number(r.total_usd || 0) === 0 && Number(r.total_bs || 0) > 0)

            if (esReciboBs) {
              const mbs = Number(r.total_bs || 0)
              sumBs += mbs
              const recItem: DesgloseReciboItem = {
                key: r.mes_facturado,
                label,
                monto: Number(mbs.toFixed(2)),
                moneda: 'BS',
                estado: 'pendiente'
              }
              recibosBsList.push(recItem)
              itemsList.push({
                id: `rec-${r.id}`,
                label: `Recibo ${label}`,
                categoria: 'recibo_mes',
                monto: Number(mbs.toFixed(2)),
                moneda: 'BS',
                estado: 'pendiente',
                icono: '📄'
              })
            } else {
              const musd = Number(r.total_usd || 0)
              sumUsd += musd
              const recItem: DesgloseReciboItem = {
                key: r.mes_facturado,
                label,
                monto: Number(musd.toFixed(2)),
                moneda: 'USD',
                estado: 'pendiente'
              }
              recibosUsdList.push(recItem)
              itemsList.push({
                id: `rec-${r.id}`,
                label: `Recibo ${label}`,
                categoria: 'recibo_mes',
                monto: Number(musd.toFixed(2)),
                moneda: 'USD',
                estado: 'pendiente',
                icono: '💵'
              })
            }
          })

          // 3. Cuotas especiales adicionales del calendario
          const cuotasAdicionales: DesgloseConceptoItem[] = []
          if (configCalendario?.columnas) {
            const celdasPers = configCalendario.valoresCeldasPersonalizadas?.[apto.id] || {}
            configCalendario.columnas.forEach((col: any) => {
              if (col.tipo === 'cuota_especial') {
                const val = celdasPers[col.id] ?? (col.montoDefecto ? { monto: col.montoDefecto, estado: 'pendiente' } : null)
                if (val && val.estado === 'pendiente' && val.monto > 0) {
                  const mon = val.moneda || col.moneda || 'USD'
                  if (mon === 'USD') sumUsd += val.monto
                  else sumBs += val.monto
                  const cuotaItem: DesgloseConceptoItem = {
                    id: col.id,
                    label: col.titulo || 'Cuota Especial',
                    categoria: 'cuota_especial',
                    monto: Number(val.monto.toFixed(2)),
                    moneda: mon,
                    estado: 'pendiente',
                    icono: '⭐'
                  }
                  cuotasAdicionales.push(cuotaItem)
                  itemsList.push(cuotaItem)
                }
              }
            })
          }

          if (Array.isArray(configCalendario?.filasCuotasEspeciales)) {
            configCalendario.filasCuotasEspeciales.forEach((fila: any) => {
              const val = fila.valoresPorApto?.[apto.id] ?? (fila.montoDefecto ? { monto: fila.montoDefecto, estado: 'pendiente' } : null)
              if (val && val.estado === 'pendiente' && val.monto > 0) {
                const mon = fila.moneda || 'USD'
                if (mon === 'USD') sumUsd += val.monto
                else sumBs += val.monto
                const cuotaItem: DesgloseConceptoItem = {
                  id: fila.id,
                  label: fila.nombre || 'Cuota Extraordinaria',
                  categoria: 'cuota_especial',
                  monto: Number(val.monto.toFixed(2)),
                  moneda: mon,
                  estado: 'pendiente',
                  icono: '⭐'
                }
                cuotasAdicionales.push(cuotaItem)
                itemsList.push(cuotaItem)
              }
            })
          }

          const totalBs = Number(sumBs.toFixed(2))
          const totalUsd = Number(sumUsd.toFixed(2))
          const tieneDeuda = totalBs > 0.01 || totalUsd > 0.01

          // Si el usuario no pidió incluir solventes y este apto no debe nada ni tiene mora registrada activa
          if (!tieneDeuda && !incluirSolventes) {
            return
          }

          // Calcular tasa de riesgo y gravedad
          const totalConceptosImpagos = itemsList.length
          let tasa: TasaRiesgoMora = 'azul'
          if (tieneDeuda) {
            if (totalConceptosImpagos <= 1 && recs.length <= 1 && deudaBase2025 <= 0.01) {
              tasa = 'azul' // Solo recibo del mes
            } else if (totalConceptosImpagos <= 3) {
              tasa = 'amarillo'
            } else if (totalConceptosImpagos <= 6) {
              tasa = 'rojo'
            } else {
              tasa = 'morado'
            }
          }

          let accionLegal: AccionLegalMora = 'notificacion_amistosa'
          if (tasa === 'amarillo') accionLegal = 'citacion_junta'
          else if (tasa === 'rojo') accionLegal = 'carta_cobro_extrajudicial'
          else if (tasa === 'morado') accionLegal = 'suspension_servicios'

          // Generar descripción legible detallada
          const partesResumen: string[] = []
          if (deudaBase2025 > 0.01) partesResumen.push(`Deuda 2025 (${mDeuda === 'BS' ? 'Bs. ' + deudaBase2025.toLocaleString('es-VE', { minimumFractionDigits: 2 }) : '$' + deudaBase2025.toFixed(2)})`)
          if (cableViajero > 0.01) partesResumen.push(`Cable Viajero ($${cableViajero.toFixed(2)})`)
          if (guaya > 0.01) partesResumen.push(`Guayas ($${guaya.toFixed(2)})`)
          if (arreglo > 0.01) partesResumen.push(`Arreglo Asc. (${mArreglo === 'BS' ? 'Bs. ' + arreglo.toLocaleString('es-VE', { minimumFractionDigits: 2 }) : '$' + arreglo.toFixed(2)})`)
          if (recibosBsList.length > 0) partesResumen.push(`${recibosBsList.length} recibos en Bs (${recibosBsList.map(r => r.label.split(' ')[0]).join(', ')})`)
          if (recibosUsdList.length > 0) partesResumen.push(`${recibosUsdList.length} recibos en $ (${recibosUsdList.map(r => r.label.split(' ')[0]).join(', ')})`)
          if (cuotasAdicionales.length > 0) partesResumen.push(`${cuotasAdicionales.length} cuotas esp.`)

          const conceptosDetalleTexto = partesResumen.length > 0
            ? partesResumen.join(' · ')
            : (tieneDeuda ? 'Cuotas pendientes al cobro' : 'Al día / Solvente')

          listaDeudores.push({
            id: moraRow?.id || `mora-apto-${apto.id}`,
            apartamento_id: apto.id,
            apartamento_numero: apto.numero,
            piso: apto.piso,
            propietario_nombre: propNombre,
            propietario_telefono: propTel,
            propietario_email: propEmail,
            meses_deuda: Math.max(tieneDeuda ? 1 : 0, totalConceptosImpagos),
            monto_usd: totalUsd,
            monto_bs: totalBs,
            monto_manual_usd: Number((moraRow?.monto_usd || 0).toFixed(2)),
            monto_manual_bs: Number((moraRow?.monto_bs || 0).toFixed(2)),
            moneda_principal: totalBs > 0 && totalUsd > 0 ? 'MIXTO' : totalBs > 0 ? 'BS' : 'USD',
            tasa_riesgo: tasa,
            accion_legal: accionLegal,
            estado: tieneDeuda ? 'activo' : 'solventado',
            conceptos_detalle: conceptosDetalleTexto,
            observaciones: moraRow?.observaciones || '',
            fecha_corte: moraRow?.fecha_corte || new Date().toISOString().slice(0, 10),
            origen: moraRow ? 'deuda_manual' : 'recibo_emitido',
            created_at: moraRow?.created_at || recs[0]?.emitido_at || new Date().toISOString(),
            updated_at: moraRow?.updated_at || new Date().toISOString(),
            desglose: {
              deuda_base_2025: deudaBase2025 > 0 ? { monto: deudaBase2025, moneda: mDeuda } : undefined,
              cable_viajero: cableViajero > 0 ? { monto: cableViajero, moneda: mCable } : undefined,
              guaya: guaya > 0 ? { monto: guaya, moneda: mGuaya } : undefined,
              arreglo: arreglo > 0 ? { monto: arreglo, moneda: mArreglo } : undefined,
              recibos_bs: recibosBsList,
              recibos_usd: recibosUsdList,
              cuotas_especiales: cuotasAdicionales,
              items: itemsList,
              total_bs: totalBs,
              total_usd: totalUsd
            }
          })
        })

        // Ordenar: primero los morosos de mayor riesgo a menor, luego solventes, y luego por número de apartamento
        listaDeudores.sort((a, b) => {
          const deudaA = (a.monto_usd || 0) > 0 || (a.monto_bs || 0) > 0 ? 1 : 0
          const deudaB = (b.monto_usd || 0) > 0 || (b.monto_bs || 0) > 0 ? 1 : 0
          if (deudaB !== deudaA) return deudaB - deudaA

          const prioA = TASA_RIESGO_CONFIG[a.tasa_riesgo]?.prioridad ?? 0
          const prioB = TASA_RIESGO_CONFIG[b.tasa_riesgo]?.prioridad ?? 0
          if (prioB !== prioA) return prioB - prioA

          return a.apartamento_numero.localeCompare(b.apartamento_numero, undefined, { numeric: true })
        })

        saveLocalMoraCache(listaDeudores)
        return { data: listaDeudores, error: null, fromDb: true }
      } catch (err: any) {
        console.warn('[moraService] Excepción obteniendo deudas:', err)
        return { data: getLocalMoraCache(), error: null, fromDb: false }
      }
    },
    { ttlMs: 3 * 60 * 1000, tags: ['mora'], forceRefresh }
  )
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

    // Asegurar que si hay deuda positiva, el estado no sea 'solventado'
    const estadoFinal = (Number(nuevoItem.monto_usd || 0) > 0.05 || Number(nuevoItem.monto_bs || 0) > 0.05) && nuevoItem.estado === 'solventado'
      ? 'activo'
      : (nuevoItem.estado || 'activo')
    nuevoItem.estado = estadoFinal

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
          estado: estadoFinal,
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

    // Invalidar inmediatamente la caché de mora
    appCache.invalidateTags(['mora', 'recibos'])

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

    // Invalidar inmediatamente la caché de mora
    appCache.invalidateTags(['mora', 'recibos'])

    return { success: true, error: null }
  } catch (err: any) {
    return { success: false, error: err.message || 'Error eliminando registro' }
  }
}

export function buscarMoraPorApto(aptoNumeroOId: string): DeudaMoraItem | null {
  if (!aptoNumeroOId) return null
  const cache = getLocalMoraCache()
  const clean = aptoNumeroOId.trim().toUpperCase().replace(/^APTO\.?\s*/i, '')
  return (
    cache.find(m => {
      const mApto = (m.apartamento_numero || '').trim().toUpperCase().replace(/^APTO\.?\s*/i, '')
      return (
        mApto === clean ||
        m.apartamento_id === aptoNumeroOId ||
        m.id === aptoNumeroOId ||
        m.id === `recibo-mora-${aptoNumeroOId}`
      )
    }) || null
  )
}

export async function obtenerMoraPorApto(aptoNumeroOId: string): Promise<DeudaMoraItem | null> {
  if (!aptoNumeroOId) return null
  await obtenerDeudasMora()
  return buscarMoraPorApto(aptoNumeroOId)
}

/**
 * Determina el piso de un apartamento (del '1' al '10' o 'PH')
 * Funciona tanto con el valor de la base de datos como infiriéndolo de la nomenclatura
 */
export function obtenerPisoApto(aptoNumero: string, pisoDb?: number, totalPisos: number = 10): string {
  if (pisoDb !== undefined && pisoDb !== null) {
    if (pisoDb > totalPisos || pisoDb === 11) return 'PH'
    if (pisoDb >= 1 && pisoDb <= totalPisos) return String(pisoDb)
  }

  const clean = (aptoNumero || '').trim().toUpperCase()
  if (clean.includes('PH')) return 'PH'
  if (clean.startsWith('510')) return '10'
  const match = clean.match(/^5(\d)\d$/)
  if (match) {
    const digit = parseInt(match[1], 10)
    if (digit === 0) return '1'
    return String(digit)
  }
  const matchGen = clean.match(/^(\d{1,2})\d{2}$/)
  if (matchGen) {
    const p = parseInt(matchGen[1], 10)
    if (p >= 1 && p <= totalPisos) return String(p)
  }

  return '1'
}

export interface MarcarDeudaPagadaParams {
  deudaId?: string
  apartamentoId: string
  apartamentoNumero: string
  montoUsd: number
  montoBs: number
  fechaPago: string
  metodoPago: string
  referencia: string
  notas?: string
  adminNombre?: string
  adminEmail?: string | null
  notificarEmail?: boolean
  emailPropietario?: string | null
  nombrePropietario?: string | null
  edificioNombre?: string
}

/**
 * Marca una deuda de mora como pagada y solventada en todo el sistema:
 * 1. Actualiza `deudas_mora` a 'solventado' y saldo en 0.
 * 2. Si hay recibos emitidos pendientes, los marca como 'pagado' con info de pago.
 * 3. Si no hay recibos generados (deuda histórica manual), genera el recibo oficial de pago de deuda atrasada.
 * 4. Inserta el pago aprobado en `pagos_reportados` para historial residente.
 * 5. Notifica in-app al residente en `notificaciones`.
 * 6. Envía correo formal con constancia de pago y solvencia al residente (si tiene email).
 * 7. Asienta el evento en `auditoria`.
 * 8. Invalida todas las cachés asociadas para sincronización instantánea en 0ms.
 */
export async function marcarDeudaMoraComoPagada(
  params: MarcarDeudaPagadaParams
): Promise<{ success: boolean; reciboId?: string; error: string | null }> {
  try {
    const {
      deudaId,
      apartamentoId,
      apartamentoNumero,
      montoUsd,
      montoBs,
      fechaPago,
      metodoPago,
      referencia,
      notas,
      adminNombre,
      adminEmail,
      notificarEmail,
      emailPropietario,
      nombrePropietario,
      edificioNombre
    } = params

    // 1. Resolver el UUID real de apartamento
    let realAptoId = apartamentoId
    let aptoInfo: any = null

    if (!realAptoId || realAptoId.startsWith('mora-') || realAptoId.startsWith('apto-') || realAptoId.startsWith('recibo-')) {
      const { data: aptoRow } = await supabase
        .from('apartamentos')
        .select('id, numero, alicuota, piso, propietario_nombre')
        .eq('numero', apartamentoNumero)
        .maybeSingle()
      if (aptoRow) {
        realAptoId = aptoRow.id
        aptoInfo = aptoRow
      }
    } else {
      const { data: aptoRow } = await supabase
        .from('apartamentos')
        .select('id, numero, alicuota, piso, propietario_nombre')
        .eq('id', realAptoId)
        .maybeSingle()
      if (aptoRow) {
        aptoInfo = aptoRow
      }
    }

    // 2. Solventar en deudas_mora
    try {
      if (deudaId && !deudaId.startsWith('mora-') && !deudaId.startsWith('recibo-')) {
        await supabase
          .from('deudas_mora')
          .update({
            estado: 'solventado',
            monto_usd: 0,
            monto_bs: 0,
            observaciones: `Solventado el ${fechaPago}. Ref: ${referencia || 'N/A'}${notas ? ` · ${notas}` : ''}`,
            updated_at: new Date().toISOString()
          })
          .eq('id', deudaId)
      } else if (realAptoId) {
        await supabase
          .from('deudas_mora')
          .update({
            estado: 'solventado',
            monto_usd: 0,
            monto_bs: 0,
            observaciones: `Solventado el ${fechaPago}. Ref: ${referencia || 'N/A'}${notas ? ` · ${notas}` : ''}`,
            updated_at: new Date().toISOString()
          })
          .eq('apartamento_id', realAptoId)
      }
    } catch (eMora) {
      console.warn('[moraService] Aviso al actualizar deudas_mora:', eMora)
    }

    // Actualizar cache local
    const cached = getLocalMoraCache()
    const idx = cached.findIndex(
      m => m.id === deudaId || (realAptoId && m.apartamento_id === realAptoId) || m.apartamento_numero === apartamentoNumero
    )
    if (idx >= 0) {
      cached.splice(idx, 1)
      saveLocalMoraCache(cached)
    }

    // 3. Sincronizar en recibos_generados
    let reciboFinalId: string | undefined = undefined
    if (realAptoId) {
      const { data: recsPendientes } = await supabase
        .from('recibos_generados')
        .select('*')
        .eq('apartamento_id', realAptoId)
        .eq('estado', 'pendiente')

      if (recsPendientes && recsPendientes.length > 0) {
        // Actualizar todos los recibos pendientes a pagado con la información del pago
        for (const r of recsPendientes) {
          reciboFinalId = r.id
          const prevJson = (r.data_json && typeof r.data_json === 'object') ? r.data_json : {}
          await supabase
            .from('recibos_generados')
            .update({
              estado: 'pagado',
              data_json: {
                ...prevJson,
                pago_info: {
                  estado: 'pagado',
                  fecha_pago: fechaPago,
                  banco: metodoPago,
                  referencia: referencia || 'PAGO-DEUDA-ATRASADA',
                  monto_usd: montoUsd,
                  monto_bs: montoBs,
                  notas: notas || 'Deuda atrasada solventada por la administración'
                }
              }
            })
            .eq('id', r.id)
        }
      } else {
        // No había recibos emitidos en el sistema (deuda histórica manual anterior a emisión)
        // Crear un recibo oficial en recibos_generados para que el residente tenga su constancia descargable
        const mesFacturado = fechaPago ? `${fechaPago.slice(0, 7)}-01` : '2026-08-01'
        const tasaEquiv = (montoUsd > 0 && montoBs > 0) ? parseFloat((montoBs / montoUsd).toFixed(4)) : 0

        const nuevoRecibo = {
          apartamento_id: realAptoId,
          mes_facturado: mesFacturado,
          tasa_bcv: tasaEquiv,
          total_gastos_usd: montoUsd,
          alicuota: aptoInfo?.alicuota || 1.59,
          subtotal_usd: montoUsd,
          fondo_reserva_pct: 0,
          fondo_reserva_usd: 0,
          cargos_extra_usd: 0,
          total_usd: montoUsd,
          total_bs: montoBs,
          estado: 'pagado',
          data_json: {
            es_recibo_deuda_atrasada: true,
            titulo_recibo: 'Recibo de Pago de Deuda Atrasada',
            gastos: [
              {
                descripcion: `Liquidación de deuda atrasada histórica (${metodoPago})`,
                monto_usd: montoUsd,
                monto_bs: montoBs,
                categoria: 'Deuda Atrasada'
              }
            ],
            cargos_especiales: [],
            pago_info: {
              estado: 'pagado',
              fecha_pago: fechaPago,
              banco: metodoPago,
              referencia: referencia || 'PAGO-DEUDA-ATRASADA',
              monto_usd: montoUsd,
              monto_bs: montoBs,
              notas: notas || 'Cancelación total de deuda histórica conciliada'
            },
            notas_residentes: 'RECIBO DE PAGO DE DEUDA ATRASADA Y CONSTANCIA DE SOLVENCIA. CONCILIADO CON ÉXITO POR LA ADMINISTRACIÓN.'
          },
          emitido_at: new Date().toISOString()
        }

        const { data: recExist } = await supabase
          .from('recibos_generados')
          .select('id')
          .eq('apartamento_id', nuevoRecibo.apartamento_id)
          .eq('mes_facturado', nuevoRecibo.mes_facturado)
          .maybeSingle()

        if (recExist?.id) {
          await supabase
            .from('recibos_generados')
            .update(nuevoRecibo)
            .eq('id', recExist.id)
          reciboFinalId = recExist.id
        } else {
          const { data: recCreated, error: errRecCreated } = await supabase
            .from('recibos_generados')
            .insert(nuevoRecibo)
            .select('id')
            .maybeSingle()
          if (recCreated) {
            reciboFinalId = recCreated.id
          } else if (errRecCreated) {
            console.warn('[moraService] Aviso al insertar recibo de deuda atrasada:', errRecCreated.message)
          }
        }
      }
    }

    // 4. Registrar en pagos_reportados como aprobado
    if (realAptoId) {
      try {
        let metodoNorm: 'transferencia_bs' | 'pago_movil' | 'efectivo_usd' | 'efectivo_bs' | 'zelle' | 'otro' = 'transferencia_bs'
        const mLow = (metodoPago || '').toLowerCase()
        if (mLow.includes('movil')) metodoNorm = 'pago_movil'
        else if (mLow.includes('efectivo')) metodoNorm = 'efectivo_usd'
        else if (mLow.includes('zelle')) metodoNorm = 'zelle'
        else if (mLow.includes('transferencia')) metodoNorm = 'transferencia_bs'
        else metodoNorm = 'otro'

        await supabase.from('pagos_reportados').insert({
          apartamento_id: realAptoId,
          monto_bs: montoBs,
          monto_usd: montoUsd,
          referencia: referencia || 'PAGO-DEUDA-ATRASADA',
          metodo: metodoNorm,
          estado: 'aprobado',
          fecha_pago: fechaPago,
          notas_admin: `Banco/Canal: ${metodoPago}. Liquidación de deuda atrasada. Validado por Administración. Ref: ${referencia}. ${notas ? `Notas: ${notas}` : ''}`
        })
      } catch (errP) {
        console.warn('[moraService] Aviso registrando pago en pagos_reportados:', errP)
      }
    }

    // 5. Notificación in-app al residente
    if (realAptoId) {
      notificarApartamento({
        apartamento_id: realAptoId,
        tipo: 'pago_aprobado',
        titulo: `✅ Recibo de Pago de Deuda Atrasada — Apto ${apartamentoNumero}`,
        cuerpo: `Se ha registrado y validado el pago de tu deuda atrasada por $ ${montoUsd.toFixed(2)} USD (Bs. ${montoBs.toFixed(2)}). Tu recibo de pago y constancia de solvencia ya están disponibles para descargar en el panel.`,
        link: '/recibos'
      }).catch(err => console.warn('[moraService] Error creando notificación:', err))
    }

    // 6. Despacho por Correo Electrónico si está solicitado
    if (notificarEmail && emailPropietario && emailPropietario.includes('@')) {
      despacharEmailPagoAprobado({
        destinatarioEmail: emailPropietario,
        apartamentoNumero,
        propietarioNombre: nombrePropietario || aptoInfo?.propietario_nombre,
        edificioNombre: edificioNombre || 'Residencias Ocutuy 5',
        montoUsd,
        montoBs,
        referencia: referencia || 'PAGO-DEUDA-ATRASADA',
        fechaPago,
        bancoOrigen: metodoPago
      }).catch(err => console.warn('[moraService] Error despachando correo de pago aprobado:', err))
    }

    // 7. Registro de auditoría administrativa
    registrarEventoAuditoria({
      tipo_accion: 'PAGO_DEUDA_ATRASADA',
      titulo: `Pago de Deuda Atrasada Solventado - Apto ${apartamentoNumero}`,
      descripcion: `El administrador solventó y registró el pago de la deuda en mora del apartamento ${apartamentoNumero}. Monto: $ ${montoUsd} USD (Bs. ${montoBs}) · Método: ${metodoPago} · Ref: ${referencia || 'N/A'}.`,
      apartamento_numero: apartamentoNumero,
      apartamento_id: realAptoId,
      monto_usd: montoUsd,
      monto_bs: montoBs,
      motivo: notas || 'Pago y solventación de deuda anterior en mora',
      autor_nombre: adminNombre || 'Administrador',
      autor_email: adminEmail || null
    }).catch(err => console.warn('[moraService] Error registrando auditoría:', err))

    // 8. Invalidación global de cachés
    limpiarCacheMora()
    appCache.invalidateTags(['mora', 'recibos', 'pagos', 'apartamentos', 'auditoria', 'saldos'])

    return { success: true, reciboId: reciboFinalId, error: null }
  } catch (err: any) {
    console.error('[moraService] Error en marcarDeudaMoraComoPagada:', err)
    return { success: false, error: err.message || 'Error al procesar el pago de la deuda' }
  }
}

