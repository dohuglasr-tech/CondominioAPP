// ============================================================
// EDGE FUNCTION: notificacion-pago
// ============================================================
// Propósito: Se dispara via Database Webhook cuando un pago
//            es APROBADO o RECHAZADO. Envía email al residente
//            vía Resend y crea notificación in-app.
//
// Despliegue:
//   supabase functions deploy notificacion-pago --no-verify-jwt
//
// Webhook (configurar en Supabase Dashboard > Database > Webhooks):
//   Nombre: on_pago_revisado
//   Tabla:  public.pagos_reportados
//           Evento: UPDATE
//   URL:    https://<PROJECT_REF>.supabase.co/functions/v1/notificacion-pago
//   Headers: { "Authorization": "Bearer <ANON_KEY>" }
//
// Variables de entorno requeridas:
//   SUPABASE_URL              → URL del proyecto
//   SUPABASE_SERVICE_ROLE_KEY → Para bypasear RLS
//   RESEND_API_KEY            → API Key de resend.com
//   EMAIL_FROM                → ej: "Torre 5 <no-reply@torre5.com>"
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "Torre 5 <no-reply@torre5.com>";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── Tipos del payload del webhook de Supabase ─────────────────────
interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: PagoRecord;
  old_record: PagoRecord | null;
}

interface PagoRecord {
  id: string;
  apartamento_id: string;
  reportado_por: string;
  metodo: string;
  monto_usd: number | null;
  monto_bs: number | null;
  referencia: string | null;
  estado: "pendiente" | "aprobado" | "rechazado";
  motivo_rechazo: string | null;
  notas_admin: string | null;
  fecha_pago: string;
  created_at: string;
}

// ── Obtener datos necesarios para el email ────────────────────────
async function obtenerDatosEmail(pago: PagoRecord) {
  // Obtener email del residente desde auth.users
  const { data: usuario } = await supabase.auth.admin.getUserById(
    pago.reportado_por
  );

  // Obtener perfil del residente
  const { data: perfil } = await supabase
    .from("perfiles")
    .select("nombre_completo")
    .eq("id", pago.reportado_por)
    .single();

  // Obtener número de apartamento
  const { data: apto } = await supabase
    .from("apartamentos")
    .select("numero")
    .eq("id", pago.apartamento_id)
    .single();

  // Obtener tasa BCV actual para mostrar en el recibo
  const { data: config } = await supabase
    .from("configuracion_edificio")
    .select("nombre_edificio, tasa_bcv_actual")
    .single();

  return {
    emailDestino: usuario?.user?.email ?? null,
    nombreResidente: perfil?.nombre_completo ?? `Apto. ${apto?.numero}`,
    numeroApto: apto?.numero ?? "N/A",
    nombreEdificio: config?.nombre_edificio ?? "Torre 5",
    tasaBcv: config?.tasa_bcv_actual ?? 0,
  };
}

// ── Templates de email ────────────────────────────────────────────
function emailAprobado(
  nombre: string,
  apto: string,
  edificio: string,
  pago: PagoRecord,
  tasaBcv: number
): { subject: string; html: string } {
  const montoUsd = pago.monto_usd
    ? `$${Number(pago.monto_usd).toFixed(2)}`
    : "—";
  const montoBs = pago.monto_usd && tasaBcv
    ? `Bs. ${(pago.monto_usd * tasaBcv).toLocaleString("es-VE", { minimumFractionDigits: 2 })}`
    : "—";
  const fecha = new Date(pago.fecha_pago).toLocaleDateString("es-VE", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return {
    subject: `✅ Pago Confirmado — ${edificio} | Apto. ${apto}`,
    html: `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirmación de Pago</title>
</head>
<body style="margin:0;padding:0;background:#0f1117;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- HEADER -->
          <tr>
            <td style="background:linear-gradient(135deg,#1a1f2e,#0d1117);border-radius:16px 16px 0 0;padding:32px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.08);">
              <div style="font-size:36px;margin-bottom:8px;">🏢</div>
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">${edificio}</h1>
              <p style="margin:6px 0 0;color:#64748b;font-size:13px;text-transform:uppercase;letter-spacing:2px;">Sistema de Condominio</p>
            </td>
          </tr>

          <!-- CUERPO -->
          <tr>
            <td style="background:#1a1f2e;padding:36px;">

              <!-- Icono confirmación -->
              <div style="text-align:center;margin-bottom:28px;">
                <div style="display:inline-block;background:linear-gradient(135deg,#10b981,#059669);border-radius:50%;width:72px;height:72px;line-height:72px;font-size:36px;text-align:center;">✓</div>
              </div>

              <h2 style="color:#f1f5f9;font-size:20px;font-weight:700;margin:0 0 8px;text-align:center;">¡Pago Confirmado!</h2>
              <p style="color:#94a3b8;font-size:15px;margin:0 0 28px;text-align:center;">Hola ${nombre}, tu pago ha sido verificado y aprobado.</p>

              <!-- Recibo -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;border-radius:12px;overflow:hidden;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px 24px;border-bottom:1px solid rgba(255,255,255,0.06);">
                    <p style="margin:0;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:4px;">Apartamento</p>
                    <p style="margin:0;color:#f1f5f9;font-size:18px;font-weight:700;">Apto. ${apto}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 24px;border-bottom:1px solid rgba(255,255,255,0.06);">
                    <table width="100%">
                      <tr>
                        <td>
                          <p style="margin:0;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:4px;">Monto USD</p>
                          <p style="margin:0;color:#10b981;font-size:20px;font-weight:700;">${montoUsd}</p>
                        </td>
                        <td align="right">
                          <p style="margin:0;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:4px;">Equivalente Bs.</p>
                          <p style="margin:0;color:#64748b;font-size:16px;font-weight:600;">${montoBs}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 24px;border-bottom:1px solid rgba(255,255,255,0.06);">
                    <p style="margin:0;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:4px;">Método de Pago</p>
                    <p style="margin:0;color:#f1f5f9;font-size:15px;font-weight:600;text-transform:capitalize;">${pago.metodo.replace("_", " ")}</p>
                  </td>
                </tr>
                ${pago.referencia ? `
                <tr>
                  <td style="padding:16px 24px;border-bottom:1px solid rgba(255,255,255,0.06);">
                    <p style="margin:0;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:4px;">Referencia</p>
                    <p style="margin:0;color:#f1f5f9;font-size:15px;font-weight:600;font-family:monospace;">${pago.referencia}</p>
                  </td>
                </tr>` : ""}
                <tr>
                  <td style="padding:16px 24px;">
                    <p style="margin:0;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:4px;">Fecha del Pago</p>
                    <p style="margin:0;color:#f1f5f9;font-size:14px;font-weight:500;text-transform:capitalize;">${fecha}</p>
                  </td>
                </tr>
              </table>

              ${pago.notas_admin ? `
              <div style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.2);border-radius:8px;padding:14px 16px;margin-bottom:24px;">
                <p style="margin:0;color:#10b981;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Nota del Administrador</p>
                <p style="margin:0;color:#d1fae5;font-size:14px;">${pago.notas_admin}</p>
              </div>` : ""}

              <p style="color:#64748b;font-size:13px;text-align:center;margin:0;">
                Puedes ver tu historial de pagos completo en el portal del condominio.
              </p>

            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#0d1117;border-radius:0 0 16px 16px;padding:20px;text-align:center;border-top:1px solid rgba(255,255,255,0.06);">
              <p style="margin:0;color:#374151;font-size:11px;">
                ${edificio} — Sistema de Administración de Condominio<br>
                Este es un correo automático, por favor no respondas a este mensaje.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  };
}

function emailRechazado(
  nombre: string,
  apto: string,
  edificio: string,
  pago: PagoRecord
): { subject: string; html: string } {
  return {
    subject: `⚠️ Pago No Procesado — ${edificio} | Apto. ${apto}`,
    html: `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <tr>
            <td style="background:linear-gradient(135deg,#1a1f2e,#0d1117);border-radius:16px 16px 0 0;padding:32px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.08);">
              <div style="font-size:36px;margin-bottom:8px;">🏢</div>
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">${edificio}</h1>
              <p style="margin:6px 0 0;color:#64748b;font-size:13px;text-transform:uppercase;letter-spacing:2px;">Sistema de Condominio</p>
            </td>
          </tr>
          <tr>
            <td style="background:#1a1f2e;padding:36px;">
              <div style="text-align:center;margin-bottom:28px;">
                <div style="display:inline-block;background:linear-gradient(135deg,#ef4444,#dc2626);border-radius:50%;width:72px;height:72px;line-height:72px;font-size:36px;text-align:center;">!</div>
              </div>
              <h2 style="color:#f1f5f9;font-size:20px;font-weight:700;margin:0 0 8px;text-align:center;">Pago No Procesado</h2>
              <p style="color:#94a3b8;font-size:15px;margin:0 0 24px;text-align:center;">Hola ${nombre}, lamentablemente tu pago reportado no pudo ser procesado.</p>

              ${pago.motivo_rechazo ? `
              <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);border-radius:8px;padding:16px;margin-bottom:24px;">
                <p style="margin:0;color:#ef4444;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Motivo del rechazo</p>
                <p style="margin:0;color:#fecaca;font-size:15px;">${pago.motivo_rechazo}</p>
              </div>` : ""}

              <p style="color:#94a3b8;font-size:14px;text-align:center;">
                Por favor vuelve a reportar tu pago corrigiendo los datos indicados.<br>
                Si tienes dudas, contacta directamente al administrador.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#0d1117;border-radius:0 0 16px 16px;padding:20px;text-align:center;border-top:1px solid rgba(255,255,255,0.06);">
              <p style="margin:0;color:#374151;font-size:11px;">${edificio} — Sistema de Administración de Condominio<br>Este es un correo automático.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  };
}

// ── Enviar email vía Resend ────────────────────────────────────────
async function enviarEmail(
  to: string,
  subject: string,
  html: string
): Promise<boolean> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: EMAIL_FROM, to, subject, html }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("[Resend] Error:", data);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Resend] Excepción:", err);
    return false;
  }
}

// ── Crear notificación in-app ─────────────────────────────────────
async function crearNotificacionInApp(
  usuarioId: string,
  aprobado: boolean,
  apto: string,
  monto: number | null
): Promise<void> {
  const montoStr = monto ? `$${Number(monto).toFixed(2)}` : "";
  await supabase.from("notificaciones").insert({
    usuario_id: usuarioId,
    titulo: aprobado ? "✅ Pago Confirmado" : "⚠️ Pago Rechazado",
    mensaje: aprobado
      ? `Tu pago ${montoStr} para el Apto. ${apto} ha sido aprobado.`
      : `Tu pago reportado para el Apto. ${apto} fue rechazado. Revisa el motivo.`,
    tipo: aprobado ? "success" : "warning",
    link: "/mis-pagos",
  });
}

// ── Handler principal ─────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const payload: WebhookPayload = await req.json();

    // Solo procesar UPDATEs donde el estado cambió
    const { record, old_record, type } = payload;

    if (type !== "UPDATE" || !old_record) {
      return Response.json({ ok: true, omitido: "no es UPDATE" });
    }

    // El estado no cambió — ignorar
    if (record.estado === old_record.estado) {
      return Response.json({ ok: true, omitido: "estado sin cambio" });
    }

    // Solo procesar si pasó a 'aprobado' o 'rechazado'
    if (record.estado !== "aprobado" && record.estado !== "rechazado") {
      return Response.json({ ok: true, omitido: "estado irrelevante" });
    }

    // Obtener datos del residente y edificio
    const { emailDestino, nombreResidente, numeroApto, nombreEdificio, tasaBcv } =
      await obtenerDatosEmail(record);

    if (!emailDestino) {
      console.warn("[notificacion-pago] No se encontró email para:", record.reportado_por);
      // Aún crear notificación in-app aunque no haya email
    }

    const aprobado = record.estado === "aprobado";

    // Crear notificación in-app (siempre)
    await crearNotificacionInApp(
      record.reportado_por,
      aprobado,
      numeroApto,
      record.monto_usd
    );

    // Enviar email si hay dirección
    let emailEnviado = false;
    if (emailDestino) {
      const { subject, html } = aprobado
        ? emailAprobado(nombreResidente, numeroApto, nombreEdificio, record, tasaBcv)
        : emailRechazado(nombreResidente, numeroApto, nombreEdificio, record);

      emailEnviado = await enviarEmail(emailDestino, subject, html);
    }

    return Response.json({
      ok: true,
      estado: record.estado,
      apto: numeroApto,
      emailEnviado,
      notificacionInApp: true,
    });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err);
    console.error("[notificacion-pago] ERROR:", mensaje);
    return Response.json({ ok: false, error: mensaje }, { status: 500 });
  }
});
