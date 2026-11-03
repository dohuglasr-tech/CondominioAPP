-- Migration: 20261103000001_locales.sql
-- Gestión de Locales Comerciales y Espacios Exclusivos del Condominio
-- La deuda de cada local pertenece al apartamento asignado por el administrador.

CREATE TABLE IF NOT EXISTS public.locales (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre                  TEXT NOT NULL,
  codigo                  TEXT,
  descripcion             TEXT,
  arrendatario_nombre     TEXT NOT NULL,
  arrendatario_cedula     TEXT,
  arrendatario_telefono   TEXT,
  arrendatario_email      TEXT,
  tipo_cuota             TEXT DEFAULT 'fija', -- 'fija' o 'variable'
  monto_usd               NUMERIC(12,2) DEFAULT 0,
  monto_bs                NUMERIC(16,2) DEFAULT 0,
  inicio_contrato         DATE NOT NULL DEFAULT CURRENT_DATE,
  fin_contrato            DATE,
  apartamento_id          UUID REFERENCES public.apartamentos(id) ON DELETE SET NULL,
  apartamento_numero      TEXT,
  estado                  TEXT DEFAULT 'activo', -- 'activo', 'inactivo', 'en_mantenimiento'
  deuda_actual_usd        NUMERIC(12,2) DEFAULT 0,
  deuda_actual_bs         NUMERIC(16,2) DEFAULT 0,
  deposito_garantia_usd   NUMERIC(12,2) DEFAULT 0,
  notas_admin             TEXT,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Políticas RLS abiertas para consistencia del sistema
ALTER TABLE public.locales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "policy_locales_select" ON public.locales;
DROP POLICY IF EXISTS "policy_locales_insert" ON public.locales;
DROP POLICY IF EXISTS "policy_locales_update" ON public.locales;
DROP POLICY IF EXISTS "policy_locales_delete" ON public.locales;

CREATE POLICY "policy_locales_select" ON public.locales FOR SELECT USING (true);
CREATE POLICY "policy_locales_insert" ON public.locales FOR INSERT WITH CHECK (true);
CREATE POLICY "policy_locales_update" ON public.locales FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "policy_locales_delete" ON public.locales FOR DELETE USING (true);

-- Agregar a Realtime
ALTER TABLE public.locales REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'locales'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.locales;
  END IF;
END $$;

