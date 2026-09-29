-- ============================================================
-- MIGRATION v8: Módulo de Generación Masiva de Recibos
-- EJECUTAR en Supabase > SQL Editor > RUN
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. TABLA: gastos_comunes (si no existe)
--    Almacena los gastos del mes que se prorratean
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gastos_comunes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  descripcion     TEXT NOT NULL,
  categoria       TEXT NOT NULL DEFAULT 'general',
  tipo            TEXT NOT NULL DEFAULT 'ordinario',
  monto_usd       NUMERIC(12,2) NOT NULL DEFAULT 0,
  mes_aplicacion  DATE NOT NULL,
  notas           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.gastos_comunes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "SELECT abierto gastos" ON public.gastos_comunes;
DROP POLICY IF EXISTS "INSERT abierto gastos" ON public.gastos_comunes;
DROP POLICY IF EXISTS "UPDATE abierto gastos" ON public.gastos_comunes;
DROP POLICY IF EXISTS "DELETE abierto gastos" ON public.gastos_comunes;
CREATE POLICY "SELECT abierto gastos" ON public.gastos_comunes FOR SELECT USING (true);
CREATE POLICY "INSERT abierto gastos" ON public.gastos_comunes FOR INSERT WITH CHECK (true);
CREATE POLICY "UPDATE abierto gastos" ON public.gastos_comunes FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "DELETE abierto gastos"  ON public.gastos_comunes FOR DELETE USING (true);

-- ────────────────────────────────────────────────────────────
-- 2. TABLA: cargos_especiales
--    Cargos extra por apartamento (multas, deudas, acuerdos)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cargos_especiales (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apartamento_id  UUID NOT NULL REFERENCES public.apartamentos(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL DEFAULT 'multa',
  descripcion     TEXT NOT NULL,
  monto_usd       NUMERIC(12,2) NOT NULL DEFAULT 0,
  mes_aplicacion  DATE NOT NULL,
  aplicado        BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.cargos_especiales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "SELECT abierto cargos" ON public.cargos_especiales;
DROP POLICY IF EXISTS "INSERT abierto cargos" ON public.cargos_especiales;
DROP POLICY IF EXISTS "UPDATE abierto cargos" ON public.cargos_especiales;
DROP POLICY IF EXISTS "DELETE abierto cargos" ON public.cargos_especiales;
CREATE POLICY "SELECT abierto cargos" ON public.cargos_especiales FOR SELECT USING (true);
CREATE POLICY "INSERT abierto cargos" ON public.cargos_especiales FOR INSERT WITH CHECK (true);
CREATE POLICY "UPDATE abierto cargos" ON public.cargos_especiales FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "DELETE abierto cargos"  ON public.cargos_especiales FOR DELETE USING (true);

-- ────────────────────────────────────────────────────────────
-- 3. TABLA: recibos_generados
--    Un recibo emitido por apartamento/mes, vincula con pagos_reportados
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.recibos_generados (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apartamento_id    UUID NOT NULL REFERENCES public.apartamentos(id) ON DELETE CASCADE,
  mes_facturado     DATE NOT NULL,
  tasa_bcv          NUMERIC(12,4) NOT NULL,
  total_gastos_usd  NUMERIC(12,2) NOT NULL DEFAULT 0,
  alicuota          NUMERIC(8,6)  NOT NULL DEFAULT 0,
  subtotal_usd      NUMERIC(12,2) NOT NULL DEFAULT 0,
  fondo_reserva_pct NUMERIC(5,2)  NOT NULL DEFAULT 10,
  fondo_reserva_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  cargos_extra_usd  NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_usd         NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_bs          NUMERIC(16,2) NOT NULL DEFAULT 0,
  estado            TEXT NOT NULL DEFAULT 'pendiente',
  data_json         JSONB,
  emitido_at        TIMESTAMPTZ DEFAULT NOW(),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.recibos_generados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "SELECT abierto recibos_gen" ON public.recibos_generados;
DROP POLICY IF EXISTS "INSERT abierto recibos_gen" ON public.recibos_generados;
DROP POLICY IF EXISTS "UPDATE abierto recibos_gen" ON public.recibos_generados;
DROP POLICY IF EXISTS "DELETE abierto recibos_gen" ON public.recibos_generados;
CREATE POLICY "SELECT abierto recibos_gen" ON public.recibos_generados FOR SELECT USING (true);
CREATE POLICY "INSERT abierto recibos_gen" ON public.recibos_generados FOR INSERT WITH CHECK (true);
CREATE POLICY "UPDATE abierto recibos_gen" ON public.recibos_generados FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "DELETE abierto recibos_gen"  ON public.recibos_generados FOR DELETE USING (true);

-- ────────────────────────────────────────────────────────────
-- 4. Realtime para las nuevas tablas
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.gastos_comunes   REPLICA IDENTITY FULL;
ALTER TABLE public.cargos_especiales REPLICA IDENTITY FULL;
ALTER TABLE public.recibos_generados REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'gastos_comunes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.gastos_comunes;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'cargos_especiales') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cargos_especiales;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'recibos_generados') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.recibos_generados;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 5. GRANTs
-- ────────────────────────────────────────────────────────────
GRANT ALL ON public.gastos_comunes    TO anon, authenticated, service_role;
GRANT ALL ON public.cargos_especiales TO anon, authenticated, service_role;
GRANT ALL ON public.recibos_generados TO anon, authenticated, service_role;

-- ────────────────────────────────────────────────────────────
-- 6. Verificación final
-- ────────────────────────────────────────────────────────────
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('gastos_comunes', 'cargos_especiales', 'recibos_generados')
ORDER BY tablename;
