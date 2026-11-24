-- ==============================================================================
-- MIGRATION: 20261124000004_relational_gas_cuotas.sql
-- Bloque D — Sub-hito D1 (Fase 4):
--   1. Tablas relacionales para Cuotas Extraordinarias y Servicio de Gas Comunal:
--      - public.cuotas_extraordinarias
--      - public.cuotas_extraordinarias_asignaciones
--      - public.gas_campanas
--      - public.gas_asignaciones
--   2. Índices compuestos, RLS estricto y migración idempotente desde casos_comunidad
--      sin eliminar ni modificar las filas históricas de respaldo.
-- ==============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. TABLAS RELACIONALES
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cuotas_extraordinarias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edificio_id UUID REFERENCES public.configuracion_edificio(id) ON DELETE CASCADE,
  anio INTEGER NOT NULL DEFAULT 2026,
  columna_id TEXT NOT NULL,
  titulo TEXT NOT NULL,
  descripcion TEXT,
  moneda TEXT NOT NULL DEFAULT 'USD' CHECK (moneda IN ('USD', 'BS')),
  monto_defecto NUMERIC(14, 2) NOT NULL DEFAULT 0,
  fecha_emision DATE,
  fecha_limite DATE,
  seccion TEXT NOT NULL DEFAULT 'naranja' CHECK (seccion IN ('naranja', 'azul')),
  orden INTEGER NOT NULL DEFAULT 0,
  activa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (edificio_id, anio, columna_id)
);

CREATE TABLE IF NOT EXISTS public.cuotas_extraordinarias_asignaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edificio_id UUID REFERENCES public.configuracion_edificio(id) ON DELETE CASCADE,
  cuota_id UUID NOT NULL REFERENCES public.cuotas_extraordinarias(id) ON DELETE CASCADE,
  apartamento_id UUID NOT NULL REFERENCES public.apartamentos(id) ON DELETE CASCADE,
  monto_asignado NUMERIC(14, 2) NOT NULL DEFAULT 0,
  monto_abonado NUMERIC(14, 2) NOT NULL DEFAULT 0,
  moneda TEXT NOT NULL DEFAULT 'USD' CHECK (moneda IN ('USD', 'BS')),
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'pagado')),
  es_adelanto BOOLEAN NOT NULL DEFAULT false,
  pagos_aplicados_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  notas TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cuota_id, apartamento_id)
);

CREATE TABLE IF NOT EXISTS public.gas_campanas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edificio_id UUID REFERENCES public.configuracion_edificio(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL,
  titulo TEXT NOT NULL,
  mes TEXT NOT NULL,
  es_especial BOOLEAN NOT NULL DEFAULT false,
  moneda_principal TEXT NOT NULL DEFAULT 'BS' CHECK (moneda_principal IN ('BS', 'USD')),
  monto_por_apto_usd NUMERIC(14, 2) NOT NULL DEFAULT 0,
  monto_por_apto_bs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  fecha_inicio DATE,
  fecha_limite DATE,
  estado TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'cerrada', 'archivada')),
  meta_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (edificio_id, codigo)
);

CREATE TABLE IF NOT EXISTS public.gas_asignaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edificio_id UUID REFERENCES public.configuracion_edificio(id) ON DELETE CASCADE,
  campana_id UUID NOT NULL REFERENCES public.gas_campanas(id) ON DELETE CASCADE,
  apartamento_id UUID NOT NULL REFERENCES public.apartamentos(id) ON DELETE CASCADE,
  monto_usd NUMERIC(14, 2) NOT NULL DEFAULT 0,
  monto_bs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  monto_abonado_usd NUMERIC(14, 2) NOT NULL DEFAULT 0,
  monto_abonado_bs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_verificacion', 'pagado')),
  pago_reportado_id UUID,
  fecha_pago DATE,
  referencia TEXT,
  metodo_pago TEXT,
  pagos_aplicados_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  observaciones TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campana_id, apartamento_id)
);

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. ÍNDICES COMPUESTOS PARA CONSULTAS DE RESIDENTES Y ADMIN
-- ──────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_cuotas_ext_edif_anio
  ON public.cuotas_extraordinarias (edificio_id, anio);

CREATE INDEX IF NOT EXISTS idx_cuotas_asig_apto_estado
  ON public.cuotas_extraordinarias_asignaciones (apartamento_id, estado);

CREATE INDEX IF NOT EXISTS idx_cuotas_asig_edif_cuota
  ON public.cuotas_extraordinarias_asignaciones (edificio_id, cuota_id);

CREATE INDEX IF NOT EXISTS idx_gas_campanas_edif_estado_mes
  ON public.gas_campanas (edificio_id, estado, mes);

CREATE INDEX IF NOT EXISTS idx_gas_asig_apto_estado
  ON public.gas_asignaciones (apartamento_id, estado);

CREATE INDEX IF NOT EXISTS idx_gas_asig_edif_campana
  ON public.gas_asignaciones (edificio_id, campana_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. RLS ESTRICTO Y PERMISOS DE ROL
-- ──────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_tbl TEXT;
  v_pol RECORD;
BEGIN
  FOREACH v_tbl IN ARRAY ARRAY[
    'cuotas_extraordinarias',
    'cuotas_extraordinarias_asignaciones',
    'gas_campanas',
    'gas_asignaciones'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', v_tbl);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon;', v_tbl);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated, service_role;', v_tbl);

    FOR v_pol IN
      SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = v_tbl
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', v_pol.policyname, v_tbl);
    END LOOP;
  END LOOP;
END $$;

-- cuotas_extraordinarias: lectura para autenticados, escritura solo admin
CREATE POLICY "rls_cuotas_extraordinarias_select"
  ON public.cuotas_extraordinarias
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "rls_cuotas_extraordinarias_insert"
  ON public.cuotas_extraordinarias
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_superadmin());

CREATE POLICY "rls_cuotas_extraordinarias_update"
  ON public.cuotas_extraordinarias
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_superadmin())
  WITH CHECK (public.is_admin_or_superadmin());

CREATE POLICY "rls_cuotas_extraordinarias_delete"
  ON public.cuotas_extraordinarias
  FOR DELETE TO authenticated
  USING (public.is_admin_or_superadmin());

-- cuotas_extraordinarias_asignaciones: lectura propia o admin; escritura solo admin
CREATE POLICY "rls_cuotas_ext_asig_select"
  ON public.cuotas_extraordinarias_asignaciones
  FOR SELECT TO authenticated
  USING (
    apartamento_id = public.current_user_apartamento_id()
    OR public.is_admin_or_superadmin()
  );

CREATE POLICY "rls_cuotas_ext_asig_insert"
  ON public.cuotas_extraordinarias_asignaciones
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_superadmin());

CREATE POLICY "rls_cuotas_ext_asig_update"
  ON public.cuotas_extraordinarias_asignaciones
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_superadmin())
  WITH CHECK (public.is_admin_or_superadmin());

CREATE POLICY "rls_cuotas_ext_asig_delete"
  ON public.cuotas_extraordinarias_asignaciones
  FOR DELETE TO authenticated
  USING (public.is_admin_or_superadmin());

-- gas_campanas: lectura autenticada; escritura solo admin
CREATE POLICY "rls_gas_campanas_select"
  ON public.gas_campanas
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "rls_gas_campanas_insert"
  ON public.gas_campanas
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_superadmin());

CREATE POLICY "rls_gas_campanas_update"
  ON public.gas_campanas
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_superadmin())
  WITH CHECK (public.is_admin_or_superadmin());

CREATE POLICY "rls_gas_campanas_delete"
  ON public.gas_campanas
  FOR DELETE TO authenticated
  USING (public.is_admin_or_superadmin());

-- gas_asignaciones: lectura propia o admin; residente solo puede reportar a 'en_verificacion'
CREATE POLICY "rls_gas_asignaciones_select"
  ON public.gas_asignaciones
  FOR SELECT TO authenticated
  USING (
    apartamento_id = public.current_user_apartamento_id()
    OR public.is_admin_or_superadmin()
  );

CREATE POLICY "rls_gas_asignaciones_insert"
  ON public.gas_asignaciones
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_or_superadmin()
    OR (
      apartamento_id = public.current_user_apartamento_id()
      AND estado = 'en_verificacion'
    )
  );

CREATE POLICY "rls_gas_asignaciones_update"
  ON public.gas_asignaciones
  FOR UPDATE TO authenticated
  USING (
    apartamento_id = public.current_user_apartamento_id()
    OR public.is_admin_or_superadmin()
  )
  WITH CHECK (
    public.is_admin_or_superadmin()
    OR (
      apartamento_id = public.current_user_apartamento_id()
      AND estado = 'en_verificacion'
    )
  );

CREATE POLICY "rls_gas_asignaciones_delete"
  ON public.gas_asignaciones
  FOR DELETE TO authenticated
  USING (public.is_admin_or_superadmin());

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. MIGRACIÓN IDEMPOTENTE DESDE casos_comunidad (SIN BORRAR RESPALDO LEGACY)
-- ──────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_default_edif UUID;
  v_row RECORD;
  v_cfg JSONB;
  v_anio INTEGER;
  v_col JSONB;
  v_col_id TEXT;
  v_cuota_uuid UUID;
  v_apto_key TEXT;
  v_apto_uuid UUID;
  v_cell JSONB;
  v_fecha_em DATE;
  v_fecha_lim DATE;
  v_moneda TEXT;
  v_estado TEXT;
  v_jornada_meta JSONB;
  v_campana_id UUID;
  v_pago_meta JSONB;
  v_pago_jid TEXT;
  v_pago_reportado UUID;
  v_edif_apto UUID;
BEGIN
  SELECT id INTO v_default_edif
  FROM public.configuracion_edificio
  ORDER BY created_at ASC NULLS LAST
  LIMIT 1;

  IF v_default_edif IS NULL THEN
    RETURN;
  END IF;

  -- A) Migrar configuraciones de cuotas extraordinarias desde config_calendario_mora*
  FOR v_row IN
    SELECT id, tipo, descripcion
    FROM public.casos_comunidad
    WHERE tipo LIKE 'config_calendario_mora%'
      AND descripcion IS NOT NULL
  LOOP
    BEGIN
      v_cfg := v_row.descripcion::JSONB;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;

    IF v_row.tipo = 'config_calendario_mora' THEN
      v_anio := 2026;
    ELSE
      BEGIN
        v_anio := COALESCE(NULLIF(SUBSTRING(v_row.tipo FROM 'config_calendario_mora_(\d{4})'), '')::INTEGER, 2026);
      EXCEPTION WHEN OTHERS THEN
        v_anio := 2026;
      END;
    END IF;

    IF jsonb_typeof(v_cfg -> 'columnas') = 'array' THEN
      FOR v_col IN SELECT value FROM jsonb_array_elements(v_cfg -> 'columnas') LOOP
        v_col_id := COALESCE(v_col ->> 'id', '');
        IF v_col_id = '' THEN CONTINUE; END IF;

        -- Migrar columnas personalizadas o cuotas extraordinarias configuradas
        IF COALESCE((v_col ->> 'esPersonalizada')::BOOLEAN, false)
           OR COALESCE(v_col ->> 'tipo', '') = 'cuota_especial' THEN
          BEGIN
            v_fecha_em := NULLIF(SUBSTRING(COALESCE(v_col ->> 'fechaEmision', '') FROM 1 FOR 10), '')::DATE;
          EXCEPTION WHEN OTHERS THEN
            v_fecha_em := NULL;
          END;
          BEGIN
            v_fecha_lim := NULLIF(SUBSTRING(COALESCE(v_col ->> 'fechaLimite', '') FROM 1 FOR 10), '')::DATE;
          EXCEPTION WHEN OTHERS THEN
            v_fecha_lim := NULL;
          END;

          v_moneda := CASE WHEN UPPER(COALESCE(v_col ->> 'moneda', 'USD')) = 'BS' THEN 'BS' ELSE 'USD' END;

          INSERT INTO public.cuotas_extraordinarias (
            edificio_id, anio, columna_id, titulo, descripcion, moneda,
            monto_defecto, fecha_emision, fecha_limite, seccion, orden, activa
          )
          VALUES (
            v_default_edif,
            v_anio,
            v_col_id,
            COALESCE(NULLIF(v_col ->> 'titulo', ''), 'Cuota Extraordinaria'),
            v_col ->> 'descripcion',
            v_moneda,
            COALESCE((v_col ->> 'montoDefecto')::NUMERIC, 0),
            v_fecha_em,
            v_fecha_lim,
            CASE WHEN COALESCE(v_col ->> 'seccion', 'naranja') = 'azul' THEN 'azul' ELSE 'naranja' END,
            COALESCE((v_col ->> 'orden')::INTEGER, 0),
            true
          )
          ON CONFLICT (edificio_id, anio, columna_id) DO NOTHING;

          SELECT ce.id INTO v_cuota_uuid
          FROM public.cuotas_extraordinarias ce
          WHERE ce.edificio_id = v_default_edif
            AND ce.anio = v_anio
            AND ce.columna_id = v_col_id
          LIMIT 1;

          IF v_cuota_uuid IS NOT NULL AND jsonb_typeof(v_cfg -> 'valoresCeldasPersonalizadas') = 'object' THEN
            FOR v_apto_key, v_cell IN
              SELECT key, value -> v_col_id
              FROM jsonb_each(v_cfg -> 'valoresCeldasPersonalizadas')
              WHERE jsonb_typeof(value) = 'object' AND (value ? v_col_id)
            LOOP
              BEGIN
                v_apto_uuid := v_apto_key::UUID;
              EXCEPTION WHEN OTHERS THEN
                CONTINUE;
              END;

              SELECT a.edificio_id INTO v_edif_apto
              FROM public.apartamentos a
              WHERE a.id = v_apto_uuid;

              IF NOT FOUND THEN CONTINUE; END IF;

              v_estado := CASE WHEN (v_cell ->> 'estado') = 'pagado' THEN 'pagado' ELSE 'pendiente' END;

              INSERT INTO public.cuotas_extraordinarias_asignaciones (
                edificio_id, cuota_id, apartamento_id, monto_asignado, monto_abonado,
                moneda, estado, es_adelanto, pagos_aplicados_ids
              )
              VALUES (
                COALESCE(v_edif_apto, v_default_edif),
                v_cuota_uuid,
                v_apto_uuid,
                COALESCE((v_cell ->> 'monto')::NUMERIC, 0),
                COALESCE((v_cell ->> 'abonado')::NUMERIC, 0),
                CASE WHEN UPPER(COALESCE(v_cell ->> 'moneda', v_moneda)) = 'BS' THEN 'BS' ELSE 'USD' END,
                v_estado,
                COALESCE((v_cell ->> 'pagadoPorAdelantado')::BOOLEAN, false),
                CASE WHEN jsonb_typeof(v_cell -> 'pagosAplicadosIds') = 'array' THEN v_cell -> 'pagosAplicadosIds' ELSE '[]'::jsonb END
              )
              ON CONFLICT (cuota_id, apartamento_id) DO NOTHING;
            END LOOP;
          END IF;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  -- B) Migrar campañas de gas desde gas_jornada
  FOR v_row IN
    SELECT id, titulo, descripcion, monto_usd, monto_bs, moneda, estado, fecha, fecha_vencimiento
    FROM public.casos_comunidad
    WHERE tipo = 'gas_jornada'
  LOOP
    BEGIN
      v_jornada_meta := COALESCE(NULLIF(v_row.descripcion, ''), '{}')::JSONB;
    EXCEPTION WHEN OTHERS THEN
      v_jornada_meta := '{}'::JSONB;
    END;

    BEGIN
      v_fecha_em := COALESCE(v_row.fecha, NULLIF(SUBSTRING(COALESCE(v_jornada_meta ->> 'fechaInicio', '') FROM 1 FOR 10), '')::DATE);
    EXCEPTION WHEN OTHERS THEN
      v_fecha_em := NULL;
    END;
    BEGIN
      v_fecha_lim := COALESCE(v_row.fecha_vencimiento, NULLIF(SUBSTRING(COALESCE(v_jornada_meta ->> 'fechaLimite', '') FROM 1 FOR 10), '')::DATE);
    EXCEPTION WHEN OTHERS THEN
      v_fecha_lim := NULL;
    END;

    INSERT INTO public.gas_campanas (
      id, edificio_id, codigo, titulo, mes, es_especial, moneda_principal,
      monto_por_apto_usd, monto_por_apto_bs, fecha_inicio, fecha_limite, estado, meta_json
    )
    VALUES (
      v_row.id,
      v_default_edif,
      v_row.id::TEXT,
      COALESCE(NULLIF(v_row.titulo, ''), v_jornada_meta ->> 'titulo', 'Recaudación de Gas'),
      COALESCE(NULLIF(v_jornada_meta ->> 'mes', ''), TO_CHAR(COALESCE(v_fecha_em, CURRENT_DATE), 'YYYY-MM')),
      COALESCE((v_jornada_meta ->> 'esEspecial')::BOOLEAN, false),
      CASE WHEN UPPER(COALESCE(v_row.moneda, v_jornada_meta ->> 'monedaPrincipal', 'BS')) = 'USD' THEN 'USD' ELSE 'BS' END,
      COALESCE(v_row.monto_usd, (v_jornada_meta ->> 'costoPorAptoUsd')::NUMERIC, 0),
      COALESCE(v_row.monto_bs, (v_jornada_meta ->> 'costoPorAptoBs')::NUMERIC, 0),
      v_fecha_em,
      v_fecha_lim,
      CASE
        WHEN v_row.estado IN ('activa', 'cerrada', 'archivada') THEN v_row.estado
        ELSE 'activa'
      END,
      v_jornada_meta
    )
    ON CONFLICT (edificio_id, codigo) DO NOTHING;
  END LOOP;

  -- C) Migrar pagos de gas desde gas_pago
  FOR v_row IN
    SELECT id, apartamento_id, descripcion, monto_usd, monto_bs, moneda, estado, fecha
    FROM public.casos_comunidad
    WHERE tipo = 'gas_pago'
  LOOP
    BEGIN
      v_pago_meta := COALESCE(NULLIF(v_row.descripcion, ''), '{}')::JSONB;
    EXCEPTION WHEN OTHERS THEN
      v_pago_meta := '{}'::JSONB;
    END;

    v_pago_jid := COALESCE(v_pago_meta ->> 'jornadaId', '');
    v_campana_id := NULL;
    IF v_pago_jid <> '' THEN
      BEGIN
        SELECT gc.id INTO v_campana_id
        FROM public.gas_campanas gc
        WHERE gc.id = v_pago_jid::UUID OR gc.codigo = v_pago_jid
        LIMIT 1;
      EXCEPTION WHEN OTHERS THEN
        SELECT gc.id INTO v_campana_id
        FROM public.gas_campanas gc
        WHERE gc.codigo = v_pago_jid
        LIMIT 1;
      END;
    END IF;

    IF v_campana_id IS NULL THEN
      SELECT gc.id INTO v_campana_id
      FROM public.gas_campanas gc
      WHERE gc.estado = 'activa'
      ORDER BY gc.created_at DESC
      LIMIT 1;
    END IF;

    v_apto_uuid := v_row.apartamento_id;
    IF v_apto_uuid IS NULL AND COALESCE(v_pago_meta ->> 'apartamentoId', '') <> '' THEN
      BEGIN
        v_apto_uuid := (v_pago_meta ->> 'apartamentoId')::UUID;
      EXCEPTION WHEN OTHERS THEN
        v_apto_uuid := NULL;
      END;
    END IF;

    IF v_campana_id IS NULL OR v_apto_uuid IS NULL THEN CONTINUE; END IF;

    SELECT a.edificio_id INTO v_edif_apto
    FROM public.apartamentos a
    WHERE a.id = v_apto_uuid;
    IF NOT FOUND THEN CONTINUE; END IF;

    BEGIN
      v_pago_reportado := NULLIF(v_pago_meta ->> 'pagoReportadoId', '')::UUID;
    EXCEPTION WHEN OTHERS THEN
      v_pago_reportado := NULL;
    END;

    BEGIN
      v_fecha_em := COALESCE(v_row.fecha, NULLIF(SUBSTRING(COALESCE(v_pago_meta ->> 'fechaPago', '') FROM 1 FOR 10), '')::DATE);
    EXCEPTION WHEN OTHERS THEN
      v_fecha_em := NULL;
    END;

    INSERT INTO public.gas_asignaciones (
      edificio_id, campana_id, apartamento_id, monto_usd, monto_bs,
      monto_abonado_usd, monto_abonado_bs, estado, pago_reportado_id,
      fecha_pago, referencia, metodo_pago, pagos_aplicados_ids, observaciones
    )
    VALUES (
      COALESCE(v_edif_apto, v_default_edif),
      v_campana_id,
      v_apto_uuid,
      COALESCE(v_row.monto_usd, (v_pago_meta ->> 'montoUsd')::NUMERIC, 0),
      COALESCE(v_row.monto_bs, (v_pago_meta ->> 'montoBs')::NUMERIC, 0),
      COALESCE((v_pago_meta ->> 'abonoUsd')::NUMERIC, 0),
      COALESCE((v_pago_meta ->> 'abonoBs')::NUMERIC, 0),
      CASE
        WHEN v_row.estado IN ('pagado', 'en_verificacion', 'pendiente') THEN v_row.estado
        WHEN (v_pago_meta ->> 'estado') IN ('pagado', 'en_verificacion', 'pendiente') THEN v_pago_meta ->> 'estado'
        ELSE 'pendiente'
      END,
      v_pago_reportado,
      v_fecha_em,
      v_pago_meta ->> 'referencia',
      v_pago_meta ->> 'metodoPago',
      CASE WHEN jsonb_typeof(v_pago_meta -> 'pagosAplicadosIds') = 'array' THEN v_pago_meta -> 'pagosAplicadosIds' ELSE '[]'::jsonb END,
      v_pago_meta ->> 'observaciones'
    )
    ON CONFLICT (campana_id, apartamento_id) DO NOTHING;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
