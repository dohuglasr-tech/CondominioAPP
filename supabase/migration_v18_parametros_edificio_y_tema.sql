-- ==============================================================================
-- MIGRACIÓN V18: PARÁMETROS ESTRUCTURALES DEL EDIFICIO Y COLOR DEL CONDOMINIO
-- ==============================================================================
-- Agrega soporte para edificios/torres con cantidad de pisos configurable,
-- apartamentos por piso y personalización del color temático de la plataforma.
-- Ejecutar en: Supabase > SQL Editor > Run
-- ==============================================================================

-- 1. Añadir columnas a configuracion_edificio si no existen
ALTER TABLE public.configuracion_edificio 
  ADD COLUMN IF NOT EXISTS total_pisos INTEGER DEFAULT 15;

ALTER TABLE public.configuracion_edificio 
  ADD COLUMN IF NOT EXISTS apartamentos_por_piso INTEGER DEFAULT 4;

ALTER TABLE public.configuracion_edificio 
  ADD COLUMN IF NOT EXISTS color_primario TEXT DEFAULT '#f97316';

-- 2. Asegurar que las filas existentes tengan valores por defecto válidos
UPDATE public.configuracion_edificio
SET 
  total_pisos = COALESCE(total_pisos, 15),
  apartamentos_por_piso = COALESCE(apartamentos_por_piso, 4),
  color_primario = COALESCE(color_primario, '#f97316')
WHERE id IS NOT NULL;
