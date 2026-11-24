import { supabase } from './supabase'
import { registrarEventoAuditoria } from './auditoriaService'
import { notificarTodos } from './notificacionesService'
import {
  CategoriaComunicadoGlobal,
  generarHtmlNotificacionGlobal
} from './emailService'

export interface DestinatarioGlobal {
  email: string
  nombre: string
  apartamentos: string[]
  apartamentoIds: string[]
  piso?: number | null
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

function esEmailValido(email?: string | null): boolean {
  if (!email || typeof email !== 'string') return false
  const clean = email.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)
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
        fechaEnvio: parsed.fechaEnvio || row.created_at || new Date().toISOString()
      } as HistorialNotificacionGlobal
    })
  } catch (err) {
    console.warn('[notificacionesGlobalesService] Error leyendo historial:', err)
    return []
  }
}

