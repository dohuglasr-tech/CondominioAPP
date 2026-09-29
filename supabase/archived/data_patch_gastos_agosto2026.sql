-- ============================================================
-- DATA PATCH: Completar monto_bs y datos de transferencia
-- en los gastos de agosto 2026
-- EJECUTAR en Supabase > SQL Editor > RUN
-- ============================================================

DO $$
DECLARE
  v_pagado_por     TEXT;
  v_autorizado_por TEXT;
  v_ref            TEXT := '12345678';
  v_razon          TEXT := 'Anexo de informacion nueva';
BEGIN
  -- Tomar pagado_por y autorizado_por de la fila MANO DE OBRA (ya tiene todo)
  SELECT pagado_por, autorizado_por
    INTO v_pagado_por, v_autorizado_por
    FROM public.gastos_comunes
   WHERE descripcion ILIKE '%MANO DE OBRA%'
   LIMIT 1;

  RAISE NOTICE 'Usando pagado_por=% autorizado_por=%', v_pagado_por, v_autorizado_por;

  -- ── Función auxiliar: arma el objeto historial ──────────────────────
  -- (inline via jsonb_build_object)

  -- Limpieza del Edificio  →  Bs 1.000,00
  UPDATE public.gastos_comunes SET
    monto_bs        = 1000.00,
    referencia      = COALESCE(NULLIF(referencia,''), v_ref),
    pagado_por      = COALESCE(NULLIF(pagado_por,''), v_pagado_por),
    autorizado_por  = COALESCE(NULLIF(autorizado_por,''), v_autorizado_por),
    veces_editado   = COALESCE(veces_editado,0) + 1,
    historial_ediciones = COALESCE(historial_ediciones,'[]'::jsonb) || jsonb_build_array(jsonb_build_object('fecha',NOW()::text,'razon',v_razon,'snapshot',jsonb_build_object('monto_bs',monto_bs)))
  WHERE descripcion ILIKE '%Limpieza del Edificio%';

  -- Bono de alimentacion  →  Bs 77.137,00
  UPDATE public.gastos_comunes SET
    monto_bs        = 77137.00,
    referencia      = COALESCE(NULLIF(referencia,''), v_ref),
    pagado_por      = COALESCE(NULLIF(pagado_por,''), v_pagado_por),
    autorizado_por  = COALESCE(NULLIF(autorizado_por,''), v_autorizado_por),
    veces_editado   = COALESCE(veces_editado,0) + 1,
    historial_ediciones = COALESCE(historial_ediciones,'[]'::jsonb) || jsonb_build_array(jsonb_build_object('fecha',NOW()::text,'razon',v_razon,'snapshot',jsonb_build_object('monto_bs',monto_bs)))
  WHERE descripcion ILIKE '%Bono de alimentacion%' OR descripcion ILIKE '%limpieza del deposito%';

  -- Mantenimiento de Ascensor  →  Bs 41.997,50
  UPDATE public.gastos_comunes SET
    monto_bs        = 41997.50,
    referencia      = COALESCE(NULLIF(referencia,''), v_ref),
    pagado_por      = COALESCE(NULLIF(pagado_por,''), v_pagado_por),
    autorizado_por  = COALESCE(NULLIF(autorizado_por,''), v_autorizado_por),
    veces_editado   = COALESCE(veces_editado,0) + 1,
    historial_ediciones = COALESCE(historial_ediciones,'[]'::jsonb) || jsonb_build_array(jsonb_build_object('fecha',NOW()::text,'razon',v_razon,'snapshot',jsonb_build_object('monto_bs',monto_bs)))
  WHERE descripcion ILIKE '%Mantenimiento de Ascensor%';

  -- Administracion Guardias Y Comision bancaria  →  Bs 8.140,57
  UPDATE public.gastos_comunes SET
    monto_bs        = 8140.57,
    referencia      = COALESCE(NULLIF(referencia,''), v_ref),
    pagado_por      = COALESCE(NULLIF(pagado_por,''), v_pagado_por),
    autorizado_por  = COALESCE(NULLIF(autorizado_por,''), v_autorizado_por),
    veces_editado   = COALESCE(veces_editado,0) + 1,
    historial_ediciones = COALESCE(historial_ediciones,'[]'::jsonb) || jsonb_build_array(jsonb_build_object('fecha',NOW()::text,'razon',v_razon,'snapshot',jsonb_build_object('monto_bs',monto_bs)))
  WHERE descripcion ILIKE '%Administracion%Guardias%' OR descripcion ILIKE '%Comision bancaria%';

  -- Copias Recibos de Condominio  →  Bs 7.980,00
  UPDATE public.gastos_comunes SET
    monto_bs        = 7980.00,
    referencia      = COALESCE(NULLIF(referencia,''), v_ref),
    pagado_por      = COALESCE(NULLIF(pagado_por,''), v_pagado_por),
    autorizado_por  = COALESCE(NULLIF(autorizado_por,''), v_autorizado_por),
    veces_editado   = COALESCE(veces_editado,0) + 1,
    historial_ediciones = COALESCE(historial_ediciones,'[]'::jsonb) || jsonb_build_array(jsonb_build_object('fecha',NOW()::text,'razon',v_razon,'snapshot',jsonb_build_object('monto_bs',monto_bs)))
  WHERE descripcion ILIKE '%Copias Recibos%';

  -- CORPOELEC MES 08-2026  →  Bs 50.347,84
  UPDATE public.gastos_comunes SET
    monto_bs        = 50347.84,
    referencia      = COALESCE(NULLIF(referencia,''), v_ref),
    pagado_por      = COALESCE(NULLIF(pagado_por,''), v_pagado_por),
    autorizado_por  = COALESCE(NULLIF(autorizado_por,''), v_autorizado_por),
    veces_editado   = COALESCE(veces_editado,0) + 1,
    historial_ediciones = COALESCE(historial_ediciones,'[]'::jsonb) || jsonb_build_array(jsonb_build_object('fecha',NOW()::text,'razon',v_razon,'snapshot',jsonb_build_object('monto_bs',monto_bs)))
  WHERE descripcion ILIKE '%CORPOELEC%';

  -- Hidrocapital Agosto 2026  →  Bs 34.442,57
  UPDATE public.gastos_comunes SET
    monto_bs        = 34442.57,
    referencia      = COALESCE(NULLIF(referencia,''), v_ref),
    pagado_por      = COALESCE(NULLIF(pagado_por,''), v_pagado_por),
    autorizado_por  = COALESCE(NULLIF(autorizado_por,''), v_autorizado_por),
    veces_editado   = COALESCE(veces_editado,0) + 1,
    historial_ediciones = COALESCE(historial_ediciones,'[]'::jsonb) || jsonb_build_array(jsonb_build_object('fecha',NOW()::text,'razon',v_razon,'snapshot',jsonb_build_object('monto_bs',monto_bs)))
  WHERE descripcion ILIKE '%Hidrocapital%';

  -- INSTALACION DE LAMPARAS  →  Bs 26.132,05
  UPDATE public.gastos_comunes SET
    monto_bs        = 26132.05,
    referencia      = COALESCE(NULLIF(referencia,''), v_ref),
    pagado_por      = COALESCE(NULLIF(pagado_por,''), v_pagado_por),
    autorizado_por  = COALESCE(NULLIF(autorizado_por,''), v_autorizado_por),
    veces_editado   = COALESCE(veces_editado,0) + 1,
    historial_ediciones = COALESCE(historial_ediciones,'[]'::jsonb) || jsonb_build_array(jsonb_build_object('fecha',NOW()::text,'razon',v_razon,'snapshot',jsonb_build_object('monto_bs',monto_bs)))
  WHERE descripcion ILIKE '%LAMPARAS%';

  -- Arreglo de frenos Ascensor  →  Bs 14.932,60
  UPDATE public.gastos_comunes SET
    monto_bs        = 14932.60,
    referencia      = COALESCE(NULLIF(referencia,''), v_ref),
    pagado_por      = COALESCE(NULLIF(pagado_por,''), v_pagado_por),
    autorizado_por  = COALESCE(NULLIF(autorizado_por,''), v_autorizado_por),
    veces_editado   = COALESCE(veces_editado,0) + 1,
    historial_ediciones = COALESCE(historial_ediciones,'[]'::jsonb) || jsonb_build_array(jsonb_build_object('fecha',NOW()::text,'razon',v_razon,'snapshot',jsonb_build_object('monto_bs',monto_bs)))
  WHERE descripcion ILIKE '%frenos Ascensor%';

  -- Reparacion porton, graduacion y cambio de 4 Rolineras  →  Bs 46.264,20
  UPDATE public.gastos_comunes SET
    monto_bs        = 46264.20,
    referencia      = COALESCE(NULLIF(referencia,''), v_ref),
    pagado_por      = COALESCE(NULLIF(pagado_por,''), v_pagado_por),
    autorizado_por  = COALESCE(NULLIF(autorizado_por,''), v_autorizado_por),
    veces_editado   = COALESCE(veces_editado,0) + 1,
    historial_ediciones = COALESCE(historial_ediciones,'[]'::jsonb) || jsonb_build_array(jsonb_build_object('fecha',NOW()::text,'razon',v_razon,'snapshot',jsonb_build_object('monto_bs',monto_bs)))
  WHERE descripcion ILIKE '%Rolineras%' OR descripcion ILIKE '%porton%graduacion%';

  -- COMPRA 4 MICROSUIKES  →  Bs 17.600,00
  UPDATE public.gastos_comunes SET
    monto_bs        = 17600.00,
    referencia      = COALESCE(NULLIF(referencia,''), v_ref),
    pagado_por      = COALESCE(NULLIF(pagado_por,''), v_pagado_por),
    autorizado_por  = COALESCE(NULLIF(autorizado_por,''), v_autorizado_por),
    veces_editado   = COALESCE(veces_editado,0) + 1,
    historial_ediciones = COALESCE(historial_ediciones,'[]'::jsonb) || jsonb_build_array(jsonb_build_object('fecha',NOW()::text,'razon',v_razon,'snapshot',jsonb_build_object('monto_bs',monto_bs)))
  WHERE descripcion ILIKE '%MICROSUIKES%' OR descripcion ILIKE '%IODO ASCENSOR%';

  -- Compra de Materiales de Limpieza  →  Bs 7.130,00
  UPDATE public.gastos_comunes SET
    monto_bs        = 7130.00,
    referencia      = COALESCE(NULLIF(referencia,''), v_ref),
    pagado_por      = COALESCE(NULLIF(pagado_por,''), v_pagado_por),
    autorizado_por  = COALESCE(NULLIF(autorizado_por,''), v_autorizado_por),
    veces_editado   = COALESCE(veces_editado,0) + 1,
    historial_ediciones = COALESCE(historial_ediciones,'[]'::jsonb) || jsonb_build_array(jsonb_build_object('fecha',NOW()::text,'razon',v_razon,'snapshot',jsonb_build_object('monto_bs',monto_bs)))
  WHERE descripcion ILIKE '%Materiales de Limpieza%';

  -- Compra e Instalacion de Faro  →  Bs 21.277,34
  UPDATE public.gastos_comunes SET
    monto_bs        = 21277.34,
    referencia      = COALESCE(NULLIF(referencia,''), v_ref),
    pagado_por      = COALESCE(NULLIF(pagado_por,''), v_pagado_por),
    autorizado_por  = COALESCE(NULLIF(autorizado_por,''), v_autorizado_por),
    veces_editado   = COALESCE(veces_editado,0) + 1,
    historial_ediciones = COALESCE(historial_ediciones,'[]'::jsonb) || jsonb_build_array(jsonb_build_object('fecha',NOW()::text,'razon',v_razon,'snapshot',jsonb_build_object('monto_bs',monto_bs)))
  WHERE descripcion ILIKE '%Faro%estacionamiento%';

  -- Compra de Materiales para arreglo de filtraciones (azoteas)  →  Bs 64.652,65
  UPDATE public.gastos_comunes SET
    monto_bs        = 64652.65,
    referencia      = COALESCE(NULLIF(referencia,''), v_ref),
    pagado_por      = COALESCE(NULLIF(pagado_por,''), v_pagado_por),
    autorizado_por  = COALESCE(NULLIF(autorizado_por,''), v_autorizado_por),
    veces_editado   = COALESCE(veces_editado,0) + 1,
    historial_ediciones = COALESCE(historial_ediciones,'[]'::jsonb) || jsonb_build_array(jsonb_build_object('fecha',NOW()::text,'razon',v_razon,'snapshot',jsonb_build_object('monto_bs',monto_bs)))
  WHERE descripcion ILIKE '%filtraciones%azoteas%' OR descripcion ILIKE '%Cachea%';

  -- Refrigerio Señores del Aseo  →  Bs 5.300,00
  UPDATE public.gastos_comunes SET
    monto_bs        = 5300.00,
    referencia      = COALESCE(NULLIF(referencia,''), v_ref),
    pagado_por      = COALESCE(NULLIF(pagado_por,''), v_pagado_por),
    autorizado_por  = COALESCE(NULLIF(autorizado_por,''), v_autorizado_por),
    veces_editado   = COALESCE(veces_editado,0) + 1,
    historial_ediciones = COALESCE(historial_ediciones,'[]'::jsonb) || jsonb_build_array(jsonb_build_object('fecha',NOW()::text,'razon',v_razon,'snapshot',jsonb_build_object('monto_bs',monto_bs)))
  WHERE descripcion ILIKE '%Refrigerio%Aseo%';

  -- MANO DE OBRA PLATABANDA  →  Bs 76.117,02 (asegurar monto_bs aunque ya tiene info)
  UPDATE public.gastos_comunes SET
    monto_bs        = CASE WHEN COALESCE(monto_bs,0) = 0 THEN 76117.02 ELSE monto_bs END,
    referencia      = COALESCE(NULLIF(referencia,''), v_ref)
  WHERE descripcion ILIKE '%MANO DE OBRA%PLATABANDA%';

  RAISE NOTICE '✅ Patch completado — todos los gastos actualizados con monto_bs y datos de transferencia.';
END $$;

-- Verificar resultado
SELECT
  descripcion,
  monto_usd,
  monto_bs,
  referencia,
  pagado_por,
  autorizado_por,
  veces_editado
FROM public.gastos_comunes
WHERE mes_aplicacion >= '2026-08-01'
ORDER BY created_at;
