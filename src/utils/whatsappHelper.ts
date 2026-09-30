/**
 * Helper centralizado para generar mensajes profesionales y abrir WhatsApp
 * con 1 solo clic para recibos, cobranza de mora y constancias de pago.
 */

export interface DatosCobroRecibo {
  edificioNombre?: string
  apartamentoNumero: string
  propietarioNombre?: string | null
  telefono?: string | null
  mesLabel: string
  anio: number | string
  totalUsd: number
  totalBs: number
  tasaBcv: number
  alicuotaPct?: string | number
  bancoNombre?: string | null
  cuentaNumero?: string | null
  titularNombre?: string | null
  cedulaRif?: string | null
  telefonoPagoMovil?: string | null
  portalUrl?: string
}

export interface DatosCobroMora {
  edificioNombre?: string
  apartamentoNumero: string
  propietarioNombre?: string | null
  telefono?: string | null
  mesesMora: number
  montoUsd: number
  montoBs: number
  tasaBcv?: number
  accionLegalTitulo?: string
  conceptosDetalle?: string
  fechaCorte?: string
  bancoNombre?: string | null
  cuentaNumero?: string | null
  titularNombre?: string | null
  cedulaRif?: string | null
  telefonoPagoMovil?: string | null
  portalUrl?: string
}

export interface DatosReciboPagado {
  edificioNombre?: string
  apartamentoNumero: string
  propietarioNombre?: string | null
  telefono?: string | null
  mesLabel: string
  anio: number | string
  totalUsd: number
  totalBs: number
  portalUrl?: string
}

const DEFAULT_PORTAL_URL = 'https://condominio-app-rouge.vercel.app'

/**
 * Normaliza números de teléfono para WhatsApp (añade código 58 si empieza por 04xx o 4xx).
 */
export function normalizarTelefonoWhatsApp(tel?: string | null): string {
  if (!tel) return ''
  let clean = tel.replace(/[^0-9]/g, '')
  if (clean.startsWith('0')) {
    clean = '58' + clean.slice(1)
  } else if (clean.startsWith('4') && clean.length === 10) {
    clean = '58' + clean
  }
  return clean
}

/**
 * Formatea moneda en Bolívares y Dólares
 */
const fmtBs = (n: number) => (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtUsd = (n: number) => (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * 1. Genera mensaje de cobro / emisión de Recibo de Condominio
 */
export function generarMensajeCobroRecibo(datos: DatosCobroRecibo): string {
  const edificio = datos.edificioNombre || 'Residencias Ocutuy 5'
  const banco = datos.bancoNombre || 'Banco Bicentenario'
  const cuenta = datos.cuentaNumero || '0175-0525-4100-7575-1351'
  const titular = datos.titularNombre || 'Zoraya Almeida'
  const rif = datos.cedulaRif || 'V-6089037'
  const pmoTel = datos.telefonoPagoMovil || datos.telefono || '0414-XXXXXXX'
  const portal = datos.portalUrl || DEFAULT_PORTAL_URL

  const saludo = datos.propietarioNombre
    ? `Estimado(a) *${datos.propietarioNombre.trim()}*,`
    : `Estimado propietario del *Apto ${datos.apartamentoNumero}*,`

  const tasaBcvReal = (datos.tasaBcv && datos.tasaBcv > 1)
    ? datos.tasaBcv
    : (datos.totalUsd > 0 && datos.totalBs > 0 ? parseFloat((datos.totalBs / datos.totalUsd).toFixed(4)) : 859.06)

  return `🏢 *${edificio.toUpperCase()}*
📄 *AVISO DE COBRO — RECIBO DE CONDOMINIO*
🗓️ *Periodo:* ${datos.mesLabel.toUpperCase()} ${datos.anio}
━━━━━━━━━━━━━━━━━━━━━━━━━━
${saludo}

Le informamos que ya ha sido emitido el recibo de condominio correspondiente a su inmueble:

🏠 *Inmueble:* Apartamento ${datos.apartamentoNumero}
💵 *Total a pagar:* $ ${fmtUsd(datos.totalUsd)} USD
🇻🇪 *Equivalente en Bolívares:* Bs. ${fmtBs(datos.totalBs)}
📊 *Tasa oficial BCV:* ${fmtBs(tasaBcvReal)} Bs/$

🏦 *DATOS BANCARIOS PARA REALIZAR EL PAGO:*
• *Banco:* ${banco}
• *Tipo:* Cuenta Corriente
• *Nro de Cuenta:* ${cuenta}
• *Titular:* ${titular}
• *Cédula / RIF:* ${rif}
• *Pago Móvil:* ${banco} | ${rif} | Tel: ${pmoTel}

📲 *REPORTAR PAGO Y SUBIR COMPROBANTE:*
Una vez realizada su transferencia o pago móvil, repórtelo en nuestro portal para conciliar su solvencia:
🔗 ${portal}/recibos

_Agradecemos de antemano su puntual colaboración para el correcto funcionamiento de los servicios de nuestra comunidad._`
}

/**
 * 2. Genera mensaje formal de Cobranza de Mora / Cartera Vencida
 */
export function generarMensajeCobroMora(datos: DatosCobroMora): string {
  const edificio = datos.edificioNombre || 'Residencias Ocutuy 5'
  const banco = datos.bancoNombre || 'Banco Bicentenario'
  const cuenta = datos.cuentaNumero || '0175-0525-4100-7575-1351'
  const titular = datos.titularNombre || 'Zoraya Almeida'
  const rif = datos.cedulaRif || 'V-6089037'
  const portal = datos.portalUrl || DEFAULT_PORTAL_URL

  const saludo = datos.propietarioNombre
    ? `Estimado(a) *${datos.propietarioNombre.trim()}*,`
    : `Estimado propietario del *Apto ${datos.apartamentoNumero}*,`

  const accionTexto = datos.accionLegalTitulo
    ? `\n⚖️ *Estado Legal Administrativo:* ${datos.accionLegalTitulo}`
    : ''

  const corteTexto = datos.fechaCorte ? ` (Corte al ${datos.fechaCorte})` : ''

  return `🏢 *${edificio.toUpperCase()} — ADMINISTRACIÓN*
⚠️ *RECORDATORIO DE DEUDA Y ESTADO DE CUENTA EN MORA*
━━━━━━━━━━━━━━━━━━━━━━━━━━
${saludo}

Nos comunicamos cordialmente desde la Administración para recordarle que su apartamento presenta cuotas pendientes de condominio:

🏠 *Inmueble:* Apartamento ${datos.apartamentoNumero}
⏳ *Tiempo en mora:* ${datos.mesesMora} meses atrasados${corteTexto}
💵 *Monto Total Adeudado:* $ ${fmtUsd(datos.montoUsd)} USD
🇻🇪 *Monto en Bolívares (BCV):* Bs. ${fmtBs(datos.montoBs)}${accionTexto}

${datos.conceptosDetalle ? `📋 *Detalle:* ${datos.conceptosDetalle}\n` : ''}
🏦 *CUENTAS RECAUDADORAS PARA PAGO O CONVENIO:*
• *Banco:* ${banco}
• *Cuenta Corriente:* ${cuenta}
• *Beneficiario:* ${titular}
• *C.I. / RIF:* ${rif}

🔗 *Acceso directo para consultar sus recibos o reportar pagos:*
${portal}/mora

_Le invitamos a ponerse al día o contactar a la Junta de Condominio para acordar un plan de pago y evitar la suspensión de servicios o cobro extrajudicial._`
}

/**
 * 3. Genera constancia de Recibo Pagado y Solvente
 */
export function generarMensajeReciboPagado(datos: DatosReciboPagado): string {
  const edificio = datos.edificioNombre || 'Residencias Ocutuy 5'
  const portal = datos.portalUrl || DEFAULT_PORTAL_URL

  const saludo = datos.propietarioNombre
    ? `Estimado(a) *${datos.propietarioNombre.trim()}*,`
    : `Estimado propietario del *Apto ${datos.apartamentoNumero}*,`

  return `🏢 *${edificio.toUpperCase()}*
✅ *CONSTANCIA DE RECIBO PAGADO Y SOLVENTE*
🗓️ *Periodo:* ${datos.mesLabel.toUpperCase()} ${datos.anio}
━━━━━━━━━━━━━━━━━━━━━━━━━━
${saludo}

Le confirmamos que su pago ha sido validado y conciliado con total éxito por la Administración:

🏠 *Apartamento:* ${datos.apartamentoNumero}
💵 *Monto Solventado:* $ ${fmtUsd(datos.totalUsd)} (Bs. ${fmtBs(datos.totalBs)})
🛡️ *Estatus:* SOLVENTE Y AL DÍA CON EL CONDOMINIO

Puede descargar su recibo oficial certificado en formato PDF en cualquier momento ingresando a su portal:
🔗 ${portal}/recibos

_¡Muchas gracias por su compromiso y puntualidad con el edificio!_`
}

/**
 * Abre la URL de WhatsApp (Web o App Nativa)
 */
export function abrirWhatsApp(params: { telefono?: string | null; mensaje: string }) {
  const cleanPhone = normalizarTelefonoWhatsApp(params.telefono)
  const encodedMsg = encodeURIComponent(params.mensaje)

  let url = ''
  if (cleanPhone) {
    url = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMsg}`
  } else {
    // Si no hay teléfono específico, abre WhatsApp listo para elegir a qué contacto o grupo enviar
    url = `https://api.whatsapp.com/send?text=${encodedMsg}`
  }

  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}
