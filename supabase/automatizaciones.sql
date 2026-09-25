-- ============================================================
-- AUTOMATIZACIONES SQL - FASE 2
-- ============================================================
-- Ejecutar en Supabase SQL Editor DESPUÉS de instalar
-- la Extension pg_cron (Dashboard > Database > Extensions)
-- ============================================================


-- ============================================================
-- 1. CRON JOB: Tasa BCV diaria
-- ============================================================
-- Llama a la Edge Function 'cron-tasa-bcv' de Lunes a Viernes
-- a las 8:00 AM hora Venezuela (UTC-4 = 12:00 PM UTC)
--
-- IMPORTANTE: Reemplazar <PROJECT_REF> con tu referencia de proyecto Supabase
--             y <ANON_KEY> con la clave anónima del proyecto.
-- ============================================================

SELECT cron.schedule(
  'cron-tasa-bcv-diaria',                    -- Nombre del job
  '0 12 * * 1-5',                             -- 12:00 UTC = 8:00 AM Venezuela (UTC-4), L-V
  $$
  SELECT net.http_post(
    url     := 'https://kevslcecttfxifcplgzx.supabase.co/functions/v1/cron-tasa-bcv',
    headers := '{"Authorization": "Bearer sb_publishable_4ByLVV27LGHNHuRGC1Pspw_Uk6V7e2J", "Content-Type": "application/json"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);

-- Ver jobs activos:
-- SELECT * FROM cron.job;

-- Para eliminar el job si hace falta re-crearlo:
-- SELECT cron.unschedule('cron-tasa-bcv-diaria');


-- ============================================================
-- 2. FUNCIÓN + TRIGGER: Recalcular cuotas al cargar gastos
-- ============================================================
-- Cuando el admin inserta un nuevo gasto_comun,
-- esta función recalcula las cuotas de TODOS los apartamentos
-- para el mes correspondiente al gasto.
-- ============================================================

CREATE OR REPLACE FUNCTION public.recalcular_cuotas_del_mes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_gastos_usd  NUMERIC;
  v_tasa_bcv          NUMERIC;
  v_mes               DATE;
  v_apto              RECORD;
  v_cuota_usd         NUMERIC;
  v_cuota_bs          NUMERIC;
BEGIN
  -- Mes del gasto recién insertado
  v_mes := DATE_TRUNC('month', NEW.mes_aplicacion);

  -- Sumar TODOS los gastos del mismo mes
  SELECT COALESCE(SUM(monto_usd), 0)
  INTO v_total_gastos_usd
  FROM public.gastos_comunes
  WHERE DATE_TRUNC('month', mes_aplicacion) = v_mes;

  -- Obtener tasa BCV actual
  SELECT tasa_bcv_actual INTO v_tasa_bcv
  FROM public.configuracion_edificio
  LIMIT 1;
  v_tasa_bcv := COALESCE(v_tasa_bcv, 0);

  -- Para cada apartamento, calcular y upsert la cuota del mes
  FOR v_apto IN
    SELECT id, alicuota FROM public.apartamentos
  LOOP
    v_cuota_usd := ROUND(v_total_gastos_usd * v_apto.alicuota, 2);
    v_cuota_bs  := ROUND(v_cuota_usd * v_tasa_bcv, 2);

    INSERT INTO public.cuotas_apartamento
      (apartamento_id, mes, monto_usd, monto_bs, tasa_bcv_usada, saldo_usd, saldo_bs, pagado_completo)
    VALUES
      (v_apto.id, v_mes, v_cuota_usd, v_cuota_bs, v_tasa_bcv, v_cuota_usd, v_cuota_bs, FALSE)
    ON CONFLICT (apartamento_id, mes) DO UPDATE
      SET
        monto_usd      = EXCLUDED.monto_usd,
        monto_bs       = EXCLUDED.monto_bs,
        tasa_bcv_usada = EXCLUDED.tasa_bcv_usada,
        -- Solo actualizar saldo si no ha pagado
        saldo_usd      = CASE
                           WHEN cuotas_apartamento.pagado_completo THEN cuotas_apartamento.saldo_usd
                           ELSE EXCLUDED.saldo_usd
                         END,
        saldo_bs       = CASE
                           WHEN cuotas_apartamento.pagado_completo THEN cuotas_apartamento.saldo_bs
                           ELSE EXCLUDED.saldo_bs
                         END,
        updated_at     = NOW();
  END LOOP;

  RETURN NEW;
END;
$$;

-- Trigger: se dispara al insertar O actualizar un gasto
DROP TRIGGER IF EXISTS trg_recalcular_cuotas_on_gasto ON public.gastos_comunes;
CREATE TRIGGER trg_recalcular_cuotas_on_gasto
  AFTER INSERT OR UPDATE ON public.gastos_comunes
  FOR EACH ROW EXECUTE FUNCTION public.recalcular_cuotas_del_mes();


-- ============================================================
-- 3. FUNCIÓN + TRIGGER: Actualizar saldo al aprobar un pago
-- ============================================================
-- Cuando el admin aprueba un pago, reduce el saldo del mes
-- correspondiente en cuotas_apartamento.
-- ============================================================

CREATE OR REPLACE FUNCTION public.aplicar_pago_aprobado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tasa_bcv NUMERIC;
BEGIN
  -- Solo actuar cuando el estado cambia a 'aprobado'
  IF NEW.estado = 'aprobado' AND OLD.estado <> 'aprobado' THEN

    -- Obtener tasa BCV actual para recalcular Bs
    SELECT tasa_bcv_actual INTO v_tasa_bcv
    FROM public.configuracion_edificio LIMIT 1;
    v_tasa_bcv := COALESCE(v_tasa_bcv, 1);

    -- Si el pago está vinculado a una cuota específica
    IF NEW.cuota_id IS NOT NULL THEN
      UPDATE public.cuotas_apartamento
      SET
        saldo_usd = GREATEST(0, saldo_usd - COALESCE(NEW.monto_usd, 0)),
        saldo_bs  = GREATEST(0, saldo_bs  - COALESCE(NEW.monto_bs, COALESCE(NEW.monto_usd, 0) * v_tasa_bcv)),
        pagado_completo = CASE
                            WHEN GREATEST(0, saldo_usd - COALESCE(NEW.monto_usd, 0)) <= 0.01
                            THEN TRUE ELSE FALSE
                          END,
        updated_at = NOW()
      WHERE id = NEW.cuota_id;
    ELSE
      -- Si no tiene cuota vinculada, aplicar al mes actual del apartamento
      UPDATE public.cuotas_apartamento
      SET
        saldo_usd = GREATEST(0, saldo_usd - COALESCE(NEW.monto_usd, 0)),
        saldo_bs  = GREATEST(0, saldo_bs  - COALESCE(NEW.monto_bs, COALESCE(NEW.monto_usd, 0) * v_tasa_bcv)),
        pagado_completo = CASE
                            WHEN GREATEST(0, saldo_usd - COALESCE(NEW.monto_usd, 0)) <= 0.01
                            THEN TRUE ELSE FALSE
                          END,
        updated_at = NOW()
      WHERE id = (
        SELECT id FROM public.cuotas_apartamento
        WHERE apartamento_id = NEW.apartamento_id
          AND mes = DATE_TRUNC('month', NEW.fecha_pago::DATE)
          AND pagado_completo = FALSE
        ORDER BY mes ASC
        LIMIT 1
      );
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_aplicar_pago_aprobado ON public.pagos_reportados;
CREATE TRIGGER trg_aplicar_pago_aprobado
  AFTER UPDATE ON public.pagos_reportados
  FOR EACH ROW EXECUTE FUNCTION public.aplicar_pago_aprobado();


-- ============================================================
-- 4. HABILITAR REALTIME EN LA TABLA DE CHAT
-- ============================================================
-- Supabase Realtime: publicar cambios en chat_mensajes y notificaciones
-- (Supabase usa publicaciones de PostgreSQL)

-- Agregar tablas a la publicación de Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_mensajes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notificaciones;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cuotas_apartamento;
