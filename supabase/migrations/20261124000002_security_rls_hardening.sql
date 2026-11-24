-- ==============================================================================
-- MIGRATION: 20261124000002_security_rls_hardening.sql
-- Bloque A (Fase 1.2): Cierre completo de RLS en tablas y Storage, trigger
-- anti-escalada en perfiles y restricción de RPCs administrativos.
-- IMPORTANTE: Ejecutar DESPUÉS de 20261124000001_public_security_rpcs.sql
-- ==============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. TRIGGER ANTI-ESCALADA DE PRIVILEGIOS EN public.perfiles
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.proteger_campos_sensibles_perfil()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_json JSONB;
  v_new_json JSONB;
  v_transicion_clave_valida BOOLEAN;
BEGIN
  -- Permitir migraciones / service_role / contextos sin JWT de usuario
  IF auth.uid() IS NULL OR public.is_admin_or_superadmin() THEN
    RETURN NEW;
  END IF;

  -- Nunca permitir cambio de rol por un no-admin
  IF NEW.rol IS DISTINCT FROM OLD.rol THEN
    RAISE EXCEPTION 'Operación prohibida: no tienes permisos para modificar el rol.';
  END IF;

  -- Nunca permitir reasignar apartamento una vez vinculado
  IF OLD.apartamento_id IS NOT NULL AND NEW.apartamento_id IS DISTINCT FROM OLD.apartamento_id THEN
    RAISE EXCEPTION 'Operación prohibida: no puedes cambiar el apartamento asignado.';
  END IF;

  -- Nunca permitir cambiar edificio_id una vez vinculado
  v_old_json := to_jsonb(OLD);
  v_new_json := to_jsonb(NEW);
  IF (v_old_json ->> 'edificio_id') IS NOT NULL
     AND (v_new_json ->> 'edificio_id') IS DISTINCT FROM (v_old_json ->> 'edificio_id') THEN
    RAISE EXCEPTION 'Operación prohibida: no puedes cambiar el edificio asignado.';
  END IF;

  -- Permitir transición de estado_cuenta ÚNICAMENTE al completar cambio de clave inicial
  IF NEW.estado_cuenta IS DISTINCT FROM OLD.estado_cuenta THEN
    v_transicion_clave_valida := (
      OLD.estado_cuenta = 'pendiente_cambio_clave'
      AND NEW.estado_cuenta = 'activa'
      AND COALESCE(NEW.clave_cambiada, false) = true
    );
    IF NOT v_transicion_clave_valida THEN
      RAISE EXCEPTION 'Operación prohibida: no tienes permisos para modificar el estado de la cuenta.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_campos_sensibles_perfil ON public.perfiles;
CREATE TRIGGER trg_proteger_campos_sensibles_perfil
BEFORE UPDATE ON public.perfiles
FOR EACH ROW EXECUTE FUNCTION public.proteger_campos_sensibles_perfil();

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. ENDURECER RPCs ADMINISTRATIVAS EXISTENTES
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_superadmin() THEN
    RAISE EXCEPTION 'Acceso denegado: solo administradores pueden eliminar usuarios.';
  END IF;

  DELETE FROM public.pagos_reportados WHERE reportado_por = target_user_id;

  IF to_regclass('public.votos_propuestas') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'votos_propuestas' AND column_name = 'usuario_id'
    ) THEN
      DELETE FROM public.votos_propuestas WHERE usuario_id = target_user_id;
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'votos_propuestas' AND column_name = 'votado_por'
    ) THEN
      EXECUTE 'DELETE FROM public.votos_propuestas WHERE votado_por = $1' USING target_user_id;
    END IF;
  END IF;

  IF to_regclass('public.chat_mensajes') IS NOT NULL THEN
    DELETE FROM public.chat_mensajes WHERE autor_id = target_user_id;
  END IF;

  UPDATE public.apartamentos
  SET propietario_nombre = NULL, telefono_contacto = NULL
  WHERE id IN (SELECT apartamento_id FROM public.perfiles WHERE id = target_user_id);

  DELETE FROM public.perfiles WHERE id = target_user_id;
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.aprobar_pago_transaccional(
  p_pago_id UUID,
  p_notas_admin TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pago RECORD;
  v_apto_id UUID;
  v_notas_final TEXT;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_superadmin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acceso denegado: requiere privilegios de administrador.');
  END IF;

  SELECT * INTO v_pago FROM public.pagos_reportados WHERE id = p_pago_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'El pago especificado no existe.');
  END IF;

  v_apto_id := v_pago.apartamento_id;
  IF v_apto_id IS NULL AND v_pago.reportado_por IS NOT NULL THEN
    SELECT apartamento_id INTO v_apto_id FROM public.perfiles WHERE id = v_pago.reportado_por;
  END IF;

  v_notas_final := COALESCE(v_pago.notas_admin, '');
  IF p_notas_admin IS NOT NULL AND TRIM(p_notas_admin) <> '' THEN
    IF v_notas_final <> '' THEN
      v_notas_final := v_notas_final || ' | Nota Admin: ' || TRIM(p_notas_admin);
    ELSE
      v_notas_final := 'Nota Admin: ' || TRIM(p_notas_admin);
    END IF;
  END IF;

  UPDATE public.pagos_reportados
  SET estado = 'aprobado', notas_admin = v_notas_final, fecha_revision = NOW(), updated_at = NOW()
  WHERE id = p_pago_id;

  IF v_apto_id IS NOT NULL THEN
    UPDATE public.recibos_generados SET estado = 'pagado' WHERE apartamento_id = v_apto_id AND estado = 'pendiente';
    UPDATE public.deudas_mora SET estado = 'solventado', updated_at = NOW() WHERE apartamento_id = v_apto_id AND estado = 'activo';
  END IF;

  RETURN jsonb_build_object('success', true, 'pago_id', p_pago_id, 'apartamento_id', v_apto_id, 'estado', 'aprobado');
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.aprobar_pago_transaccional(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aprobar_pago_transaccional(UUID, TEXT) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.superadmin_change_user_password(uuid,text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.superadmin_change_user_password(UUID, TEXT) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.superadmin_change_user_password(UUID, TEXT) TO authenticated, service_role;
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. LIMPIEZA TOTAL DE POLÍTICAS PERMISIVAS Y CIERRE ESTRICTO DE RLS EN public.*
-- ──────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_tbl TEXT;
  v_pol RECORD;
  v_has_apto_id BOOLEAN;
  v_has_usuario_id BOOLEAN;
  v_has_autor_id BOOLEAN;
  v_has_creado_por BOOLEAN;
  v_tablas TEXT[] := ARRAY[
    'perfiles', 'configuracion_edificio', 'pagos_reportados',
    'recibos_generados', 'deudas_mora', 'cargos_especiales',
    'cuotas_apartamento', 'cartas_solvencia', 'apartamentos',
    'locales', 'gastos_comunes', 'junta_condominio', 'boveda_legal',
    'casos_comunidad', 'comunicados', 'comunicados_leidos', 'tasa_bcv',
    'historial_auditoria', 'notificaciones', 'chat_mensajes',
    'falencias', 'incidencias', 'propuestas', 'votos_propuestas',
    'propuestas_apoyos', 'propuestas_comentarios', 'votos_falencias',
    'tickets_anonimos', 'documentos_admin', 'recibos_laborales',
    'registro_conserje', 'visitantes'
  ];
BEGIN
  FOREACH v_tbl IN ARRAY v_tablas LOOP
    IF to_regclass('public.' || v_tbl) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', v_tbl);

    -- Eliminar TODAS las políticas previas sin importar su nombre
    FOR v_pol IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = v_tbl
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', v_pol.policyname, v_tbl);
    END LOOP;
  END LOOP;

  -- 1) perfiles
  IF to_regclass('public.perfiles') IS NOT NULL THEN
    CREATE POLICY "rls_perfiles_select" ON public.perfiles
      FOR SELECT TO authenticated
      USING (id = auth.uid() OR public.is_admin_or_superadmin());

    CREATE POLICY "rls_perfiles_update" ON public.perfiles
      FOR UPDATE TO authenticated
      USING (id = auth.uid() OR public.is_admin_or_superadmin())
      WITH CHECK (id = auth.uid() OR public.is_admin_or_superadmin());

    CREATE POLICY "rls_perfiles_insert" ON public.perfiles
      FOR INSERT TO authenticated
      WITH CHECK (public.is_admin_or_superadmin());

    CREATE POLICY "rls_perfiles_delete" ON public.perfiles
      FOR DELETE TO authenticated
      USING (public.is_admin_or_superadmin());
  END IF;

  -- 2) configuracion_edificio
  IF to_regclass('public.configuracion_edificio') IS NOT NULL THEN
    CREATE POLICY "rls_config_edificio_select" ON public.configuracion_edificio
      FOR SELECT TO authenticated
      USING (true);

    CREATE POLICY "rls_config_edificio_insert" ON public.configuracion_edificio
      FOR INSERT TO authenticated
      WITH CHECK (public.is_admin_or_superadmin());

    CREATE POLICY "rls_config_edificio_update" ON public.configuracion_edificio
      FOR UPDATE TO authenticated
      USING (public.is_admin_or_superadmin())
      WITH CHECK (public.is_admin_or_superadmin());

    CREATE POLICY "rls_config_edificio_delete" ON public.configuracion_edificio
      FOR DELETE TO authenticated
      USING (public.is_admin_or_superadmin());
  END IF;

  -- 3) pagos_reportados
  IF to_regclass('public.pagos_reportados') IS NOT NULL THEN
    CREATE POLICY "rls_pagos_select" ON public.pagos_reportados
      FOR SELECT TO authenticated
      USING (
        apartamento_id = public.current_user_apartamento_id()
        OR reportado_por = auth.uid()
        OR public.is_admin_or_superadmin()
      );

    CREATE POLICY "rls_pagos_insert" ON public.pagos_reportados
      FOR INSERT TO authenticated
      WITH CHECK (
        public.is_admin_or_superadmin()
        OR (
          apartamento_id = public.current_user_apartamento_id()
          AND COALESCE(reportado_por, auth.uid()) = auth.uid()
          AND estado = 'pendiente'
        )
      );

    CREATE POLICY "rls_pagos_update" ON public.pagos_reportados
      FOR UPDATE TO authenticated
      USING (public.is_admin_or_superadmin())
      WITH CHECK (public.is_admin_or_superadmin());

    CREATE POLICY "rls_pagos_delete" ON public.pagos_reportados
      FOR DELETE TO authenticated
      USING (public.is_admin_or_superadmin());
  END IF;

  -- 4) Tablas financieras por apartamento (recibos_generados, deudas_mora, cargos_especiales, cuotas_apartamento, cartas_solvencia)
  FOREACH v_tbl IN ARRAY ARRAY['recibos_generados', 'deudas_mora', 'cargos_especiales', 'cuotas_apartamento', 'cartas_solvencia'] LOOP
    IF to_regclass('public.' || v_tbl) IS NOT NULL THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (apartamento_id = public.current_user_apartamento_id() OR public.is_admin_or_superadmin());',
        'rls_' || v_tbl || '_select', v_tbl
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_superadmin());',
        'rls_' || v_tbl || '_insert', v_tbl
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_admin_or_superadmin()) WITH CHECK (public.is_admin_or_superadmin());',
        'rls_' || v_tbl || '_update', v_tbl
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_admin_or_superadmin());',
        'rls_' || v_tbl || '_delete', v_tbl
      );
    END IF;
  END LOOP;

  -- 5) Tablas administrativas de lectura autenticada y escritura exclusiva de admins
  FOREACH v_tbl IN ARRAY ARRAY[
    'apartamentos', 'locales', 'gastos_comunes', 'junta_condominio',
    'boveda_legal', 'casos_comunidad', 'comunicados', 'tasa_bcv',
    'documentos_admin', 'recibos_laborales', 'registro_conserje', 'visitantes'
  ] LOOP
    IF to_regclass('public.' || v_tbl) IS NOT NULL THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true);',
        'rls_' || v_tbl || '_select', v_tbl
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_superadmin());',
        'rls_' || v_tbl || '_insert', v_tbl
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_admin_or_superadmin()) WITH CHECK (public.is_admin_or_superadmin());',
        'rls_' || v_tbl || '_update', v_tbl
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_admin_or_superadmin());',
        'rls_' || v_tbl || '_delete', v_tbl
      );
    END IF;
  END LOOP;

  -- 6) historial_auditoria (lectura solo admin; inserción autenticada; inmutable)
  IF to_regclass('public.historial_auditoria') IS NOT NULL THEN
    CREATE POLICY "rls_auditoria_select" ON public.historial_auditoria
      FOR SELECT TO authenticated
      USING (public.is_admin_or_superadmin());

    CREATE POLICY "rls_auditoria_insert" ON public.historial_auditoria
      FOR INSERT TO authenticated
      WITH CHECK (auth.uid() IS NOT NULL);
  END IF;

  -- 7) notificaciones
  IF to_regclass('public.notificaciones') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'notificaciones' AND column_name = 'apartamento_id'
    ) INTO v_has_apto_id;

    IF v_has_apto_id THEN
      CREATE POLICY "rls_notificaciones_select" ON public.notificaciones
        FOR SELECT TO authenticated
        USING (apartamento_id = public.current_user_apartamento_id() OR public.is_admin_or_superadmin());

      CREATE POLICY "rls_notificaciones_update" ON public.notificaciones
        FOR UPDATE TO authenticated
        USING (apartamento_id = public.current_user_apartamento_id() OR public.is_admin_or_superadmin())
        WITH CHECK (apartamento_id = public.current_user_apartamento_id() OR public.is_admin_or_superadmin());
    ELSE
      CREATE POLICY "rls_notificaciones_select" ON public.notificaciones
        FOR SELECT TO authenticated
        USING (public.is_admin_or_superadmin());

      CREATE POLICY "rls_notificaciones_update" ON public.notificaciones
        FOR UPDATE TO authenticated
        USING (public.is_admin_or_superadmin())
        WITH CHECK (public.is_admin_or_superadmin());
    END IF;

    CREATE POLICY "rls_notificaciones_insert" ON public.notificaciones
      FOR INSERT TO authenticated
      WITH CHECK (public.is_admin_or_superadmin());

    CREATE POLICY "rls_notificaciones_delete" ON public.notificaciones
      FOR DELETE TO authenticated
      USING (public.is_admin_or_superadmin());
  END IF;

  -- 8) chat_mensajes
  IF to_regclass('public.chat_mensajes') IS NOT NULL THEN
    CREATE POLICY "rls_chat_select" ON public.chat_mensajes
      FOR SELECT TO authenticated
      USING (true);

    CREATE POLICY "rls_chat_insert" ON public.chat_mensajes
      FOR INSERT TO authenticated
      WITH CHECK (autor_id = auth.uid() OR public.is_admin_or_superadmin());

    CREATE POLICY "rls_chat_update" ON public.chat_mensajes
      FOR UPDATE TO authenticated
      USING (autor_id = auth.uid() OR public.is_admin_or_superadmin())
      WITH CHECK (autor_id = auth.uid() OR public.is_admin_or_superadmin());

    CREATE POLICY "rls_chat_delete" ON public.chat_mensajes
      FOR DELETE TO authenticated
      USING (autor_id = auth.uid() OR public.is_admin_or_superadmin());
  END IF;

  -- 9) falencias / incidencias
  FOREACH v_tbl IN ARRAY ARRAY['falencias', 'incidencias'] LOOP
    IF to_regclass('public.' || v_tbl) IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = v_tbl AND column_name = 'creado_por'
      ) INTO v_has_creado_por;

      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true);', 'rls_' || v_tbl || '_select', v_tbl);

      IF v_has_creado_por THEN
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (COALESCE(creado_por, auth.uid()) = auth.uid() OR public.is_admin_or_superadmin());',
          'rls_' || v_tbl || '_insert', v_tbl
        );
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (creado_por = auth.uid() OR public.is_admin_or_superadmin()) WITH CHECK (creado_por = auth.uid() OR public.is_admin_or_superadmin());',
          'rls_' || v_tbl || '_update', v_tbl
        );
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (creado_por = auth.uid() OR public.is_admin_or_superadmin());',
          'rls_' || v_tbl || '_delete', v_tbl
        );
      ELSE
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);',
          'rls_' || v_tbl || '_insert', v_tbl
        );
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_admin_or_superadmin()) WITH CHECK (public.is_admin_or_superadmin());',
          'rls_' || v_tbl || '_update', v_tbl
        );
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_admin_or_superadmin());',
          'rls_' || v_tbl || '_delete', v_tbl
        );
      END IF;
    END IF;
  END LOOP;

  -- 10) Tablas comunitarias de participación (propuestas y votos)
  FOREACH v_tbl IN ARRAY ARRAY[
    'propuestas', 'votos_propuestas', 'propuestas_apoyos',
    'propuestas_comentarios', 'votos_falencias', 'comunicados_leidos',
    'tickets_anonimos'
  ] LOOP
    IF to_regclass('public.' || v_tbl) IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = v_tbl AND column_name = 'usuario_id'
      ) INTO v_has_usuario_id;
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = v_tbl AND column_name = 'autor_id'
      ) INTO v_has_autor_id;

      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true);', 'rls_' || v_tbl || '_select', v_tbl);

      IF v_has_usuario_id THEN
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (COALESCE(usuario_id, auth.uid()) = auth.uid() OR public.is_admin_or_superadmin());',
          'rls_' || v_tbl || '_insert', v_tbl
        );
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (usuario_id = auth.uid() OR public.is_admin_or_superadmin()) WITH CHECK (usuario_id = auth.uid() OR public.is_admin_or_superadmin());',
          'rls_' || v_tbl || '_update', v_tbl
        );
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (usuario_id = auth.uid() OR public.is_admin_or_superadmin());',
          'rls_' || v_tbl || '_delete', v_tbl
        );
      ELSIF v_has_autor_id THEN
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (COALESCE(autor_id, auth.uid()) = auth.uid() OR public.is_admin_or_superadmin());',
          'rls_' || v_tbl || '_insert', v_tbl
        );
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (autor_id = auth.uid() OR public.is_admin_or_superadmin()) WITH CHECK (autor_id = auth.uid() OR public.is_admin_or_superadmin());',
          'rls_' || v_tbl || '_update', v_tbl
        );
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (autor_id = auth.uid() OR public.is_admin_or_superadmin());',
          'rls_' || v_tbl || '_delete', v_tbl
        );
      ELSE
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);',
          'rls_' || v_tbl || '_insert', v_tbl
        );
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_admin_or_superadmin()) WITH CHECK (public.is_admin_or_superadmin());',
          'rls_' || v_tbl || '_update', v_tbl
        );
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_admin_or_superadmin());',
          'rls_' || v_tbl || '_delete', v_tbl
        );
      END IF;
    END IF;
  END LOOP;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. ENDURECIMIENTO DE STORAGE (storage.objects: edificio-assets y pagos)
-- ──────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_pol RECORD;
BEGIN
  FOR v_pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND (
        policyname ILIKE '%edificio-assets%'
        OR policyname ILIKE '%pagos%'
        OR policyname ILIKE '%comprobantes%'
        OR COALESCE(qual, '') ILIKE '%edificio-assets%'
        OR COALESCE(qual, '') ILIKE '%pagos%'
        OR COALESCE(with_check, '') ILIKE '%edificio-assets%'
        OR COALESCE(with_check, '') ILIKE '%pagos%'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects;', v_pol.policyname);
  END LOOP;
END $$;

-- Bucket edificio-assets: lectura pública para logos/branding; mutaciones solo admin
CREATE POLICY "rls_storage_edificio_assets_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'edificio-assets');

CREATE POLICY "rls_storage_edificio_assets_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'edificio-assets' AND public.is_admin_or_superadmin());

CREATE POLICY "rls_storage_edificio_assets_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'edificio-assets' AND public.is_admin_or_superadmin())
  WITH CHECK (bucket_id = 'edificio-assets' AND public.is_admin_or_superadmin());

CREATE POLICY "rls_storage_edificio_assets_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'edificio-assets' AND public.is_admin_or_superadmin());

-- Bucket pagos: solo autenticados, limitado por ruta del apartamento/usuario o admin; modificación/borrado solo admin
CREATE POLICY "rls_storage_pagos_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'pagos'
    AND (
      public.is_admin_or_superadmin()
      OR name LIKE ('comprobantes/' || COALESCE(public.current_user_apartamento_id()::TEXT, '__NONE__') || '/%')
      OR name LIKE ('reportes/' || COALESCE(public.current_user_apartamento_id()::TEXT, '__NONE__') || '/%')
      OR name LIKE ('reportes/' || COALESCE(auth.uid()::TEXT, '__NONE__') || '/%')
      OR name LIKE 'reportes/%'
      OR name LIKE 'gastos/%'
    )
  );

CREATE POLICY "rls_storage_pagos_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'pagos'
    AND (
      public.is_admin_or_superadmin()
      OR name LIKE ('comprobantes/' || COALESCE(public.current_user_apartamento_id()::TEXT, '__NONE__') || '/%')
      OR name LIKE 'reportes/%'
    )
  );

CREATE POLICY "rls_storage_pagos_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'pagos' AND public.is_admin_or_superadmin())
  WITH CHECK (bucket_id = 'pagos' AND public.is_admin_or_superadmin());

CREATE POLICY "rls_storage_pagos_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'pagos' AND public.is_admin_or_superadmin());

NOTIFY pgrst, 'reload schema';
