-- ==============================================================================
-- MIGRACIÓN V20: FECHAS DE TRANSICIÓN DE ADMINISTRACIÓN (ENTRADA Y SALIDA)
-- ==============================================================================
-- 1. Añade 'fecha_inicio_gestion' (cuándo entra la administración actual, ej: 2026-09-01).
-- 2. Añade 'fecha_fin_administracion_anterior' (cuándo salió la última administración, ej: 2026-08-31).
-- 3. Esto sincroniza dinámicamente todo el sistema:
--    - Los meses anteriores se identifican automáticamente como "Carga de Administración Anterior".
--    - A partir de la fecha de entrada, se gestionan como meses de la administración actual.
--
-- Ejecutar en: Supabase > SQL Editor > Run
-- ==============================================================================

ALTER TABLE public.configuracion_edificio 
  ADD COLUMN IF NOT EXISTS fecha_inicio_gestion DATE DEFAULT '2026-09-01';

ALTER TABLE public.configuracion_edificio 
  ADD COLUMN IF NOT EXISTS fecha_fin_administracion_anterior DATE DEFAULT '2026-08-31';

UPDATE public.configuracion_edificio
SET 
  fecha_inicio_gestion = COALESCE(fecha_inicio_gestion, '2026-09-01'),
  fecha_fin_administracion_anterior = COALESCE(fecha_fin_administracion_anterior, '2026-08-31')
WHERE id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
