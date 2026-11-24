-- ==============================================================================
-- MIGRATION: 20261124000005_multitenant_edificio_isolation.sql
-- Bloque D — Sub-hito D2 (Fase 5): Multi-Edificio Real y Aislamiento Tenant
--   1. Helpers SECURITY DEFINER: is_superadmin(), default_edificio_id(),
--      user_can_access_edificio(UUID)
--   2. Columna edificio_id + índices compuestos + backfill seguro en todas las
--      tablas operativas y relacionales
--   3. Trigger BEFORE INSERT asignar_edificio_id_por_defecto() en todas las tablas
--   4. Políticas RLS combinando propietario/rol + user_can_access_edificio(edificio_id)
--   5. Endurecimiento multi-tenant en get_admin_dashboard_kpis,
--      reclamar_pago_para_revision y get_resumen_mora_comunitario
-- ==============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. HELPERS MULTI-TENANT (SECURITY DEFINER + search_path fijo)
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_user_rol() = 'superadmin', false);
$$;

CREATE OR REPLACE FUNCTION public.default_edificio_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.configuracion_edificio ORDER BY created_at ASC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.user_can_access_edificio(p_edificio_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_superadmin()
    OR (
      COALESCE(public.current_user_edificio_id(), public.default_edificio_id()) IS NOT NULL
      AND COALESCE(p_edificio_id, public.default_edificio_id()) = COALESCE(public.current_user_edificio_id(), public.default_edificio_id())
    )
    OR (public.default_edificio_id() IS NULL AND p_edificio_id IS NULL);
$$;

REVOKE ALL ON FUNCTION public.is_superadmin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_superadmin() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.default_edificio_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.default_edificio_id() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.user_can_access_edificio(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_access_edificio(UUID) TO authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. TRIGGER GENÉRICO BEFORE INSERT PARA ASIGNAR edificio_id POR DEFECTO
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.asignar_edificio_id_por_defecto()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_apto_id TEXT;
  v_edif_id UUID;
BEGIN
  IF NEW.edificio_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_edif_id := public.current_user_edificio_id();

  IF v_edif_id IS NULL THEN
    v_apto_id := to_jsonb(NEW) ->> 'apartamento_id';
    IF v_apto_id IS NOT NULL AND v_apto_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT a.edificio_id INTO v_edif_id
      FROM public.apartamentos a
      WHERE a.id = v_apto_id::UUID;
    END IF;
  END IF;

  IF v_edif_id IS NULL THEN
    v_edif_id := public.default_edificio_id();
  END IF;

  NEW.edificio_id := v_edif_id;
  RETURN NEW;
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. ESQUEMA: AGREGAR edificio_id, ÍNDICES, BACKFILL Y TRIGGER POR TABLA
-- ──────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_default_edif_id UUID;
  v_tbl TEXT;
  v_has_apto_id BOOLEAN;
  v_tablas TEXT[] := ARRAY[
    'perfiles', 'pagos_reportados', 'recibos_generados', 'deudas_mora',
    'cargos_especiales', 'cuotas_apartamento', 'cartas_solvencia', 'apartamentos',
    'locales', 'gastos_comunes', 'junta_condominio', 'boveda_legal',
    'casos_comunidad', 'comunicados', 'comunicados_leidos', 'tasa_bcv',
    'historial_auditoria', 'notificaciones', 'chat_mensajes',
    'falencias', 'incidencias', 'propuestas', 'votos_propuestas',
    'propuestas_apoyos', 'propuestas_comentarios', 'votos_falencias',
    'tickets_anonimos', 'documentos_admin', 'recibos_laborales',
    'registro_conserje', 'visitantes',
    'cuotas_extraordinarias', 'cuotas_extraordinarias_asignaciones',
    'gas_campanas', 'gas_asignaciones'
  ];
BEGIN
  SELECT id INTO v_default_edif_id
  FROM public.configuracion_edificio
  ORDER BY created_at ASC
  LIMIT 1;

  FOREACH v_tbl IN ARRAY v_tablas LOOP
    IF to_regclass('public.' || v_tbl) IS NULL THEN
      CONTINUE;
    END IF;

    -- Agregar columna edificio_id si no existe
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = v_tbl AND column_name = 'edificio_id'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN edificio_id UUID REFERENCES public.configuracion_edificio(id) ON DELETE CASCADE;',
        v_tbl
      );
    END IF;

    -- Índice por edificio_id
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (edificio_id);',
      'idx_' || v_tbl || '_edificio_id', v_tbl
    );

    -- Backfill desde apartamentos cuando exista apartamento_id
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = v_tbl AND column_name = 'apartamento_id'
    ) INTO v_has_apto_id;

    IF v_has_apto_id THEN
      EXECUTE format(
        'UPDATE public.%I t SET edificio_id = a.edificio_id FROM public.apartamentos a WHERE t.edificio_id IS NULL AND t.apartamento_id = a.id AND a.edificio_id IS NOT NULL;',
        v_tbl
      );
    END IF;

    -- Backfill residual con edificio por defecto
    IF v_default_edif_id IS NOT NULL THEN
      EXECUTE format(
        'UPDATE public.%I SET edificio_id = $1 WHERE edificio_id IS NULL;',
        v_tbl
      ) USING v_default_edif_id;
    END IF;

    -- Trigger BEFORE INSERT para futuras inserciones sin edificio_id explícito
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I;', 'trg_set_edificio_id_' || v_tbl, v_tbl);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.asignar_edificio_id_por_defecto();',
      'trg_set_edificio_id_' || v_tbl, v_tbl
    );
  END LOOP;

  -- Índices compuestos adicionales para filtros frecuentes multi-tenant
  IF to_regclass('public.casos_comunidad') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_casos_comunidad_edif_tipo ON public.casos_comunidad (edificio_id, tipo);
  END IF;
  IF to_regclass('public.pagos_reportados') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_pagos_reportados_edif_estado ON public.pagos_reportados (edificio_id, estado);
  END IF;
  IF to_regclass('public.recibos_generados') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_recibos_generados_edif_mes ON public.recibos_generados (edificio_id, mes_facturado);
  END IF;
  IF to_regclass('public.gastos_comunes') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_gastos_comunes_edif_mes ON public.gastos_comunes (edificio_id, mes_aplicacion);
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. REFORZAR POLÍTICAS RLS CON AISLAMIENTO POR EDIFICIO (user_can_access_edificio)
-- ──────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_tbl TEXT;
  v_pol RECORD;
  v_has_apto_id BOOLEAN;
  v_has_usuario_id BOOLEAN;
  v_has_autor_id BOOLEAN;
  v_has_creado_por BOOLEAN;
  v_tablas_reset TEXT[] := ARRAY[
    'perfiles', 'configuracion_edificio', 'pagos_reportados',
    'recibos_generados', 'deudas_mora', 'cargos_especiales',
    'cuotas_apartamento', 'cartas_solvencia', 'apartamentos',
    'locales', 'gastos_comunes', 'junta_condominio', 'boveda_legal',
    'casos_comunidad', 'comunicados', 'comunicados_leidos', 'tasa_bcv',
    'historial_auditoria', 'notificaciones', 'chat_mensajes',
    'falencias', 'incidencias', 'propuestas', 'votos_propuestas',
    'propuestas_apoyos', 'propuestas_comentarios', 'votos_falencias',
    'tickets_anonimos', 'documentos_admin', 'recibos_laborales',
    'registro_conserje', 'visitantes',
    'cuotas_extraordinarias', 'cuotas_extraordinarias_asignaciones',
    'gas_campanas', 'gas_asignaciones'
  ];
BEGIN
  FOREACH v_tbl IN ARRAY v_tablas_reset LOOP
    IF to_regclass('public.' || v_tbl) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', v_tbl);
    FOR v_pol IN
      SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = v_tbl
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', v_pol.policyname, v_tbl);
    END LOOP;
  END LOOP;

  -- 1) perfiles
  IF to_regclass('public.perfiles') IS NOT NULL THEN
    CREATE POLICY "rls_perfiles_select" ON public.perfiles
      FOR SELECT TO authenticated
      USING (
        id = auth.uid()
        OR (public.is_admin_or_superadmin() AND public.user_can_access_edificio(edificio_id))
      );

    CREATE POLICY "rls_perfiles_insert" ON public.perfiles
      FOR INSERT TO authenticated
      WITH CHECK (
        public.is_admin_or_superadmin()
        AND public.user_can_access_edificio(COALESCE(edificio_id, public.current_user_edificio_id(), public.default_edificio_id()))
      );

    CREATE POLICY "rls_perfiles_update" ON public.perfiles
      FOR UPDATE TO authenticated
      USING (
        id = auth.uid()
        OR (public.is_admin_or_superadmin() AND public.user_can_access_edificio(edificio_id))
      )
      WITH CHECK (
        id = auth.uid()
        OR (public.is_admin_or_superadmin() AND public.user_can_access_edificio(edificio_id))
      );

    CREATE POLICY "rls_perfiles_delete" ON public.perfiles
      FOR DELETE TO authenticated
      USING (public.is_admin_or_superadmin() AND public.user_can_access_edificio(edificio_id));
  END IF;

  -- 2) configuracion_edificio
  IF to_regclass('public.configuracion_edificio') IS NOT NULL THEN
    CREATE POLICY "rls_config_edificio_select" ON public.configuracion_edificio
      FOR SELECT TO authenticated
      USING (public.user_can_access_edificio(id));

    CREATE POLICY "rls_config_edificio_insert" ON public.configuracion_edificio
      FOR INSERT TO authenticated
      WITH CHECK (public.is_superadmin());

    CREATE POLICY "rls_config_edificio_update" ON public.configuracion_edificio
      FOR UPDATE TO authenticated
      USING (public.is_admin_or_superadmin() AND public.user_can_access_edificio(id))
      WITH CHECK (public.is_admin_or_superadmin() AND public.user_can_access_edificio(id));

    CREATE POLICY "rls_config_edificio_delete" ON public.configuracion_edificio
      FOR DELETE TO authenticated
      USING (public.is_superadmin());
  END IF;

  -- 3) pagos_reportados
  IF to_regclass('public.pagos_reportados') IS NOT NULL THEN
    CREATE POLICY "rls_pagos_select" ON public.pagos_reportados
      FOR SELECT TO authenticated
      USING (
        public.user_can_access_edificio(edificio_id)
        AND (
          apartamento_id = public.current_user_apartamento_id()
          OR reportado_por = auth.uid()
          OR public.is_admin_or_superadmin()
        )
      );

    CREATE POLICY "rls_pagos_insert" ON public.pagos_reportados
      FOR INSERT TO authenticated
      WITH CHECK (
        public.user_can_access_edificio(COALESCE(edificio_id, public.current_user_edificio_id(), public.default_edificio_id()))
        AND (
          public.is_admin_or_superadmin()
          OR (
            apartamento_id = public.current_user_apartamento_id()
            AND COALESCE(reportado_por, auth.uid()) = auth.uid()
            AND estado = 'pendiente'
          )
        )
      );

    CREATE POLICY "rls_pagos_update" ON public.pagos_reportados
      FOR UPDATE TO authenticated
      USING (public.is_admin_or_superadmin() AND public.user_can_access_edificio(edificio_id))
      WITH CHECK (public.is_admin_or_superadmin() AND public.user_can_access_edificio(edificio_id));

    CREATE POLICY "rls_pagos_delete" ON public.pagos_reportados
      FOR DELETE TO authenticated
      USING (public.is_admin_or_superadmin() AND public.user_can_access_edificio(edificio_id));
  END IF;

  -- 4) Tablas financieras por apartamento
  FOREACH v_tbl IN ARRAY ARRAY[
    'recibos_generados', 'deudas_mora', 'cargos_especiales',
    'cuotas_apartamento', 'cartas_solvencia', 'cuotas_extraordinarias_asignaciones'
  ] LOOP
    IF to_regclass('public.' || v_tbl) IS NOT NULL THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.user_can_access_edificio(edificio_id) AND (apartamento_id = public.current_user_apartamento_id() OR public.is_admin_or_superadmin()));',
        'rls_' || v_tbl || '_select', v_tbl
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_superadmin() AND public.user_can_access_edificio(COALESCE(edificio_id, public.current_user_edificio_id(), public.default_edificio_id())));',
        'rls_' || v_tbl || '_insert', v_tbl
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_admin_or_superadmin() AND public.user_can_access_edificio(edificio_id)) WITH CHECK (public.is_admin_or_superadmin() AND public.user_can_access_edificio(edificio_id));',
        'rls_' || v_tbl || '_update', v_tbl
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_admin_or_superadmin() AND public.user_can_access_edificio(edificio_id));',
        'rls_' || v_tbl || '_delete', v_tbl
      );
    END IF;
  END LOOP;

  -- 4b) gas_asignaciones (residente puede reportar su propia asignación)
  IF to_regclass('public.gas_asignaciones') IS NOT NULL THEN
    CREATE POLICY "rls_gas_asig_select" ON public.gas_asignaciones
      FOR SELECT TO authenticated
      USING (
        public.user_can_access_edificio(edificio_id)
        AND (apartamento_id = public.current_user_apartamento_id() OR public.is_admin_or_superadmin())
      );

    CREATE POLICY "rls_gas_asig_insert" ON public.gas_asignaciones
      FOR INSERT TO authenticated
      WITH CHECK (
        public.user_can_access_edificio(COALESCE(edificio_id, public.current_user_edificio_id(), public.default_edificio_id()))
        AND (
          public.is_admin_or_superadmin()
          OR (apartamento_id = public.current_user_apartamento_id() AND estado = 'en_verificacion')
        )
      );

    CREATE POLICY "rls_gas_asig_update" ON public.gas_asignaciones
      FOR UPDATE TO authenticated
      USING (
        public.user_can_access_edificio(edificio_id)
        AND (apartamento_id = public.current_user_apartamento_id() OR public.is_admin_or_superadmin())
      )
      WITH CHECK (
        public.user_can_access_edificio(edificio_id)
        AND (
          public.is_admin_or_superadmin()
          OR (apartamento_id = public.current_user_apartamento_id() AND estado = 'en_verificacion')
        )
      );

    CREATE POLICY "rls_gas_asig_delete" ON public.gas_asignaciones
      FOR DELETE TO authenticated
      USING (public.is_admin_or_superadmin() AND public.user_can_access_edificio(edificio_id));
  END IF;

  -- 5) Tablas operativas / catálogo de lectura comunitaria y escritura admin
  FOREACH v_tbl IN ARRAY ARRAY[
    'apartamentos', 'locales', 'gastos_comunes', 'junta_condominio',
    'boveda_legal', 'casos_comunidad', 'comunicados', 'tasa_bcv',
    'documentos_admin', 'recibos_laborales', 'registro_conserje', 'visitantes',
    'cuotas_extraordinarias', 'gas_campanas'
  ] LOOP
    IF to_regclass('public.' || v_tbl) IS NOT NULL THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.user_can_access_edificio(edificio_id));',
        'rls_' || v_tbl || '_select', v_tbl
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_superadmin() AND public.user_can_access_edificio(COALESCE(edificio_id, public.current_user_edificio_id(), public.default_edificio_id())));',
        'rls_' || v_tbl || '_insert', v_tbl
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_admin_or_superadmin() AND public.user_can_access_edificio(edificio_id)) WITH CHECK (public.is_admin_or_superadmin() AND public.user_can_access_edificio(edificio_id));',
        'rls_' || v_tbl || '_update', v_tbl
      );
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_admin_or_superadmin() AND public.user_can_access_edificio(edificio_id));',
        'rls_' || v_tbl || '_delete', v_tbl
      );
    END IF;
  END LOOP;

  -- 6) historial_auditoria
  IF to_regclass('public.historial_auditoria') IS NOT NULL THEN
    CREATE POLICY "rls_auditoria_select" ON public.historial_auditoria
      FOR SELECT TO authenticated
      USING (public.is_admin_or_superadmin() AND public.user_can_access_edificio(edificio_id));

    CREATE POLICY "rls_auditoria_insert" ON public.historial_auditoria
      FOR INSERT TO authenticated
      WITH CHECK (
        auth.uid() IS NOT NULL
        AND public.user_can_access_edificio(COALESCE(edificio_id, public.current_user_edificio_id(), public.default_edificio_id()))
      );
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
        USING (
          public.user_can_access_edificio(edificio_id)
          AND (apartamento_id = public.current_user_apartamento_id() OR public.is_admin_or_superadmin())
        );

      CREATE POLICY "rls_notificaciones_update" ON public.notificaciones
        FOR UPDATE TO authenticated
        USING (
          public.user_can_access_edificio(edificio_id)
          AND (apartamento_id = public.current_user_apartamento_id() OR public.is_admin_or_superadmin())
        )
        WITH CHECK (
          public.user_can_access_edificio(edificio_id)
          AND (apartamento_id = public.current_user_apartamento_id() OR public.is_admin_or_superadmin())
        );
    ELSE
      CREATE POLICY "rls_notificaciones_select" ON public.notificaciones
        FOR SELECT TO authenticated
        USING (public.is_admin_or_superadmin() AND public.user_can_access_edificio(edificio_id));

      CREATE POLICY "rls_notificaciones_update" ON public.notificaciones
        FOR UPDATE TO authenticated
        USING (public.is_admin_or_superadmin() AND public.user_can_access_edificio(edificio_id))
        WITH CHECK (public.is_admin_or_superadmin() AND public.user_can_access_edificio(edificio_id));
    END IF;

    CREATE POLICY "rls_notificaciones_insert" ON public.notificaciones
      FOR INSERT TO authenticated
      WITH CHECK (
        public.is_admin_or_superadmin()
        AND public.user_can_access_edificio(COALESCE(edificio_id, public.current_user_edificio_id(), public.default_edificio_id()))
      );

    CREATE POLICY "rls_notificaciones_delete" ON public.notificaciones
      FOR DELETE TO authenticated
      USING (public.is_admin_or_superadmin() AND public.user_can_access_edificio(edificio_id));
  END IF;

  -- 8) chat_mensajes
  IF to_regclass('public.chat_mensajes') IS NOT NULL THEN
    CREATE POLICY "rls_chat_select" ON public.chat_mensajes
      FOR SELECT TO authenticated
      USING (public.user_can_access_edificio(edificio_id));

    CREATE POLICY "rls_chat_insert" ON public.chat_mensajes
      FOR INSERT TO authenticated
      WITH CHECK (
        public.user_can_access_edificio(COALESCE(edificio_id, public.current_user_edificio_id(), public.default_edificio_id()))
        AND (autor_id = auth.uid() OR public.is_admin_or_superadmin())
      );

    CREATE POLICY "rls_chat_update" ON public.chat_mensajes
      FOR UPDATE TO authenticated
      USING (public.user_can_access_edificio(edificio_id) AND (autor_id = auth.uid() OR public.is_admin_or_superadmin()))
      WITH CHECK (public.user_can_access_edificio(edificio_id) AND (autor_id = auth.uid() OR public.is_admin_or_superadmin()));

    CREATE POLICY "rls_chat_delete" ON public.chat_mensajes
      FOR DELETE TO authenticated
      USING (public.user_can_access_edificio(edificio_id) AND (autor_id = auth.uid() OR public.is_admin_or_superadmin()));
  END IF;

  -- 9) falencias / incidencias
  FOREACH v_tbl IN ARRAY ARRAY['falencias', 'incidencias'] LOOP
    IF to_regclass('public.' || v_tbl) IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = v_tbl AND column_name = 'creado_por'
      ) INTO v_has_creado_por;

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.user_can_access_edificio(edificio_id));',
        'rls_' || v_tbl || '_select', v_tbl
      );

      IF v_has_creado_por THEN
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.user_can_access_edificio(COALESCE(edificio_id, public.current_user_edificio_id(), public.default_edificio_id())) AND (COALESCE(creado_por, auth.uid()) = auth.uid() OR public.is_admin_or_superadmin()));',
          'rls_' || v_tbl || '_insert', v_tbl
        );
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.user_can_access_edificio(edificio_id) AND (creado_por = auth.uid() OR public.is_admin_or_superadmin())) WITH CHECK (public.user_can_access_edificio(edificio_id) AND (creado_por = auth.uid() OR public.is_admin_or_superadmin()));',
          'rls_' || v_tbl || '_update', v_tbl
        );
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.user_can_access_edificio(edificio_id) AND (creado_por = auth.uid() OR public.is_admin_or_superadmin()));',
          'rls_' || v_tbl || '_delete', v_tbl
        );
      ELSE
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL AND public.user_can_access_edificio(COALESCE(edificio_id, public.current_user_edificio_id(), public.default_edificio_id())));',
          'rls_' || v_tbl || '_insert', v_tbl
        );
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_admin_or_superadmin() AND public.user_can_access_edificio(edificio_id)) WITH CHECK (public.is_admin_or_superadmin() AND public.user_can_access_edificio(edificio_id));',
          'rls_' || v_tbl || '_update', v_tbl
        );
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_admin_or_superadmin() AND public.user_can_access_edificio(edificio_id));',
          'rls_' || v_tbl || '_delete', v_tbl
        );
      END IF;
    END IF;
  END LOOP;

  -- 10) Tablas comunitarias de participación
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

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.user_can_access_edificio(edificio_id));',
        'rls_' || v_tbl || '_select', v_tbl
      );

      IF v_has_usuario_id THEN
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.user_can_access_edificio(COALESCE(edificio_id, public.current_user_edificio_id(), public.default_edificio_id())) AND (COALESCE(usuario_id, auth.uid()) = auth.uid() OR public.is_admin_or_superadmin()));',
          'rls_' || v_tbl || '_insert', v_tbl
        );
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.user_can_access_edificio(edificio_id) AND (usuario_id = auth.uid() OR public.is_admin_or_superadmin())) WITH CHECK (public.user_can_access_edificio(edificio_id) AND (usuario_id = auth.uid() OR public.is_admin_or_superadmin()));',
          'rls_' || v_tbl || '_update', v_tbl
        );
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.user_can_access_edificio(edificio_id) AND (usuario_id = auth.uid() OR public.is_admin_or_superadmin()));',
          'rls_' || v_tbl || '_delete', v_tbl
        );
      ELSIF v_has_autor_id THEN
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.user_can_access_edificio(COALESCE(edificio_id, public.current_user_edificio_id(), public.default_edificio_id())) AND (COALESCE(autor_id, auth.uid()) = auth.uid() OR public.is_admin_or_superadmin()));',
          'rls_' || v_tbl || '_insert', v_tbl
        );
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.user_can_access_edificio(edificio_id) AND (autor_id = auth.uid() OR public.is_admin_or_superadmin())) WITH CHECK (public.user_can_access_edificio(edificio_id) AND (autor_id = auth.uid() OR public.is_admin_or_superadmin()));',
          'rls_' || v_tbl || '_update', v_tbl
        );
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.user_can_access_edificio(edificio_id) AND (autor_id = auth.uid() OR public.is_admin_or_superadmin()));',
          'rls_' || v_tbl || '_delete', v_tbl
        );
      ELSE
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL AND public.user_can_access_edificio(COALESCE(edificio_id, public.current_user_edificio_id(), public.default_edificio_id())));',
          'rls_' || v_tbl || '_insert', v_tbl
        );
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_admin_or_superadmin() AND public.user_can_access_edificio(edificio_id)) WITH CHECK (public.is_admin_or_superadmin() AND public.user_can_access_edificio(edificio_id));',
          'rls_' || v_tbl || '_update', v_tbl
        );
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_admin_or_superadmin() AND public.user_can_access_edificio(edificio_id));',
          'rls_' || v_tbl || '_delete', v_tbl
        );
      END IF;
    END IF;
  END LOOP;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. RPCs MULTI-TENANT: reclamar_pago_para_revision, get_admin_dashboard_kpis,
--    get_resumen_mora_comunitario
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reclamar_pago_para_revision(
  p_pago_id UUID,
  p_nuevo_estado TEXT,
  p_notas_admin TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pago RECORD;
  v_updated JSONB;
  v_has_fecha_revision BOOLEAN;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_superadmin() THEN
    RAISE EXCEPTION 'Acceso denegado: requiere rol de administrador.';
  END IF;

  IF p_nuevo_estado NOT IN ('aprobado', 'rechazado') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Estado inválido. Solo se permite aprobado o rechazado.'
    );
  END IF;

  SELECT * INTO v_pago
  FROM public.pagos_reportados
  WHERE id = p_pago_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'El pago especificado no existe.'
    );
  END IF;

  IF auth.uid() IS NOT NULL AND NOT public.user_can_access_edificio(v_pago.edificio_id) THEN
    RAISE EXCEPTION 'Acceso denegado: este pago pertenece a otro edificio.';
  END IF;

  IF COALESCE(v_pago.estado, 'pendiente') <> 'pendiente' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'already_processed', true,
      'estado_actual', v_pago.estado,
      'error', 'Este pago ya fue procesado anteriormente.'
    );
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pagos_reportados'
      AND column_name = 'fecha_revision'
  ) INTO v_has_fecha_revision;

  IF v_has_fecha_revision THEN
    UPDATE public.pagos_reportados
    SET
      estado = p_nuevo_estado,
      notas_admin = COALESCE(p_notas_admin, notas_admin),
      fecha_revision = NOW(),
      updated_at = NOW()
    WHERE id = p_pago_id
      AND estado = 'pendiente';
  ELSE
    UPDATE public.pagos_reportados
    SET
      estado = p_nuevo_estado,
      notas_admin = COALESCE(p_notas_admin, notas_admin),
      updated_at = NOW()
    WHERE id = p_pago_id
      AND estado = 'pendiente';
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'already_processed', true,
      'error', 'Este pago fue procesado concurrentemente por otro administrador.'
    );
  END IF;

  SELECT to_jsonb(p) INTO v_updated
  FROM public.pagos_reportados p
  WHERE p.id = p_pago_id;

  RETURN jsonb_build_object(
    'ok', true,
    'pago', v_updated
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reclamar_pago_para_revision(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reclamar_pago_para_revision(UUID, TEXT, TEXT) TO authenticated, service_role;

-- Nota: mantenemos la firma de 1 argumento y añadimos sobrecarga opcional o reemplazamos solo si no colisiona.
DROP FUNCTION IF EXISTS public.get_admin_dashboard_kpis(TEXT);
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_kpis(
  p_mes TEXT DEFAULT NULL,
  p_edificio_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mes TEXT := NULLIF(SUBSTRING(COALESCE(p_mes, '') FROM 1 FOR 7), '');
  v_edif_id UUID := CASE
    WHEN public.is_superadmin() THEN COALESCE(p_edificio_id, public.current_user_edificio_id(), public.default_edificio_id())
    ELSE COALESCE(public.current_user_edificio_id(), public.default_edificio_id())
  END;
  v_pagos_pendientes INTEGER := 0;
  v_total_historico_bs NUMERIC(18, 2) := 0;
  v_total_historico_usd NUMERIC(18, 2) := 0;
  v_recaudado_mes_bs NUMERIC(18, 2) := 0;
  v_recaudado_mes_usd NUMERIC(18, 2) := 0;
  v_recibos_pagados_total INTEGER := 0;
  v_recibos_pagados_mes INTEGER := 0;
  v_meses_disponibles TEXT[] := ARRAY[]::TEXT[];
  v_meses_recibos_exactos TEXT[] := ARRAY[]::TEXT[];
  v_total_apartamentos INTEGER := 0;
  v_reportes_averias INTEGER := 0;
  v_votaciones_activas INTEGER := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_superadmin() THEN
    RAISE EXCEPTION 'Acceso denegado: requiere rol de administrador.';
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE estado = 'pendiente'),
    COALESCE(SUM(monto_bs) FILTER (WHERE estado = 'aprobado'), 0),
    COALESCE(SUM(monto_usd) FILTER (WHERE estado = 'aprobado'), 0),
    COALESCE(SUM(monto_bs) FILTER (
      WHERE estado = 'aprobado'
        AND (v_mes IS NULL OR SUBSTRING(COALESCE(fecha_pago::TEXT, created_at::TEXT) FROM 1 FOR 7) = v_mes)
    ), 0),
    COALESCE(SUM(monto_usd) FILTER (
      WHERE estado = 'aprobado'
        AND (v_mes IS NULL OR SUBSTRING(COALESCE(fecha_pago::TEXT, created_at::TEXT) FROM 1 FOR 7) = v_mes)
    ), 0)
  INTO
    v_pagos_pendientes,
    v_total_historico_bs,
    v_total_historico_usd,
    v_recaudado_mes_bs,
    v_recaudado_mes_usd
  FROM public.pagos_reportados
  WHERE v_edif_id IS NULL OR edificio_id IS NULL OR edificio_id = v_edif_id;

  SELECT
    COUNT(*) FILTER (WHERE estado = 'pagado'),
    COUNT(*) FILTER (
      WHERE estado = 'pagado'
        AND (v_mes IS NULL OR SUBSTRING(mes_facturado::TEXT FROM 1 FOR 7) = v_mes)
    ),
    COALESCE(
      ARRAY_AGG(DISTINCT SUBSTRING(mes_facturado::TEXT FROM 1 FOR 7) ORDER BY SUBSTRING(mes_facturado::TEXT FROM 1 FOR 7) DESC)
      FILTER (WHERE mes_facturado IS NOT NULL),
      ARRAY[]::TEXT[]
    ),
    COALESCE(
      ARRAY_AGG(DISTINCT mes_facturado::TEXT ORDER BY mes_facturado::TEXT DESC)
      FILTER (WHERE mes_facturado IS NOT NULL),
      ARRAY[]::TEXT[]
    )
  INTO
    v_recibos_pagados_total,
    v_recibos_pagados_mes,
    v_meses_disponibles,
    v_meses_recibos_exactos
  FROM public.recibos_generados
  WHERE v_edif_id IS NULL OR edificio_id IS NULL OR edificio_id = v_edif_id;

  SELECT COUNT(*) INTO v_total_apartamentos
  FROM public.apartamentos
  WHERE v_edif_id IS NULL OR edificio_id IS NULL OR edificio_id = v_edif_id;

  IF to_regclass('public.falencias') IS NOT NULL THEN
    SELECT COUNT(*) INTO v_reportes_averias
    FROM public.falencias
    WHERE v_edif_id IS NULL OR edificio_id IS NULL OR edificio_id = v_edif_id;
  END IF;

  IF to_regclass('public.propuestas') IS NOT NULL THEN
    SELECT COUNT(*) INTO v_votaciones_activas
    FROM public.propuestas
    WHERE estado = 'activa'
      AND (v_edif_id IS NULL OR edificio_id IS NULL OR edificio_id = v_edif_id);
  END IF;

  RETURN jsonb_build_object(
    'edificio_id', v_edif_id,
    'pagos_pendientes', v_pagos_pendientes,
    'total_historico_bs', v_total_historico_bs,
    'total_historico_usd', v_total_historico_usd,
    'recaudado_mes_bs', v_recaudado_mes_bs,
    'recaudado_mes_usd', v_recaudado_mes_usd,
    'recibos_pagados_total', v_recibos_pagados_total,
    'recibos_pagados_mes', v_recibos_pagados_mes,
    'meses_disponibles', to_jsonb(v_meses_disponibles),
    'meses_recibos_exactos', to_jsonb(v_meses_recibos_exactos),
    'total_apartamentos', v_total_apartamentos,
    'reportes_averias', v_reportes_averias,
    'votaciones_activas', v_votaciones_activas
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_dashboard_kpis(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_kpis(TEXT, UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_resumen_mora_comunitario()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_edif_id UUID := COALESCE(public.current_user_edificio_id(), public.default_edificio_id());
  v_aptos JSONB;
  v_deudas JSONB;
  v_recibos JSONB;
  v_configs JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticación requerida';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'numero', a.numero,
    'piso', a.piso,
    'propietario_nombre', a.propietario_nombre
  ) ORDER BY a.numero), '[]'::JSONB)
  INTO v_aptos
  FROM public.apartamentos a
  WHERE v_edif_id IS NULL OR a.edificio_id IS NULL OR a.edificio_id = v_edif_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', d.id,
    'apartamento_id', d.apartamento_id,
    'meses_deuda', d.meses_deuda,
    'monto_usd', d.monto_usd,
    'monto_bs', d.monto_bs,
    'moneda_principal', d.moneda_principal,
    'tasa_riesgo', d.tasa_riesgo,
    'accion_legal', d.accion_legal,
    'estado', d.estado,
    'conceptos_detalle', d.conceptos_detalle,
    'fecha_corte', d.fecha_corte,
    'created_at', d.created_at,
    'updated_at', d.updated_at
  )), '[]'::JSONB)
  INTO v_deudas
  FROM public.deudas_mora d
  JOIN public.apartamentos a ON a.id = d.apartamento_id
  WHERE v_edif_id IS NULL OR COALESCE(d.edificio_id, a.edificio_id) IS NULL OR COALESCE(d.edificio_id, a.edificio_id) = v_edif_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'apartamento_id', r.apartamento_id,
    'mes_facturado', r.mes_facturado,
    'total_usd', r.total_usd,
    'total_bs', r.total_bs,
    'estado', r.estado,
    'emitido_at', r.emitido_at
  ) ORDER BY r.mes_facturado ASC), '[]'::JSONB)
  INTO v_recibos
  FROM public.recibos_generados r
  JOIN public.apartamentos a ON a.id = r.apartamento_id
  WHERE r.estado = 'pendiente'
    AND (v_edif_id IS NULL OR COALESCE(r.edificio_id, a.edificio_id) IS NULL OR COALESCE(r.edificio_id, a.edificio_id) = v_edif_id);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'tipo', c.tipo,
    'descripcion', c.descripcion
  )), '[]'::JSONB)
  INTO v_configs
  FROM public.casos_comunidad c
  WHERE c.tipo LIKE 'config_calendario_mora%'
    AND (v_edif_id IS NULL OR c.edificio_id IS NULL OR c.edificio_id = v_edif_id);

  RETURN jsonb_build_object(
    'apartamentos', v_aptos,
    'deudas_mora', v_deudas,
    'recibos_pendientes', v_recibos,
    'configs_calendario', v_configs
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_resumen_mora_comunitario() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_resumen_mora_comunitario() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
