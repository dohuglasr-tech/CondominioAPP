-- ============================================================
-- MIGRATION v8b: Fix columnas faltantes en gastos_comunes
-- EJECUTAR en Supabase > SQL Editor > RUN
-- ============================================================

-- 1. Añadir columnas faltantes si no existen
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='gastos_comunes' AND column_name='categoria') THEN
    ALTER TABLE public.gastos_comunes ADD COLUMN categoria TEXT NOT NULL DEFAULT 'general';
    RAISE NOTICE 'Columna categoria añadida';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='gastos_comunes' AND column_name='tipo') THEN
    ALTER TABLE public.gastos_comunes ADD COLUMN tipo TEXT NOT NULL DEFAULT 'ordinario';
    RAISE NOTICE 'Columna tipo añadida';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='gastos_comunes' AND column_name='monto_usd') THEN
    ALTER TABLE public.gastos_comunes ADD COLUMN monto_usd NUMERIC(12,2) NOT NULL DEFAULT 0;
    RAISE NOTICE 'Columna monto_usd añadida';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='gastos_comunes' AND column_name='mes_aplicacion') THEN
    ALTER TABLE public.gastos_comunes ADD COLUMN mes_aplicacion DATE NOT NULL DEFAULT CURRENT_DATE;
    RAISE NOTICE 'Columna mes_aplicacion añadida';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='gastos_comunes' AND column_name='notas') THEN
    ALTER TABLE public.gastos_comunes ADD COLUMN notas TEXT;
    RAISE NOTICE 'Columna notas añadida';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='gastos_comunes' AND column_name='descripcion') THEN
    ALTER TABLE public.gastos_comunes ADD COLUMN descripcion TEXT NOT NULL DEFAULT '';
    RAISE NOTICE 'Columna descripcion añadida';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='gastos_comunes' AND column_name='updated_at') THEN
    ALTER TABLE public.gastos_comunes ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    RAISE NOTICE 'Columna updated_at añadida';
  END IF;
END $$;

-- 2. Si la tabla NO existe, crearla completa desde cero
CREATE TABLE IF NOT EXISTS public.gastos_comunes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  descripcion     TEXT NOT NULL DEFAULT '',
  categoria       TEXT NOT NULL DEFAULT 'general',
  tipo            TEXT NOT NULL DEFAULT 'ordinario',
  monto_usd       NUMERIC(12,2) NOT NULL DEFAULT 0,
  mes_aplicacion  DATE NOT NULL DEFAULT CURRENT_DATE,
  notas           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 3. RLS abierto
ALTER TABLE public.gastos_comunes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "SELECT abierto gastos" ON public.gastos_comunes;
DROP POLICY IF EXISTS "INSERT abierto gastos" ON public.gastos_comunes;
DROP POLICY IF EXISTS "UPDATE abierto gastos" ON public.gastos_comunes;
DROP POLICY IF EXISTS "DELETE abierto gastos" ON public.gastos_comunes;

CREATE POLICY "SELECT abierto gastos" ON public.gastos_comunes FOR SELECT USING (true);
CREATE POLICY "INSERT abierto gastos" ON public.gastos_comunes FOR INSERT WITH CHECK (true);
CREATE POLICY "UPDATE abierto gastos" ON public.gastos_comunes FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "DELETE abierto gastos"  ON public.gastos_comunes FOR DELETE USING (true);

-- 4. GRANTs
GRANT ALL ON public.gastos_comunes TO anon, authenticated, service_role;

-- 5. Recargar schema cache de PostgREST (Supabase lo escucha)
NOTIFY pgrst, 'reload schema';

-- 6. Verificar columnas
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'gastos_comunes'
ORDER BY ordinal_position;
