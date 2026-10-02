-- ==============================================================================
-- MIGRACIÓN V21: NUEVOS CAMPOS DE PAGO (CÉDULA, TIPO DE CUENTA, PAGO MÓVIL, ZELLE)
-- ==============================================================================
-- 1. Añade 'cedula_cuenta' y 'tipo_cuenta' a la sección de cuenta bancaria.
-- 2. Añade 'pago_movil_banco', 'pago_movil_cedula' y 'pago_movil_telefono'.
-- 3. Añade 'zelle_email'.
-- 4. Notifica a PostgREST para recargar el schema cache de inmediato.
--
-- Ejecutar en: Supabase > SQL Editor > Run
-- (URL: https://supabase.com/dashboard/project/kevslcecttfxifcplgzx/sql/new)
-- ==============================================================================

ALTER TABLE public.configuracion_edificio
  ADD COLUMN IF NOT EXISTS cedula_cuenta TEXT,
  ADD COLUMN IF NOT EXISTS tipo_cuenta TEXT,
  ADD COLUMN IF NOT EXISTS pago_movil_banco TEXT,
  ADD COLUMN IF NOT EXISTS pago_movil_cedula TEXT,
  ADD COLUMN IF NOT EXISTS pago_movil_telefono TEXT,
  ADD COLUMN IF NOT EXISTS zelle_email TEXT;

-- Recargar cache del schema de Supabase/PostgREST
NOTIFY pgrst, 'reload schema';
