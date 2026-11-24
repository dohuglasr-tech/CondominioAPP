import { supabase } from './supabase'
import { registrarEventoAuditoria } from './auditoriaService'
import { notificarTodos } from './notificacionesService'
import {
  CategoriaComunicadoGlobal,
  generarHtmlNotificacionGlobal
} from './emailService'

export type OrigenAudienciaGlobal = 'bd' | 'ultimo_recibo' | 'excel'

export interface DestinatarioGlobal {
  email: string
  nombre: string
  apartamentos: string[]
  apartamentoIds: string[]
  piso?: number | null
  origen?: 'bd' | 'ultimo_recibo' | 'excel' | 'manual'
}

export interface AptoSinCorreo {
  apartamentoId: string
  numero: string
  propietario: string
  piso?: number | null
}

export interface ResumenAudienciaGlobal {
  destinatarios: DestinatarioGlobal[]
  sinCorreo: AptoSinCorreo[]
  totalApartamentosActivos: number
}

export interface ResumenUltimoReciboEmails {
  destinatarios: DestinatarioGlobal[]
  mesReferencia: string | null
  fechaEnvio: string | null
  fuente: 'registro_envio' | 'auditoria' | 'ultimo_mes_emitido' | 'ninguno'
  notaFuente: string
}

export interface ResultadoExcelCorreos {
  destinatarios: DestinatarioGlobal[]
  totalFilas: number
  descartados: number
  duplicados: number
  error?: string
}

export interface HistorialNotificacionGlobal {
  id: string
  asunto: string
  cuerpo: string
  categoria: CategoriaComunicadoGlobal
  totalDestinatarios: number
  enviados: number
  fallidos: number
  errores: Array<{ email: string; error: string }>
  remitenteNombre: string
  remitenteEmail?: string
  modoEnvio: 'bcc_lotes' | 'individual_lotes'
  notificadoEnApp: boolean
  incluirBotonPortal?: boolean
  origenAudiencia?: OrigenAudienciaGlobal
  destinatariosEmails?: string[]
  fechaEnvio: string
}

export interface ProgresoEnvioGlobal {
  procesados: number
  total: number
  enviados: number
  fallidos: number
  loteActual: number
  totalLotes: number
}

const TIPO_COMUNICADO_GLOBAL = 'comunicado_global_email'
const TIPO_ULTIMO_ENVIO_RECIBOS = 'config_ultimo_envio_recibos_emails'
const LOCAL_KEY_ULTIMO_ENVIO_RECIBOS = 'domus_ultimo_envio_recibos_emails_v1'

function normalizarCadenaApto(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/^(apto|apartamento|unidad|inmueble|depto|piso)[\s.\-]*/i, '')
    .replace(/[^a-z0-9]/gi, '')
}

function esEmailValido(email?: string | null): boolean {
  if (!email || typeof email !== 'string') return false
  const clean = email.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)
}

function extraerEmailsDeTexto(raw: unknown): string[] {
  const txt = String(raw || '').trim()
  if (!txt || !txt.includes('@')) return []
  return txt
    .split(/[\s,;]+/)
    .map(p => p.trim().replace(/^[<("']+|[>)"']+$/g, '').toLowerCase())
    .filter(esEmailValido)
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Recopila y deduplica todos los correos electrónicos válidos asociados a apartamentos activos.
 */
export async function obtenerDestinatariosActivosGlobal(
  incluirDesocupados: boolean = false
): Promise<ResumenAudienciaGlobal> {
  const [aptosRes, perfilesRes] = await Promise.all([
    supabase
      .from('apartamentos')
      .select('*')
      .order('numero'),
    supabase
      .from('perfiles')
      .select('id, apartamento_id, nombre_completo, propietario_nombre, propietario_email, email, condicion_habitacional, rol')
  ])

  const aptos = (aptosRes.data || []).filter((a: any) => {
    if (incluirDesocupados) return true
    return String(a.estado || '').toLowerCase() !== 'desocupado'
  })

  const perfilesPorApto = new Map<string, any[]>()
  ;(perfilesRes.data || []).forEach((p: any) => {
    if (!p.apartamento_id) return
    const list = perfilesPorApto.get(p.apartamento_id) || []
    list.push(p)
    perfilesPorApto.set(p.apartamento_id, list)
  })

  const mapaEmails = new Map<string, DestinatarioGlobal>()
  const sinCorreo: AptoSinCorreo[] = []

  aptos.forEach((a: any) => {
    const perfilesApto = perfilesPorApto.get(a.id) || []
    const emailsApto = new Set<string>()
    let nombrePrincipal = a.propietario_nombre || 'Propietario'

    if (esEmailValido(a.propietario_email)) {
      emailsApto.add(String(a.propietario_email).trim().toLowerCase())
    }

    perfilesApto.forEach((p: any) => {
      if (p.propietario_nombre && p.condicion_habitacional === 'alquilado') {
        nombrePrincipal = p.propietario_nombre
      } else if (p.nombre_completo && nombrePrincipal === 'Propietario') {
        nombrePrincipal = p.nombre_completo
      }
      if (esEmailValido(p.propietario_email)) {
        emailsApto.add(String(p.propietario_email).trim().toLowerCase())
      }
      if (esEmailValido(p.email)) {
        emailsApto.add(String(p.email).trim().toLowerCase())
      }
    })

    if (emailsApto.size === 0) {
      sinCorreo.push({
        apartamentoId: a.id,
        numero: String(a.numero || 'S/N'),
        propietario: nombrePrincipal,
        piso: a.piso ?? null
      })
      return
    }

    emailsApto.forEach(email => {
      const existing = mapaEmails.get(email)
      if (existing) {
        if (!existing.apartamentos.includes(a.numero)) existing.apartamentos.push(a.numero)
        if (!existing.apartamentoIds.includes(a.id)) existing.apartamentoIds.push(a.id)
      } else {
        mapaEmails.set(email, {
          email,
          nombre: nombrePrincipal,
          apartamentos: [String(a.numero || 'S/N')],
          apartamentoIds: [a.id],
          piso: a.piso ?? null
        })
      }
    })
  })

  const destinatarios = Array.from(mapaEmails.values()).sort((a, b) =>
    (a.apartamentos[0] || '').localeCompare(b.apartamentos[0] || '', undefined, { numeric: true })
  )

  return {
    destinatarios,
    sinCorreo,
    totalApartamentosActivos: aptos.length
  }
}

async function invocarEdgeEmail(payload: {
  to?: string | string[]
  bcc?: string | string[]
  subject: string
  html: string
  replyTo?: string
}): Promise<{ ok: boolean; bccSupported?: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('enviar-email', {
      body: payload
    })
    if (error) {
      return { ok: false, error: error.message || 'Error invocando función de correo' }
    }
    if (data && data.ok === false) {
      return { ok: false, error: data.error || 'El proveedor de correo rechazó el envío' }
    }
    return {
      ok: true,
      bccSupported: Boolean(data?.bccSupported)
    }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Excepción de red al enviar correo' }
  }
}

/**
 * Ejecuta el envío masivo global en lotes BCC (protegiendo la privacidad entre vecinos),
 * con fallback automático a envío individual controlado si la Edge Function no reporta BCC.
 */
export async function enviarNotificacionGlobalMasiva(
  params: {
    asunto: string
    cuerpo: string
    categoria: CategoriaComunicadoGlobal
    destinatarios: DestinatarioGlobal[]
    edificioNombre: string
    remitenteNombre: string
    remitenteEmail?: string
    incluirBotonPortal?: boolean
    notificarEnApp?: boolean
    tasaBcvReferencia?: number
    origenAudiencia?: OrigenAudienciaGlobal
  },
  onProgress?: (p: ProgresoEnvioGlobal) => void
): Promise<HistorialNotificacionGlobal> {
  const emailsUnicos = Array.from(
    new Set(params.destinatarios.map(d => d.email.trim().toLowerCase()).filter(esEmailValido))
  )

  const html = generarHtmlNotificacionGlobal({
    edificioNombre: params.edificioNombre,
    asunto: params.asunto,
    cuerpo: params.cuerpo,
    categoria: params.categoria,
    remitenteNombre: params.remitenteNombre,
    incluirBotonPortal: params.incluirBotonPortal !== false
  })

  const total = emailsUnicos.length
  let enviados = 0
  let fallidos = 0
  const errores: Array<{ email: string; error: string }> = []
  let modoEnvio: 'bcc_lotes' | 'individual_lotes' = 'bcc_lotes'

  if (total > 0) {
    const TAM_LOTE_BCC = 20
    const lotesBcc: string[][] = []
    for (let i = 0; i < emailsUnicos.length; i += TAM_LOTE_BCC) {
      lotesBcc.push(emailsUnicos.slice(i, i + TAM_LOTE_BCC))
    }

    const fallbackToAdmin = esEmailValido(params.remitenteEmail)
      ? params.remitenteEmail!.trim().toLowerCase()
      : undefined

    let usarIndividualDesdeIndice = -1

    for (let i = 0; i < lotesBcc.length; i++) {
      const lote = lotesBcc[i]
      // Si hay correo admin, usarlo en 'to' y todos los residentes en 'bcc'.
      // Si no hay correo admin, enviar al edge con bcc para que use GMAIL_USER en 'to'.
      const resLote = await invocarEdgeEmail({
        ...(fallbackToAdmin ? { to: fallbackToAdmin } : {}),
        bcc: lote,
        subject: params.asunto.trim(),
        html,
        ...(fallbackToAdmin ? { replyTo: fallbackToAdmin } : {})
      })

      if (resLote.ok && resLote.bccSupported) {
        enviados += lote.length
      } else if (resLote.ok && !resLote.bccSupported) {
        // La Edge Function en la nube aún no soporta bcc: cambiar a modo individual controlado
        // desde el siguiente lote para garantizar privacidad y entrega real.
        modoEnvio = 'individual_lotes'
        usarIndividualDesdeIndice = i
        break
      } else {
        // Si falló el lote BCC (ej. correo rebotado dentro del lote), reintentar individualmente para aislar fallos
        for (const emailInd of lote) {
          const rInd = await invocarEdgeEmail({
            to: emailInd,
            subject: params.asunto.trim(),
            html
          })
          if (rInd.ok) enviados++
          else {
            fallidos++
            errores.push({ email: emailInd, error: rInd.error || resLote.error || 'Error enviando correo' })
          }
          await sleep(150)
        }
      }

      onProgress?.({
        procesados: Math.min(total, enviados + fallidos),
        total,
        enviados,
        fallidos,
        loteActual: i + 1,
        totalLotes: lotesBcc.length
      })

      if (i < lotesBcc.length - 1) await sleep(450)
    }

    if (usarIndividualDesdeIndice >= 0) {
      const pendientes = lotesBcc.slice(usarIndividualDesdeIndice).flat()
      const CONCURRENCIA = 3
      const totalIndLotes = Math.ceil(pendientes.length / CONCURRENCIA)
      for (let i = 0; i < pendientes.length; i += CONCURRENCIA) {
        const subLote = pendientes.slice(i, i + CONCURRENCIA)
        const resultados = await Promise.all(
          subLote.map(async emailInd => {
            const r = await invocarEdgeEmail({
              to: emailInd,
              subject: params.asunto.trim(),
              html
            })
            return { email: emailInd, ...r }
          })
        )
        resultados.forEach(r => {
          if (r.ok) enviados++
          else {
            fallidos++
            errores.push({ email: r.email, error: r.error || 'Error enviando correo' })
          }
        })
        onProgress?.({
          procesados: Math.min(total, enviados + fallidos),
          total,
          enviados,
          fallidos,
          loteActual: Math.floor(i / CONCURRENCIA) + 1,
          totalLotes: totalIndLotes
        })
        if (i + CONCURRENCIA < pendientes.length) await sleep(350)
      }
    }
  }

  // Notificación in-app opcional a todos los apartamentos
  if (params.notificarEnApp) {
    notificarTodos({
      tipo: 'aviso',
      titulo: `📧 ${params.asunto.trim()}`,
      cuerpo: params.cuerpo.trim().length > 140
        ? `${params.cuerpo.trim().slice(0, 137)}...`
        : params.cuerpo.trim(),
      link: '/'
    }).catch(() => {})
  }

  const registro: HistorialNotificacionGlobal = {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `com-${Date.now()}`,
    asunto: params.asunto.trim(),
    cuerpo: params.cuerpo.trim(),
    categoria: params.categoria,
    totalDestinatarios: total,
    enviados,
    fallidos,
    errores,
    remitenteNombre: params.remitenteNombre || 'Administrador',
    remitenteEmail: params.remitenteEmail,
    modoEnvio,
    notificadoEnApp: Boolean(params.notificarEnApp),
    incluirBotonPortal: params.incluirBotonPortal !== false,
    origenAudiencia: params.origenAudiencia || 'bd',
    destinatariosEmails: emailsUnicos,
    fechaEnvio: new Date().toISOString()
  }

  try {
    await supabase.from('casos_comunidad').insert({
      id: registro.id,
      tipo: TIPO_COMUNICADO_GLOBAL,
      titulo: registro.asunto,
      descripcion: JSON.stringify(registro),
      monto_usd: 0,
      monto_bs: 0,
      moneda: 'USD',
      estado: fallidos === 0 ? 'enviado' : enviados > 0 ? 'parcial' : 'fallido',
      fecha: registro.fechaEnvio.slice(0, 10),
      involucrado_nombre: registro.remitenteNombre,
      involucrado_contacto: `${enviados}/${total} enviados`
    })
  } catch (dbErr) {
    console.warn('[notificacionesGlobalesService] Error guardando historial:', dbErr)
  }

  registrarEventoAuditoria({
    tipo_accion: 'ENVIO_EMAILS_MASIVO',
    titulo: `Notificación Global Enviada: ${registro.asunto}`,
    descripcion: `Comunicado masivo (${registro.categoria}) despachado a ${enviados}/${total} destinatarios (${fallidos} fallidos) vía ${modoEnvio}.`,
    motivo: `Comunicado global (${registro.categoria})`,
    autor_nombre: registro.remitenteNombre,
    autor_email: registro.remitenteEmail || null
  }).catch(() => {})

  return registro
}

/**
 * Obtiene el historial de comunicados globales enviados desde casos_comunidad.
 */
export async function obtenerHistorialNotificacionesGlobales(): Promise<HistorialNotificacionGlobal[]> {
  try {
    const { data, error } = await supabase
      .from('casos_comunidad')
      .select('*')
      .eq('tipo', TIPO_COMUNICADO_GLOBAL)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error || !data) return []

    return data.map((row: any) => {
      let parsed: any = {}
      try { parsed = JSON.parse(row.descripcion || '{}') } catch {}
      return {
        id: row.id,
        asunto: parsed.asunto || row.titulo || 'Comunicado Global',
        cuerpo: parsed.cuerpo || '',
        categoria: parsed.categoria || 'informativo',
        totalDestinatarios: Number(parsed.totalDestinatarios || 0),
        enviados: Number(parsed.enviados || 0),
        fallidos: Number(parsed.fallidos || 0),
        errores: Array.isArray(parsed.errores) ? parsed.errores : [],
        remitenteNombre: parsed.remitenteNombre || row.involucrado_nombre || 'Administrador',
        remitenteEmail: parsed.remitenteEmail,
        modoEnvio: parsed.modoEnvio || 'bcc_lotes',
        notificadoEnApp: Boolean(parsed.notificadoEnApp),
        incluirBotonPortal: parsed.incluirBotonPortal !== false,
        origenAudiencia: parsed.origenAudiencia || 'bd',
        destinatariosEmails: Array.isArray(parsed.destinatariosEmails) ? parsed.destinatariosEmails : undefined,
        fechaEnvio: parsed.fechaEnvio || row.created_at || new Date().toISOString()
      } as HistorialNotificacionGlobal
    })
  } catch (err) {
    console.warn('[notificacionesGlobalesService] Error leyendo historial:', err)
    return []
  }
}

/**
 * Registra los destinatarios exactos del último despacho de recibos por correo
 * (en Supabase bajo tipo `config_*` y en localStorage) para reutilizarlos en Comunicados.
 */
export async function guardarDestinatariosUltimoReciboEnviado(params: {
  mes: string
  origen: 'emision_recibos' | 'envio_masivo_recibos'
  destinatarios: Array<{
    email: string
    nombre?: string | null
    apartamento?: string | null
    apartamentoId?: string | null
  }>
}): Promise<void> {
  const mapa = new Map<string, DestinatarioGlobal>()
  ;(params.destinatarios || []).forEach(item => {
    const email = String(item.email || '').trim().toLowerCase()
    if (!esEmailValido(email)) return
    const aptoNum = String(item.apartamento || 'S/N').trim()
    const aptoId = item.apartamentoId ? String(item.apartamentoId) : `rec_${aptoNum}`
    const nombre = String(item.nombre || 'Propietario').trim() || 'Propietario'
    const existing = mapa.get(email)
    if (existing) {
      if (aptoNum && !existing.apartamentos.includes(aptoNum)) existing.apartamentos.push(aptoNum)
      if (aptoId && !existing.apartamentoIds.includes(aptoId)) existing.apartamentoIds.push(aptoId)
    } else {
      mapa.set(email, {
        email,
        nombre,
        apartamentos: aptoNum ? [aptoNum] : ['S/N'],
        apartamentoIds: [aptoId],
        origen: 'ultimo_recibo'
      })
    }
  })

  const lista = Array.from(mapa.values()).sort((a, b) =>
    (a.apartamentos[0] || '').localeCompare(b.apartamentos[0] || '', undefined, { numeric: true })
  )
  if (lista.length === 0) return

  const payload = {
    mes: params.mes || '',
    fechaEnvio: new Date().toISOString(),
    origen: params.origen,
    destinatarios: lista
  }

  try {
    localStorage.setItem(LOCAL_KEY_ULTIMO_ENVIO_RECIBOS, JSON.stringify(payload))
  } catch {}

  try {
    const { data: existente } = await supabase
      .from('casos_comunidad')
      .select('id')
      .eq('tipo', TIPO_ULTIMO_ENVIO_RECIBOS)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existente?.id) {
      await supabase
        .from('casos_comunidad')
        .update({
          titulo: `ULTIMO_ENVIO_RECIBOS_${payload.mes || 'RECIENTE'}`,
          descripcion: JSON.stringify(payload),
          fecha: payload.fechaEnvio.slice(0, 10),
          involucrado_contacto: `${lista.length} correos`,
          updated_at: new Date().toISOString()
        })
        .eq('id', existente.id)
    } else {
      await supabase.from('casos_comunidad').insert({
        tipo: TIPO_ULTIMO_ENVIO_RECIBOS,
        titulo: `ULTIMO_ENVIO_RECIBOS_${payload.mes || 'RECIENTE'}`,
        descripcion: JSON.stringify(payload),
        monto_usd: 0,
        monto_bs: 0,
        moneda: 'USD',
        estado: 'resuelto',
        fecha: payload.fechaEnvio.slice(0, 10),
        involucrado_nombre: 'Sistema de Recibos',
        involucrado_contacto: `${lista.length} correos`
      })
    }
  } catch (err) {
    console.warn('[notificacionesGlobalesService] Error guardando registro último recibo:', err)
  }
}

/**
 * Obtiene la lista de correos del último recibo enviado:
 * 1) Registro explícito de despacho (`config_ultimo_envio_recibos_emails` / localStorage)
 * 2) Historial de auditoría (`ENVIO_EMAILS_MASIVO` de recibos)
 * 3) Fallback al último período emitido en `recibos_generados` cruzado con correos actuales en BD.
 */
export async function obtenerDestinatariosUltimoReciboEnviado(): Promise<ResumenUltimoReciboEmails> {
  // Prioridad 1: Registro directo en Supabase o localStorage
  try {
    const { data: regRow } = await supabase
      .from('casos_comunidad')
      .select('descripcion, created_at')
      .eq('tipo', TIPO_ULTIMO_ENVIO_RECIBOS)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    let parsedReg: any = null
    if (regRow?.descripcion) {
      try { parsedReg = JSON.parse(regRow.descripcion) } catch {}
    }
    if (!parsedReg) {
      try {
        const rawLocal = localStorage.getItem(LOCAL_KEY_ULTIMO_ENVIO_RECIBOS)
        if (rawLocal) parsedReg = JSON.parse(rawLocal)
      } catch {}
    }

    if (parsedReg && Array.isArray(parsedReg.destinatarios) && parsedReg.destinatarios.length > 0) {
      const lista = (parsedReg.destinatarios as DestinatarioGlobal[])
        .filter(d => esEmailValido(d?.email))
        .map(d => ({ ...d, email: d.email.trim().toLowerCase(), origen: 'ultimo_recibo' as const }))
      if (lista.length > 0) {
        return {
          destinatarios: lista,
          mesReferencia: parsedReg.mes || null,
          fechaEnvio: parsedReg.fechaEnvio || regRow?.created_at || null,
          fuente: 'registro_envio',
          notaFuente: parsedReg.mes
            ? `Correos exactos del último envío de recibos (${parsedReg.mes})`
            : 'Correos exactos del último envío de recibos registrado'
        }
      }
    }
  } catch (err) {
    console.warn('[notificacionesGlobalesService] Aviso leyendo registro último recibo:', err)
  }

  // Prioridad 2: Historial de auditoría de envío masivo de recibos
  let mesDesdeAuditoria: string | null = null
  let fechaAuditoria: string | null = null
  try {
    const { data: logsAud } = await supabase
      .from('historial_auditoria')
      .select('titulo, fecha, mes_afectado, datos_nuevos')
      .eq('tipo_accion', 'ENVIO_EMAILS_MASIVO')
      .order('fecha', { ascending: false })
      .limit(10)

    const logRecibo = (logsAud || []).find((l: any) =>
      String(l.titulo || '').startsWith('Envío Masivo de Correos')
    )

    if (logRecibo) {
      mesDesdeAuditoria = logRecibo.mes_afectado || logRecibo.datos_nuevos?.mes || null
      fechaAuditoria = logRecibo.fecha || null
      const destAud = logRecibo.datos_nuevos?.destinatarios_enviados
      if (Array.isArray(destAud) && destAud.length > 0) {
        const mapa = new Map<string, DestinatarioGlobal>()
        destAud.forEach((item: any) => {
          const email = String(item?.email || '').trim().toLowerCase()
          if (!esEmailValido(email)) return
          const aptoNum = String(item?.apto || 'S/N')
          const ex = mapa.get(email)
          if (ex) {
            if (!ex.apartamentos.includes(aptoNum)) ex.apartamentos.push(aptoNum)
          } else {
            mapa.set(email, {
              email,
              nombre: 'Propietario',
              apartamentos: [aptoNum],
              apartamentoIds: [`aud_${aptoNum}`],
              origen: 'ultimo_recibo'
            })
          }
        })
        const lista = Array.from(mapa.values()).sort((a, b) =>
          (a.apartamentos[0] || '').localeCompare(b.apartamentos[0] || '', undefined, { numeric: true })
        )
        if (lista.length > 0) {
          return {
            destinatarios: lista,
            mesReferencia: mesDesdeAuditoria,
            fechaEnvio: fechaAuditoria,
            fuente: 'auditoria',
            notaFuente: mesDesdeAuditoria
              ? `Recuperado desde auditoría del envío de recibos (${mesDesdeAuditoria})`
              : 'Recuperado desde auditoría de envío de recibos'
          }
        }
      }
    }
  } catch (err) {
    console.warn('[notificacionesGlobalesService] Aviso leyendo auditoría último recibo:', err)
  }

  // Prioridad 3: Fallback al último mes con recibos emitidos en recibos_generados
  try {
    let mesObjetivo = mesDesdeAuditoria
    let fechaRef = fechaAuditoria

    if (!mesObjetivo) {
      const { data: ultimoRec } = await supabase
        .from('recibos_generados')
        .select('mes_facturado, emitido_at')
        .order('emitido_at', { ascending: false })
        .order('mes_facturado', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (ultimoRec?.mes_facturado) {
        mesObjetivo = ultimoRec.mes_facturado
        fechaRef = ultimoRec.emitido_at || null
      }
    }

    if (mesObjetivo) {
      const [recibosMesRes, aptosRes, perfilesRes] = await Promise.all([
        supabase.from('recibos_generados').select('apartamento_id').eq('mes_facturado', mesObjetivo),
        supabase.from('apartamentos').select('id, numero, piso, propietario_nombre, propietario_email'),
        supabase.from('perfiles').select('apartamento_id, nombre_completo, propietario_nombre, propietario_email, email, condicion_habitacional')
      ])

      const aptosReciboIds = new Set((recibosMesRes.data || []).map((r: any) => r.apartamento_id).filter(Boolean))
      const aptosMap = new Map<string, any>()
      ;(aptosRes.data || []).forEach((a: any) => aptosMap.set(a.id, a))

      const perfilesPorApto = new Map<string, any[]>()
      ;(perfilesRes.data || []).forEach((p: any) => {
        if (!p.apartamento_id) return
        const arr = perfilesPorApto.get(p.apartamento_id) || []
        arr.push(p)
        perfilesPorApto.set(p.apartamento_id, arr)
      })

      const mapaEmails = new Map<string, DestinatarioGlobal>()
      aptosReciboIds.forEach(aptoId => {
        const a = aptosMap.get(aptoId)
        if (!a) return
        const perfilesApto = perfilesPorApto.get(aptoId) || []
        const emailsApto = new Set<string>()
        let nombrePrincipal = a.propietario_nombre || 'Propietario'

        if (esEmailValido(a.propietario_email)) {
          emailsApto.add(String(a.propietario_email).trim().toLowerCase())
        }
        perfilesApto.forEach((p: any) => {
          if (p.propietario_nombre && p.condicion_habitacional === 'alquilado') {
            nombrePrincipal = p.propietario_nombre
          } else if (p.nombre_completo && nombrePrincipal === 'Propietario') {
            nombrePrincipal = p.nombre_completo
          }
          if (esEmailValido(p.propietario_email)) emailsApto.add(String(p.propietario_email).trim().toLowerCase())
          if (esEmailValido(p.email)) emailsApto.add(String(p.email).trim().toLowerCase())
        })

        emailsApto.forEach(email => {
          const ex = mapaEmails.get(email)
          if (ex) {
            if (!ex.apartamentos.includes(String(a.numero))) ex.apartamentos.push(String(a.numero))
            if (!ex.apartamentoIds.includes(a.id)) ex.apartamentoIds.push(a.id)
          } else {
            mapaEmails.set(email, {
              email,
              nombre: nombrePrincipal,
              apartamentos: [String(a.numero || 'S/N')],
              apartamentoIds: [a.id],
              piso: a.piso ?? null,
              origen: 'ultimo_recibo'
            })
          }
        })
      })

      const lista = Array.from(mapaEmails.values()).sort((a, b) =>
        (a.apartamentos[0] || '').localeCompare(b.apartamentos[0] || '', undefined, { numeric: true })
      )

      return {
        destinatarios: lista,
        mesReferencia: mesObjetivo,
        fechaEnvio: fechaRef,
        fuente: 'ultimo_mes_emitido',
        notaFuente: `Correos de apartamentos incluidos en la última emisión de recibos (${mesObjetivo})`
      }
    }
  } catch (err) {
    console.warn('[notificacionesGlobalesService] Error en fallback último mes emitido:', err)
  }

  return {
    destinatarios: [],
    mesReferencia: null,
    fechaEnvio: null,
    fuente: 'ninguno',
    notaFuente: 'No se encontraron envíos o emisiones previas de recibos con correos registrados.'
  }
}

function extraerTextoCeldaExcelJS(cellVal: any): string {
  if (cellVal === null || cellVal === undefined) return ''
  if (typeof cellVal === 'string' || typeof cellVal === 'number' || typeof cellVal === 'boolean') {
    return String(cellVal).trim()
  }
  if (cellVal instanceof Date) {
    return cellVal.toISOString().slice(0, 10)
  }
  if (typeof cellVal === 'object') {
    if (typeof cellVal.text === 'string') return cellVal.text.trim()
    if (typeof cellVal.hyperlink === 'string') return cellVal.hyperlink.replace(/^mailto:/i, '').trim()
    if (Array.isArray(cellVal.richText)) {
      return cellVal.richText.map((r: any) => r?.text || '').join('').trim()
    }
    if (cellVal.result !== undefined && cellVal.result !== null) {
      return extraerTextoCeldaExcelJS(cellVal.result)
    }
  }
  return String(cellVal).trim()
}

function parsearCsvAMatriz(text: string): string[][] {
  const cleanText = text.replace(/^\uFEFF/, '')
  const firstLine = cleanText.split(/\r?\n/)[0] || ''
  const delimiter = (firstLine.split(';').length > firstLine.split(',').length) ? ';' : ','
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentCell = ''
  let inQuotes = false

  for (let i = 0; i < cleanText.length; i++) {
    const ch = cleanText[i]
    const next = cleanText[i + 1]
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentCell += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        currentCell += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === delimiter) {
      currentRow.push(currentCell.trim())
      currentCell = ''
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && next === '\n') i++
      currentRow.push(currentCell.trim())
      if (currentRow.some(c => c !== '')) rows.push(currentRow)
      currentRow = []
      currentCell = ''
    } else {
      currentCell += ch
    }
  }
  currentRow.push(currentCell.trim())
  if (currentRow.some(c => c !== '')) rows.push(currentRow)
  return rows
}

export async function leerMatrizDesdeArchivoExcel(file: File): Promise<string[][]> {
  const fileName = (file.name || '').toLowerCase()
  if (fileName.endsWith('.xls') && !fileName.endsWith('.xlsx')) {
    throw new Error('El formato antiguo .xls no es soportado por razones de seguridad. Guarda el archivo como .xlsx o .csv e inténtalo de nuevo.')
  }

  if (fileName.endsWith('.csv') || file.type === 'text/csv') {
    const csvText = await file.text()
    return parsearCsvAMatriz(csvText)
  }

  const ExcelJSModule = await import('exceljs')
  const ExcelJS = (ExcelJSModule as any).default || ExcelJSModule
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await file.arrayBuffer())
  const worksheet = workbook.worksheets[0]
  if (!worksheet) {
    throw new Error('El archivo Excel no contiene hojas.')
  }

  const matrix: string[][] = []
  worksheet.eachRow({ includeEmpty: false }, (row: any) => {
    const values = Array.isArray(row.values) ? row.values.slice(1) : []
    matrix.push(values.map((v: any) => extraerTextoCeldaExcelJS(v)))
  })
  return matrix
}

export async function leerObjetosDesdeArchivoExcel(file: File): Promise<Record<string, string>[]> {
  const matrix = await leerMatrizDesdeArchivoExcel(file)
  const rowsLimpias = matrix.filter(row => row.some(c => c.trim() !== ''))
  if (rowsLimpias.length === 0) return []

  const primeraFila = rowsLimpias[0].map((c, idx) => c.trim() || `Columna_${idx + 1}`)
  const tieneEncabezado = !primeraFila.some(c => c.includes('@'))
  const startRow = tieneEncabezado ? 1 : 0
  const headers = tieneEncabezado
    ? primeraFila
    : primeraFila.map((_, idx) => `Columna_${idx + 1}`)

  const result: Record<string, string>[] = []
  for (let i = startRow; i < rowsLimpias.length; i++) {
    const row = rowsLimpias[i]
    const obj: Record<string, string> = {}
    headers.forEach((h, idx) => {
      obj[h] = String(row[idx] ?? '').trim()
    })
    result.push(obj)
  }
  return result
}

export async function exportarFilasAExcel(params: {
  rows: Array<Record<string, unknown>>
  sheetName: string
  fileName: string
  columnWidths?: number[]
}): Promise<void> {
  const ExcelJSModule = await import('exceljs')
  const ExcelJS = (ExcelJSModule as any).default || ExcelJSModule
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet(params.sheetName || 'Datos')

  const headers = params.rows.length > 0 ? Object.keys(params.rows[0]) : []
  if (headers.length > 0) {
    worksheet.columns = headers.map((h, idx) => ({
      header: h,
      key: h,
      width: params.columnWidths?.[idx] || 22
    }))
    params.rows.forEach(r => {
      const cleanRow: Record<string, unknown> = {}
      headers.forEach(h => {
        cleanRow[h] = r[h] ?? ''
      })
      worksheet.addRow(cleanRow)
    })
  }

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = params.fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Parsea un archivo Excel (.xlsx, .csv) para extraer y deduplicar correos electrónicos,
 * cruzando opcionalmente números de apartamento con el edificio.
 */
export async function parsearExcelCorreos(
  file: File,
  aptosExistentes?: Array<{ id: string; numero: string; propietario_nombre?: string | null }>
): Promise<ResultadoExcelCorreos> {
  try {
    const matrix = await leerMatrizDesdeArchivoExcel(file)
    const rowsLimpias = (matrix || []).filter(row => Array.isArray(row) && row.some(c => String(c || '').trim() !== ''))

    if (rowsLimpias.length === 0) {
      return { destinatarios: [], totalFilas: 0, descartados: 0, duplicados: 0, error: 'El archivo Excel está vacío.' }
    }

    const primeraFila = rowsLimpias[0].map(c => String(c || '').trim())
    const primeraFilaTieneEmail = primeraFila.some(c => extraerEmailsDeTexto(c).length > 0)

    let idxEmail = -1
    let idxApto = -1
    let idxNombre = -1
    let startRow = 0

    if (!primeraFilaTieneEmail) {
      primeraFila.forEach((cell, idx) => {
        const k = cell.toLowerCase()
        if (idxEmail === -1 && (k.includes('email') || k.includes('correo') || k.includes('mail'))) idxEmail = idx
        if (idxApto === -1 && (k.includes('apto') || k.includes('apartamento') || k.includes('unidad') || k.includes('inmueble') || k.includes('depto') || k.includes('numero') || k.includes('nro'))) idxApto = idx
        if (idxNombre === -1 && (k.includes('nombre') || k.includes('propietario') || k.includes('residente') || k.includes('titular') || k.includes('inquilino') || k.includes('destinatario'))) idxNombre = idx
      })
      const pareceEncabezado = idxEmail >= 0 || idxApto >= 0 || idxNombre >= 0 ||
        primeraFila.some(c => /^(correo|email|apartamento|apto|nombre|propietario|unidad)/i.test(c))
      if (pareceEncabezado) startRow = 1
    }

    const aptosLookup = new Map<string, { id: string; numero: string; propietario_nombre?: string | null }>()
    ;(aptosExistentes || []).forEach(a => {
      const norm = normalizarCadenaApto(a.numero)
      if (norm) aptosLookup.set(norm, a)
    })

    const mapaEmails = new Map<string, DestinatarioGlobal>()
    let totalFilas = 0
    let descartados = 0
    let duplicados = 0

    for (let i = startRow; i < rowsLimpias.length; i++) {
      const row = rowsLimpias[i]
      totalFilas++

      let emailsFila: string[] = []
      if (idxEmail >= 0 && idxEmail < row.length) {
        emailsFila = extraerEmailsDeTexto(row[idxEmail])
      }
      if (emailsFila.length === 0) {
        for (const cell of row) {
          const found = extraerEmailsDeTexto(cell)
          if (found.length > 0) emailsFila.push(...found)
        }
      }

      if (emailsFila.length === 0) {
        descartados++
        continue
      }

      const rawApto = idxApto >= 0 && idxApto < row.length ? String(row[idxApto] || '').trim() : ''
      const rawNombre = idxNombre >= 0 && idxNombre < row.length ? String(row[idxNombre] || '').trim() : ''
      const aptoMatch = rawApto ? aptosLookup.get(normalizarCadenaApto(rawApto)) : undefined

      const aptoLabel = aptoMatch?.numero || rawApto || 'Excel'
      const aptoId = aptoMatch?.id || `excel_${i}`
      const nombreFinal = rawNombre || aptoMatch?.propietario_nombre || 'Destinatario Excel'

      emailsFila.forEach(email => {
        const ex = mapaEmails.get(email)
        if (ex) {
          duplicados++
          if (aptoLabel !== 'Excel' && !ex.apartamentos.includes(aptoLabel)) {
            if (ex.apartamentos.length === 1 && ex.apartamentos[0] === 'Excel') ex.apartamentos = [aptoLabel]
            else ex.apartamentos.push(aptoLabel)
          }
        } else {
          mapaEmails.set(email, {
            email,
            nombre: nombreFinal,
            apartamentos: [aptoLabel],
            apartamentoIds: [aptoId],
            origen: 'excel'
          })
        }
      })
    }

    const destinatarios = Array.from(mapaEmails.values()).sort((a, b) =>
      (a.apartamentos[0] || '').localeCompare(b.apartamentos[0] || '', undefined, { numeric: true })
    )

    return { destinatarios, totalFilas, descartados, duplicados }
  } catch (err: any) {
    return {
      destinatarios: [],
      totalFilas: 0,
      descartados: 0,
      duplicados: 0,
      error: err?.message || 'Error leyendo el archivo Excel'
    }
  }
}

