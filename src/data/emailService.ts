import { supabase } from './supabase'

/**
 * Servicio centralizado para el envío automático de correos electrónicos:
 * 1. Emisión de nuevo recibo de condominio (aviso de cobro con desglose y datos bancarios).
 * 2. Recordatorios de impago cada 3 días para carteras morosas.
 * 3. Confirmación de pago, constancia de solvencia y agradecimiento por estar al día.
 */

export interface DatosEmailRecibo {
  destinatarioEmail: string
  propietarioNombre?: string | null
  apartamentoNumero: string
  edificioNombre?: string
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
  cedula_cuenta?: string | null
  tipo_cuenta?: string | null
  pago_movil_banco?: string | null
  pago_movil_cedula?: string | null
  pago_movil_telefono?: string | null
  zelle_email?: string | null
  telefonoPagoMovil?: string | null
  portalUrl?: string
  colorPrimario?: string | null
}

export interface DatosEmailMora {
  destinatarioEmail: string
  apartamentoId?: string
  apartamentoNumero: string
  propietarioNombre?: string | null
  edificioNombre?: string
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
  portalUrl?: string
}

export interface DatosEmailPagoAprobado {
  destinatarioEmail: string
  apartamentoNumero: string
  propietarioNombre?: string | null
  edificioNombre?: string
  mesLabel?: string
  anio?: number | string
  montoUsd: number
  montoBs: number
  referencia?: string | null
  fechaPago?: string | null
  bancoOrigen?: string | null
  portalUrl?: string
}

export interface DatosEmailCuotaGas {
  destinatarioEmail: string
  apartamentoNumero: string
  propietarioNombre?: string | null
  edificioNombre?: string
  tituloCuota: string
  esCuotaEspecial?: boolean
  montoUsd: number
  montoBs: number
  tasaBcv: number
  fechaLimite?: string
  banco?: string | null
  telefono?: string | null
  rifCedula?: string | null
  titular?: string | null
  portalUrl?: string
  colorPrimario?: string | null
}

const DEFAULT_PORTAL_URL = 'https://condominio-app-rouge.vercel.app'
const DEFAULT_EDIFICIO = 'Residencias Ocutuy 5'
const DEFAULT_BANCO = 'Banco Bicentenario'
const DEFAULT_CUENTA = '0175-0525-4100-7575-1351'
const DEFAULT_TITULAR = 'Zoraya Almeida'
const DEFAULT_RIF = 'V-6089037'

const fmtBs = (n: number) => (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtUsd = (n: number) => (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ── Control de frecuencia: Recordatorio de impago cada 3 días ─────────────────
const STORAGE_KEY_RECORDATORIOS = 'condominio_recordatorios_mora_v1'

interface RegistroRecordatorio {
  [apartamentoIdOrNumero: string]: number // timestamp en ms del último envío
}

function getRegistrosRecordatorios(): RegistroRecordatorio {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RECORDATORIOS)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

/**
 * Comprueba si un apartamento es elegible para recibir un recordatorio de impago.
 * Regla: solo se envía si han pasado al menos 3 días (72 horas) desde el último envío.
 */
export function esElegibleRecordatorio3Dias(idOrNumero: string): boolean {
  if (!idOrNumero) return true
  const registros = getRegistrosRecordatorios()
  const ultimoEnvio = registros[idOrNumero]
  if (!ultimoEnvio) return true

  const diferenciaHoras = (Date.now() - ultimoEnvio) / (1000 * 60 * 60)
  return diferenciaHoras >= 72 // 3 días cumplidos
}

/**
 * Marca el timestamp actual como fecha del último recordatorio enviado.
 */
export function registrarRecordatorioEnviado(idOrNumero: string) {
  if (!idOrNumero) return
  try {
    const registros = getRegistrosRecordatorios()
    registros[idOrNumero] = Date.now()
    localStorage.setItem(STORAGE_KEY_RECORDATORIOS, JSON.stringify(registros))
  } catch (err) {
    console.warn('[EmailService] Error guardando registro de recordatorio:', err)
  }
}

// ── 1. PLANTILLA: EMISIÓN DE RECIBO (AVISO DE COBRO) ──────────────────────────
export function generarHtmlReciboEmitido(datos: DatosEmailRecibo): { subject: string; html: string } {
  const edificio = datos.edificioNombre || DEFAULT_EDIFICIO
  const portal = datos.portalUrl || DEFAULT_PORTAL_URL
  const banco = datos.bancoNombre || DEFAULT_BANCO
  const cuenta = datos.cuentaNumero || DEFAULT_CUENTA
  const titular = datos.titularNombre || DEFAULT_TITULAR
  const rif = datos.cedulaRif || DEFAULT_RIF
  const cedula = datos.cedula_cuenta || rif
  const tipoCuenta = datos.tipo_cuenta || 'Cuenta Corriente'
  const pmoTel = datos.pago_movil_telefono || datos.telefonoPagoMovil || ''
  const pmoBanco = datos.pago_movil_banco || banco
  const pmoCedula = datos.pago_movil_cedula || cedula
  const zelleEmail = datos.zelle_email || ''

  const tasaBcvReal = (datos.tasaBcv && datos.tasaBcv > 1)
    ? datos.tasaBcv
    : (datos.totalUsd > 0 && datos.totalBs > 0 ? parseFloat((datos.totalBs / datos.totalUsd).toFixed(4)) : 859.06)

  const primaryColor = datos.colorPrimario || (typeof window !== 'undefined' ? localStorage.getItem('domus_primary_color') : null) || '#f97316'

  const subject = `🏢 Aviso de Cobro Condominio — ${datos.mesLabel.toUpperCase()} ${datos.anio} | Apto. ${datos.apartamentoNumero}`

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#0b0f17;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0b0f17;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#131926;border-radius:18px;border:1px solid #1e293b;overflow:hidden;box-shadow:0 20px 40px rgba(0,0,0,0.6);">
          
          <!-- HEADER -->
          <tr>
            <td style="background:linear-gradient(135deg, #1e293b 0%, #0f172a 100%);padding:30px 24px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.08);">
              <div style="font-size:38px;margin-bottom:6px;">🏢</div>
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">${edificio.toUpperCase()}</h1>
              <p style="margin:6px 0 0;color:${primaryColor};font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;">
                AVISO DE COBRO — RECIBO DE CONDOMINIO
              </p>
              <div style="display:inline-block;background:${primaryColor}22;border:1px solid ${primaryColor}66;border-radius:20px;padding:4px 14px;margin-top:12px;font-size:12px;color:${primaryColor};font-weight:700;">
                🗓️ Período Facturado: ${datos.mesLabel.toUpperCase()} ${datos.anio}
              </div>
            </td>
          </tr>

          <!-- CUERPO -->
          <tr>
            <td style="padding:32px 28px;">
              <p style="margin:0 0 16px;font-size:15px;color:#f8fafc;line-height:1.5;">
                Estimado(a) <strong>${datos.propietarioNombre ? datos.propietarioNombre.trim() : `Propietario del Apartamento ${datos.apartamentoNumero}`}</strong>,
              </p>
              <p style="margin:0 0 24px;font-size:14px;color:#94a3b8;line-height:1.6;">
                Le informamos que ha sido emitido formalmente el recibo de gastos comunes de condominio correspondiente a su inmueble:
              </p>

              <!-- TARJETA DE MONTOS -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#090d14;border:1px solid #1e293b;border-radius:14px;margin-bottom:24px;overflow:hidden;">
                <tr>
                  <td style="padding:18px 20px;border-bottom:1px solid #1e293b;">
                    <table width="100%">
                      <tr>
                        <td style="font-size:12px;color:#64748b;text-transform:uppercase;font-weight:700;letter-spacing:1px;">Inmueble</td>
                        <td align="right" style="font-size:16px;color:#fff;font-weight:800;">Apto. ${datos.apartamentoNumero} ${datos.alicuotaPct ? `· Alícuota: ${datos.alicuotaPct}` : ''}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px;background:${primaryColor}0d;">
                    <div style="font-size:12px;color:${primaryColor};text-transform:uppercase;font-weight:700;margin-bottom:6px;">Total a pagar por su cuota:</div>
                    <div style="font-size:30px;color:#ffffff;font-weight:900;letter-spacing:-0.5px;">
                      $ ${fmtUsd(datos.totalUsd)} <span style="font-size:14px;color:${primaryColor};font-weight:700;">USD</span>
                    </div>
                    <div style="font-size:18px;color:#eab308;font-weight:700;margin-top:4px;">
                      Bs. ${fmtBs(datos.totalBs)}
                    </div>
                    <div style="font-size:11px;color:#64748b;margin-top:6px;">
                      Calculado a la Tasa Oficial BCV: <strong>${fmtBs(tasaBcvReal)} Bs/$</strong>
                    </div>
                  </td>
                </tr>
              </table>

              <div style="background:#0e131d;border:1px solid #1e293b;border-radius:14px;padding:20px;margin-bottom:28px;">
                <div style="font-size:12px;color:#38bdf8;font-weight:800;text-transform:uppercase;letter-spacing:1px;margin-bottom:14px;">
                  🏦 Opciones de Pago Disponibles:
                </div>

                <!-- TRANSFERENCIA BANCARIA -->
                <div style="margin-bottom:14px;">
                  <div style="font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:8px;border-bottom:1px solid #1e293b;padding-bottom:4px;">💳 Transferencia Bancaria</div>
                  <table width="100%" style="font-size:13px;color:#cbd5e1;line-height:1.7;">
                    <tr><td style="width:130px;color:#64748b;">Banco:</td><td><strong>${banco}</strong></td></tr>
                    <tr><td style="color:#64748b;">Cédula:</td><td><strong>${cedula}</strong></td></tr>
                    <tr><td style="color:#64748b;">Tipo de Cuenta:</td><td>${tipoCuenta}</td></tr>
                    <tr><td style="color:#64748b;">Nro de Cuenta:</td><td><strong style="font-family:monospace;letter-spacing:0.5px;color:#fff;">${cuenta}</strong></td></tr>
                    <tr><td style="color:#64748b;">Titular:</td><td><strong>${titular}</strong></td></tr>
                  </table>
                </div>

                ${(pmoTel || pmoBanco) ? `
                <!-- PAGO MÓVIL -->
                <div style="margin-bottom:14px;">
                  <div style="font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:8px;border-bottom:1px solid #1e293b;padding-bottom:4px;">📱 Pago Móvil</div>
                  <table width="100%" style="font-size:13px;color:#cbd5e1;line-height:1.7;">
                    <tr><td style="width:130px;color:#64748b;">Banco:</td><td><strong>${pmoBanco}</strong></td></tr>
                    <tr><td style="color:#64748b;">Cédula:</td><td><strong>${pmoCedula}</strong></td></tr>
                    <tr><td style="color:#64748b;">Teléfono:</td><td><strong style="color:#fff;">${pmoTel}</strong></td></tr>
                  </table>
                </div>` : ''}

                ${zelleEmail ? `
                <!-- ZELLE -->
                <div>
                  <div style="font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:8px;border-bottom:1px solid #1e293b;padding-bottom:4px;">💵 Zelle</div>
                  <table width="100%" style="font-size:13px;color:#cbd5e1;line-height:1.7;">
                    <tr><td style="width:130px;color:#64748b;">Correo:</td><td><strong style="color:#fff;">${zelleEmail}</strong></td></tr>
                  </table>
                </div>` : ''}
              </div>

              <!-- BOTÓN CTA -->
              <div style="text-align:center;margin-bottom:28px;">
                <a href="${portal}/recibos" target="_blank" style="display:inline-block;background:${primaryColor};color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:14px;font-weight:800;box-shadow:0 6px 20px ${primaryColor}66;">
                  💳 Reportar Pago y Ver Recibo Oficial →
                </a>
              </div>

              <p style="margin:0;font-size:12px;color:#64748b;text-align:center;line-height:1.5;">
                Una vez realizado su pago por transferencia o pago móvil, ingrese al enlace para registrar la referencia y conciliar su solvencia administrativa.
              </p>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background-color:#090d14;padding:20px;text-align:center;border-top:1px solid #1e293b;font-size:11px;color:#475569;">
              © ${new Date().getFullYear()} ${edificio} · Sistema de Notificaciones Administrativas Automatizadas
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  return { subject, html }
}

// ── 2. PLANTILLA: RECORDATORIO DE IMPAGO / CARTERA MOROSA (CADA 3 DÍAS) ────────
export function generarHtmlRecordatorioMora(datos: DatosEmailMora): { subject: string; html: string } {
  const edificio = datos.edificioNombre || DEFAULT_EDIFICIO
  const portal = datos.portalUrl || DEFAULT_PORTAL_URL
  const banco = datos.bancoNombre || DEFAULT_BANCO
  const cuenta = datos.cuentaNumero || DEFAULT_CUENTA
  const titular = datos.titularNombre || DEFAULT_TITULAR
  const rif = datos.cedulaRif || DEFAULT_RIF

  const subject = `⚠️ Recordatorio de Pago — Cuota Pendiente de Condominio | Apto. ${datos.apartamentoNumero}`

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#0b0f17;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0b0f17;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#131926;border-radius:18px;border:1px solid #334155;overflow:hidden;box-shadow:0 20px 40px rgba(0,0,0,0.6);">
          
          <!-- HEADER -->
          <tr>
            <td style="background:linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%);padding:30px 24px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.08);">
              <div style="font-size:38px;margin-bottom:6px;">⚠️</div>
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:800;letter-spacing:-0.5px;">${edificio.toUpperCase()} · ADMINISTRACIÓN</h1>
              <p style="margin:6px 0 0;color:#f43f5e;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;">
                RECORDATORIO DE DEUDA Y SALDO PENDIENTE
              </p>
            </td>
          </tr>

          <!-- CUERPO -->
          <tr>
            <td style="padding:32px 28px;">
              <p style="margin:0 0 16px;font-size:15px;color:#f8fafc;line-height:1.5;">
                Estimado(a) <strong>${datos.propietarioNombre ? datos.propietarioNombre.trim() : `Propietario del Apto. ${datos.apartamentoNumero}`}</strong>,
              </p>
              <p style="margin:0 0 24px;font-size:14px;color:#94a3b8;line-height:1.6;">
                Nos comunicamos cordialmente desde la Administración para recordarle que su inmueble mantiene un saldo de condominio pendiente por liquidar:
              </p>

              <!-- TARJETA DE DEUDA -->
              <div style="background:#090d14;border:1px solid rgba(244,63,94,0.3);border-radius:14px;padding:22px;margin-bottom:24px;">
                <table width="100%">
                  <tr>
                    <td style="font-size:13px;color:#cbd5e1;">Apartamento:</td>
                    <td align="right" style="font-size:16px;color:#fff;font-weight:800;">Apto. ${datos.apartamentoNumero}</td>
                  </tr>
                  <tr>
                    <td style="font-size:13px;color:#cbd5e1;padding-top:8px;">Tiempo atrasado:</td>
                    <td align="right" style="font-size:14px;color:#f43f5e;font-weight:700;padding-top:8px;">${datos.mesesMora} meses pendientes</td>
                  </tr>
                  ${datos.accionLegalTitulo ? `
                  <tr>
                    <td style="font-size:13px;color:#cbd5e1;padding-top:8px;">Estado Administrativo:</td>
                    <td align="right" style="font-size:13px;color:#c084fc;font-weight:700;padding-top:8px;">${datos.accionLegalTitulo}</td>
                  </tr>` : ''}
                </table>

                <div style="margin-top:16px;padding-top:16px;border-top:1px solid #1e293b;text-align:center;">
                  <div style="font-size:11px;color:#64748b;text-transform:uppercase;font-weight:700;margin-bottom:4px;">Monto total a regularizar:</div>
                  <div style="font-size:28px;color:#ffffff;font-weight:900;">
                    $ ${fmtUsd(datos.montoUsd)} <span style="font-size:14px;color:#f43f5e;">USD</span>
                  </div>
                  ${datos.montoBs > 0 ? `
                  <div style="font-size:16px;color:#eab308;font-weight:700;margin-top:4px;">
                    Bs. ${fmtBs(datos.montoBs)}
                  </div>` : ''}
                </div>
              </div>

              <!-- DATOS BANCARIOS -->
              <div style="background:#0e131d;border:1px solid #1e293b;border-radius:14px;padding:20px;margin-bottom:26px;">
                <div style="font-size:12px;color:#38bdf8;font-weight:800;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">
                  🏦 Cuentas para Pago o Convenio:
                </div>
                <div style="font-size:13px;color:#cbd5e1;line-height:1.7;">
                  • <strong>Banco:</strong> ${banco}<br/>
                  • <strong>Cuenta Corriente:</strong> <span style="font-family:monospace;color:#fff;">${cuenta}</span><br/>
                  • <strong>Titular:</strong> ${titular}<br/>
                  • <strong>C.I. / RIF:</strong> ${rif}
                </div>
              </div>

              <!-- BOTÓN CTA -->
              <div style="text-align:center;margin-bottom:24px;">
                <a href="${portal}/mora" target="_blank" style="display:inline-block;background:linear-gradient(135deg, #e11d48 0%, #be123c 100%);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:14px;font-weight:800;box-shadow:0 6px 20px rgba(225, 29, 72, 0.4);">
                  💳 Consultar Mi Estado y Regularizar →
                </a>
              </div>

              <p style="margin:0;font-size:12px;color:#64748b;text-align:center;line-height:1.5;">
                Le invitamos a ponerse al día o comunicarse con la Junta de Condominio para coordinar un convenio de pago y preservar el buen funcionamiento de los servicios del edificio.
              </p>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background-color:#090d14;padding:18px;text-align:center;border-top:1px solid #1e293b;font-size:11px;color:#475569;">
              Este es un recordatorio automático enviado cada 3 días según las normas de cobranza de ${edificio}.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  return { subject, html }
}

// ── 3. PLANTILLA: PAGO CONFIRMADO, SOLVENCIA Y AGRADECIMIENTO ─────────────────
export function generarHtmlPagoAprobado(datos: DatosEmailPagoAprobado): { subject: string; html: string } {
  const edificio = datos.edificioNombre || DEFAULT_EDIFICIO
  const portal = datos.portalUrl || DEFAULT_PORTAL_URL
  const fechaStr = datos.fechaPago
    ? new Date(datos.fechaPago).toLocaleDateString('es-VE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : new Date().toLocaleDateString('es-VE')

  const subject = `✅ ¡Gracias por su Pago! — ${edificio} | Apto. ${datos.apartamentoNumero}`

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#0b0f17;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0b0f17;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#131926;border-radius:18px;border:1px solid #1e293b;overflow:hidden;box-shadow:0 20px 40px rgba(0,0,0,0.6);">
          
          <!-- HEADER -->
          <tr>
            <td style="background:linear-gradient(135deg, #064e3b 0%, #0f172a 100%);padding:32px 24px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.08);">
              <div style="display:inline-block;background:linear-gradient(135deg,#10b981,#059669);border-radius:50%;width:64px;height:64px;line-height:64px;font-size:32px;text-align:center;color:#fff;margin-bottom:12px;box-shadow:0 6px 16px rgba(16,185,129,0.4);">
                ✓
              </div>
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">¡PAGO RECIBIDO — MUCHAS GRACIAS POR SU PAGO!</h1>
              <p style="margin:6px 0 0;color:#34d399;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;">
                ${edificio.toUpperCase()} · COMPROBANTE Y CONSTANCIA DE PAGO
              </p>
            </td>
          </tr>

          <!-- CUERPO -->
          <tr>
            <td style="padding:32px 28px;">
              <p style="margin:0 0 16px;font-size:16px;color:#f8fafc;line-height:1.5;">
                Estimado(a) <strong>${datos.propietarioNombre ? datos.propietarioNombre.trim() : `Copropietario del Apto. ${datos.apartamentoNumero}`}</strong>,
              </p>
              
              <!-- MENSAJE DE AGRADECIMIENTO DESTACADO -->
              <div style="background:rgba(16, 185, 129, 0.08);border:1px solid rgba(16, 185, 129, 0.35);border-radius:14px;padding:18px;margin-bottom:24px;text-align:center;">
                <div style="font-size:16px;color:#4ade80;font-weight:800;margin-bottom:4px;">
                  🌟 ¡Muchas gracias por su pago y por apoyar a la comunidad!
                </div>
                <div style="font-size:13px;color:#94a3b8;line-height:1.5;">
                  Su valioso aporte ha sido validado exitosamente en el sistema de condominio y aplicado a su cuenta. Gracias por su compromiso con el mantenimiento y operatividad de nuestra comunidad.
                </div>
              </div>

              <!-- DETALLES DEL COMPROBANTE -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#090d14;border:1px solid #1e293b;border-radius:14px;margin-bottom:24px;overflow:hidden;">
                <tr>
                  <td style="padding:16px 20px;border-bottom:1px solid #1e293b;">
                    <table width="100%">
                      <tr>
                        <td style="font-size:12px;color:#64748b;text-transform:uppercase;font-weight:700;">Inmueble</td>
                        <td align="right" style="font-size:15px;color:#fff;font-weight:800;">Apartamento ${datos.apartamentoNumero}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 20px;border-bottom:1px solid #1e293b;">
                    <table width="100%">
                      <tr>
                        <td style="font-size:12px;color:#64748b;text-transform:uppercase;font-weight:700;">Monto Aprobado</td>
                        <td align="right" style="font-size:20px;color:#10b981;font-weight:900;">
                          $ ${fmtUsd(datos.montoUsd)} USD <span style="font-size:14px;color:#94a3b8;">(${fmtBs(datos.montoBs)} Bs)</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                ${datos.referencia ? `
                <tr>
                  <td style="padding:14px 20px;border-bottom:1px solid #1e293b;">
                    <table width="100%">
                      <tr>
                        <td style="font-size:12px;color:#64748b;">Nro. Referencia:</td>
                        <td align="right" style="font-size:13px;color:#fff;font-family:monospace;font-weight:700;">${datos.referencia}</td>
                      </tr>
                    </table>
                  </td>
                </tr>` : ''}
                <tr>
                  <td style="padding:14px 20px;">
                    <table width="100%">
                      <tr>
                        <td style="font-size:12px;color:#64748b;">Fecha de Verificación:</td>
                        <td align="right" style="font-size:13px;color:#cbd5e1;text-transform:capitalize;">${fechaStr}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- BOTÓN CTA: DESCARGAR RECIBO -->
              <div style="text-align:center;margin-bottom:24px;">
                <a href="${portal}/recibos" target="_blank" style="display:inline-block;background:linear-gradient(135deg, #10b981 0%, #059669 100%);color:#ffffff;text-decoration:none;padding:14px 34px;border-radius:12px;font-size:14px;font-weight:800;box-shadow:0 6px 20px rgba(16, 185, 129, 0.35);">
                  📥 Descargar Recibo Oficial Certificado (PDF) →
                </a>
              </div>

              <p style="margin:0;font-size:12px;color:#64748b;text-align:center;">
                Su recibo oficial con firma de solvencia y sello de la administración se encuentra archivado y disponible para descargar en su portal en cualquier momento.
              </p>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background-color:#090d14;padding:18px;text-align:center;border-top:1px solid #1e293b;font-size:11px;color:#475569;">
              © ${new Date().getFullYear()} ${edificio} · Constancia de Pago Electrónica
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  return { subject, html }
}

// ── 3b. PLANTILLA: NOTIFICACIÓN DE CUOTA ESPECIAL / COMUNAL DE GAS ───────────
export function generarHtmlCuotaGas(datos: DatosEmailCuotaGas): { subject: string; html: string } {
  const edificio = datos.edificioNombre || DEFAULT_EDIFICIO
  const portal = datos.portalUrl || DEFAULT_PORTAL_URL
  const banco = datos.banco || DEFAULT_BANCO
  const titular = datos.titular || DEFAULT_TITULAR
  const rif = datos.rifCedula || DEFAULT_RIF
  const telefono = datos.telefono || ''
  const esEspecial = !!datos.esCuotaEspecial

  const subject = esEspecial
    ? `⛽ Cuota Especial de Gas — Apto. ${datos.apartamentoNumero} | ${edificio}`
    : `⛽ Notificación de Cuota de Gas Comunal — Apto. ${datos.apartamentoNumero} | ${edificio}`

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#07090e;font-family:'Segoe UI',Roboto,-apple-system,BlinkMacSystemFont,sans-serif;color:#e2e8f0;line-height:1.5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#07090e;padding:30px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:580px;background-color:#0f172a;border-radius:18px;border:1px solid #1e293b;overflow:hidden;box-shadow:0 16px 40px rgba(0,0,0,0.6);" cellspacing="0" cellpadding="0">
          
          <!-- BANNER SUPERIOR -->
          <tr>
            <td style="background:linear-gradient(135deg, ${esEspecial ? '#dc2626 0%, #ea580c 100%' : '#ea580c 0%, #d97706 100%'});padding:28px 24px;text-align:center;">
              <div style="font-size:32px;line-height:1;margin-bottom:8px;">⛽</div>
              <div style="display:inline-block;background-color:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.2);padding:4px 14px;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#ffffff;margin-bottom:10px;">
                ${esEspecial ? '⚡ Cuota Especial de Gas' : 'Servicio de Gas Comunal'}
              </div>
              <h1 style="margin:0;font-size:22px;font-weight:900;color:#ffffff;letter-spacing:-0.3px;">
                ${edificio}
              </h1>
            </td>
          </tr>

          <!-- CONTENIDO PRINCIPAL -->
          <tr>
            <td style="padding:28px 24px;">
              <p style="margin:0 0 16px;font-size:14px;color:#94a3b8;">
                Estimado(a) residente del <strong style="color:#ffffff;">Apartamento ${datos.apartamentoNumero}</strong>${datos.propietarioNombre ? ` (${datos.propietarioNombre})` : ''}:
              </p>
              <p style="margin:0 0 20px;font-size:13.5px;color:#cbd5e1;line-height:1.6;">
                La administración ha establecido una <strong style="color:${esEspecial ? '#f87171' : '#fb923c'};">${esEspecial ? 'Cuota Especial / Extraordinaria' : 'Cuota Comunitaria'}</strong> para la recarga del tanque central y continuidad del servicio de gas del edificio:
              </p>

              <!-- TARJETA DEL MONTO -->
              <div style="background-color:#1e293b;border-radius:14px;border:1px solid ${esEspecial ? 'rgba(239, 68, 68, 0.4)' : 'rgba(249, 115, 22, 0.35)'};padding:20px;text-align:center;margin-bottom:24px;">
                <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px;">
                  ${datos.tituloCuota}
                </div>
                <div style="font-size:32px;font-weight:900;color:#ffffff;line-height:1.2;margin-bottom:4px;">
                  Bs. ${fmtBs(datos.montoBs)}
                </div>
                <div style="font-size:13px;color:#94a3b8;font-weight:600;">
                  ≈ $${fmtUsd(datos.montoUsd)} USD <span style="font-size:11px;color:#64748b;">(Tasa BCV: ${fmtBs(datos.tasaBcv)} Bs/$)</span>
                </div>
                ${datos.fechaLimite ? `
                <div style="display:inline-block;margin-top:12px;background-color:rgba(239, 68, 68, 0.15);border:1px solid rgba(239, 68, 68, 0.3);color:#fca5a5;padding:4px 12px;border-radius:6px;font-size:11.5px;font-weight:700;">
                  ⏳ Fecha Límite de Recaudación: ${datos.fechaLimite}
                </div>
                ` : ''}
              </div>

              <!-- DATOS BANCARIOS PARA PAGO MÓVIL / TRANSFERENCIA -->
              <div style="background-color:#0b1120;border:1px solid #1e293b;border-radius:12px;padding:16px 18px;margin-bottom:24px;">
                <div style="font-size:12px;font-weight:800;color:#38bdf8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">
                  💳 Datos de Pago (Exclusivo Cuenta de Gas)
                </div>
                <table style="width:100%;font-size:12.5px;color:#cbd5e1;" cellspacing="0" cellpadding="4">
                  <tr>
                    <td style="color:#64748b;width:35%;">Banco:</td>
                    <td style="color:#ffffff;font-weight:700;">${banco}</td>
                  </tr>
                  ${telefono ? `
                  <tr>
                    <td style="color:#64748b;">Pago Móvil:</td>
                    <td style="color:#ffffff;font-weight:700;">${telefono}</td>
                  </tr>
                  ` : ''}
                  ${rif ? `
                  <tr>
                    <td style="color:#64748b;">C.I. / RIF:</td>
                    <td style="color:#ffffff;font-weight:700;">${rif}</td>
                  </tr>
                  ` : ''}
                  <tr>
                    <td style="color:#64748b;">Titular:</td>
                    <td style="color:#ffffff;font-weight:700;">${titular}</td>
                  </tr>
                  <tr>
                    <td style="color:#64748b;">Concepto:</td>
                    <td style="color:#fb923c;font-weight:700;">Gas Apto ${datos.apartamentoNumero}</td>
                  </tr>
                </table>
              </div>

              <!-- BOTÓN CTA -->
              <div style="text-align:center;margin-bottom:20px;">
                <a href="${portal}/gas" target="_blank" style="display:inline-block;background:linear-gradient(135deg, #f97316 0%, #ea580c 100%);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:14px;font-weight:800;box-shadow:0 6px 20px rgba(249, 115, 22, 0.4);">
                  Reportar Pago de Gas en mi Portal →
                </a>
              </div>

              <p style="margin:0;font-size:11.5px;color:#64748b;text-align:center;line-height:1.5;">
                *Nota: Este pago es independiente del recibo ordinario de condominio. Una vez efectuado el pago móvil o transferencia, ingresa a tu portal para registrar el número de referencia.
              </p>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background-color:#090d14;padding:16px;text-align:center;border-top:1px solid #1e293b;font-size:11px;color:#475569;">
              © ${new Date().getFullYear()} ${edificio} · Servicio de Gas Comunal
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  return { subject, html }
}

// ── 4. FUNCIÓN DISPARADORA DEL ENVÍO DE EMAIL ────────────────────────────────
export async function enviarEmail(params: {
  to: string
  subject: string
  html: string
}): Promise<{ ok: boolean; error?: string }> {
  const { to, subject, html } = params
  if (!to || !to.includes('@')) {
    return { ok: false, error: 'Dirección de correo inválida o no registrada' }
  }

  // 1. Intentar llamar a Supabase Edge Function 'enviar-email'
  try {
    const { data, error } = await supabase.functions.invoke('enviar-email', {
      body: { to, subject, html },
    })
    if (!error && (data?.ok || data?.id)) {
      return { ok: true }
    }
    if (error) {
      let errMsg = error.message
      if ((error as any).context && typeof (error as any).context.json === 'function') {
        try {
          const body = await (error as any).context.json()
          if (body?.error) errMsg = body.error
        } catch {}
      }
      if (errMsg.includes('only send testing emails to your own email address')) {
        return {
          ok: false,
          error: 'Modo de prueba Resend: Actualmente solo permite enviar a dohuglas.r@gmail.com. Para enviar a otros residentes, verifica un dominio en resend.com/domains.'
        }
      }
      return { ok: false, error: errMsg }
    }
  } catch (edgeErr: any) {
    console.debug('[EmailService] Error invocando Edge Function, probando envío directo:', edgeErr)
  }

  // 2. Intentar llamar a la API de Resend directamente si hay clave en entorno
  const resendApiKey = (import.meta as any).env?.VITE_RESEND_API_KEY
  if (resendApiKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Residencias Ocutuy 5 <onboarding@resend.dev>',
          to,
          subject,
          html,
        }),
      })
      const resData = await res.json()
      if (res.ok) {
        return { ok: true }
      }
      if (resData?.message?.includes('only send testing emails to your own email address')) {
        return {
          ok: false,
          error: 'Modo de prueba Resend: Actualmente solo permite enviar a dohuglas.r@gmail.com. Para enviar a otros residentes, verifica un dominio en resend.com/domains.'
        }
      }
      return { ok: false, error: resData?.message || 'Error en servicio Resend' }
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Error de conexión enviando email' }
    }
  }

  // 3. Si no hay proveedor configurado
  console.warn(`[EmailService] ⚠️ No se pudo enviar correo a "${to}": Falta proveedor de correo. Asunto:`, subject)
  return {
    ok: false,
    error: 'Servicio de correo no configurado. Se requiere configurar la API Key de Resend en Supabase o en .env.local.'
  }
}

// ── DISPARADORES DE ALTO NIVEL ────────────────────────────────────────────────

/**
 * Dispara el email de emisión de recibo
 */
export async function despacharEmailRecibo(datos: DatosEmailRecibo): Promise<{ ok: boolean; error?: string }> {
  const { subject, html } = generarHtmlReciboEmitido(datos)
  return enviarEmail({ to: datos.destinatarioEmail, subject, html })
}

/**
 * Dispara el email de recordatorio de mora (con verificación de 3 días)
 */
export async function despacharEmailRecordatorioMora(
  datos: DatosEmailMora,
  forzar: boolean = false
): Promise<{ ok: boolean; omitidoPorFrecuencia?: boolean; error?: string }> {
  const claveApto = datos.apartamentoId || datos.apartamentoNumero

  if (!forzar && !esElegibleRecordatorio3Dias(claveApto)) {
    return { ok: true, omitidoPorFrecuencia: true }
  }

  const { subject, html } = generarHtmlRecordatorioMora(datos)
  const res = await enviarEmail({ to: datos.destinatarioEmail, subject, html })

  if (res.ok) {
    registrarRecordatorioEnviado(claveApto)
  }

  return res
}

/**
 * Dispara el email de pago aprobado y solvencia
 */
export async function despacharEmailPagoAprobado(datos: DatosEmailPagoAprobado): Promise<{ ok: boolean; error?: string }> {
  const { subject, html } = generarHtmlPagoAprobado(datos)
  return enviarEmail({ to: datos.destinatarioEmail, subject, html })
}

/**
 * Dispara el email de cuota especial o comunal de gas
 */
export async function despacharEmailCuotaGas(datos: DatosEmailCuotaGas): Promise<{ ok: boolean; error?: string }> {
  const { subject, html } = generarHtmlCuotaGas(datos)
  return enviarEmail({ to: datos.destinatarioEmail, subject, html })
}

