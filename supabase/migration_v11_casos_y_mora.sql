-- ==============================================================================
-- MIGRACIÓN V11: Módulos de "Casos Especiales" y "Mora o Deudores"
-- ==============================================================================

-- ────────────────────────────────────────────────────────────
-- 1. TABLA: casos_comunidad
--    Gestión de multas, acuerdos de pago, alquiler de locales,
--    asignaciones e ingresos externos del edificio.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.casos_comunidad (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apartamento_id       UUID REFERENCES public.apartamentos(id) ON DELETE SET NULL,
  tipo                 TEXT NOT NULL, -- 'multa', 'acuerdo_pago', 'alquiler_local', 'asignacion', 'ingreso_externo'
  titulo               TEXT NOT NULL,
  descripcion          TEXT,
  monto_usd            NUMERIC(12,2) DEFAULT 0,
  monto_bs             NUMERIC(12,2) DEFAULT 0,
  moneda               TEXT DEFAULT 'USD', -- 'USD', 'BS', 'MIXTO'
  estado               TEXT DEFAULT 'abierto', -- 'abierto', 'en_proceso', 'resuelto', 'cancelado'
  involucrado_nombre   TEXT,
  involucrado_contacto TEXT,
  fecha                DATE DEFAULT CURRENT_DATE,
  fecha_vencimiento    DATE,
  comprobante_url      TEXT,
  notas_admin          TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- RLS para casos_comunidad
ALTER TABLE public.casos_comunidad ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "SELECT abierto casos_comunidad" ON public.casos_comunidad;
DROP POLICY IF EXISTS "INSERT abierto casos_comunidad" ON public.casos_comunidad;
DROP POLICY IF EXISTS "UPDATE abierto casos_comunidad" ON public.casos_comunidad;
DROP POLICY IF EXISTS "DELETE abierto casos_comunidad" ON public.casos_comunidad;

CREATE POLICY "SELECT abierto casos_comunidad" ON public.casos_comunidad FOR SELECT USING (true);
CREATE POLICY "INSERT abierto casos_comunidad" ON public.casos_comunidad FOR INSERT WITH CHECK (true);
CREATE POLICY "UPDATE abierto casos_comunidad" ON public.casos_comunidad FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "DELETE abierto casos_comunidad"  ON public.casos_comunidad FOR DELETE USING (true);

-- ────────────────────────────────────────────────────────────
-- 2. TABLA: deudas_mora
--    Control de mora extensa (>3 meses), deudas anteriores montadas
--    por apartamento en USD/Bs, tasas de riesgo y acciones legales.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.deudas_mora (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apartamento_id       UUID NOT NULL REFERENCES public.apartamentos(id) ON DELETE CASCADE,
  meses_deuda          INTEGER NOT NULL DEFAULT 3,
  monto_usd            NUMERIC(12,2) DEFAULT 0,
  monto_bs             NUMERIC(12,2) DEFAULT 0,
  moneda_principal     TEXT DEFAULT 'USD', -- 'USD', 'BS', 'MIXTO'
  tasa_riesgo          TEXT NOT NULL DEFAULT 'amarillo', -- 'amarillo', 'rojo', 'morado'
  accion_legal         TEXT DEFAULT 'notificacion_amistosa', -- 'notificacion_amistosa', 'carta_cobro_extrajudicial', 'citacion_junta', 'suspension_servicios', 'bloqueo_administrativo', 'demanda_judicial'
  estado               TEXT DEFAULT 'activo', -- 'activo', 'en_convenio', 'solventado'
  conceptos_detalle    TEXT,
  observaciones        TEXT,
  fecha_corte          DATE DEFAULT CURRENT_DATE,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_apartamento_mora UNIQUE (apartamento_id)
);

-- RLS para deudas_mora
ALTER TABLE public.deudas_mora ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "SELECT abierto deudas_mora" ON public.deudas_mora;
DROP POLICY IF EXISTS "INSERT abierto deudas_mora" ON public.deudas_mora;
DROP POLICY IF EXISTS "UPDATE abierto deudas_mora" ON public.deudas_mora;
DROP POLICY IF EXISTS "DELETE abierto deudas_mora" ON public.deudas_mora;

CREATE POLICY "SELECT abierto deudas_mora" ON public.deudas_mora FOR SELECT USING (true);
CREATE POLICY "INSERT abierto deudas_mora" ON public.deudas_mora FOR INSERT WITH CHECK (true);
CREATE POLICY "UPDATE abierto deudas_mora" ON public.deudas_mora FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "DELETE abierto deudas_mora"  ON public.deudas_mora FOR DELETE USING (true);

-- ────────────────────────────────────────────────────────────
-- 3. PERMISOS Y REALTIME
-- ────────────────────────────────────────────────────────────
GRANT ALL ON public.casos_comunidad TO anon, authenticated, service_role;
GRANT ALL ON public.deudas_mora TO anon, authenticated, service_role;

ALTER TABLE public.casos_comunidad REPLICA IDENTITY FULL;
ALTER TABLE public.deudas_mora REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'casos_comunidad') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.casos_comunidad;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'deudas_mora') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.deudas_mora;
  END IF;
END $$;
