-- ==============================================================================
-- MIGRACIÓN V19: INDEXACIÓN DE RECIBOS Y REGISTRO DE SALDOS A FAVOR
-- ==============================================================================
-- 1. Añade columna 'es_indexado' a recibos_generados (indica si la deuda se ancla al Dólar BCV o queda fija en Bolívares).
-- 2. Asegura que PostgREST recargue el esquema para sincronización en tiempo real.
--
-- Ejecutar en: Supabase > SQL Editor > Run
-- ==============================================================================

-- 1. Columna de indexación en recibos generados
ALTER TABLE public.recibos_generados 
  ADD COLUMN IF NOT EXISTS es_indexado BOOLEAN DEFAULT true;

-- 2. Actualizar recibos existentes para asegurar valor por defecto
UPDATE public.recibos_generados
SET es_indexado = COALESCE(es_indexado, true)
WHERE es_indexado IS NULL;

-- 3. Crear índice para consultas de recibos indexados vs fijos
CREATE INDEX IF NOT EXISTS idx_recibos_indexado 
  ON public.recibos_generados (apartamento_id, es_indexado, estado);

-- 4. Notificar a PostgREST para recargar el esquema de forma inmediata
NOTIFY pgrst, 'reload schema';
