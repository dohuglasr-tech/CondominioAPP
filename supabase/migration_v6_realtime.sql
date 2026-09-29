-- ============================================================
-- MIGRATION v6: TIEMPO REAL (Supabase Realtime) Y REPLICACIÓN
-- Ejecutar en Supabase > SQL Editor
-- ============================================================

-- 1. Habilitar Replica Identity FULL en las tablas para que
--    las actualizaciones y eliminaciones transmitan todos los datos
ALTER TABLE public.pagos_reportados REPLICA IDENTITY FULL;
ALTER TABLE public.perfiles REPLICA IDENTITY FULL;
ALTER TABLE public.apartamentos REPLICA IDENTITY FULL;
ALTER TABLE public.falencias REPLICA IDENTITY FULL;
ALTER TABLE public.propuestas REPLICA IDENTITY FULL;

-- 2. Asegurar que las tablas estén en la publicación `supabase_realtime`
--    Esto permite que Supabase envíe eventos en vivo por WebSockets
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'pagos_reportados'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pagos_reportados;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'perfiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.perfiles;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'apartamentos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.apartamentos;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'falencias'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.falencias;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'gastos_comunes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.gastos_comunes;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'propuestas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.propuestas;
  END IF;
END $$;

-- 3. Confirmar que las políticas RLS permitan lectura pública / anon
--    (necesario para que la suscripción por websocket no sea filtrada)
ALTER TABLE public.pagos_reportados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura libre pagos" ON public.pagos_reportados;
CREATE POLICY "Lectura libre pagos"
  ON public.pagos_reportados FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Insertar pagos libre" ON public.pagos_reportados;
CREATE POLICY "Insertar pagos libre"
  ON public.pagos_reportados FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Actualizar pagos libre" ON public.pagos_reportados;
CREATE POLICY "Actualizar pagos libre"
  ON public.pagos_reportados FOR UPDATE
  USING (true)
  WITH CHECK (true);
