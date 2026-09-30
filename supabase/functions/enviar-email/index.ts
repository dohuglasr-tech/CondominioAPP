// ============================================================
// EDGE FUNCTION: enviar-email
// ============================================================
// Propósito: Despacho universal de correos electrónicos para:
//   1. Emisión de recibos de condominio (avisos de cobro)
//   2. Recordatorios automáticos de mora cada 3 días
//   3. Aprobación de pagos y constancia de solvencia
//
// Métodos soportados automáticamente:
//   A. Gmail SMTP (Recomendado sin dominio y 100% libre de bloqueos en Venezuela):
//      Variables: GMAIL_USER (ej. tucondominio@gmail.com)
//                 GMAIL_APP_PASSWORD (contraseña de aplicación de 16 caracteres)
//
//   B. Google Apps Script Web App:
//      Variable:  GOOGLE_SCRIPT_URL
//
//   C. Resend API:
//      Variable:  RESEND_API_KEY
// ============================================================

import nodemailer from "npm:nodemailer@6.9.13";

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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  // Manejo de pre-flight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { to, subject, html, from } = body;

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

        const info = await transporter.sendMail({
          from: remitente,
          to: destinatario,
          subject,
          html,
        });

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
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: remitenteResend,
          to: Array.isArray(to) ? to : [to],
          subject,
          html,
        }),
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
