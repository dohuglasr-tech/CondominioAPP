-- ────────────────────────────────────────────────────────────
-- MIGRACIÓN V10: Constraint único para recibos_generados
-- Permite que (apartamento_id, mes_facturado) sea único por mes
-- ────────────────────────────────────────────────────────────

DO $$
BEGIN
  -- Eliminar restricción previa si existía con otro nombre
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_recibo_apto_mes'
  ) THEN
    ALTER TABLE public.recibos_generados DROP CONSTRAINT uq_recibo_apto_mes;
  END IF;

  -- Crear restricción única
  ALTER TABLE public.recibos_generados
    ADD CONSTRAINT uq_recibo_apto_mes UNIQUE (apartamento_id, mes_facturado);
END $$;
