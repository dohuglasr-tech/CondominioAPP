-- ============================================================
-- MIGRATION v8c: Ampliar gastos_comunes con nuevos campos
-- EJECUTAR en Supabase > SQL Editor > RUN
-- ============================================================

DO $$
BEGIN
  -- Monto en Bolívares (ingresado manualmente por el admin)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='gastos_comunes' AND column_name='monto_bs') THEN
    ALTER TABLE public.gastos_comunes ADD COLUMN monto_bs NUMERIC(16,2) DEFAULT 0;
    RAISE NOTICE 'monto_bs añadido';
  END IF;

  -- Fecha en que se realizó el pago
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='gastos_comunes' AND column_name='fecha_pago') THEN
    ALTER TABLE public.gastos_comunes ADD COLUMN fecha_pago DATE DEFAULT CURRENT_DATE;
    RAISE NOTICE 'fecha_pago añadido';
  END IF;

  -- Últimos 8 dígitos de referencia bancaria
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='gastos_comunes' AND column_name='referencia') THEN
    ALTER TABLE public.gastos_comunes ADD COLUMN referencia TEXT DEFAULT NULL;
    RAISE NOTICE 'referencia añadido';
  END IF;

  -- Persona que realizó el pago
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='gastos_comunes' AND column_name='pagado_por') THEN
    ALTER TABLE public.gastos_comunes ADD COLUMN pagado_por TEXT DEFAULT NULL;
    RAISE NOTICE 'pagado_por añadido';
  END IF;

  -- Persona que autorizó la transferencia
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='gastos_comunes' AND column_name='autorizado_por') THEN
    ALTER TABLE public.gastos_comunes ADD COLUMN autorizado_por TEXT DEFAULT NULL;
    RAISE NOTICE 'autorizado_por añadido';
  END IF;
END $$;

-- Recargar schema cache
NOTIFY pgrst, 'reload schema';

-- Verificar
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name='gastos_comunes'
ORDER BY ordinal_position;
