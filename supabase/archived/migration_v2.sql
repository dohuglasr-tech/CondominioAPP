-- ============================================================
-- MIGRATION: Campos adicionales para configuracion_edificio y perfiles
-- Ejecutar en Supabase > SQL Editor
-- ============================================================

-- 1. Agregar campos faltantes a configuracion_edificio
ALTER TABLE public.configuracion_edificio
  ADD COLUMN IF NOT EXISTS rif            TEXT,
  ADD COLUMN IF NOT EXISTS direccion      TEXT,
  ADD COLUMN IF NOT EXISTS telefono       TEXT,
  ADD COLUMN IF NOT EXISTS email_contacto TEXT,
  ADD COLUMN IF NOT EXISTS banco          TEXT,
  ADD COLUMN IF NOT EXISTS cuenta_bancaria TEXT,
  ADD COLUMN IF NOT EXISTS titular_cuenta  TEXT,
  ADD COLUMN IF NOT EXISTS logo_url        TEXT,
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ DEFAULT NOW();

-- 2. Agregar campos de perfil para residentes
ALTER TABLE public.perfiles
  ADD COLUMN IF NOT EXISTS cedula               TEXT,
  ADD COLUMN IF NOT EXISTS condicion_habitacional TEXT DEFAULT 'propio',
  ADD COLUMN IF NOT EXISTS carga_familiar        INTEGER,
  ADD COLUMN IF NOT EXISTS propietario_nombre    TEXT,
  ADD COLUMN IF NOT EXISTS propietario_cedula    TEXT,
  ADD COLUMN IF NOT EXISTS propietario_telefono  TEXT,
  ADD COLUMN IF NOT EXISTS propietario_email     TEXT,
  ADD COLUMN IF NOT EXISTS perfil_completo       BOOLEAN DEFAULT FALSE;

-- 3. Crear bucket de Storage para logos (si no existe)
-- Nota: esto se hace desde el panel de Supabase > Storage > New bucket
-- Nombre: "edificio-assets", tipo: public

-- 4. Política de acceso al Storage (ejecutar si creaste el bucket)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('edificio-assets', 'edificio-assets', true)
-- ON CONFLICT (id) DO NOTHING;

-- CREATE POLICY "Logos públicos" ON storage.objects
--   FOR SELECT USING (bucket_id = 'edificio-assets');

-- CREATE POLICY "Admin puede subir logos" ON storage.objects
--   FOR INSERT WITH CHECK (bucket_id = 'edificio-assets');

-- CREATE POLICY "Admin puede actualizar logos" ON storage.objects
--   FOR UPDATE USING (bucket_id = 'edificio-assets');
