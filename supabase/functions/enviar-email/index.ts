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

const ALLOWED_ORIGINS_ENV = (Deno.env.get("ALLOWED_ORIGINS") || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const ALLOWED_ORIGINS = Array.from(
  new Set([
    "https://domus-ve.vercel.app",
    "https://domus.ve",
    "http://localhost:3000",
    "http://localhost:5173",
    "capacitor://localhost",
    "http://localhost",
    ...ALLOWED_ORIGINS_ENV,
  ])
);

const ALLOWED_RESET_ORIGINS_ENV = (Deno.env.get("ALLOWED_RESET_ORIGINS") || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const ALLOWED_RESET_ORIGINS = Array.from(
  new Set([
    "https://domus-ve.vercel.app",
    "https://domus.ve",
    "http://localhost:3000",
    "http://localhost:5173",
    ...ALLOWED_RESET_ORIGINS_ENV,
  ])
);

const DEFAULT_RESET_REDIRECT = "https://domus-ve.vercel.app/reset-password";

// Rate-limiting en memoria para recuperar-password (máx 3 solicitudes cada 5 min por clave)
const resetRateLimiter = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX = 3;

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = (req.headers.get("origin") || "").trim();
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function sanitizeResetRedirect(rawUrl?: string): string {
  if (!rawUrl || typeof rawUrl !== "string") return DEFAULT_RESET_REDIRECT;
  try {
    const parsed = new URL(rawUrl.trim());
    if (
      ALLOWED_RESET_ORIGINS.includes(parsed.origin) &&
      parsed.pathname.startsWith("/reset-password")
    ) {
      return `${parsed.origin}/reset-password`;
    }
  } catch {
    // URL inválida
  }
  return DEFAULT_RESET_REDIRECT;
}

function maskEmail(email: string): string {
  if (!email || !email.includes("@")) return "tu correo registrado";
  const [u, d] = email.split("@");
  if (!u || !d) return "tu correo registrado";
  if (u.length <= 2) return `${u[0]}*@${d}`;
  return `${u[0]}${"*".repeat(Math.min(6, Math.max(3, u.length - 2)))}${u[u.length - 1]}@${d}`;
}

function checkResetRateLimit(key: string): boolean {
  const now = Date.now();
  const prev = (resetRateLimiter.get(key) || []).filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
  if (prev.length >= RATE_LIMIT_MAX) {
    resetRateLimiter.set(key, prev);
    return false;
  }
  prev.push(now);
  resetRateLimiter.set(key, prev);
  return true;
}

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

async function resolverCuentaResidenteServidor(
  supabaseAdmin: any,
  rawIdentifier: string,
  fallbackNombre?: string,
  fallbackApto?: string
): Promise<{
  email: string;
  nombre?: string;
  apto?: string;
  edificioId: string | null;
}> {
  const clean = rawIdentifier.trim();
  if (clean.includes("@")) {
    return {
      email: clean.toLowerCase(),
      nombre: fallbackNombre,
      apto: fallbackApto,
      edificioId: null,
    };
  }

  let email = "";
  let nombre = fallbackNombre;
  let apto = fallbackApto;
  let edificioId: string | null = null;

  const { data: aptos } = await supabaseAdmin
    .from("apartamentos")
    .select("*")
    .ilike("numero", clean)
    .limit(1);

  if (aptos && aptos.length > 0) {
    const aptoRow: any = aptos[0];
    apto = aptoRow.numero;
    edificioId = aptoRow.edificio_id || null;

    const { data: perfApto } = await supabaseAdmin
      .from("perfiles")
      .select("nombre_completo, propietario_email, email")
      .eq("apartamento_id", aptoRow.id)
      .limit(1);

    if (perfApto && perfApto.length > 0) {
      nombre = perfApto[0].nombre_completo || nombre;
      email = String(perfApto[0].propietario_email || perfApto[0].email || "").trim().toLowerCase();
    }
  } else {
    const digits = clean.replace(/[^0-9]/g, "");
    if (digits.length >= 5) {
      const { data: perfCed } = await supabaseAdmin
        .from("perfiles")
        .select("nombre_completo, propietario_email, email, apartamento_id, apartamento:apartamento_id(numero)")
        .or(`cedula.ilike.%${digits}%,propietario_cedula.ilike.%${digits}%`)
        .limit(1);

      if (perfCed && perfCed.length > 0) {
        const p: any = perfCed[0];
        nombre = p.nombre_completo || nombre;
        apto = p.apartamento?.numero || apto;
        email = String(p.propietario_email || p.email || "").trim().toLowerCase();
      }
    }
  }

  return { email, nombre, apto, edificioId };
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  // Manejo de pre-flight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({ ok: false, error: "Credenciales de servicio Supabase no configuradas en Edge Function." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json();

    let { to, bcc, replyTo, subject, html, from, attachments } = body;
    const tipo = body.tipo || body.accion || "";
    let defaultBuildingName = "Domus Condominio";
    let resetMetaResponse: { maskedEmail?: string; apto?: string } | null = null;

    // ──────────────────────────────────────────────────────────
    // CASO ESPECIAL A: VERIFICAR OTP DE RECUPERACIÓN (por correo/apto/cédula)
    // ──────────────────────────────────────────────────────────
    if (tipo === "verificar-otp-recovery") {
      const rawIdentifier = String(body.identifier || body.email || "").trim();
      const token = String(body.token || "").trim();

      if (!rawIdentifier || !token) {
        return new Response(
          JSON.stringify({ ok: false, error: "Identificador y código OTP son requeridos." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const clientIp = (req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown").split(",")[0].trim();
      if (!checkResetRateLimit(`otp:${clientIp}:${rawIdentifier.toLowerCase()}`)) {
        return new Response(
          JSON.stringify({ ok: false, error: "Demasiados intentos. Espera 5 minutos antes de reintentar." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const resolved = await resolverCuentaResidenteServidor(supabaseAdmin, rawIdentifier);
      if (!resolved.email || !resolved.email.includes("@")) {
        return new Response(
          JSON.stringify({ ok: false, error: "Código incorrecto o expirado." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: otpData, error: otpErr } = await supabaseAdmin.auth.verifyOtp({
        email: resolved.email,
        token,
        type: "recovery",
      });

      if (otpErr || !otpData?.session) {
        return new Response(
          JSON.stringify({ ok: false, error: "Código incorrecto o expirado." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          ok: true,
          access_token: otpData.session.access_token,
          refresh_token: otpData.session.refresh_token,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ──────────────────────────────────────────────────────────
    // CASO ESPECIAL B: RESTABLECIMIENTO DE CONTRASEÑA (Público, con rate-limit + allowlist)
    // ──────────────────────────────────────────────────────────
    if (tipo === "recuperar-password" || tipo === "password-reset") {
      const rawIdentifier = String(body.identifier || body.email || to || "").trim();
      if (!rawIdentifier) {
        return new Response(
          JSON.stringify({ ok: false, error: "Por favor ingresa tu correo, número de apartamento o cédula." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const clientIp = (req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown").split(",")[0].trim();
      const rateKey = `${clientIp}:${rawIdentifier.toLowerCase()}`;
      if (!checkResetRateLimit(rateKey)) {
        return new Response(
          JSON.stringify({ ok: false, error: "Demasiados intentos recientes. Por favor espera 5 minutos antes de volver a intentarlo." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Resolver correo, nombre, apto y edificio en el servidor con service_role
      const resolved = await resolverCuentaResidenteServidor(
        supabaseAdmin,
        rawIdentifier,
        body.nombre,
        body.apto
      );
      const emailDestino = resolved.email;
      const nombreDestino = resolved.nombre;
      const aptoDestino = resolved.apto;
      const edificioIdDestino = resolved.edificioId;

      // Respuesta neutra si no hay correo encontrado (previene enumeración de cuentas)
      if (!emailDestino || !emailDestino.includes("@")) {
        return new Response(
          JSON.stringify({
            ok: true,
            neutral: true,
            maskedEmail: "tu correo registrado",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Obtener nombre dinámico del edificio
      let cfgQuery = supabaseAdmin.from("configuracion_edificio").select("nombre_edificio");
      if (edificioIdDestino) {
        cfgQuery = cfgQuery.eq("id", edificioIdDestino);
      }
      const { data: cfgRow } = await cfgQuery.limit(1).maybeSingle();
      defaultBuildingName = cfgRow?.nombre_edificio || body.edificio || "Domus Condominio";

      const targetBase = sanitizeResetRedirect(body.redirectTo);

      // Generar enlace de recuperación oficial
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email: emailDestino,
        options: { redirectTo: targetBase },
      });

      if (linkError || !linkData?.properties) {
        console.warn("[enviar-email] generateLink no generó enlace (se responde neutro):", linkError?.message);
        return new Response(
          JSON.stringify({
            ok: true,
            neutral: true,
            maskedEmail: maskEmail(emailDestino),
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const hashedToken = linkData.properties.hashed_token;
      const emailOtp = linkData.properties.email_otp;
      let resetUrl = linkData.properties.action_link;
      if (hashedToken && targetBase) {
        const cleanBase = targetBase.split("?")[0];
        resetUrl = `${cleanBase}?token_hash=${encodeURIComponent(hashedToken)}&type=recovery`;
      }

      to = emailDestino;
      subject = `🔑 Restablece tu contraseña - ${defaultBuildingName}`;
      html = generarHtmlRecuperacionPassword({
        nombre: nombreDestino,
        apto: aptoDestino,
        edificio: defaultBuildingName,
        resetUrl,
        codigoOtp: emailOtp,
      });
      resetMetaResponse = {
        maskedEmail: maskEmail(emailDestino),
        apto: aptoDestino,
      };
    } else {
      // ──────────────────────────────────────────────────────────
      // RESTO DE ENVÍOS: EXIGE JWT VÁLIDO + ROL ADMINISTRADOR / SUPERADMIN
      // ──────────────────────────────────────────────────────────
      const authHeader = (req.headers.get("authorization") || "").trim();
      const jwt = authHeader.toLowerCase().startsWith("bearer ")
        ? authHeader.slice(7).trim()
        : "";

      if (!jwt) {
        return new Response(
          JSON.stringify({ ok: false, error: "Autenticación requerida para enviar correos." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(jwt);
      if (userErr || !userRes?.user) {
        return new Response(
          JSON.stringify({ ok: false, error: "Token inválido o sesión expirada." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: perfilAdmin } = await supabaseAdmin
        .from("perfiles")
        .select("*")
        .eq("id", userRes.user.id)
        .maybeSingle();

      const rolUsuario = String((perfilAdmin as any)?.rol || "").toLowerCase();
      if (!["administrador", "superadmin", "admin"].includes(rolUsuario)) {
        return new Response(
          JSON.stringify({ ok: false, error: "Acceso denegado: solo administradores pueden despachar correos." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const adminEdificioId = (perfilAdmin as any)?.edificio_id || null;
      let cfgQuery = supabaseAdmin.from("configuracion_edificio").select("nombre_edificio");
      if (adminEdificioId) cfgQuery = cfgQuery.eq("id", adminEdificioId);
      const { data: cfgRow } = await cfgQuery.limit(1).maybeSingle();
      if (cfgRow?.nombre_edificio) {
        defaultBuildingName = cfgRow.nombre_edificio;
      }
    }

    const toList = Array.isArray(to) ? to.map((e: string) => String(e).trim()).filter(Boolean) : (to ? [String(to).trim()].filter(Boolean) : []);
    const bccList = Array.isArray(bcc) ? bcc.map((e: string) => String(e).trim()).filter(Boolean) : (bcc ? [String(bcc).trim()].filter(Boolean) : []);

    if ((toList.length === 0 && bccList.length === 0) || !subject || !html) {
      return new Response(
        JSON.stringify({ ok: false, error: "Parámetros ('to' o 'bcc'), 'subject' y 'html' son requeridos." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const destinatario = toList.join(", ");
    const bccHeader = bccList.join(", ");

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

        const remitente = from || (EMAIL_FROM_CONFIG.includes('<') ? EMAIL_FROM_CONFIG : `"${defaultBuildingName}" <${EMAIL_FROM_CONFIG || GMAIL_USER}>`);

        const mailOptions: Record<string, any> = {
          from: remitente,
          to: destinatario || GMAIL_USER,
          subject,
          html,
        };
        if (bccHeader) {
          mailOptions.bcc = bccHeader;
        }
        if (replyTo) {
          mailOptions.replyTo = String(replyTo).trim();
        }

        if (attachments && Array.isArray(attachments) && attachments.length > 0) {
          mailOptions.attachments = attachments.map((att: any) => ({
            filename: att.filename,
            content: att.content,
            encoding: "base64",
          }));
        }

        const info = await transporter.sendMail(mailOptions);

        return new Response(
          JSON.stringify({
            ok: true,
            provider: "gmail-smtp",
            id: info.messageId,
            bccSupported: true,
            bccCount: bccList.length,
            ...(resetMetaResponse || {}),
          }),
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
          body: JSON.stringify({
            to: destinatario || bccList[0] || "",
            ...(bccHeader ? { bcc: bccHeader } : {}),
            subject,
            html
          }),
        });
        const gasData = await gasRes.json().catch(() => ({}));
        if (gasRes.ok && (gasData.ok || gasData.success)) {
          return new Response(
            JSON.stringify({
              ok: true,
              provider: "google-script",
              bccSupported: Boolean(bccHeader),
              bccCount: bccList.length,
              ...(resetMetaResponse || {}),
            }),
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
      const remitenteResend = from || EMAIL_FROM_CONFIG || `${defaultBuildingName} <onboarding@resend.dev>`;
      const payloadResend: Record<string, any> = {
        from: remitenteResend,
        to: toList.length > 0 ? toList : [EMAIL_FROM_CONFIG || "onboarding@resend.dev"],
        subject,
        html,
      };
      if (bccList.length > 0) {
        payloadResend.bcc = bccList;
      }
      if (replyTo) {
        payloadResend.reply_to = String(replyTo).trim();
      }

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
        JSON.stringify({
          ok: true,
          provider: "resend",
          id: resData.id,
          bccSupported: true,
          bccCount: bccList.length,
          ...(resetMetaResponse || {}),
        }),
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
