// ============================================================
// EDGE FUNCTION: cron-tasa-bcv
// ============================================================
// Propósito: Obtiene la tasa USD/VES del BCV diariamente,
//            la guarda en `tasa_bcv` y recalcula cuotas en Bs.
//
// Despliegue:
//   supabase functions deploy cron-tasa-bcv --no-verify-jwt
//
// Cron (activar en Supabase Dashboard > Edge Functions > Schedule):
//   0 8 * * 1-5   → Lunes a viernes a las 8:00 AM hora Venezuela
//
// Variables de entorno requeridas (Supabase Dashboard > Settings > Edge Functions):
//   SUPABASE_URL          → URL del proyecto Supabase
//   SUPABASE_SERVICE_ROLE_KEY → Service Role Key (para bypasear RLS)
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Fuentes de la tasa BCV (con fallback)
// Fuente primaria: API no oficial pero estable de exchangerate
// Fuente secundaria: Scraping directo del BCV
const BCV_API_PRIMARY = "https://ve.dolarapi.com/v1/dolares/oficial";
const BCV_SCRAPE_URL = "https://www.bcv.org.ve/";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── Estrategia 1: API DolarAPI.com (JSON limpio del BCV oficial) ──
async function fetchTasaDolarAPI(): Promise<number | null> {
  try {
    const res = await fetch(BCV_API_PRIMARY, {
      headers: { "Accept": "application/json", "User-Agent": "Torre5-App/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    // La respuesta tiene: { promedio: 36.50, ... } o { precio: 36.50 }
    const tasa = data.promedio ?? data.precio ?? data.ventaTarjeta;
    return tasa ? parseFloat(tasa) : null;
  } catch {
    return null;
  }
}

// ── Estrategia 2: Scraping HTML del BCV ──────────────────────────
async function fetchTasaBCVScraping(): Promise<number | null> {
  try {
    const res = await fetch(BCV_SCRAPE_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "Accept-Language": "es-VE,es;q=0.9",
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    // El BCV publica la tasa en un bloque con id "dolar"
    // Patrón: <div id="dolar">...<strong>36,5000</strong>
    const match = html.match(/id="dolar"[\s\S]*?<strong>([\d,\.]+)<\/strong>/);
    if (!match) {
      // Fallback: busca el patrón numérico directamente
      const altMatch = html.match(/USD[\s\S]{0,200}?(\d{2,3}[,\.]\d{4})/);
      if (!altMatch) return null;
      return parseFloat(altMatch[1].replace(",", "."));
    }
    // Normalizar: "36,5000" → 36.5000
    return parseFloat(match[1].replace(",", "."));
  } catch {
    return null;
  }
}

// ── Actualizar cuotas pendientes en Bolívares ─────────────────────
async function recalcularCuotasEnBs(nuevaTasa: number): Promise<void> {
  // Obtener todas las cuotas no pagadas
  const { data: cuotas, error } = await supabase
    .from("cuotas_apartamento")
    .select("id, saldo_usd")
    .eq("pagado_completo", false)
    .gt("saldo_usd", 0);

  if (error || !cuotas?.length) return;

  // Actualizar lote a lote (máx 500 por llamada)
  const updates = cuotas.map((c) => ({
    id: c.id,
    saldo_bs: parseFloat((c.saldo_usd * nuevaTasa).toFixed(2)),
    monto_bs: parseFloat((c.saldo_usd * nuevaTasa).toFixed(2)),
    tasa_bcv_usada: nuevaTasa,
    updated_at: new Date().toISOString(),
  }));

  // Upsert en lotes de 100
  for (let i = 0; i < updates.length; i += 100) {
    await supabase
      .from("cuotas_apartamento")
      .upsert(updates.slice(i, i + 100));
  }
}

// ── Handler principal ─────────────────────────────────────────────
Deno.serve(async (_req) => {
  const log: string[] = [];
  const hoy = new Date().toISOString().split("T")[0];

  try {
    // 1. Verificar si ya tenemos la tasa de hoy
    const { data: existing } = await supabase
      .from("tasa_bcv")
      .select("id, tasa")
      .eq("fecha", hoy)
      .single();

    if (existing) {
      return Response.json({
        ok: true,
        mensaje: `Tasa de ${hoy} ya existe: Bs. ${existing.tasa}`,
        omitido: true,
      });
    }

    // 2. Intentar obtener la tasa (primaria → fallback scraping)
    log.push("Intentando DolarAPI.com...");
    let tasa = await fetchTasaDolarAPI();

    if (!tasa) {
      log.push("DolarAPI falló. Intentando scraping BCV...");
      tasa = await fetchTasaBCVScraping();
    }

    if (!tasa || tasa <= 0 || tasa > 999_999) {
      throw new Error(
        `Tasa inválida obtenida: ${tasa}. Revisa las fuentes manualmente.`
      );
    }

    log.push(`Tasa obtenida: Bs. ${tasa}`);

    // 3. Guardar en tabla tasa_bcv
    const { error: insertError } = await supabase
      .from("tasa_bcv")
      .insert({ tasa, fecha: hoy, fuente: "bcv.org.ve / dolarapi.com" });

    if (insertError) throw new Error(`Insert tasa_bcv: ${insertError.message}`);

    // 4. Actualizar tasa actual en configuracion_edificio
    await supabase
      .from("configuracion_edificio")
      .update({
        tasa_bcv_actual: tasa,
        tasa_bcv_actualizada: new Date().toISOString(),
      })
      .neq("id", "00000000-0000-0000-0000-000000000000"); // actualiza la fila real

    // 5. Recalcular cuotas pendientes en Bs
    log.push("Recalculando cuotas en Bolívares...");
    await recalcularCuotasEnBs(tasa);

    log.push("Proceso completado exitosamente.");

    return Response.json({
      ok: true,
      fecha: hoy,
      tasa_bs_por_usd: tasa,
      log,
    });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err);
    console.error("[cron-tasa-bcv] ERROR:", mensaje);

    return Response.json(
      { ok: false, error: mensaje, log },
      { status: 500 }
    );
  }
});
