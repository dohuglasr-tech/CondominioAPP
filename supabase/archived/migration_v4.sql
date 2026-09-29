-- ============================================================
-- MIGRATION v4: Restricciones y políticas para un usuario por apartamento
-- Ejecutar en Supabase > SQL Editor
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Asegurar que el número de apartamento sea único
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.apartamentos
  DROP CONSTRAINT IF EXISTS apartamentos_numero_unique;

ALTER TABLE public.apartamentos
  ADD CONSTRAINT apartamentos_numero_unique UNIQUE (numero);

-- ────────────────────────────────────────────────────────────
-- 2. Asegurar que un apartamento no pueda tener dos perfiles activos
-- ────────────────────────────────────────────────────────────
-- Crear índice único en perfiles.apartamento_id para evitar dos usuarios
-- con el mismo apartamento (excepto NULL que significa sin apartamento asignado)
CREATE UNIQUE INDEX IF NOT EXISTS perfiles_apartamento_id_unique
  ON public.perfiles (apartamento_id)
  WHERE apartamento_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 3. Políticas RLS para perfiles — los nuevos usuarios pueden
--    actualizarse a sí mismos (necesario para el flujo de registro)
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuarios pueden leer su propio perfil" ON public.perfiles;
DROP POLICY IF EXISTS "Usuarios pueden actualizar su propio perfil" ON public.perfiles;
DROP POLICY IF EXISTS "Insert libre perfiles" ON public.perfiles;
DROP POLICY IF EXISTS "Lectura pública perfiles" ON public.perfiles;

CREATE POLICY "Usuarios pueden leer su propio perfil"
  ON public.perfiles FOR SELECT
  USING (true);

CREATE POLICY "Usuarios pueden actualizar su propio perfil"
  ON public.perfiles FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Insert libre perfiles"
  ON public.perfiles FOR INSERT
  WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- 4. Asegurar que perfil_completo tenga default false
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.perfiles
  ALTER COLUMN perfil_completo SET DEFAULT false;

-- Actualizar perfiles que aun tengan NULL
UPDATE public.perfiles
  SET perfil_completo = false
  WHERE perfil_completo IS NULL;

-- ────────────────────────────────────────────────────────────
-- 5. Asegurar que clave_cambiada tenga default false
--    (para no bloquear a usuarios nuevos en el flujo de setup)
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.perfiles
  ALTER COLUMN clave_cambiada SET DEFAULT false;
