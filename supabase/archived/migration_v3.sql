-- ============================================================
-- MIGRATION v3: Políticas RLS completas para la aplicación
-- Ejecutar en Supabase > SQL Editor
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. configuracion_edificio — acceso público lectura, escritura libre
--    (el admin accede via localStorage, no Supabase Auth)
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.configuracion_edificio ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura pública config edificio" ON public.configuracion_edificio;
DROP POLICY IF EXISTS "Escritura libre config edificio" ON public.configuracion_edificio;
DROP POLICY IF EXISTS "Insert libre config edificio" ON public.configuracion_edificio;

CREATE POLICY "Lectura pública config edificio"
  ON public.configuracion_edificio FOR SELECT
  USING (true);

CREATE POLICY "Escritura libre config edificio"
  ON public.configuracion_edificio FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Insert libre config edificio"
  ON public.configuracion_edificio FOR INSERT
  WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- 2. pagos_reportados — residentes pueden insertar, todos pueden leer
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.pagos_reportados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Residentes pueden reportar pagos" ON public.pagos_reportados;
DROP POLICY IF EXISTS "Lectura de pagos autenticados" ON public.pagos_reportados;
DROP POLICY IF EXISTS "Admin puede actualizar pagos" ON public.pagos_reportados;

CREATE POLICY "Residentes pueden reportar pagos"
  ON public.pagos_reportados FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Lectura de pagos autenticados"
  ON public.pagos_reportados FOR SELECT
  USING (true);

CREATE POLICY "Admin puede actualizar pagos"
  ON public.pagos_reportados FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- 3. perfiles — acceso autenticado + anon para admin
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuarios ven su propio perfil" ON public.perfiles;
DROP POLICY IF EXISTS "Usuarios actualizan su propio perfil" ON public.perfiles;
DROP POLICY IF EXISTS "Acceso anon a perfiles" ON public.perfiles;

CREATE POLICY "Usuarios ven su propio perfil"
  ON public.perfiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Usuarios actualizan su propio perfil"
  ON public.perfiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Acceso anon a perfiles"
  ON public.perfiles FOR ALL
  USING (true)
  WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- 4. Storage: crear buckets y sus políticas
-- ────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
  VALUES ('edificio-assets', 'edificio-assets', true)
  ON CONFLICT (id) DO UPDATE SET public = true;

INSERT INTO storage.buckets (id, name, public)
  VALUES ('pagos', 'pagos', true)
  ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Lectura pública edificio-assets" ON storage.objects;
DROP POLICY IF EXISTS "Subida libre edificio-assets" ON storage.objects;
DROP POLICY IF EXISTS "Update libre edificio-assets" ON storage.objects;
DROP POLICY IF EXISTS "Lectura pública pagos" ON storage.objects;
DROP POLICY IF EXISTS "Usuarios suben comprobantes" ON storage.objects;

CREATE POLICY "Lectura pública edificio-assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'edificio-assets');

CREATE POLICY "Subida libre edificio-assets"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'edificio-assets');

CREATE POLICY "Update libre edificio-assets"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'edificio-assets')
  WITH CHECK (bucket_id = 'edificio-assets');

CREATE POLICY "Lectura pública pagos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'pagos');

CREATE POLICY "Usuarios suben comprobantes"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'pagos');

-- ────────────────────────────────────────────────────────────
-- 5. Asegurar perfil_completo = false por defecto
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.perfiles
  ALTER COLUMN perfil_completo SET DEFAULT false;

UPDATE public.perfiles
  SET perfil_completo = false
  WHERE perfil_completo IS NULL;
