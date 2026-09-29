-- ============================================================
-- MIGRATION v7: Fix definitivo para Gestion de Recibos Admin
-- EJECUTAR COMPLETO en Supabase > SQL Editor > RUN
-- ============================================================

-- 1. Añadir columna fecha_revision si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'pagos_reportados'
      AND column_name  = 'fecha_revision'
  ) THEN
    ALTER TABLE public.pagos_reportados
      ADD COLUMN fecha_revision TIMESTAMPTZ DEFAULT NULL;
    RAISE NOTICE 'Columna fecha_revision añadida a pagos_reportados';
  ELSE
    RAISE NOTICE 'La columna fecha_revision ya existe, se omite';
  END IF;
END $$;

-- 2. Normalizar el campo estado
ALTER TABLE public.pagos_reportados
  ALTER COLUMN estado SET DEFAULT 'pendiente';

UPDATE public.pagos_reportados
  SET estado = 'pendiente'
  WHERE estado IS NULL;

-- 3. RLS pagos_reportados
ALTER TABLE public.pagos_reportados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura libre pagos" ON public.pagos_reportados;
DROP POLICY IF EXISTS "Insertar pagos libre" ON public.pagos_reportados;
DROP POLICY IF EXISTS "Actualizar pagos libre" ON public.pagos_reportados;
DROP POLICY IF EXISTS "Delete libre pagos" ON public.pagos_reportados;
DROP POLICY IF EXISTS "Residentes pueden reportar pagos" ON public.pagos_reportados;
DROP POLICY IF EXISTS "Lectura de pagos autenticados" ON public.pagos_reportados;
DROP POLICY IF EXISTS "Admin puede actualizar pagos" ON public.pagos_reportados;
DROP POLICY IF EXISTS "Usuarios insertan sus propios pagos" ON public.pagos_reportados;
DROP POLICY IF EXISTS "SELECT abierto pagos" ON public.pagos_reportados;
DROP POLICY IF EXISTS "INSERT abierto pagos" ON public.pagos_reportados;
DROP POLICY IF EXISTS "UPDATE abierto pagos" ON public.pagos_reportados;
DROP POLICY IF EXISTS "DELETE abierto pagos" ON public.pagos_reportados;

CREATE POLICY "SELECT abierto pagos" ON public.pagos_reportados FOR SELECT USING (true);
CREATE POLICY "INSERT abierto pagos" ON public.pagos_reportados FOR INSERT WITH CHECK (true);
CREATE POLICY "UPDATE abierto pagos" ON public.pagos_reportados FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "DELETE abierto pagos" ON public.pagos_reportados FOR DELETE USING (true);

-- 4. RLS perfiles
ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura pública perfiles" ON public.perfiles;
DROP POLICY IF EXISTS "Insert libre perfiles" ON public.perfiles;
DROP POLICY IF EXISTS "Update libre perfiles" ON public.perfiles;
DROP POLICY IF EXISTS "Delete libre perfiles" ON public.perfiles;
DROP POLICY IF EXISTS "Usuarios ven su propio perfil" ON public.perfiles;
DROP POLICY IF EXISTS "Usuarios actualizan su propio perfil" ON public.perfiles;
DROP POLICY IF EXISTS "Acceso anon a perfiles" ON public.perfiles;
DROP POLICY IF EXISTS "Usuarios pueden leer su propio perfil" ON public.perfiles;
DROP POLICY IF EXISTS "Usuarios pueden actualizar su propio perfil" ON public.perfiles;
DROP POLICY IF EXISTS "SELECT abierto perfiles" ON public.perfiles;
DROP POLICY IF EXISTS "INSERT abierto perfiles" ON public.perfiles;
DROP POLICY IF EXISTS "UPDATE abierto perfiles" ON public.perfiles;
DROP POLICY IF EXISTS "DELETE abierto perfiles" ON public.perfiles;

CREATE POLICY "SELECT abierto perfiles" ON public.perfiles FOR SELECT USING (true);
CREATE POLICY "INSERT abierto perfiles" ON public.perfiles FOR INSERT WITH CHECK (true);
CREATE POLICY "UPDATE abierto perfiles" ON public.perfiles FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "DELETE abierto perfiles" ON public.perfiles FOR DELETE USING (true);

-- 5. RLS apartamentos
ALTER TABLE public.apartamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura pública apartamentos" ON public.apartamentos;
DROP POLICY IF EXISTS "Insert libre apartamentos" ON public.apartamentos;
DROP POLICY IF EXISTS "Update libre apartamentos" ON public.apartamentos;
DROP POLICY IF EXISTS "SELECT abierto apartamentos" ON public.apartamentos;
DROP POLICY IF EXISTS "INSERT abierto apartamentos" ON public.apartamentos;
DROP POLICY IF EXISTS "UPDATE abierto apartamentos" ON public.apartamentos;

CREATE POLICY "SELECT abierto apartamentos" ON public.apartamentos FOR SELECT USING (true);
CREATE POLICY "INSERT abierto apartamentos" ON public.apartamentos FOR INSERT WITH CHECK (true);
CREATE POLICY "UPDATE abierto apartamentos" ON public.apartamentos FOR UPDATE USING (true) WITH CHECK (true);

-- 6. Realtime
ALTER TABLE public.pagos_reportados REPLICA IDENTITY FULL;
ALTER TABLE public.perfiles REPLICA IDENTITY FULL;
ALTER TABLE public.apartamentos REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'pagos_reportados') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pagos_reportados;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'perfiles') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.perfiles;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'apartamentos') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.apartamentos;
  END IF;
END $$;

-- 7. GRANTs
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

-- 8. Verificacion final
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('pagos_reportados', 'perfiles', 'apartamentos')
ORDER BY tablename, cmd;
