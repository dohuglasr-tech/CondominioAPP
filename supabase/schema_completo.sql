-- ==============================================================================
-- SCHEMA COMPLETO Y CONSOLIDADO — CONDOMINIO APP (RESIDENCIAS OCUTUY 5)
-- ==============================================================================
-- Este archivo agrupa todas las tablas, relaciones, políticas RLS, triggers de
-- auditoría inmutable, suscripciones Realtime y permisos en un único script maestro.
-- Puede ejecutarse de forma segura en: Supabase > SQL Editor > Run
-- ==============================================================================

-- ────────────────────────────────────────────────────────────
-- 0. EXTENSIONES
-- ────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ────────────────────────────────────────────────────────────
-- 1. TABLA: configuracion_edificio
--    Parámetros globales del condominio, datos bancarios y controles.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.configuracion_edificio (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_edificio          TEXT NOT NULL DEFAULT 'Residencias Ocutuy 5',
  rif                      TEXT DEFAULT 'J-296749485',
  direccion                TEXT DEFAULT 'Urbanización Casa Blanca, Residencias Ocutuy 5',
  telefono                 TEXT,
  email_contacto           TEXT DEFAULT 'juntacondominioocutuy5@gmail.com',
  banco                    TEXT DEFAULT 'Banco Bicentenario',
  cuenta_bancaria          TEXT DEFAULT '0175-0525-4100-7575-1351',
  titular_cuenta           TEXT DEFAULT 'Zoraya Almeida',
  tasa_bcv_actual          NUMERIC(12,4) DEFAULT 40.00,
  logo_url                 TEXT,
  chat_solo_lectura        BOOLEAN DEFAULT false,
  chat_motivo_bloqueo      TEXT DEFAULT 'Modo solo lectura activado por la administración para mantener la sana convivencia.',
  chat_bloqueado_en        TIMESTAMPTZ,
  chat_bloqueado_por       TEXT DEFAULT 'Administración',
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- 2. TABLA: apartamentos
--    Catálogo oficial de los 62 apartamentos del edificio.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.apartamentos (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero                   TEXT NOT NULL UNIQUE,
  piso                     INTEGER,
  alicuota                 NUMERIC(8,6) NOT NULL DEFAULT 0.0159,
  metros_cuadrados         NUMERIC(10,2),
  propietario_nombre       TEXT,
  propietario_cedula       TEXT,
  telefono_contacto        TEXT,
  estado                   TEXT DEFAULT 'solvente', -- 'solvente', 'moroso', 'en_proceso'
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- 3. TABLA: perfiles
--    Perfiles de usuarios residentes y administradores.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.perfiles (
  id                       UUID PRIMARY KEY, -- vincula a auth.users.id
  apartamento_id           UUID REFERENCES public.apartamentos(id) ON DELETE SET NULL,
  nombre_completo          TEXT NOT NULL,
  email                    TEXT,
  telefono                 TEXT,
  cedula                   TEXT,
  rol                      TEXT NOT NULL DEFAULT 'residente', -- 'admin', 'residente'
  condicion_habitacional   TEXT DEFAULT 'propio', -- 'propio', 'alquilado', 'familiar'
  carga_familiar           INTEGER DEFAULT 1,
  propietario_nombre       TEXT,
  propietario_cedula       TEXT,
  propietario_telefono     TEXT,
  propietario_email        TEXT,
  perfil_completo          BOOLEAN DEFAULT false,
  avatar_url               TEXT,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- 4. TABLA: gastos_comunes
--    Egresos del condominio para prorrateo mensual.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gastos_comunes (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  descripcion              TEXT NOT NULL,
  categoria                TEXT NOT NULL DEFAULT 'general',
  tipo                     TEXT NOT NULL DEFAULT 'ordinario', -- 'ordinario', 'extraordinario'
  monto_usd                NUMERIC(12,2) NOT NULL DEFAULT 0,
  monto_bs                 NUMERIC(16,2) DEFAULT 0,
  mes_aplicacion           DATE NOT NULL,
  fecha_pago               DATE DEFAULT CURRENT_DATE,
  referencia               TEXT,
  pagado_por               TEXT,
  autorizado_por           TEXT,
  notas                    TEXT,
  veces_editado            INTEGER NOT NULL DEFAULT 0,
  historial_ediciones      JSONB NOT NULL DEFAULT '[]',
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- 5. TABLA: cargos_especiales
--    Cargos individuales por apartamento (multas, acuerdos, etc.)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cargos_especiales (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apartamento_id           UUID NOT NULL REFERENCES public.apartamentos(id) ON DELETE CASCADE,
  tipo                     TEXT NOT NULL DEFAULT 'multa', -- 'multa', 'deuda_atrasada', 'cuota_extraordinaria', 'acuerdo_pago'
  descripcion              TEXT NOT NULL,
  monto_usd                NUMERIC(12,2) NOT NULL DEFAULT 0,
  monto_bs                 NUMERIC(16,2) DEFAULT 0,
  mes_aplicacion           DATE NOT NULL,
  aplicado                 BOOLEAN DEFAULT false,
  created_at               TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- 6. TABLA: recibos_generados
--    Emisión mensual de recibos de condominio por apartamento.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.recibos_generados (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apartamento_id           UUID NOT NULL REFERENCES public.apartamentos(id) ON DELETE CASCADE,
  mes_facturado            DATE NOT NULL,
  tasa_bcv                 NUMERIC(12,4) NOT NULL,
  total_gastos_usd         NUMERIC(12,2) NOT NULL DEFAULT 0,
  alicuota                 NUMERIC(8,6)  NOT NULL DEFAULT 0,
  subtotal_usd             NUMERIC(12,2) NOT NULL DEFAULT 0,
  fondo_reserva_pct        NUMERIC(5,2)  NOT NULL DEFAULT 10,
  fondo_reserva_usd        NUMERIC(12,2) NOT NULL DEFAULT 0,
  cargos_extra_usd         NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_usd                NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_bs                 NUMERIC(16,2) NOT NULL DEFAULT 0,
  estado                   TEXT NOT NULL DEFAULT 'pendiente', -- 'pendiente', 'pagado', 'anulado'
  data_json                JSONB,
  emitido_at               TIMESTAMPTZ DEFAULT NOW(),
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_recibo_apto_mes UNIQUE (apartamento_id, mes_facturado)
);

-- ────────────────────────────────────────────────────────────
-- 7. TABLA: pagos_reportados
--    Pagos cargados por los residentes para conciliación.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pagos_reportados (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apartamento_id           UUID REFERENCES public.apartamentos(id) ON DELETE CASCADE,
  monto_usd                NUMERIC(12,2),
  monto_bs                 NUMERIC(16,2) NOT NULL DEFAULT 0,
  tasa_bcv                 NUMERIC(12,4),
  metodo_pago              TEXT DEFAULT 'transferencia', -- 'transferencia', 'pago_movil', 'efectivo_usd', 'zelle'
  referencia               TEXT NOT NULL,
  banco_origen             TEXT,
  banco_destino            TEXT,
  fecha_pago               DATE DEFAULT CURRENT_DATE,
  fecha_revision           TIMESTAMPTZ,
  comprobante_url          TEXT,
  estado                   TEXT NOT NULL DEFAULT 'pendiente', -- 'pendiente', 'aprobado', 'rechazado'
  notas_admin              TEXT,
  notas_residente          TEXT,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- 8. TABLA: casos_comunidad
--    Gestión de acuerdos de pago, multas, locales e ingresos.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.casos_comunidad (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apartamento_id           UUID REFERENCES public.apartamentos(id) ON DELETE SET NULL,
  tipo                     TEXT NOT NULL, -- 'multa', 'acuerdo_pago', 'alquiler_local', 'asignacion', 'ingreso_externo'
  titulo                   TEXT NOT NULL,
  descripcion              TEXT,
  monto_usd                NUMERIC(12,2) DEFAULT 0,
  monto_bs                 NUMERIC(16,2) DEFAULT 0,
  moneda                   TEXT DEFAULT 'USD', -- 'USD', 'BS', 'MIXTO'
  estado                   TEXT DEFAULT 'abierto', -- 'abierto', 'en_proceso', 'resuelto', 'cancelado'
  involucrado_nombre       TEXT,
  involucrado_contacto     TEXT,
  fecha                    DATE DEFAULT CURRENT_DATE,
  fecha_vencimiento        DATE,
  comprobante_url          TEXT,
  notas_admin              TEXT,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- 9. TABLA: deudas_mora
--    Control de mora y deudores (Azul <1m, Amarillo 3m, Rojo 4-6m, Morado >6m).
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.deudas_mora (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apartamento_id           UUID NOT NULL REFERENCES public.apartamentos(id) ON DELETE CASCADE,
  meses_deuda              INTEGER NOT NULL DEFAULT 1,
  monto_usd                NUMERIC(12,2) DEFAULT 0,
  monto_bs                 NUMERIC(16,2) DEFAULT 0,
  moneda_principal         TEXT DEFAULT 'USD', -- 'USD', 'BS', 'MIXTO'
  tasa_riesgo              TEXT NOT NULL DEFAULT 'azul', -- 'azul', 'amarillo', 'rojo', 'morado'
  accion_legal             TEXT DEFAULT 'notificacion_amistosa',
  estado                   TEXT DEFAULT 'activo', -- 'activo', 'en_convenio', 'solventado'
  conceptos_detalle        TEXT,
  observaciones            TEXT,
  fecha_corte              DATE DEFAULT CURRENT_DATE,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_apartamento_mora UNIQUE (apartamento_id),
  CONSTRAINT deudas_mora_tasa_riesgo_check CHECK (tasa_riesgo IN ('azul', 'amarillo', 'rojo', 'morado'))
);

-- ────────────────────────────────────────────────────────────
-- 10. TABLA: junta_condominio
--     Organigrama directivo y operativo del edificio.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.junta_condominio (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre                   TEXT NOT NULL,
  cargo                    TEXT NOT NULL,
  categoria                TEXT NOT NULL DEFAULT 'administracion', -- 'administracion', 'junta_directiva', 'comite_vocal', 'operativo'
  telefono                 TEXT,
  email                    TEXT,
  apartamento              TEXT,
  descripcion_rol          TEXT,
  horario_atencion         TEXT,
  orden                    INTEGER DEFAULT 1,
  avatar_url               TEXT,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- 11. TABLA: chat_mensajes
--     Chat comunitario en vivo con sincronización y modo solo lectura.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_mensajes (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  autor_id                 UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  autor_nombre             TEXT,
  autor_rol                TEXT DEFAULT 'residente',
  apartamento_numero       TEXT,
  mensaje                  TEXT NOT NULL,
  es_admin                 BOOLEAN DEFAULT false,
  es_anuncio               BOOLEAN DEFAULT false,
  created_at               TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- 12. TABLA: historial_auditoria (INMUTABLE - ARQUEO)
--     Bitácora de arqueo de recibos eliminados, deudas condonadas y cambios.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.historial_auditoria (
  id                       TEXT PRIMARY KEY,
  fecha                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tipo_accion              TEXT NOT NULL, -- 'ELIMINACION_EMISION', 'ELIMINACION_RECIBO', 'EDICION_DEUDA', 'CONDONACION_DEUDA', 'CAMBIO_CONFIGURACION'
  titulo                   TEXT NOT NULL,
  descripcion              TEXT NOT NULL,
  apartamento_numero       TEXT,
  apartamento_id           UUID,
  mes_afectado             TEXT,
  monto_usd                NUMERIC(12,2),
  monto_bs                 NUMERIC(16,2),
  motivo                   TEXT NOT NULL,
  autor_nombre             TEXT NOT NULL DEFAULT 'Administrador',
  autor_email              TEXT,
  datos_anteriores         JSONB,
  datos_nuevos             JSONB,
  ip_origen                TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger de Inmutabilidad Estricta
CREATE OR REPLACE FUNCTION public.prevenir_modificacion_auditoria()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'EL HISTORIAL DE AUDITORÍA ES INMUTABLE Y ESTÁ BLINDADO. NO SE PERMITE MODIFICAR NI ELIMINAR REGISTROS DE ARQUEO.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_proteger_auditoria ON public.historial_auditoria;
CREATE TRIGGER trg_proteger_auditoria
BEFORE UPDATE OR DELETE ON public.historial_auditoria
FOR EACH ROW EXECUTE FUNCTION public.prevenir_modificacion_auditoria();

-- ────────────────────────────────────────────────────────────
-- 13. TABLAS COMUNITARIAS ADICIONALES
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.incidencias (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apartamento_id           UUID REFERENCES public.apartamentos(id) ON DELETE SET NULL,
  titulo                   TEXT NOT NULL,
  descripcion              TEXT NOT NULL,
  categoria                TEXT DEFAULT 'general',
  estado                   TEXT DEFAULT 'abierta', -- 'abierta', 'en_proceso', 'resuelta'
  prioridad                TEXT DEFAULT 'media',
  foto_url                 TEXT,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.propuestas (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  autor_id                 UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  titulo                   TEXT NOT NULL,
  descripcion              TEXT NOT NULL,
  estado                   TEXT DEFAULT 'activa', -- 'activa', 'aprobada', 'rechazada', 'cerrada'
  votos_favor              INTEGER DEFAULT 0,
  votos_contra             INTEGER DEFAULT 0,
  fecha_cierre             TIMESTAMPTZ,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.votos_propuestas (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  propuesta_id             UUID NOT NULL REFERENCES public.propuestas(id) ON DELETE CASCADE,
  apartamento_id           UUID NOT NULL REFERENCES public.apartamentos(id) ON DELETE CASCADE,
  usuario_id               UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  voto                     TEXT NOT NULL, -- 'favor', 'contra'
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_apto_voto UNIQUE (propuesta_id, apartamento_id)
);

CREATE TABLE IF NOT EXISTS public.propuestas_apoyos (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  propuesta_id             UUID NOT NULL REFERENCES public.propuestas(id) ON DELETE CASCADE,
  usuario_id               UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_apoyo UNIQUE (propuesta_id, usuario_id)
);

CREATE TABLE IF NOT EXISTS public.propuestas_comentarios (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  propuesta_id             UUID NOT NULL REFERENCES public.propuestas(id) ON DELETE CASCADE,
  autor_id                 UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  contenido                TEXT NOT NULL,
  created_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.boveda_legal (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apartamento_id           UUID NOT NULL REFERENCES public.apartamentos(id) ON DELETE CASCADE,
  propietario_id           UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  nombre_archivo           TEXT NOT NULL,
  tipo_documento           TEXT NOT NULL,
  archivo_url              TEXT NOT NULL,
  tamano_bytes             BIGINT,
  verified                 BOOLEAN DEFAULT false,
  created_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.visitantes (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apartamento_id           UUID NOT NULL REFERENCES public.apartamentos(id) ON DELETE CASCADE,
  nombre                   TEXT NOT NULL,
  cedula                   TEXT,
  placa_vehiculo           TEXT,
  fecha_ingreso            TIMESTAMPTZ DEFAULT NOW(),
  fecha_salida             TIMESTAMPTZ,
  notas                    TEXT,
  created_at               TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- 13.1 ÍNDICES DE RENDIMIENTO Y OPTIMIZACIÓN
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_recibos_apto_estado ON public.recibos_generados (apartamento_id, estado);
CREATE INDEX IF NOT EXISTS idx_recibos_mes_facturado ON public.recibos_generados (mes_facturado DESC);
CREATE INDEX IF NOT EXISTS idx_recibos_estado ON public.recibos_generados (estado) WHERE estado = 'pendiente';

CREATE INDEX IF NOT EXISTS idx_pagos_apto_estado ON public.pagos_reportados (apartamento_id, estado);
CREATE INDEX IF NOT EXISTS idx_pagos_created_at ON public.pagos_reportados (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pagos_estado ON public.pagos_reportados (estado) WHERE estado = 'pendiente';
CREATE INDEX IF NOT EXISTS idx_pagos_reportado_por ON public.pagos_reportados (reportado_por);

CREATE INDEX IF NOT EXISTS idx_gastos_mes_aplicacion ON public.gastos_comunes (mes_aplicacion DESC);
CREATE INDEX IF NOT EXISTS idx_gastos_created_at ON public.gastos_comunes (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_perfiles_apartamento_id ON public.perfiles (apartamento_id);
CREATE INDEX IF NOT EXISTS idx_perfiles_rol ON public.perfiles (rol);
CREATE INDEX IF NOT EXISTS idx_perfiles_email ON public.perfiles (email);
CREATE INDEX IF NOT EXISTS idx_perfiles_propietario_email ON public.perfiles (propietario_email);

CREATE INDEX IF NOT EXISTS idx_apartamentos_piso ON public.apartamentos (piso);
CREATE INDEX IF NOT EXISTS idx_apartamentos_estado ON public.apartamentos (estado);

CREATE INDEX IF NOT EXISTS idx_deudas_mora_tasa_riesgo ON public.deudas_mora (tasa_riesgo, estado);
CREATE INDEX IF NOT EXISTS idx_cargos_mes_aplicado ON public.cargos_especiales (mes_aplicacion, aplicado);
CREATE INDEX IF NOT EXISTS idx_cargos_apartamento_id ON public.cargos_especiales (apartamento_id);

CREATE INDEX IF NOT EXISTS idx_auditoria_apto_accion ON public.historial_auditoria (apartamento_id, tipo_accion);
CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON public.historial_auditoria (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_chat_created_at ON public.chat_mensajes (created_at DESC);

-- Procedimiento atómico de conciliación de pagos
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
  SELECT * INTO v_pago FROM public.pagos_reportados WHERE id = p_pago_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'El pago especificado no existe.');
  END IF;

  v_apto_id := v_pago.apartamento_id;
  IF v_apto_id IS NULL AND v_pago.reportado_por IS NOT NULL THEN
    SELECT apartamento_id INTO v_apto_id FROM public.perfiles WHERE id = v_pago.reportado_por;
  END IF;

  v_notas_final := COALESCE(v_pago.notas_admin, '');
  IF p_notas_admin IS NOT NULL AND TRIM(p_notas_admin) <> '' THEN
    IF v_notas_final <> '' THEN
      v_notas_final := v_notas_final || ' | Nota Admin: ' || TRIM(p_notas_admin);
    ELSE
      v_notas_final := 'Nota Admin: ' || TRIM(p_notas_admin);
    END IF;
  END IF;

  UPDATE public.pagos_reportados
  SET estado = 'aprobado', notas_admin = v_notas_final, fecha_revision = NOW(), updated_at = NOW()
  WHERE id = p_pago_id;

  IF v_apto_id IS NOT NULL THEN
    UPDATE public.recibos_generados SET estado = 'pagado' WHERE apartamento_id = v_apto_id AND estado = 'pendiente';
    UPDATE public.deudas_mora SET estado = 'solventado', updated_at = NOW() WHERE apartamento_id = v_apto_id AND estado = 'activo';
  END IF;

  RETURN jsonb_build_object('success', true, 'pago_id', p_pago_id, 'apartamento_id', v_apto_id, 'estado', 'aprobado');
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.aprobar_pago_transaccional(UUID, TEXT) TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────
-- 14. HABILITACIÓN DE ROW LEVEL SECURITY (RLS) Y POLÍTICAS
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
  tablas text[] := ARRAY[
    'configuracion_edificio', 'apartamentos', 'perfiles', 'gastos_comunes',
    'cargos_especiales', 'recibos_generados', 'pagos_reportados', 'casos_comunidad',
    'deudas_mora', 'junta_condominio', 'chat_mensajes', 'incidencias',
    'propuestas', 'votos_propuestas', 'propuestas_apoyos', 'propuestas_comentarios',
    'boveda_legal', 'visitantes'
  ];
BEGIN
  FOREACH t IN ARRAY tablas LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS "policy_select_%s" ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "policy_insert_%s" ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "policy_update_%s" ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "policy_delete_%s" ON public.%I;', t, t);
    EXECUTE format('CREATE POLICY "policy_select_%s" ON public.%I FOR SELECT USING (true);', t, t);
    EXECUTE format('CREATE POLICY "policy_insert_%s" ON public.%I FOR INSERT WITH CHECK (true);', t, t);
    EXECUTE format('CREATE POLICY "policy_update_%s" ON public.%I FOR UPDATE USING (true) WITH CHECK (true);', t, t);
    EXECUTE format('CREATE POLICY "policy_delete_%s" ON public.%I FOR DELETE USING (true);', t, t);
  END LOOP;
END $$;

-- Políticas específicas para historial_auditoria (Solo SELECT e INSERT)
ALTER TABLE public.historial_auditoria ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "historial_auditoria_select" ON public.historial_auditoria;
DROP POLICY IF EXISTS "historial_auditoria_insert" ON public.historial_auditoria;
CREATE POLICY "historial_auditoria_select" ON public.historial_auditoria FOR SELECT USING (true);
CREATE POLICY "historial_auditoria_insert" ON public.historial_auditoria FOR INSERT WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- 15. CONCESIÓN DE PERMISOS (GRANTS)
-- ────────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

-- ────────────────────────────────────────────────────────────
-- 16. SUPABASE REALTIME (PUBLICACIÓN)
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
  tablas_realtime text[] := ARRAY[
    'chat_mensajes', 'pagos_reportados', 'recibos_generados',
    'gastos_comunes', 'deudas_mora', 'casos_comunidad',
    'junta_condominio', 'historial_auditoria', 'incidencias',
    'propuestas', 'configuracion_edificio'
  ];
BEGIN
  FOREACH t IN ARRAY tablas_realtime LOOP
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL;', t);
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I;', t);
    END IF;
  END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────
-- 17. STORAGE BUCKETS Y ACCESO PÚBLICO
-- ────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('edificio-assets', 'edificio-assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

INSERT INTO storage.buckets (id, name, public)
VALUES ('pagos', 'pagos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Lectura pública edificio-assets" ON storage.objects;
DROP POLICY IF EXISTS "Subida libre edificio-assets" ON storage.objects;
DROP POLICY IF EXISTS "Update libre edificio-assets" ON storage.objects;
DROP POLICY IF EXISTS "Lectura pública pagos" ON storage.objects;
DROP POLICY IF EXISTS "Subida libre pagos" ON storage.objects;

CREATE POLICY "Lectura pública edificio-assets" ON storage.objects FOR SELECT USING (bucket_id = 'edificio-assets');
CREATE POLICY "Subida libre edificio-assets" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'edificio-assets');
CREATE POLICY "Update libre edificio-assets" ON storage.objects FOR UPDATE USING (bucket_id = 'edificio-assets');

CREATE POLICY "Lectura pública pagos" ON storage.objects FOR SELECT USING (bucket_id = 'pagos');
CREATE POLICY "Subida libre pagos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'pagos');

-- ────────────────────────────────────────────────────────────
-- 18. DATOS INICIALES (SEED DATA)
-- ────────────────────────────────────────────────────────────
-- Configuración básica del edificio
INSERT INTO public.configuracion_edificio (
  nombre_edificio, rif, direccion, email_contacto, banco, cuenta_bancaria, titular_cuenta, tasa_bcv_actual
)
SELECT 'Residencias Ocutuy 5', 'J-296749485', 'Urbanización Casa Blanca, Residencias Ocutuy 5', 'juntacondominioocutuy5@gmail.com', 'Banco Bicentenario', '0175-0525-4100-7575-1351', 'Zoraya Almeida', 40.00
WHERE NOT EXISTS (SELECT 1 FROM public.configuracion_edificio);

-- Junta de Condominio
INSERT INTO public.junta_condominio (nombre, cargo, categoria, telefono, email, apartamento, descripcion_rol, horario_atencion, orden)
SELECT 'Dohuglas Guevara', 'Administrador General', 'administracion', '0414-1234567', 'administracion@torre5.com', 'Oficina PB', 'Gestión administrativa, cobranza, emisión de recibos y contrataciones', 'Lunes a Viernes 8:00 AM - 5:00 PM', 1
WHERE NOT EXISTS (SELECT 1 FROM public.junta_condominio WHERE cargo = 'Administrador General');

INSERT INTO public.junta_condominio (nombre, cargo, categoria, telefono, email, apartamento, descripcion_rol, horario_atencion, orden)
SELECT 'Carlos Eduardo Mendoza', 'Presidente de la Junta', 'junta_directiva', '0424-9876543', 'presidencia@torre5.com', 'Apto 521', 'Representación legal de la comunidad y supervisión de proyectos', 'Previa cita / Reuniones de Junta', 2
WHERE NOT EXISTS (SELECT 1 FROM public.junta_condominio WHERE cargo = 'Presidente de la Junta');

INSERT INTO public.junta_condominio (nombre, cargo, categoria, telefono, email, apartamento, descripcion_rol, horario_atencion, orden)
SELECT 'Mariana Castillo', 'Tesorera', 'junta_directiva', '0412-5554321', 'tesoreria@torre5.com', 'Apto 510', 'Control presupuestario, revisión de cuentas y auditoría de egresos', 'Lunes a Jueves 4:00 PM - 6:00 PM', 3
WHERE NOT EXISTS (SELECT 1 FROM public.junta_condominio WHERE cargo = 'Tesorera');

INSERT INTO public.junta_condominio (nombre, cargo, categoria, telefono, email, apartamento, descripcion_rol, horario_atencion, orden)
SELECT 'Roberto Villasmil', 'Secretario', 'junta_directiva', '0416-3332211', 'secretaria@torre5.com', 'Apto 506', 'Redacción de actas de asamblea, citaciones y archivo documental', 'Horario de oficina', 4
WHERE NOT EXISTS (SELECT 1 FROM public.junta_condominio WHERE cargo = 'Secretario');
