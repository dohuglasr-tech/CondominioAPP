-- ============================================================
-- MIGRATION v5: Permisos completos (GRANTS), RLS y admin_delete_user
-- Ejecutar en Supabase > SQL Editor y presionar "RUN"
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. CONCEDER PERMISOS (GRANTS) A ROLES anon, authenticated, service_role
--    (Soluciona definitivamente el error: "permission denied for table ...")
-- ────────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

-- ────────────────────────────────────────────────────────────
-- 2. TABLA: apartamentos (RLS y políticas)
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.apartamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura pública apartamentos" ON public.apartamentos;
DROP POLICY IF EXISTS "Insert libre apartamentos" ON public.apartamentos;
DROP POLICY IF EXISTS "Update libre apartamentos" ON public.apartamentos;

CREATE POLICY "Lectura pública apartamentos"
  ON public.apartamentos FOR SELECT
  USING (true);

CREATE POLICY "Insert libre apartamentos"
  ON public.apartamentos FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Update libre apartamentos"
  ON public.apartamentos FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- 3. TABLA: perfiles (RLS y políticas)
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura pública perfiles" ON public.perfiles;
DROP POLICY IF EXISTS "Insert libre perfiles" ON public.perfiles;
DROP POLICY IF EXISTS "Update libre perfiles" ON public.perfiles;
DROP POLICY IF EXISTS "Delete libre perfiles" ON public.perfiles;
DROP POLICY IF EXISTS "Usuarios ven su propio perfil" ON public.perfiles;
DROP POLICY IF EXISTS "Usuarios actualizan su propio perfil" ON public.perfiles;
DROP POLICY IF EXISTS "Acceso anon a perfiles" ON public.perfiles;
DROP POLICY IF EXISTS "Usuarios pueden leer su propio perfil" ON public.perfiles;
DROP POLICY IF EXISTS "Usuarios pueden actualizar su propio perfil" ON public.perfiles;

CREATE POLICY "Lectura pública perfiles"
  ON public.perfiles FOR SELECT
  USING (true);

CREATE POLICY "Insert libre perfiles"
  ON public.perfiles FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Update libre perfiles"
  ON public.perfiles FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Delete libre perfiles"
  ON public.perfiles FOR DELETE
  USING (true);

-- ────────────────────────────────────────────────────────────
-- 4. TABLA: pagos_reportados (RLS y políticas)
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.pagos_reportados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura libre pagos" ON public.pagos_reportados;
DROP POLICY IF EXISTS "Insertar pagos libre" ON public.pagos_reportados;
DROP POLICY IF EXISTS "Actualizar pagos libre" ON public.pagos_reportados;
DROP POLICY IF EXISTS "Delete libre pagos" ON public.pagos_reportados;
DROP POLICY IF EXISTS "Residentes pueden reportar pagos" ON public.pagos_reportados;
DROP POLICY IF EXISTS "Lectura de pagos autenticados" ON public.pagos_reportados;
DROP POLICY IF EXISTS "Admin puede actualizar pagos" ON public.pagos_reportados;
DROP POLICY IF EXISTS "Usuarios insertan sus propios pagos" ON public.pagos_reportados;

CREATE POLICY "Lectura libre pagos"
  ON public.pagos_reportados FOR SELECT
  USING (true);

CREATE POLICY "Insertar pagos libre"
  ON public.pagos_reportados FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Actualizar pagos libre"
  ON public.pagos_reportados FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Delete libre pagos"
  ON public.pagos_reportados FOR DELETE
  USING (true);

-- Asegurar default para fecha_pago si no se envía
ALTER TABLE public.pagos_reportados 
  ALTER COLUMN fecha_pago SET DEFAULT CURRENT_DATE;

-- ────────────────────────────────────────────────────────────
-- 5. FUNCIÓN: admin_delete_user
--    Elimina por completo a un usuario:
--    - pagos reportados
--    - perfiles
--    - auth.users (usando SECURITY DEFINER)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- 1. Eliminar pagos reportados por el usuario
  DELETE FROM public.pagos_reportados WHERE reportado_por = target_user_id;

  -- 2. Eliminar votos de propuestas si existen
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'votos_propuestas') THEN
    DELETE FROM public.votos_propuestas WHERE votado_por = target_user_id;
  END IF;

  -- 3. Eliminar mensajes de chat si existen
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'mensajes_chat') THEN
    DELETE FROM public.mensajes_chat WHERE usuario_id = target_user_id;
  END IF;

  -- 4. Desvincular apartamentos asociados al perfil
  UPDATE public.apartamentos
  SET propietario_nombre = NULL, telefono_contacto = NULL
  WHERE id IN (SELECT apartamento_id FROM public.perfiles WHERE id = target_user_id);

  -- 5. Eliminar el registro del perfil
  DELETE FROM public.perfiles WHERE id = target_user_id;

  -- 6. Eliminar el usuario de Supabase Auth (auth.users)
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO anon, authenticated, service_role;
