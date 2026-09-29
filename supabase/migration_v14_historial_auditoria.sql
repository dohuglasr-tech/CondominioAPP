-- ==============================================================================
-- MIGRACIÓN v14: Historial de Auditoría y Arqueo Inmutable (Solo Lectura)
-- ==============================================================================

-- 1. Crear tabla de historial_auditoria
CREATE TABLE IF NOT EXISTS public.historial_auditoria (
  id                  TEXT PRIMARY KEY,
  fecha               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tipo_accion         TEXT NOT NULL,
  titulo              TEXT NOT NULL,
  descripcion         TEXT NOT NULL,
  apartamento_numero  TEXT,
  apartamento_id      UUID,
  mes_afectado        TEXT,
  monto_usd           NUMERIC(12,2),
  monto_bs            NUMERIC(16,2),
  motivo              TEXT NOT NULL,
  autor_nombre        TEXT NOT NULL DEFAULT 'Administrador',
  autor_email         TEXT,
  datos_anteriores    JSONB,
  datos_nuevos        JSONB,
  ip_origen           TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Habilitar Seguridad por Filas (RLS)
ALTER TABLE public.historial_auditoria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "historial_auditoria_select" ON public.historial_auditoria;
DROP POLICY IF EXISTS "historial_auditoria_insert" ON public.historial_auditoria;
DROP POLICY IF EXISTS "historial_auditoria_update" ON public.historial_auditoria;
DROP POLICY IF EXISTS "historial_auditoria_delete" ON public.historial_auditoria;

-- Permitir lectura pública o autenticada para arqueo y auditoría
CREATE POLICY "historial_auditoria_select" ON public.historial_auditoria 
  FOR SELECT USING (true);

-- Permitir inserción de eventos de auditoría
CREATE POLICY "historial_auditoria_insert" ON public.historial_auditoria 
  FOR INSERT WITH CHECK (true);

-- Otorgar permisos
GRANT SELECT, INSERT ON public.historial_auditoria TO anon, authenticated, service_role;

-- 3. REGLA INMUTABLE: Función y trigger que impide UPDATE y DELETE
CREATE OR REPLACE FUNCTION public.prevenir_modificacion_auditoria()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'EL HISTORIAL DE AUDITORÍA ES INMUTABLE Y ESTÁ PROTEGIDO. NO SE PERMITE MODIFICAR NI ELIMINAR NINGÚN REGISTRO DE ARQUEO.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_proteger_auditoria ON public.historial_auditoria;
CREATE TRIGGER trg_proteger_auditoria
BEFORE UPDATE OR DELETE ON public.historial_auditoria
FOR EACH ROW EXECUTE FUNCTION public.prevenir_modificacion_auditoria();

-- 4. Habilitar Replica Identity para suscripciones en tiempo real
ALTER TABLE public.historial_auditoria REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'historial_auditoria'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.historial_auditoria;
  END IF;
END $$;
