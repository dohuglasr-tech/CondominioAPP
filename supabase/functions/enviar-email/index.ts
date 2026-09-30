// ============================================================
// EDGE FUNCTION: enviar-email
// ============================================================
// Propósito: Despacho universal de correos electrónicos vía Resend
//            para emisión de recibos, recordatorios de mora cada 3 días
//            y constancias de pago aprobado.
//
// Despliegue:
//   supabase functions deploy enviar-email --no-verify-jwt
//
// Variables de entorno (en Supabase Dashboard > Settings > Edge Functions):
//   RESEND_API_KEY  → API Key de resend.com
//   EMAIL_FROM      → ej: "Residencias Ocutuy 5 <no-reply@resend.dev>"
// ============================================================

// Declaración de tipos para Deno runtime
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (req: Request) => Promise<Response> | Response): void;
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") || "Residencias Ocutuy 5 <no-reply@resend.dev>";

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
    const { to, subject, html, from } = await req.json();

    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({ ok: false, error: "Parámetros 'to', 'subject' y 'html' son requeridos." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!RESEND_API_KEY) {
      console.warn("[enviar-email] RESEND_API_KEY no configurado en Deno.env");
      return new Response(
        JSON.stringify({ ok: true, simulated: true, message: "Email registrado (Modo simulación - configura RESEND_API_KEY para envío real)." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: from || EMAIL_FROM,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("[enviar-email] Error de Resend:", data);
      return new Response(
        JSON.stringify({ ok: false, error: data?.message || "Error enviando con Resend" }),
        { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, id: data.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[enviar-email] Excepción no controlada:", err);
    return new Response(
      JSON.stringify({ ok: false, error: err?.message || String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
