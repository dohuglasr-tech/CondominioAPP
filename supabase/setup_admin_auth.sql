-- ==============================================================================
-- CONFIGURACIÓN DE AUTENTICACIÓN REAL DEL ADMINISTRADOR
-- ==============================================================================
-- Ejecutar en: Supabase → SQL Editor → Run
--
-- PASO PREVIO (manual, una sola vez):
--   1. Ir a Supabase → Authentication → Users → Add User
--   2. Crear el usuario con el email y contraseña que quieras para el admin
--      (ejemplo: admin@torre5.com / [contraseña-segura])
--   3. Luego ejecutar este script para asignarle el rol 'administrador'
-- ==============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE A: Asegurarnos que el perfil del admin existe y tiene el rol correcto
-- ─────────────────────────────────────────────────────────────────────────────

-- Reemplaza 'admin@torre5.com' con el email exacto que usaste al crear el usuario

DO $$
DECLARE
  v_admin_id UUID;
BEGIN
  -- Buscar el ID del usuario administrador en auth.users
  SELECT id INTO v_admin_id
  FROM auth.users
  WHERE email = 'admin@torre5.com'  -- ← Cambiar si usas otro email
  LIMIT 1;

  IF v_admin_id IS NULL THEN
    RAISE NOTICE '⚠️  No se encontró ningún usuario con ese email en Supabase Auth. Créalo primero desde Authentication → Users → Add User.';
  ELSE
    RAISE NOTICE '✅ Usuario encontrado: %', v_admin_id;

    -- Insertar perfil si no existe, o actualizar si ya existe
    INSERT INTO public.perfiles (
      id,
      nombre_completo,
      email,
      rol,
      clave_cambiada,
      estado_cuenta,
      perfil_completo
    )
    VALUES (
      v_admin_id,
      'Administrador General',   -- ← Puedes personalizar el nombre
      'admin@torre5.com',        -- ← Mismo email del usuario
      'administrador',
      true,
      'activa',
      true
    )
    ON CONFLICT (id) DO UPDATE
      SET
        rol            = 'administrador',
        clave_cambiada = true,
        estado_cuenta  = 'activa',
        perfil_completo = true;

    RAISE NOTICE '✅ Perfil de administrador configurado correctamente.';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE B: Verificación — ejecutar esto por separado para confirmar
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  u.email,
  p.nombre_completo,
  p.rol,
  p.estado_cuenta,
  p.clave_cambiada,
  p.perfil_completo
FROM auth.users u
JOIN public.perfiles p ON p.id = u.id
WHERE p.rol = 'administrador';

-- Si ves una fila con rol = 'administrador', estás listo para hacer el login seguro.
-- ==============================================================================
