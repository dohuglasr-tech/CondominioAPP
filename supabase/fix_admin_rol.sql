-- ==============================================================================
-- DIAGNÓSTICO Y CORRECCIÓN DEL ROL DE ADMINISTRADOR
-- Ejecutar en: Supabase → SQL Editor → Run
-- ==============================================================================

-- PASO 1: Ver todos los usuarios en auth.users y su perfil actual
-- (Para identificar el ID y rol actual del admin)
SELECT
  u.id,
  u.email,
  u.created_at,
  p.nombre_completo,
  p.rol,
  p.estado_cuenta,
  p.clave_cambiada
FROM auth.users u
LEFT JOIN public.perfiles p ON p.id = u.id
ORDER BY u.created_at DESC;

-- ==============================================================================
-- PASO 2: Corregir el rol del administrador
-- Reemplaza 'admin@admin.com' con el email exacto que usaste al crear el usuario
-- ==============================================================================

DO $$
DECLARE
  v_admin_id UUID;
BEGIN
  -- Buscar por el email real del admin
  SELECT id INTO v_admin_id
  FROM auth.users
  WHERE email = 'admin@admin.com'   -- ← CAMBIAR al email que usaste
  LIMIT 1;

  IF v_admin_id IS NULL THEN
    RAISE NOTICE '⚠️  No se encontró el usuario. Verifica el email en la línea anterior.';
  ELSE
    -- Si ya tiene perfil, solo actualizamos el rol
    IF EXISTS (SELECT 1 FROM public.perfiles WHERE id = v_admin_id) THEN
      UPDATE public.perfiles
      SET
        rol             = 'administrador',
        clave_cambiada  = true,
        estado_cuenta   = 'activa',
        perfil_completo = true
      WHERE id = v_admin_id;
      RAISE NOTICE '✅ Perfil actualizado a rol=administrador para el usuario: %', v_admin_id;

    -- Si NO tiene perfil todavía, lo creamos
    ELSE
      INSERT INTO public.perfiles (id, nombre_completo, email, rol, clave_cambiada, estado_cuenta, perfil_completo)
      VALUES (v_admin_id, 'Administrador General', 'admin@admin.com', 'administrador', true, 'activa', true);
      RAISE NOTICE '✅ Perfil de administrador creado para: %', v_admin_id;
    END IF;
  END IF;
END $$;

-- ==============================================================================
-- PASO 3: Verificación final — debe mostrar rol = 'administrador'
-- ==============================================================================
SELECT
  u.email,
  p.nombre_completo,
  p.rol,
  p.estado_cuenta,
  p.clave_cambiada
FROM auth.users u
JOIN public.perfiles p ON p.id = u.id
WHERE p.rol = 'administrador';
