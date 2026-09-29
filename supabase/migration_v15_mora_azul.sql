-- ==============================================================================
-- MIGRACIÓN V15: Soporte para Nivel de Riesgo AZUL en Mora y Deudores
-- ==============================================================================
-- La categoría 'azul' representa a los apartamentos que deben únicamente el
-- recibo emitido del mes en curso (< 1 mes de mora / deuda corriente al cobro).
-- Se diferencia de las moras crónicas:
--   - 'azul': Recibo del mes (<1 mes de mora / cuota al cobro ordinario).
--   - 'amarillo': Riesgo Moderado (3 meses).
--   - 'rojo': Riesgo Alto (4 a 6 meses).
--   - 'morado': Riesgo Severo / Máximo Deudor (>6 meses).
-- ==============================================================================

-- 1. Si existe alguna restricción CHECK previa en tasa_riesgo, actualizarla para incluir 'azul':
DO $$
BEGIN
  -- Remover cualquier constraint CHECK antiguo en tasa_riesgo si existiese
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'deudas_mora' AND column_name = 'tasa_riesgo'
  ) THEN
    ALTER TABLE public.deudas_mora DROP CONSTRAINT IF EXISTS deudas_mora_tasa_riesgo_check;
  END IF;

  -- Agregar constraint validando los 4 niveles oficiales
  ALTER TABLE public.deudas_mora
    ADD CONSTRAINT deudas_mora_tasa_riesgo_check
    CHECK (tasa_riesgo IN ('azul', 'amarillo', 'rojo', 'morado'));
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'No se pudo aplicar check constraint estricto en deudas_mora: %', SQLERRM;
END $$;

COMMENT ON COLUMN public.deudas_mora.tasa_riesgo IS 'Nivel de riesgo de mora: azul (<1m / recibo del mes), amarillo (3m), rojo (4-6m), morado (>6m / crónico)';
