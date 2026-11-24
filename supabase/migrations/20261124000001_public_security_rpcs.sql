-- ==============================================================================
-- MIGRATION: 20261124000001_public_security_rpcs.sql
-- Bloque A (Fase 1.1): Helpers SECURITY DEFINER + RPCs seguros para flujos
-- públicos (sin sesión) y resumen comunitario de morosidad sin exposición PII.
-- ==============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. HELPERS DE SEGURIDAD (SECURITY DEFINER + search_path fijo)
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.current_user_rol()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rol TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT p.rol INTO v_rol
  FROM public.perfiles p
  WHERE p.id = auth.uid();

  RETURN v_rol;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_user_apartamento_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_apto_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT p.apartamento_id INTO v_apto_id
  FROM public.perfiles p
  WHERE p.id = auth.uid();

  RETURN v_apto_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_user_edificio_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_edif_text TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT (to_jsonb(p) ->> 'edificio_id') INTO v_edif_text
  FROM public.perfiles p
  WHERE p.id = auth.uid();

  IF v_edif_text IS NULL OR v_edif_text = '' THEN
    RETURN NULL;
  END IF;

  RETURN v_edif_text::UUID;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_user_rol() IN ('administrador', 'superadmin', 'admin'), false);
$$;

GRANT EXECUTE ON FUNCTION public.current_user_rol() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_apartamento_id() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_edificio_id() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_or_superadmin() TO anon, authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. RPC PÚBLICO: Branding / Apariencia del Edificio (sin datos bancarios)
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.public_get_edificio_branding(
  p_slug TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target TEXT := LOWER(TRIM(COALESCE(p_slug, '')));
  v_clean_target TEXT := REGEXP_REPLACE(v_target, '[^a-z0-9]', '', 'g');
  v_row JSONB := NULL;
BEGIN
  -- 1. Si viene slug, UUID o nombre aproximado, intentar resolverlo
  IF v_target <> '' THEN
    SELECT to_jsonb(c) INTO v_row
    FROM public.configuracion_edificio c
    WHERE LOWER(COALESCE(to_jsonb(c) ->> 'slug', '')) = v_target
       OR c.id::TEXT = v_target
    LIMIT 1;

    IF v_row IS NULL AND v_clean_target <> '' THEN
      SELECT to_jsonb(c) INTO v_row
      FROM public.configuracion_edificio c
      WHERE REGEXP_REPLACE(
              REGEXP_REPLACE(LOWER(COALESCE(c.nombre_edificio, '')), '^(condominio|edificio|residencias|residencia|torre)\s+', ''),
              '[^a-z0-9]+', '-', 'g'
            ) = v_target
         OR REGEXP_REPLACE(LOWER(COALESCE(c.nombre_edificio, '')), '[^a-z0-9]', '', 'g') LIKE ('%' || v_clean_target || '%')
      LIMIT 1;
    END IF;
  END IF;

  -- 2. Fallback al primer edificio configurado si no se especificó slug
  IF v_row IS NULL AND v_target = '' THEN
    SELECT to_jsonb(c) INTO v_row
    FROM public.configuracion_edificio c
    ORDER BY c.created_at ASC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_row IS NULL THEN
    RETURN NULL;
  END IF;

  -- Retornar EXCLUSIVAMENTE campos públicos no sensibles
  RETURN jsonb_build_object(
    'id', v_row -> 'id',
    'nombre_edificio', v_row -> 'nombre_edificio',
    'slug', v_row -> 'slug',
    'rif', COALESCE(v_row -> 'rif', v_row -> 'rif_edificio'),
    'direccion', v_row -> 'direccion',
    'ciudad', v_row -> 'ciudad',
    'logo_url', v_row -> 'logo_url',
    'color_primario', v_row -> 'color_primario',
    'dominio_email', v_row -> 'dominio_email',
    'total_apartamentos', v_row -> 'total_apartamentos',
    'total_pisos', v_row -> 'total_pisos',
    'apartamentos_por_piso', v_row -> 'apartamentos_por_piso',
    'tiene_ph', v_row -> 'tiene_ph',
    'total_ph', v_row -> 'total_ph',
    'modo_mantenimiento', COALESCE((v_row -> 'modo_mantenimiento')::JSONB, 'false'::JSONB),
    'modo_mantenimiento_motivo', v_row -> 'modo_mantenimiento_motivo',
    'banner_emergencia_activo', COALESCE((v_row -> 'banner_emergencia_activo')::JSONB, 'false'::JSONB),
    'banner_emergencia_texto', v_row -> 'banner_emergencia_texto',
    'banner_emergencia_nivel', v_row -> 'banner_emergencia_nivel'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.public_get_edificio_branding(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_get_edificio_branding(TEXT) TO anon, authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. RPC PÚBLICO: Lista de apartamentos para Registro (sin PII)
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.public_list_apartamentos_registro(
  p_edificio_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  numero TEXT,
  piso INTEGER,
  ocupado BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id,
    a.numero,
    a.piso,
    EXISTS (
      SELECT 1
      FROM public.perfiles p
      WHERE p.apartamento_id = a.id
    ) AS ocupado
  FROM public.apartamentos a
  WHERE p_edificio_id IS NULL
     OR (to_jsonb(a) ->> 'edificio_id') IS NULL
     OR (to_jsonb(a) ->> 'edificio_id') = p_edificio_id::TEXT
  ORDER BY a.numero ASC;
$$;

REVOKE ALL ON FUNCTION public.public_list_apartamentos_registro(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_list_apartamentos_registro(UUID) TO anon, authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. RPC AUTENTICADO: Completar registro de residente (fuerza rol = 'residente')
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.completar_registro_residente(
  p_apartamento_id UUID,
  p_nombre_completo TEXT,
  p_cedula TEXT,
  p_telefono TEXT,
  p_condicion_habitacional TEXT DEFAULT 'propio',
  p_carga_familiar INTEGER DEFAULT 1,
  p_propietario_nombre TEXT DEFAULT NULL,
  p_propietario_cedula TEXT DEFAULT NULL,
  p_propietario_telefono TEXT DEFAULT NULL,
  p_propietario_email TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_user_email TEXT;
  v_apto_exists BOOLEAN;
  v_ocupado_por_otro BOOLEAN;
  v_apto_edif_id UUID;
  v_condicion TEXT;
  v_prop_nombre TEXT;
  v_prop_cedula TEXT;
  v_prop_tel TEXT;
  v_prop_email TEXT;
  v_has_perfiles_edif BOOLEAN;
  v_has_perfiles_email BOOLEAN;
  v_has_perfiles_prop_email BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuario no autenticado.');
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.apartamentos WHERE id = p_apartamento_id) INTO v_apto_exists;
  IF NOT v_apto_exists THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El apartamento seleccionado no existe en el catálogo oficial.');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.perfiles
    WHERE apartamento_id = p_apartamento_id
      AND id <> v_uid
  ) INTO v_ocupado_por_otro;

  IF v_ocupado_por_otro THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Este departamento ya tiene un usuario existente, contáctese con la administración.');
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = v_uid;

  v_condicion := CASE WHEN LOWER(COALESCE(p_condicion_habitacional, 'propio')) = 'alquilado' THEN 'alquilado' ELSE 'propio' END;
  v_prop_nombre := CASE WHEN v_condicion = 'propio' THEN TRIM(p_nombre_completo) ELSE NULLIF(TRIM(COALESCE(p_propietario_nombre, '')), '') END;
  v_prop_cedula := CASE WHEN v_condicion = 'propio' THEN TRIM(p_cedula) ELSE NULLIF(TRIM(COALESCE(p_propietario_cedula, '')), '') END;
  v_prop_tel := CASE WHEN v_condicion = 'propio' THEN TRIM(p_telefono) ELSE NULLIF(TRIM(COALESCE(p_propietario_telefono, '')), '') END;
  v_prop_email := CASE WHEN v_condicion = 'propio' THEN v_user_email ELSE NULLIF(TRIM(COALESCE(p_propietario_email, '')), '') END;

  -- Insertar o actualizar perfil forzando siempre rol = 'residente' en el servidor
  INSERT INTO public.perfiles (
    id,
    apartamento_id,
    nombre_completo,
    cedula,
    telefono,
    rol,
    estado_cuenta,
    clave_cambiada,
    perfil_completo,
    condicion_habitacional,
    carga_familiar,
    propietario_nombre,
    propietario_cedula,
    propietario_telefono,
    updated_at
  ) VALUES (
    v_uid,
    p_apartamento_id,
    TRIM(p_nombre_completo),
    TRIM(p_cedula),
    TRIM(p_telefono),
    'residente',
    'activa',
    true,
    true,
    v_condicion,
    GREATEST(1, COALESCE(p_carga_familiar, 1)),
    v_prop_nombre,
    v_prop_cedula,
    v_prop_tel,
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    apartamento_id = EXCLUDED.apartamento_id,
    nombre_completo = EXCLUDED.nombre_completo,
    cedula = EXCLUDED.cedula,
    telefono = EXCLUDED.telefono,
    rol = 'residente',
    estado_cuenta = 'activa',
    clave_cambiada = true,
    perfil_completo = true,
    condicion_habitacional = EXCLUDED.condicion_habitacional,
    carga_familiar = EXCLUDED.carga_familiar,
    propietario_nombre = EXCLUDED.propietario_nombre,
    propietario_cedula = EXCLUDED.propietario_cedula,
    propietario_telefono = EXCLUDED.propietario_telefono,
    updated_at = NOW();

  -- Sincronizar columnas opcionales si existen en el esquema
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'perfiles' AND column_name = 'email'
  ) INTO v_has_perfiles_email;

  IF v_has_perfiles_email AND v_user_email IS NOT NULL THEN
    EXECUTE 'UPDATE public.perfiles SET email = $1 WHERE id = $2' USING v_user_email, v_uid;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'perfiles' AND column_name = 'propietario_email'
  ) INTO v_has_perfiles_prop_email;

  IF v_has_perfiles_prop_email AND v_prop_email IS NOT NULL THEN
    EXECUTE 'UPDATE public.perfiles SET propietario_email = $1 WHERE id = $2' USING v_prop_email, v_uid;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'perfiles' AND column_name = 'edificio_id'
  ) INTO v_has_perfiles_edif;

  IF v_has_perfiles_edif THEN
    SELECT NULLIF(to_jsonb(a) ->> 'edificio_id', '')::UUID
    INTO v_apto_edif_id
    FROM public.apartamentos a
    WHERE a.id = p_apartamento_id;

    IF v_apto_edif_id IS NOT NULL THEN
      EXECUTE 'UPDATE public.perfiles SET edificio_id = $1 WHERE id = $2' USING v_apto_edif_id, v_uid;
    END IF;
  END IF;

  -- Actualizar ficha oficial del apartamento
  UPDATE public.apartamentos
  SET
    propietario_nombre = COALESCE(v_prop_nombre, propietario_nombre),
    propietario_cedula = COALESCE(v_prop_cedula, propietario_cedula),
    telefono_contacto = COALESCE(v_prop_tel, telefono_contacto),
    estado = 'habitado',
    updated_at = NOW()
  WHERE id = p_apartamento_id;

  RETURN jsonb_build_object('ok', true, 'apartamento_id', p_apartamento_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.completar_registro_residente(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.completar_registro_residente(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. RPC PÚBLICO: Descarga directa de un recibo puntual por UUID (sin listar tabla)
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.public_get_recibo_descarga(
  p_recibo_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recibo JSONB;
  v_apto JSONB;
  v_config JSONB;
  v_apto_id UUID;
  v_edif_id_text TEXT;
BEGIN
  IF p_recibo_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT to_jsonb(r), r.apartamento_id INTO v_recibo, v_apto_id
  FROM public.recibos_generados r
  WHERE r.id = p_recibo_id
  LIMIT 1;

  IF v_recibo IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'id', a.id,
    'numero', a.numero,
    'piso', a.piso,
    'alicuota', a.alicuota,
    'propietario_nombre', a.propietario_nombre
  ),
  COALESCE(to_jsonb(a) ->> 'edificio_id', v_recibo ->> 'edificio_id')
  INTO v_apto, v_edif_id_text
  FROM public.apartamentos a
  WHERE a.id = v_apto_id
  LIMIT 1;

  SELECT to_jsonb(c) INTO v_config
  FROM public.configuracion_edificio c
  WHERE v_edif_id_text IS NULL OR c.id::TEXT = v_edif_id_text
  ORDER BY c.created_at ASC NULLS LAST
  LIMIT 1;

  IF v_config IS NULL THEN
    SELECT to_jsonb(c) INTO v_config
    FROM public.configuracion_edificio c
    ORDER BY c.created_at ASC NULLS LAST
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'recibo', v_recibo || jsonb_build_object('apartamento', v_apto),
    'config', CASE WHEN v_config IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_config -> 'id',
      'nombre_edificio', v_config -> 'nombre_edificio',
      'rif', COALESCE(v_config -> 'rif', v_config -> 'rif_edificio'),
      'direccion', v_config -> 'direccion',
      'email_contacto', COALESCE(v_config -> 'email_contacto', v_config -> 'email_admin'),
      'banco', v_config -> 'banco',
      'cuenta_bancaria', v_config -> 'cuenta_bancaria',
      'titular_cuenta', v_config -> 'titular_cuenta',
      'tasa_bcv_actual', v_config -> 'tasa_bcv_actual',
      'color_primario', v_config -> 'color_primario',
      'logo_url', v_config -> 'logo_url',
      'fecha_inicio_gestion', v_config -> 'fecha_inicio_gestion'
    ) END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.public_get_recibo_descarga(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_get_recibo_descarga(UUID) TO anon, authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────────────
-- 6. RPC AUTENTICADO: Resumen Comunitario de Morosidad (sin PII privada)
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_resumen_mora_comunitario()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_edif_id UUID := public.current_user_edificio_id();
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
  WHERE v_edif_id IS NULL
     OR (to_jsonb(a) ->> 'edificio_id') IS NULL
     OR (to_jsonb(a) ->> 'edificio_id') = v_edif_id::TEXT;

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
  WHERE v_edif_id IS NULL
     OR (to_jsonb(a) ->> 'edificio_id') IS NULL
     OR (to_jsonb(a) ->> 'edificio_id') = v_edif_id::TEXT;

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
    AND (
      v_edif_id IS NULL
      OR (to_jsonb(a) ->> 'edificio_id') IS NULL
      OR (to_jsonb(a) ->> 'edificio_id') = v_edif_id::TEXT
    );

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'tipo', c.tipo,
    'descripcion', c.descripcion
  )), '[]'::JSONB)
  INTO v_configs
  FROM public.casos_comunidad c
  WHERE c.tipo LIKE 'config_calendario_mora%';

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

