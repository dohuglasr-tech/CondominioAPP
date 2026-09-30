-- ==============================================================================
-- MIGRACIÓN V18: PARÁMETROS ESTRUCTURALES DEL EDIFICIO, PH Y COLOR DEL CONDOMINIO
-- ==============================================================================
-- Agrega soporte para:
-- 1. Cantidad de pisos estándar (total_pisos).
-- 2. Apartamentos estándar por piso (apartamentos_por_piso).
-- 3. Configuración de piso Penthouse (tiene_ph, total_ph).
-- 4. Color temático de marca principal (color_primario).
-- 5. Total de apartamentos sincronizado.
--
-- Ejecutar en: Supabase > SQL Editor > Run
-- ==============================================================================

-- 1. Añadir columnas a configuracion_edificio si no existen
ALTER TABLE public.configuracion_edificio 
  ADD COLUMN IF NOT EXISTS total_apartamentos INTEGER DEFAULT 62;

ALTER TABLE public.configuracion_edificio 
  ADD COLUMN IF NOT EXISTS total_pisos INTEGER DEFAULT 10;

ALTER TABLE public.configuracion_edificio 
  ADD COLUMN IF NOT EXISTS apartamentos_por_piso INTEGER DEFAULT 6;

ALTER TABLE public.configuracion_edificio 
  ADD COLUMN IF NOT EXISTS tiene_ph BOOLEAN DEFAULT true;

ALTER TABLE public.configuracion_edificio 
  ADD COLUMN IF NOT EXISTS total_ph INTEGER DEFAULT 2;

ALTER TABLE public.configuracion_edificio 
  ADD COLUMN IF NOT EXISTS color_primario TEXT DEFAULT '#f97316';

-- 2. Asegurar que las filas existentes tengan valores por defecto válidos
UPDATE public.configuracion_edificio
SET 
  total_apartamentos = COALESCE(total_apartamentos, 62),
  total_pisos = COALESCE(total_pisos, 10),
  apartamentos_por_piso = COALESCE(apartamentos_por_piso, 6),
  tiene_ph = COALESCE(tiene_ph, true),
  total_ph = COALESCE(total_ph, 2),
  color_primario = COALESCE(color_primario, '#f97316')
WHERE id IS NOT NULL;

-- 3. Recargar el esquema de PostgREST
NOTIFY pgrst, 'reload schema';
