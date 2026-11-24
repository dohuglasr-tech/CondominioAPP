-- ==============================================================================
-- MIGRATION: 20261124000007_fondo_reserva_module.sql
-- Módulo Integral de Fondo de Reserva (Multimoneda, Ubicaciones y Auditoría):
--   1. public.fondo_reserva_ubicaciones (cuentas/cajas por moneda y edificio)
--   2. public.fondo_reserva_movimientos (historial de aportes, ajustes, egresos)
--   3. Bandera idempotente en public.recibos_generados (fondo_reserva_acreditado)
--   4. RLS estricto multi-tenant + REVOKE anon
--   5. RPCs atómicos: acreditar_fondo_reserva_recibo,
--      definir_ubicacion_default_fondo_reserva, ajustar_fondo_reserva_ubicacion,
--      convertir_divisa_fondo_reserva y get_fondo_reserva_portal_residente
-- ==============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. TABLAS RELACIONALES
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.fondo_reserva_ubicaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edificio_id UUID REFERENCES public.configuracion_edificio(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'banco' CHECK (tipo IN ('banco', 'efectivo', 'digital', 'otro')),
  moneda TEXT NOT NULL CHECK (moneda IN ('USD', 'BS')),
  saldo NUMERIC(14, 2) NOT NULL DEFAULT 0,
  es_destino_default BOOLEAN NOT NULL DEFAULT false,
  descripcion TEXT,
  activa BOOLEAN NOT NULL DEFAULT true,
  orden INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.fondo_reserva_movimientos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edificio_id UUID REFERENCES public.configuracion_edificio(id) ON DELETE CASCADE,
  ubicacion_id UUID NOT NULL REFERENCES public.fondo_reserva_ubicaciones(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('aporte_cuota', 'ajuste_manual', 'egreso', 'transferencia_divisa', 'saldo_inicial')),
  moneda TEXT NOT NULL CHECK (moneda IN ('USD', 'BS')),
  monto NUMERIC(14, 2) NOT NULL,
  saldo_anterior NUMERIC(14, 2) NOT NULL DEFAULT 0,
  saldo_nuevo NUMERIC(14, 2) NOT NULL DEFAULT 0,
  recibo_id UUID NULL REFERENCES public.recibos_generados(id) ON DELETE SET NULL,
  apartamento_id UUID NULL REFERENCES public.apartamentos(id) ON DELETE SET NULL,
  apartamento_numero TEXT NULL,
  mes_facturado DATE NULL,
  pago_reportado_id UUID NULL,
  referencia TEXT NULL,
  descripcion TEXT NOT NULL,
  autor_nombre TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Columnas de control idempotente en recibos_generados
ALTER TABLE public.recibos_generados
  ADD COLUMN IF NOT EXISTS fondo_reserva_acreditado BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fondo_reserva_acreditado_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS fondo_reserva_acreditado_moneda TEXT NULL,
  ADD COLUMN IF NOT EXISTS fondo_reserva_ubicacion_id UUID NULL;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. ÍNDICES Y UNICIDAD
-- ──────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_fr_ubicaciones_edificio
  ON public.fondo_reserva_ubicaciones (edificio_id, activa, moneda, orden);

-- Garantiza a lo sumo una ubicación destino por defecto activa por moneda/edificio
CREATE UNIQUE INDEX IF NOT EXISTS uq_fr_ubicaciones_default_moneda
  ON public.fondo_reserva_ubicaciones (edificio_id, moneda)
  WHERE es_destino_default = true AND activa = true;

CREATE INDEX IF NOT EXISTS idx_fr_movimientos_edificio_fecha
  ON public.fondo_reserva_movimientos (edificio_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fr_movimientos_ubicacion
  ON public.fondo_reserva_movimientos (ubicacion_id, created_at DESC);

-- Garantía estructural anti-duplicación: un recibo ordinario solo aporta una vez
CREATE UNIQUE INDEX IF NOT EXISTS uq_fr_movimientos_recibo_aporte
  ON public.fondo_reserva_movimientos (recibo_id)
  WHERE recibo_id IS NOT NULL AND tipo = 'aporte_cuota';

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. TRIGGERS DE TENANT (edificio_id) Y SEED INICIAL IDEMPOTENTE
-- ──────────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_set_edificio_id_fondo_reserva_ubicaciones ON public.fondo_reserva_ubicaciones;
CREATE TRIGGER trg_set_edificio_id_fondo_reserva_ubicaciones
  BEFORE INSERT ON public.fondo_reserva_ubicaciones
  FOR EACH ROW EXECUTE FUNCTION public.asignar_edificio_id_por_defecto();

DROP TRIGGER IF EXISTS trg_set_edificio_id_fondo_reserva_movimientos ON public.fondo_reserva_movimientos;
CREATE TRIGGER trg_set_edificio_id_fondo_reserva_movimientos
  BEFORE INSERT ON public.fondo_reserva_movimientos
  FOR EACH ROW EXECUTE FUNCTION public.asignar_edificio_id_por_defecto();

-- Semilla segura por edificio existente (solo si aún no tiene ubicaciones)
DO $$
DECLARE
  v_edif RECORD;
BEGIN
  FOR v_edif IN SELECT id FROM public.configuracion_edificio LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.fondo_reserva_ubicaciones u WHERE u.edificio_id = v_edif.id
    ) THEN
      INSERT INTO public.fondo_reserva_ubicaciones (
        edificio_id, nombre, tipo, moneda, saldo, es_destino_default, descripcion, orden
      ) VALUES
        (v_edif.id, 'Caja / Fondo Principal USD', 'efectivo', 'USD', 0.00, true, 'Ubicación principal para resguardo y aportes en dólares', 1),
        (v_edif.id, 'Cuenta Bancaria Principal Bs.', 'banco', 'BS', 0.00, true, 'Cuenta bancaria receptora de aportes mensuales en bolívares', 2);
    END IF;
  END LOOP;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. SEGURIDAD RLS MULTI-TENANT Y REVOKE ANON
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.fondo_reserva_ubicaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fondo_reserva_movimientos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.fondo_reserva_ubicaciones FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.fondo_reserva_movimientos FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.fondo_reserva_ubicaciones TO authenticated;
GRANT SELECT, INSERT ON TABLE public.fondo_reserva_movimientos TO authenticated;

DROP POLICY IF EXISTS "rls_fr_ubicaciones_select" ON public.fondo_reserva_ubicaciones;
CREATE POLICY "rls_fr_ubicaciones_select" ON public.fondo_reserva_ubicaciones
  FOR SELECT TO authenticated
  USING (public.user_can_access_edificio(edificio_id));

DROP POLICY IF EXISTS "rls_fr_ubicaciones_admin_all" ON public.fondo_reserva_ubicaciones;
CREATE POLICY "rls_fr_ubicaciones_admin_all" ON public.fondo_reserva_ubicaciones
  FOR ALL TO authenticated
  USING (public.is_admin_or_superadmin() AND public.user_can_access_edificio(edificio_id))
  WITH CHECK (public.is_admin_or_superadmin() AND public.user_can_access_edificio(edificio_id));

-- Los movimientos completos son visibles solo para administradores del edificio;
-- los residentes leen movimientos sanitizados vía get_fondo_reserva_portal_residente()
DROP POLICY IF EXISTS "rls_fr_movimientos_admin_select" ON public.fondo_reserva_movimientos;
CREATE POLICY "rls_fr_movimientos_admin_select" ON public.fondo_reserva_movimientos
  FOR SELECT TO authenticated
  USING (public.is_admin_or_superadmin() AND public.user_can_access_edificio(edificio_id));

DROP POLICY IF EXISTS "rls_fr_movimientos_admin_insert" ON public.fondo_reserva_movimientos;
CREATE POLICY "rls_fr_movimientos_admin_insert" ON public.fondo_reserva_movimientos
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_superadmin() AND public.user_can_access_edificio(edificio_id));

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. RPCs ATÓMICOS DE NEGOCIO
-- ──────────────────────────────────────────────────────────────────────────────

-- A. Definir ubicación destino por defecto (exclusiva por moneda/edificio)
CREATE OR REPLACE FUNCTION public.definir_ubicacion_default_fondo_reserva(
  p_ubicacion_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ub RECORD;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_superadmin() THEN
    RAISE EXCEPTION 'Acceso denegado: requiere rol de administrador.';
  END IF;

  SELECT * INTO v_ub
  FROM public.fondo_reserva_ubicaciones
  WHERE id = p_ubicacion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Ubicación no encontrada.');
  END IF;

  IF auth.uid() IS NOT NULL AND NOT public.user_can_access_edificio(v_ub.edificio_id) THEN
    RAISE EXCEPTION 'Acceso denegado: ubicación pertenece a otro edificio.';
  END IF;

  UPDATE public.fondo_reserva_ubicaciones
  SET es_destino_default = false, updated_at = NOW()
  WHERE edificio_id IS NOT DISTINCT FROM v_ub.edificio_id
    AND moneda = v_ub.moneda
    AND id <> p_ubicacion_id
    AND es_destino_default = true;

  UPDATE public.fondo_reserva_ubicaciones
  SET es_destino_default = true, activa = true, updated_at = NOW()
  WHERE id = p_ubicacion_id;

  RETURN jsonb_build_object('ok', true, 'ubicacion_id', p_ubicacion_id, 'moneda', v_ub.moneda);
END;
$$;

-- B. Ajuste manual directo de saldo (cargar saldo inicial, corrección o egreso)
CREATE OR REPLACE FUNCTION public.ajustar_fondo_reserva_ubicacion(
  p_ubicacion_id UUID,
  p_nuevo_saldo NUMERIC,
  p_tipo TEXT DEFAULT 'ajuste_manual',
  p_descripcion TEXT DEFAULT NULL,
  p_autor_nombre TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ub RECORD;
  v_tipo_clean TEXT;
  v_delta NUMERIC(14, 2);
  v_nuevo NUMERIC(14, 2);
  v_desc TEXT;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_superadmin() THEN
    RAISE EXCEPTION 'Acceso denegado: requiere rol de administrador.';
  END IF;

  IF p_nuevo_saldo IS NULL OR p_nuevo_saldo < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El saldo no puede ser negativo.');
  END IF;

  SELECT * INTO v_ub
  FROM public.fondo_reserva_ubicaciones
  WHERE id = p_ubicacion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Ubicación no encontrada.');
  END IF;

  IF auth.uid() IS NOT NULL AND NOT public.user_can_access_edificio(v_ub.edificio_id) THEN
    RAISE EXCEPTION 'Acceso denegado: ubicación pertenece a otro edificio.';
  END IF;

  v_nuevo := ROUND(p_nuevo_saldo, 2);
  v_delta := ROUND(v_nuevo - COALESCE(v_ub.saldo, 0), 2);
  v_tipo_clean := CASE
    WHEN p_tipo IN ('ajuste_manual', 'egreso', 'saldo_inicial') THEN p_tipo
    WHEN v_delta < 0 THEN 'egreso'
    ELSE 'ajuste_manual'
  END;

  v_desc := COALESCE(
    NULLIF(TRIM(p_descripcion), ''),
    CASE
      WHEN v_tipo_clean = 'saldo_inicial' THEN 'Carga manual de saldo en ubicación'
      WHEN v_tipo_clean = 'egreso' THEN 'Egreso / uso autorizado del Fondo de Reserva'
      ELSE 'Ajuste manual directo de saldo por administración'
    END
  );

  UPDATE public.fondo_reserva_ubicaciones
  SET saldo = v_nuevo, updated_at = NOW()
  WHERE id = p_ubicacion_id;

  IF v_delta <> 0 THEN
    INSERT INTO public.fondo_reserva_movimientos (
      edificio_id, ubicacion_id, tipo, moneda, monto, saldo_anterior, saldo_nuevo,
      descripcion, autor_nombre
    ) VALUES (
      v_ub.edificio_id, p_ubicacion_id, v_tipo_clean, v_ub.moneda, v_delta,
      COALESCE(v_ub.saldo, 0), v_nuevo, v_desc, COALESCE(NULLIF(TRIM(p_autor_nombre), ''), 'Administrador')
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'ubicacion_id', p_ubicacion_id,
    'saldo_anterior', COALESCE(v_ub.saldo, 0),
    'saldo_nuevo', v_nuevo,
    'delta', v_delta
  );
END;
$$;

-- C. Conversión / cambio de divisa atómico entre dos ubicaciones (sin alterar deudas)
CREATE OR REPLACE FUNCTION public.convertir_divisa_fondo_reserva(
  p_origen_id UUID,
  p_destino_id UUID,
  p_monto_origen NUMERIC,
  p_monto_destino NUMERIC,
  p_descripcion TEXT DEFAULT NULL,
  p_autor_nombre TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orig RECORD;
  v_dest RECORD;
  v_m_orig NUMERIC(14, 2);
  v_m_dest NUMERIC(14, 2);
  v_desc TEXT;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_superadmin() THEN
    RAISE EXCEPTION 'Acceso denegado: requiere rol de administrador.';
  END IF;

  IF p_origen_id = p_destino_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Las ubicaciones origen y destino deben ser distintas.');
  END IF;

  v_m_orig := ROUND(COALESCE(p_monto_origen, 0), 2);
  v_m_dest := ROUND(COALESCE(p_monto_destino, 0), 2);
  IF v_m_orig <= 0 OR v_m_dest <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Los montos deben ser mayores a cero.');
  END IF;

  SELECT * INTO v_orig FROM public.fondo_reserva_ubicaciones WHERE id = p_origen_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Ubicación de origen no encontrada.');
  END IF;

  SELECT * INTO v_dest FROM public.fondo_reserva_ubicaciones WHERE id = p_destino_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Ubicación de destino no encontrada.');
  END IF;

  IF auth.uid() IS NOT NULL AND (
    NOT public.user_can_access_edificio(v_orig.edificio_id)
    OR NOT public.user_can_access_edificio(v_dest.edificio_id)
  ) THEN
    RAISE EXCEPTION 'Acceso denegado: ubicación pertenece a otro edificio.';
  END IF;

  IF COALESCE(v_orig.saldo, 0) < v_m_orig THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Saldo insuficiente en la ubicación de origen.');
  END IF;

  v_desc := COALESCE(
    NULLIF(TRIM(p_descripcion), ''),
    format('Cambio / traslado entre %s (%s) y %s (%s)', v_orig.nombre, v_orig.moneda, v_dest.nombre, v_dest.moneda)
  );

  UPDATE public.fondo_reserva_ubicaciones
  SET saldo = ROUND(saldo - v_m_orig, 2), updated_at = NOW()
  WHERE id = p_origen_id;

  UPDATE public.fondo_reserva_ubicaciones
  SET saldo = ROUND(saldo + v_m_dest, 2), updated_at = NOW()
  WHERE id = p_destino_id;

  INSERT INTO public.fondo_reserva_movimientos (
    edificio_id, ubicacion_id, tipo, moneda, monto, saldo_anterior, saldo_nuevo, descripcion, autor_nombre
  ) VALUES
  (
    v_orig.edificio_id, p_origen_id, 'transferencia_divisa', v_orig.moneda, -v_m_orig,
    v_orig.saldo, ROUND(v_orig.saldo - v_m_orig, 2), v_desc, COALESCE(NULLIF(TRIM(p_autor_nombre), ''), 'Administrador')
  ),
  (
    v_dest.edificio_id, p_destino_id, 'transferencia_divisa', v_dest.moneda, v_m_dest,
    v_dest.saldo, ROUND(v_dest.saldo + v_m_dest, 2), v_desc, COALESCE(NULLIF(TRIM(p_autor_nombre), ''), 'Administrador')
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- D. Acreditar aporte al Fondo de Reserva por liquidación total de recibo ordinario (idempotente)
CREATE OR REPLACE FUNCTION public.acreditar_fondo_reserva_recibo(
  p_recibo_id UUID,
  p_moneda_pago TEXT DEFAULT 'USD',
  p_tasa_bcv NUMERIC DEFAULT NULL,
  p_pago_reportado_id UUID DEFAULT NULL,
  p_referencia TEXT DEFAULT NULL,
  p_autor_nombre TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recibo RECORD;
  v_edif_id UUID;
  v_apto_num TEXT;
  v_moneda TEXT;
  v_tasa NUMERIC(14, 4);
  v_fondo_usd NUMERIC(14, 2);
  v_monto_acreditar NUMERIC(14, 2);
  v_ubicacion RECORD;
  v_saldo_ant NUMERIC(14, 2);
  v_saldo_nuevo NUMERIC(14, 2);
  v_mes_txt TEXT;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_superadmin() THEN
    RAISE EXCEPTION 'Acceso denegado: requiere rol de administrador.';
  END IF;

  SELECT * INTO v_recibo
  FROM public.recibos_generados
  WHERE id = p_recibo_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Recibo no encontrado.');
  END IF;

  v_edif_id := COALESCE(v_recibo.edificio_id, public.default_edificio_id());
  IF auth.uid() IS NOT NULL AND NOT public.user_can_access_edificio(v_edif_id) THEN
    RAISE EXCEPTION 'Acceso denegado: recibo pertenece a otro edificio.';
  END IF;

  -- Solo suma cuando el recibo está pagado al 100%
  IF COALESCE(v_recibo.estado, 'pendiente') <> 'pagado' THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'reason', 'recibo_no_pagado');
  END IF;

  -- Idempotencia estricta (bandera + índice único)
  IF COALESCE(v_recibo.fondo_reserva_acreditado, false) = true
     OR EXISTS (
       SELECT 1 FROM public.fondo_reserva_movimientos m
       WHERE m.recibo_id = p_recibo_id AND m.tipo = 'aporte_cuota'
     ) THEN
    UPDATE public.recibos_generados
    SET fondo_reserva_acreditado = true
    WHERE id = p_recibo_id AND fondo_reserva_acreditado = false;

    RETURN jsonb_build_object('ok', true, 'already_credited', true);
  END IF;

  -- El porcentaje/monto de fondo de reserva corresponde únicamente a la cuota mensual ordinaria
  v_fondo_usd := ROUND(COALESCE(v_recibo.fondo_reserva_usd, 0), 2);
  IF v_fondo_usd <= 0 THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'reason', 'sin_monto_fondo_reserva');
  END IF;

  v_moneda := CASE WHEN UPPER(COALESCE(p_moneda_pago, 'USD')) IN ('BS', 'VES') THEN 'BS' ELSE 'USD' END;

  IF v_moneda = 'BS' THEN
    SELECT COALESCE(NULLIF(p_tasa_bcv, 0), NULLIF(v_recibo.tasa_bcv, 0), NULLIF(c.tasa_bcv_actual, 0), 0)
    INTO v_tasa
    FROM public.configuracion_edificio c
    WHERE c.id = v_edif_id;

    IF COALESCE(v_tasa, 0) <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Tasa BCV inválida para acreditar Fondo de Reserva en Bs.');
    END IF;
    v_monto_acreditar := ROUND(v_fondo_usd * v_tasa, 2);
  ELSE
    v_monto_acreditar := v_fondo_usd;
  END IF;

  IF v_monto_acreditar <= 0 THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'reason', 'monto_cero');
  END IF;

  -- Buscar ubicación destino por defecto (o primera activa en esa moneda)
  SELECT * INTO v_ubicacion
  FROM public.fondo_reserva_ubicaciones u
  WHERE u.edificio_id IS NOT DISTINCT FROM v_edif_id
    AND u.moneda = v_moneda
    AND u.activa = true
  ORDER BY u.es_destino_default DESC, u.orden ASC, u.created_at ASC
  LIMIT 1
  FOR UPDATE;

  -- Si el edificio no tiene ubicación en esa moneda todavía, crear la principal automáticamente
  IF NOT FOUND THEN
    INSERT INTO public.fondo_reserva_ubicaciones (
      edificio_id, nombre, tipo, moneda, saldo, es_destino_default, descripcion, orden
    ) VALUES (
      v_edif_id,
      CASE WHEN v_moneda = 'USD' THEN 'Caja / Fondo Principal USD' ELSE 'Cuenta Bancaria Principal Bs.' END,
      CASE WHEN v_moneda = 'USD' THEN 'efectivo' ELSE 'banco' END,
      v_moneda,
      0.00,
      true,
      'Ubicación creada automáticamente para recibir aportes de Fondo de Reserva',
      1
    )
    RETURNING * INTO v_ubicacion;
  END IF;

  SELECT numero INTO v_apto_num FROM public.apartamentos WHERE id = v_recibo.apartamento_id;
  v_mes_txt := to_char(v_recibo.mes_facturado, 'YYYY-MM');

  v_saldo_ant := COALESCE(v_ubicacion.saldo, 0);
  v_saldo_nuevo := ROUND(v_saldo_ant + v_monto_acreditar, 2);

  UPDATE public.fondo_reserva_ubicaciones
  SET saldo = v_saldo_nuevo, updated_at = NOW()
  WHERE id = v_ubicacion.id;

  INSERT INTO public.fondo_reserva_movimientos (
    edificio_id, ubicacion_id, tipo, moneda, monto, saldo_anterior, saldo_nuevo,
    recibo_id, apartamento_id, apartamento_numero, mes_facturado, pago_reportado_id,
    referencia, descripcion, autor_nombre
  ) VALUES (
    v_edif_id,
    v_ubicacion.id,
    'aporte_cuota',
    v_moneda,
    v_monto_acreditar,
    v_saldo_ant,
    v_saldo_nuevo,
    p_recibo_id,
    v_recibo.apartamento_id,
    COALESCE(v_apto_num, 'S/N'),
    v_recibo.mes_facturado,
    p_pago_reportado_id,
    p_referencia,
    format('Aporte Fondo de Reserva (%s%%) · Apto %s · Mes %s', COALESCE(v_recibo.fondo_reserva_pct, 10), COALESCE(v_apto_num, 'S/N'), v_mes_txt),
    COALESCE(NULLIF(TRIM(p_autor_nombre), ''), 'Sistema')
  );

  UPDATE public.recibos_generados
  SET
    fondo_reserva_acreditado = true,
    fondo_reserva_acreditado_at = NOW(),
    fondo_reserva_acreditado_moneda = v_moneda,
    fondo_reserva_ubicacion_id = v_ubicacion.id
  WHERE id = p_recibo_id;

  RETURN jsonb_build_object(
    'ok', true,
    'recibo_id', p_recibo_id,
    'ubicacion_id', v_ubicacion.id,
    'ubicacion_nombre', v_ubicacion.nombre,
    'moneda', v_moneda,
    'monto', v_monto_acreditar,
    'saldo_nuevo', v_saldo_nuevo
  );
END;
$$;

-- E. Portal de transparencia para residentes (solo lectura, sin exponer datos de otros propietarios)
CREATE OR REPLACE FUNCTION public.get_fondo_reserva_portal_residente(
  p_limit INTEGER DEFAULT 25
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_edif_id UUID;
  v_user_apto_id UUID;
  v_es_admin BOOLEAN;
  v_ubicaciones JSONB;
  v_movimientos JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticación requerida.';
  END IF;

  v_edif_id := COALESCE(public.current_user_edificio_id(), public.default_edificio_id());
  IF v_edif_id IS NOT NULL AND NOT public.user_can_access_edificio(v_edif_id) THEN
    RAISE EXCEPTION 'Acceso denegado al edificio.';
  END IF;

  v_es_admin := public.is_admin_or_superadmin();
  SELECT apartamento_id INTO v_user_apto_id FROM public.perfiles WHERE id = auth.uid();

  SELECT COALESCE(jsonb_agg(to_jsonb(u) ORDER BY u.orden ASC, u.created_at ASC), '[]'::jsonb)
  INTO v_ubicaciones
  FROM (
    SELECT id, nombre, tipo, moneda, saldo, es_destino_default, descripcion, updated_at
    FROM public.fondo_reserva_ubicaciones
    WHERE edificio_id IS NOT DISTINCT FROM v_edif_id
      AND activa = true
  ) u;

  SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.created_at DESC), '[]'::jsonb)
  INTO v_movimientos
  FROM (
    SELECT
      mv.id,
      mv.ubicacion_id,
      ub.nombre AS ubicacion_nombre,
      mv.tipo,
      mv.moneda,
      mv.monto,
      mv.saldo_nuevo,
      mv.mes_facturado,
      CASE
        WHEN v_es_admin OR mv.tipo <> 'aporte_cuota' OR mv.apartamento_id = v_user_apto_id
          THEN mv.descripcion
        ELSE format('Aporte ordinario recaudado · Período %s', COALESCE(to_char(mv.mes_facturado, 'YYYY-MM'), 'Mensual'))
      END AS descripcion,
      CASE
        WHEN v_es_admin OR mv.apartamento_id = v_user_apto_id THEN mv.apartamento_numero
        ELSE NULL
      END AS apartamento_numero,
      mv.created_at
    FROM public.fondo_reserva_movimientos mv
    JOIN public.fondo_reserva_ubicaciones ub ON ub.id = mv.ubicacion_id
    WHERE mv.edificio_id IS NOT DISTINCT FROM v_edif_id
    ORDER BY mv.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100)
  ) m;

  RETURN jsonb_build_object(
    'ubicaciones', v_ubicaciones,
    'movimientos', v_movimientos
  );
END;
$$;

-- Permisos de ejecución de RPCs
REVOKE ALL ON FUNCTION public.definir_ubicacion_default_fondo_reserva(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.definir_ubicacion_default_fondo_reserva(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.ajustar_fondo_reserva_ubicacion(UUID, NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ajustar_fondo_reserva_ubicacion(UUID, NUMERIC, TEXT, TEXT, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.convertir_divisa_fondo_reserva(UUID, UUID, NUMERIC, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convertir_divisa_fondo_reserva(UUID, UUID, NUMERIC, NUMERIC, TEXT, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.acreditar_fondo_reserva_recibo(UUID, TEXT, NUMERIC, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acreditar_fondo_reserva_recibo(UUID, TEXT, NUMERIC, UUID, TEXT, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_fondo_reserva_portal_residente(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fondo_reserva_portal_residente(INTEGER) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
