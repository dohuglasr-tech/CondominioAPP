-- ==============================================================================
-- MIGRATION: 20261124000008_fix_fondo_reserva_portal_rpc.sql
-- Corrige ORDER BY en subconsulta de ubicaciones dentro de
-- public.get_fondo_reserva_portal_residente(INTEGER)
-- ==============================================================================

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

  SELECT COALESCE(jsonb_agg(to_jsonb(u)), '[]'::jsonb)
  INTO v_ubicaciones
  FROM (
    SELECT id, nombre, tipo, moneda, saldo, es_destino_default, descripcion, updated_at
    FROM public.fondo_reserva_ubicaciones
    WHERE edificio_id IS NOT DISTINCT FROM v_edif_id
      AND activa = true
    ORDER BY orden ASC, created_at ASC
  ) u;

  SELECT COALESCE(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
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

REVOKE ALL ON FUNCTION public.get_fondo_reserva_portal_residente(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fondo_reserva_portal_residente(INTEGER) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
