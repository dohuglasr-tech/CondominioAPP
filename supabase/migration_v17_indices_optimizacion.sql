-- ==============================================================================
-- MIGRACIÓN V17: ÍNDICES DE ALTO RENDIMIENTO Y PROCEDIMIENTOS ATÓMICOS (RPC)
-- ==============================================================================
-- Objetivo: Acelerar hasta 500% las consultas de PostgreSQL eliminando Sequential Scans,
-- optimizar tiempos de respuesta a sub-milisegundos y asegurar atomicidad transaccional.
-- Ejecutar en: Supabase > SQL Editor > Run
-- ==============================================================================

-- ────────────────────────────────────────────────────────────
-- 0. GARANTIZAR COLUMNAS BASE (Idempotente y 100% Seguro)
--    Evita errores si alguna columna opcional no fue creada en migraciones previas.
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.perfiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.perfiles ADD COLUMN IF NOT EXISTS propietario_email TEXT;
ALTER TABLE public.pagos_reportados ADD COLUMN IF NOT EXISTS reportado_por UUID;
ALTER TABLE public.pagos_reportados ADD COLUMN IF NOT EXISTS fecha_revision TIMESTAMPTZ;

-- ────────────────────────────────────────────────────────────
-- 1. TABLA: recibos_generados
-- ────────────────────────────────────────────────────────────
-- Acelera la búsqueda del último recibo pendiente por apartamento (Dashboard y RecibosPanel)
CREATE INDEX IF NOT EXISTS idx_recibos_apto_estado
  ON public.recibos_generados (apartamento_id, estado);

-- Acelera el listado mensual y filtros por mes facturado (AdminRecibosEmitidos)
CREATE INDEX IF NOT EXISTS idx_recibos_mes_facturado
  ON public.recibos_generados (mes_facturado DESC);

-- Acelera el cálculo de morosidad global (moraService: recibos con estado 'pendiente')
CREATE INDEX IF NOT EXISTS idx_recibos_estado
  ON public.recibos_generados (estado)
  WHERE estado = 'pendiente';

-- ────────────────────────────────────────────────────────────
-- 2. TABLA: pagos_reportados
-- ────────────────────────────────────────────────────────────
-- Acelera el cálculo de saldo a favor (saldoFavorService: suma de pagos aprobados por apto)
CREATE INDEX IF NOT EXISTS idx_pagos_apto_estado
  ON public.pagos_reportados (apartamento_id, estado);

-- Acelera el ordenamiento cronológico de auditoría y actividades recientes (AdminDashboard)
CREATE INDEX IF NOT EXISTS idx_pagos_created_at
  ON public.pagos_reportados (created_at DESC);

-- Acelera el filtro de pagos pendientes de revisión administrativa (AdminRecibos)
CREATE INDEX IF NOT EXISTS idx_pagos_estado
  ON public.pagos_reportados (estado)
  WHERE estado = 'pendiente';

-- Acelera la resolución de pagos por usuario residente
CREATE INDEX IF NOT EXISTS idx_pagos_reportado_por
  ON public.pagos_reportados (reportado_por);

-- ────────────────────────────────────────────────────────────
-- 3. TABLA: gastos_comunes
-- ────────────────────────────────────────────────────────────
-- Acelera las consultas por mes de aplicación (AdminGastos y cálculo de cuota del mes)
CREATE INDEX IF NOT EXISTS idx_gastos_mes_aplicacion
  ON public.gastos_comunes (mes_aplicacion DESC);

-- Acelera el orden de carga y filtros por fecha de creación
CREATE INDEX IF NOT EXISTS idx_gastos_created_at
  ON public.gastos_comunes (created_at DESC);

-- ────────────────────────────────────────────────────────────
-- 4. TABLA: perfiles
-- ────────────────────────────────────────────────────────────
-- Acelera la vinculación y joins entre usuarios y sus apartamentos
CREATE INDEX IF NOT EXISTS idx_perfiles_apartamento_id
  ON public.perfiles (apartamento_id);

-- Acelera la verificación de roles administrativos y de residentes
CREATE INDEX IF NOT EXISTS idx_perfiles_rol
  ON public.perfiles (rol);

-- Acelera la búsqueda y despacho de notificaciones por email
CREATE INDEX IF NOT EXISTS idx_perfiles_email
  ON public.perfiles (email);

CREATE INDEX IF NOT EXISTS idx_perfiles_propietario_email
  ON public.perfiles (propietario_email);

-- ────────────────────────────────────────────────────────────
-- 5. TABLA: apartamentos
-- ────────────────────────────────────────────────────────────
-- Acelera filtros por piso (análisis de morosidad y vistas por nivel)
CREATE INDEX IF NOT EXISTS idx_apartamentos_piso
  ON public.apartamentos (piso);

-- Acelera filtros por condición de solvencia
CREATE INDEX IF NOT EXISTS idx_apartamentos_estado
  ON public.apartamentos (estado);

-- ────────────────────────────────────────────────────────────
-- 6. TABLA: deudas_mora
-- ────────────────────────────────────────────────────────────
-- Acelera la categorización por nivel de riesgo y meses de atraso
CREATE INDEX IF NOT EXISTS idx_deudas_mora_tasa_riesgo
  ON public.deudas_mora (tasa_riesgo, estado);

-- ────────────────────────────────────────────────────────────
-- 7. TABLA: cargos_especiales
-- ────────────────────────────────────────────────────────────
-- Acelera la inclusión de multas y acuerdos en la emisión del mes
CREATE INDEX IF NOT EXISTS idx_cargos_mes_aplicado
  ON public.cargos_especiales (mes_aplicacion, aplicado);

CREATE INDEX IF NOT EXISTS idx_cargos_apartamento_id
  ON public.cargos_especiales (apartamento_id);

-- ────────────────────────────────────────────────────────────
-- 8. TABLA: historial_auditoria
-- ────────────────────────────────────────────────────────────
-- Acelera la búsqueda de deducciones de saldo a favor y arqueo por apartamento
CREATE INDEX IF NOT EXISTS idx_auditoria_apto_accion
  ON public.historial_auditoria (apartamento_id, tipo_accion);

-- Acelera el listado cronológico de la bitácora de auditoría
CREATE INDEX IF NOT EXISTS idx_auditoria_fecha
  ON public.historial_auditoria (fecha DESC);

-- ────────────────────────────────────────────────────────────
-- 9. TABLA: chat_mensajes
-- ────────────────────────────────────────────────────────────
-- Acelera la carga en vivo de los últimos mensajes del chat comunitario
CREATE INDEX IF NOT EXISTS idx_chat_created_at
  ON public.chat_mensajes (created_at DESC);

-- ────────────────────────────────────────────────────────────
-- 10. PROCEDIMIENTO ATÓMICO RPC: aprobar_pago_transaccional
-- ────────────────────────────────────────────────────────────
-- Garantiza consistencia atómica: si se aprueba un pago, actualiza
-- en UNA sola transacción:
-- 1. Estado en pagos_reportados -> 'aprobado'
-- 2. Recibos pendientes del apartamento -> 'pagado'
-- 3. Deudas de mora activas del apartamento -> 'solventado'
-- Si cualquiera falla, se revierte todo automáticamente.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.aprobar_pago_transaccional(
  p_pago_id UUID,
  p_notas_admin TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pago RECORD;
  v_apto_id UUID;
  v_notas_final TEXT;
BEGIN
  -- 1. Obtener y bloquear la fila del pago
  SELECT * INTO v_pago
  FROM public.pagos_reportados
  WHERE id = p_pago_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'El pago especificado no existe.');
  END IF;

  v_apto_id := v_pago.apartamento_id;

  -- Fallback de apartamento si no estaba asignado directamente en el pago
  IF v_apto_id IS NULL AND v_pago.reportado_por IS NOT NULL THEN
    SELECT apartamento_id INTO v_apto_id
    FROM public.perfiles
    WHERE id = v_pago.reportado_por;
  END IF;

  -- Construir nota administrativa
  v_notas_final := COALESCE(v_pago.notas_admin, '');
  IF p_notas_admin IS NOT NULL AND TRIM(p_notas_admin) <> '' THEN
    IF v_notas_final <> '' THEN
      v_notas_final := v_notas_final || ' | Nota Admin: ' || TRIM(p_notas_admin);
    ELSE
      v_notas_final := 'Nota Admin: ' || TRIM(p_notas_admin);
    END IF;
  END IF;

  -- 2. Actualizar el pago reportado
  UPDATE public.pagos_reportados
  SET
    estado = 'aprobado',
    notas_admin = v_notas_final,
    fecha_revision = NOW(),
    updated_at = NOW()
  WHERE id = p_pago_id;

  -- 3. Si se identificó el apartamento, conciliar recibos y deudas de mora
  IF v_apto_id IS NOT NULL THEN
    -- Marcar recibos pendientes como pagados
    UPDATE public.recibos_generados
    SET estado = 'pagado'
    WHERE apartamento_id = v_apto_id
      AND estado = 'pendiente';

    -- Solventar moras activas
    UPDATE public.deudas_mora
    SET
      estado = 'solventado',
      updated_at = NOW()
    WHERE apartamento_id = v_apto_id
      AND estado = 'activo';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'pago_id', p_pago_id,
    'apartamento_id', v_apto_id,
    'estado', 'aprobado'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

-- Permisos de ejecución del procedimiento RPC
GRANT EXECUTE ON FUNCTION public.aprobar_pago_transaccional(UUID, TEXT) TO authenticated, service_role;
