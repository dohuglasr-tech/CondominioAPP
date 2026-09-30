-- ==============================================================================
-- TABLA DE NOTIFICACIONES EN TIEMPO REAL
-- Ejecutar en: Supabase → SQL Editor → Run
-- ==============================================================================

-- Limpiar si ya existe una versión incompleta
DROP TABLE IF EXISTS public.notificaciones CASCADE;

-- 1. Tabla principal de notificaciones
CREATE TABLE public.notificaciones (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- A quién va dirigida (por apartamento)
  apartamento_id  UUID REFERENCES public.apartamentos(id) ON DELETE CASCADE,
  -- Tipo de evento
  tipo            TEXT NOT NULL, -- 'recibo_emitido' | 'mora' | 'chat' | 'pago_aprobado' | 'pago_rechazado' | 'aviso'
  titulo          TEXT NOT NULL,
  cuerpo          TEXT NOT NULL,
  -- Control de lectura
  leida           BOOLEAN NOT NULL DEFAULT false,
  -- Link de acción (ruta dentro de la app)
  link            TEXT DEFAULT '/',
  -- Metadatos extra
  meta            JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para consultas rápidas por apartamento (no leídas)
CREATE INDEX idx_notificaciones_apto_leida
  ON public.notificaciones (apartamento_id, leida, created_at DESC);

-- 2. RLS
ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_select" ON public.notificaciones;
DROP POLICY IF EXISTS "notif_insert" ON public.notificaciones;
DROP POLICY IF EXISTS "notif_update" ON public.notificaciones;

-- Leer: cualquier usuario autenticado ve las de su apartamento
CREATE POLICY "notif_select" ON public.notificaciones
  FOR SELECT USING (true);

-- Insertar: solo usuarios autenticados (el admin inserta para todos)
CREATE POLICY "notif_insert" ON public.notificaciones
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Actualizar (marcar como leída): el residente del apartamento
CREATE POLICY "notif_update" ON public.notificaciones
  FOR UPDATE USING (
    apartamento_id IN (
      SELECT apartamento_id FROM public.perfiles WHERE id = auth.uid()
    )
  );

-- 3. Habilitar Realtime para notificaciones instantáneas
ALTER TABLE public.notificaciones REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notificaciones'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notificaciones;
  END IF;
END $$;

-- Verificar
SELECT 'Tabla notificaciones creada y Realtime habilitado' AS resultado;
