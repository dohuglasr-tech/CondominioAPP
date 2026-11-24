-- ==============================================================================
-- MIGRATION: 20261124000003_financial_integrity_rpcs.sql
-- Bloque B (Fase 2):
--   1. Reclamo atómico de pagos para revisión (anti-doble aprobación FOR UPDATE)
--   2. KPIs administrativos agregados en servidor (inmune al límite de 1,000 filas)
-- ==============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. RPC: reclamar_pago_para_revision
--    Bloquea la fila en pagos_reportados con FOR UPDATE y garantiza que solo
--    pueda transicionar una única vez desde 'pendiente' hacia 'aprobado'/'rechazado'.
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

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. RPC: get_admin_dashboard_kpis
--    Calcula totales y meses en PostgreSQL sin el límite de 1,000 filas de PostgREST.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_kpis(
  p_mes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mes TEXT := NULLIF(SUBSTRING(COALESCE(p_mes, '') FROM 1 FOR 7), '');
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
  FROM public.pagos_reportados;

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
  FROM public.recibos_generados;

  SELECT COUNT(*) INTO v_total_apartamentos FROM public.apartamentos;

  IF to_regclass('public.falencias') IS NOT NULL THEN
    SELECT COUNT(*) INTO v_reportes_averias FROM public.falencias;
  END IF;

  IF to_regclass('public.propuestas') IS NOT NULL THEN
    SELECT COUNT(*) INTO v_votaciones_activas FROM public.propuestas WHERE estado = 'activa';
  END IF;

  RETURN jsonb_build_object(
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

REVOKE ALL ON FUNCTION public.get_admin_dashboard_kpis(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_kpis(TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
