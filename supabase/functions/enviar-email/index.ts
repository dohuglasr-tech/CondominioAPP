// ============================================================
// EDGE FUNCTION: enviar-email
// ============================================================
// Propósito: Despacho universal de correos electrónicos para:
//   1. Emisión de recibos de condominio (avisos de cobro)
//   2. Recordatorios automáticos de mora y cobranza
//   3. Aprobación de pagos y constancia de solvencia
//   4. Expediente Legal Inmobiliario con PDF adjunto
//   5. Restablecimiento de contraseña con enlace seguro oficial
//
// Métodos soportados automáticamente:
//   A. Gmail SMTP (100% libre de bloqueos, sin necesidad de dominio):
//      Variables: GMAIL_USER (ej. juntacondominioocutuy5@gmail.com)
//                 GMAIL_APP_PASSWORD (contraseña de aplicación de 16 caracteres)
//
//   B. Google Apps Script Web App:
//      Variable:  GOOGLE_SCRIPT_URL
//
//   C. Resend API:
//      Variable:  RESEND_API_KEY
// ============================================================

import nodemailer from "npm:nodemailer@6.9.13";
import { createClient } from "npm:@supabase/supabase-js@2.48.1";

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (req: Request) => Promise<Response> | Response): void;
};

const GMAIL_USER = (Deno.env.get("GMAIL_USER") || "").trim();
const GMAIL_APP_PASSWORD = (Deno.env.get("GMAIL_APP_PASSWORD") || "").trim().replace(/\s+/g, "");
const GOOGLE_SCRIPT_URL = (Deno.env.get("GOOGLE_SCRIPT_URL") || "").trim();
const RESEND_API_KEY = (Deno.env.get("RESEND_API_KEY") || "").trim();
const EMAIL_FROM_CONFIG = Deno.env.get("EMAIL_FROM") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Genera la plantilla HTML ejecutiva para recuperación de contraseña */
function generarHtmlRecuperacionPassword(params: {
  nombre?: string;
  apto?: string;
  edificio: string;
  resetUrl: string;
  codigoOtp?: string;
}): string {
  const { nombre, apto, edificio, resetUrl, codigoOtp } = params;
  const saludo = nombre ? `Hola, <strong>${nombre}</strong>` : apto ? `Estimado(a) residente del <strong>Apto. ${apto}</strong>` : 'Estimado(a) residente';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Restablecer Contraseña - ${edificio}</title>
</head>
<body style="margin:0;padding:0;background-color:#050811;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#f1f5f9;-webkit-font-smoothing:antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#050811;padding:28px 12px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:560px;background-color:#0e1626;border:1px solid #1e293b;border-radius:18px;overflow:hidden;box-shadow:0 15px 40px rgba(0,0,0,0.6);" cellpadding="0" cellspacing="0">
          
          <!-- TOP HEADER BANNER -->
          <tr>
            <td style="background:linear-gradient(135deg,#0a0f1d 0%,#182338 100%);padding:26px 24px;border-bottom:1px solid rgba(249,115,22,0.3);text-align:center;">
              <div style="display:inline-block;padding:5px 14px;background:rgba(249,115,22,0.15);border:1px solid rgba(249,115,22,0.4);border-radius:20px;font-size:11px;font-weight:800;color:#f97316;letter-spacing:1px;text-transform:uppercase;margin-bottom:10px;">
                🔑 Seguridad y Acceso
              </div>
              <h1 style="margin:0 0 4px;font-size:20px;font-weight:900;color:#ffffff;letter-spacing:-0.3px;">
                ${edificio}
              </h1>
              <div style="font-size:12px;color:#94a3b8;font-weight:500;">
                Portal de Administración y Residentes
              </div>
            </td>
          </tr>

          <!-- CONTENIDO PRINCIPAL -->
          <tr>
            <td style="padding:28px 24px;">
              <p style="margin:0 0 14px;font-size:15px;color:#cbd5e1;line-height:1.5;">
                ${saludo},
              </p>
              <p style="margin:0 0 20px;font-size:13.5px;color:#94a3b8;line-height:1.6;">
                Hemos recibido una solicitud para restablecer la contraseña de acceso a tu cuenta en el sistema de condominio. Para definir tu nueva clave de acceso directamente, haz clic en el siguiente botón:
              </p>

              <!-- BOTÓN DE ACCIÓN -->
              <div style="text-align:center;margin:28px 0;">
                <a href="${resetUrl}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#f97316 0%,#ea580c 100%);color:#ffffff;text-decoration:none;font-weight:800;font-size:14px;border-radius:12px;box-shadow:0 6px 20px rgba(249,115,22,0.45);letter-spacing:0.3px;">
                  Restablecer mi Contraseña ➔
                </a>
              </div>

              ${codigoOtp ? `
              <!-- CÓDIGO DIRECTO DE SEGURIDAD -->
              <div style="background:#070a13;border:1px dashed #f97316;border-radius:12px;padding:16px;margin:22px 0;text-align:center;">
                <div style="font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;margin-bottom:6px;letter-spacing:0.5px;">
                  O ingresa este código temporal en la aplicación:
                </div>
                <div style="font-size:26px;font-weight:900;letter-spacing:6px;color:#f97316;font-family:monospace;">
                  ${codigoOtp}
                </div>
              </div>
              ` : ''}

              <!-- ENLACE DIRECTO DE RESPALDO -->
              <div style="background:#070a13;border:1px solid #1e293b;border-radius:10px;padding:12px 14px;margin-bottom:24px;">
                <div style="font-size:11px;color:#64748b;font-weight:700;margin-bottom:4px;text-transform:uppercase;">
                  ¿El botón no responde? Copia este enlace en tu navegador:
                </div>
                <div style="font-size:11.5px;color:#38bdf8;word-break:break-all;line-height:1.4;">
                  ${resetUrl}
                </div>
              </div>

              <!-- AVISO DE SEGURIDAD -->
              <div style="background:rgba(234,179,8,0.08);border-left:4px solid #eab308;border-radius:6px;padding:12px 14px;font-size:12px;color:#cbd5e1;line-height:1.5;">
                <strong style="color:#fde047;">⚠️ Aviso de Seguridad:</strong> Este enlace es personal, de un solo uso y caduca en 1 hora. Si tú no solicitaste este cambio, puedes ignorar este mensaje de forma segura; tu contraseña actual continuará protegida.
              </div>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background-color:#090d14;padding:16px 24px;text-align:center;border-top:1px solid #1e293b;font-size:11px;color:#64748b;">
              © ${new Date().getFullYear()} ${edificio} · Notificación automática generada por el sistema
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req: Request) => {
  // Manejo de pre-flight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    let { to, subject, html, from, attachments } = body;
    const tipo = body.tipo || body.accion || "";

    // ──────────────────────────────────────────────────────────
    // CASO ESPECIAL: RESTABLECIMIENTO DE CONTRASEÑA
    // ──────────────────────────────────────────────────────────
    if (tipo === "recuperar-password" || tipo === "password-reset") {
      const emailDestino = (body.email || to || "").trim().toLowerCase();
      if (!emailDestino || !emailDestino.includes("@")) {
        return new Response(
          JSON.stringify({ ok: false, error: "Correo electrónico destinatario inválido." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        return new Response(
          JSON.stringify({ ok: false, error: "Credenciales de servicio Supabase no configuradas en Edge Function." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const targetBase = (body.redirectTo || "https://domus-ve.vercel.app/reset-password").trim();

      // Generar el enlace de recuperación oficial seguro de Supabase
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email: emailDestino,
        options: {
          redirectTo: targetBase,
        },
      });

      if (linkError || !linkData?.properties) {
        console.error("[enviar-email] Error generando enlace de recuperación:", linkError);
        return new Response(
          JSON.stringify({ ok: false, error: linkError?.message || "No se pudo generar el enlace de recuperación." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const hashedToken = linkData.properties.hashed_token;
      const emailOtp = linkData.properties.email_otp;

      // Usar enlace directo al portal con token_hash para entrar sin pasar por pantallas de login externas
      let resetUrl = linkData.properties.action_link;
      if (hashedToken && targetBase) {
        const cleanBase = targetBase.split('?')[0];
        resetUrl = `${cleanBase}?token_hash=${encodeURIComponent(hashedToken)}&type=recovery`;
      }

      const edificioNombre = body.edificio || "Residencias Ocutuy 5";

      to = emailDestino;
      subject = `🔑 Restablece tu contraseña - ${edificioNombre}`;
      html = generarHtmlRecuperacionPassword({
        nombre: body.nombre,
        apto: body.apto,
        edificio: edificioNombre,
        resetUrl,
        codigoOtp: emailOtp,
      });
    }

    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({ ok: false, error: "Parámetros 'to', 'subject' y 'html' son requeridos." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const destinatario = Array.isArray(to) ? to.join(", ") : to;

    // ──────────────────────────────────────────────────────────
    // MÉTODO 1: GMAIL SMTP (500 correos/día gratis, sin dominio, 0 bloqueos)
    // ──────────────────────────────────────────────────────────
    if (GMAIL_USER && GMAIL_APP_PASSWORD) {
      try {
        const transporter = nodemailer.createTransport({
          host: "smtp.gmail.com",
          port: 465,
          secure: true,
          auth: {
            user: GMAIL_USER,
            pass: GMAIL_APP_PASSWORD,
          },
        });

        const remitente = from || (EMAIL_FROM_CONFIG.includes('<') ? EMAIL_FROM_CONFIG : `"Residencias Ocutuy 5" <${EMAIL_FROM_CONFIG || GMAIL_USER}>`);

        const mailOptions: Record<string, any> = {
          from: remitente,
          to: destinatario,
          subject,
          html,
        };

        if (attachments && Array.isArray(attachments) && attachments.length > 0) {
          mailOptions.attachments = attachments.map((att: any) => ({
            filename: att.filename,
            content: att.content,
            encoding: "base64",
          }));
        }

        const info = await transporter.sendMail(mailOptions);

        return new Response(
          JSON.stringify({ ok: true, provider: "gmail-smtp", id: info.messageId }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (gmailErr: any) {
        console.error("[enviar-email] Error con Gmail SMTP:", gmailErr);
        return new Response(
          JSON.stringify({ ok: false, error: `Error enviando con Gmail: ${gmailErr?.message || String(gmailErr)}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ──────────────────────────────────────────────────────────
    // MÉTODO 2: GOOGLE APPS SCRIPT WEB APP (Alternativa gratuita)
    // ──────────────────────────────────────────────────────────
    if (GOOGLE_SCRIPT_URL) {
      try {
        const gasRes = await fetch(GOOGLE_SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: destinatario, subject, html }),
        });
        const gasData = await gasRes.json().catch(() => ({}));
        if (gasRes.ok && (gasData.ok || gasData.success)) {
          return new Response(
            JSON.stringify({ ok: true, provider: "google-script" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } catch (gasErr: any) {
        console.error("[enviar-email] Error con Google Apps Script:", gasErr);
      }
    }

    // ──────────────────────────────────────────────────────────
    // MÉTODO 3: RESEND API
    // ──────────────────────────────────────────────────────────
    if (RESEND_API_KEY) {
      const remitenteResend = from || EMAIL_FROM_CONFIG || "Residencias Ocutuy 5 <onboarding@resend.dev>";
      const payloadResend: Record<string, any> = {
        from: remitenteResend,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
      };

      if (attachments && Array.isArray(attachments) && attachments.length > 0) {
        payloadResend.attachments = attachments;
      }

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payloadResend),
      });

      const resData = await res.json();

      if (!res.ok) {
        console.error("[enviar-email] Error de Resend:", resData);
        return new Response(
          JSON.stringify({ ok: false, error: resData?.message || "Error enviando con Resend" }),
          { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ ok: true, provider: "resend", id: resData.id }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Si ningún proveedor tiene credenciales
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Ningún proveedor de correo está configurado en Supabase (GMAIL_USER + GMAIL_APP_PASSWORD o RESEND_API_KEY).",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[enviar-email] Excepción no controlada:", err);
    return new Response(
      JSON.stringify({ ok: false, error: err?.message || String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
