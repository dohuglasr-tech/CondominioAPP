-- ==============================================================================
-- MIGRACIÓN v13: Sincronización de Chat en Vivo y Modo Solo Lectura
-- ==============================================================================

-- 1. Actualizar tabla chat_mensajes para admitir mensajes de residentes y administradores
ALTER TABLE public.chat_mensajes ALTER COLUMN autor_id DROP NOT NULL;

ALTER TABLE public.chat_mensajes ADD COLUMN IF NOT EXISTS autor_nombre TEXT;
ALTER TABLE public.chat_mensajes ADD COLUMN IF NOT EXISTS autor_rol TEXT DEFAULT 'residente';
ALTER TABLE public.chat_mensajes ADD COLUMN IF NOT EXISTS apartamento_numero TEXT;
ALTER TABLE public.chat_mensajes ADD COLUMN IF NOT EXISTS es_admin BOOLEAN DEFAULT false;
ALTER TABLE public.chat_mensajes ADD COLUMN IF NOT EXISTS es_anuncio BOOLEAN DEFAULT false;

-- 2. Políticas RLS permisivas para chat_mensajes (sincronización total residente <-> admin)
ALTER TABLE public.chat_mensajes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_mensajes_select" ON public.chat_mensajes;
DROP POLICY IF EXISTS "chat_mensajes_insert" ON public.chat_mensajes;
DROP POLICY IF EXISTS "chat_mensajes_update" ON public.chat_mensajes;
DROP POLICY IF EXISTS "chat_mensajes_delete" ON public.chat_mensajes;
DROP POLICY IF EXISTS "Permitir select para todos" ON public.chat_mensajes;
DROP POLICY IF EXISTS "Permitir insert para todos" ON public.chat_mensajes;
DROP POLICY IF EXISTS "SELECT libre chat_mensajes" ON public.chat_mensajes;
DROP POLICY IF EXISTS "INSERT libre chat_mensajes" ON public.chat_mensajes;
DROP POLICY IF EXISTS "UPDATE libre chat_mensajes" ON public.chat_mensajes;
DROP POLICY IF EXISTS "DELETE libre chat_mensajes" ON public.chat_mensajes;

CREATE POLICY "SELECT libre chat_mensajes" ON public.chat_mensajes FOR SELECT USING (true);
CREATE POLICY "INSERT libre chat_mensajes" ON public.chat_mensajes FOR INSERT WITH CHECK (true);
CREATE POLICY "UPDATE libre chat_mensajes" ON public.chat_mensajes FOR UPDATE USING (true);
CREATE POLICY "DELETE libre chat_mensajes" ON public.chat_mensajes FOR DELETE USING (true);

GRANT ALL ON public.chat_mensajes TO anon, authenticated, service_role;

-- 3. Habilitar Replica Identity para que Realtime envíe los registros completos
ALTER TABLE public.chat_mensajes REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_mensajes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_mensajes;
  END IF;
END $$;

-- 4. Agregar columnas para Modo Solo Lectura en configuracion_edificio
ALTER TABLE public.configuracion_edificio ADD COLUMN IF NOT EXISTS chat_solo_lectura BOOLEAN DEFAULT false;
ALTER TABLE public.configuracion_edificio ADD COLUMN IF NOT EXISTS chat_motivo_bloqueo TEXT DEFAULT 'Modo solo lectura activado por la administración para mantener la sana convivencia.';
ALTER TABLE public.configuracion_edificio ADD COLUMN IF NOT EXISTS chat_bloqueado_en TIMESTAMPTZ;
ALTER TABLE public.configuracion_edificio ADD COLUMN IF NOT EXISTS chat_bloqueado_por TEXT DEFAULT 'Administración';

-- Asegurar permisos en configuracion_edificio
ALTER TABLE public.configuracion_edificio ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "configuracion_edificio_all" ON public.configuracion_edificio;
DROP POLICY IF EXISTS "Permitir todo en configuracion_edificio" ON public.configuracion_edificio;
CREATE POLICY "Permitir todo en configuracion_edificio" ON public.configuracion_edificio FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.configuracion_edificio TO anon, authenticated, service_role;

ALTER TABLE public.configuracion_edificio REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'configuracion_edificio'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.configuracion_edificio;
  END IF;
END $$;
