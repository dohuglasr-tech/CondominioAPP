-- ============================================================
-- MIGRATION v8d: Auditoría de ediciones en gastos_comunes
-- EJECUTAR en Supabase > SQL Editor > RUN
-- ============================================================

DO $$
BEGIN
  -- Contador de veces editado
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='gastos_comunes' AND column_name='veces_editado') THEN
    ALTER TABLE public.gastos_comunes ADD COLUMN veces_editado INT NOT NULL DEFAULT 0;
    RAISE NOTICE 'veces_editado añadido';
  END IF;

  -- Historial de ediciones (array JSON con razon + fecha + snapshot anterior)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='gastos_comunes' AND column_name='historial_ediciones') THEN
    ALTER TABLE public.gastos_comunes ADD COLUMN historial_ediciones JSONB NOT NULL DEFAULT '[]';
    RAISE NOTICE 'historial_ediciones añadido';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name='gastos_comunes'
ORDER BY ordinal_position;
