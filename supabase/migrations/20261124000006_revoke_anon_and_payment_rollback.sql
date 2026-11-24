-- ==============================================================================
-- MIGRATION: 20261124000006_revoke_anon_and_payment_rollback.sql
-- Bloque D (Cierre — Sub-hito D4):
--   1. Defensa en profundidad: REVOKE ALL FROM PUBLIC, anon en todas las tablas
--      operativas y legacy (preservando RPCs públicos SECURITY DEFINER).
--   2. RPC compensatoria revertir_reclamo_pago() para evitar pagos atascados si
--      falla una etapa intermedia tras reclamar el pago para revisión.
-- ==============================================================================

DO $$
DECLARE
  v_tbl TEXT;
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
    'registro_conserje', 'visitantes',
    'cuotas_extraordinarias', 'cuotas_extraordinarias_asignaciones',
    'gas_campanas', 'gas_asignaciones'
  ];
BEGIN
  FOREACH v_tbl IN ARRAY v_tablas LOOP
    IF to_regclass('public.' || v_tbl) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon;', v_tbl);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated, service_role;', v_tbl);
  END LOOP;
END $$;

-- Garantizar que los RPCs públicos sigan accesibles sin sesión para el login/descarga de recibo
GRANT EXECUTE ON FUNCTION public.public_get_edificio_branding(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.public_get_recibo_descarga(UUID) TO anon, authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────────────
-- RPC COMPENSATORIA: revertir_reclamo_pago
--   Revierte el estado a 'pendiente' cuando falla un paso intermedio posterior
--   a reclamar_pago_para_revision(), preservando consistencia multi-tenant.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.revertir_reclamo_pago(
  p_pago_id UUID,
  p_motivo TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pago RECORD;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_superadmin() THEN
    RAISE EXCEPTION 'Acceso denegado: requiere rol de administrador.';
  END IF;

  SELECT * INTO v_pago
  FROM public.pagos_reportados
  WHERE id = p_pago_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El pago especificado no existe.');
  END IF;

  IF auth.uid() IS NOT NULL AND NOT public.user_can_access_edificio(v_pago.edificio_id) THEN
    RAISE EXCEPTION 'Acceso denegado: este pago pertenece a otro edificio.';
  END IF;

  IF COALESCE(v_pago.estado, 'pendiente') = 'pendiente' THEN
    RETURN jsonb_build_object('ok', true, 'already_pending', true);
  END IF;

  UPDATE public.pagos_reportados
  SET
    estado = 'pendiente',
    updated_at = NOW()
  WHERE id = p_pago_id;

  IF to_regclass('public.historial_auditoria') IS NOT NULL THEN
    INSERT INTO public.historial_auditoria (
      apartamento_id,
      tipo_accion,
      titulo,
      descripcion,
      edificio_id
    ) VALUES (
      v_pago.apartamento_id,
      'ROLLBACK_CONCILIACION_PAGO',
      'Reversión automática de conciliación',
      COALESCE(NULLIF(TRIM(p_motivo), ''), 'Fallo intermedio al liquidar pago reclamado; revertido a pendiente.'),
      v_pago.edificio_id
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'pago_id', p_pago_id, 'estado', 'pendiente');
END;
$$;

REVOKE ALL ON FUNCTION public.revertir_reclamo_pago(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revertir_reclamo_pago(UUID, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
