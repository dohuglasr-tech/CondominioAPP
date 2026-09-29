-- ==============================================================================
-- MIGRACIÓN V12: Organigrama y Junta de Condominio
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.junta_condominio (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre              TEXT NOT NULL,
  cargo               TEXT NOT NULL,
  categoria           TEXT NOT NULL DEFAULT 'administracion', -- 'administracion', 'junta_directiva', 'comite_vocal', 'operativo'
  telefono            TEXT,
  email               TEXT,
  apartamento         TEXT,
  descripcion_rol     TEXT,
  horario_atencion    TEXT,
  orden               INTEGER DEFAULT 1,
  avatar_url          TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.junta_condominio ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "SELECT libre junta_condominio" ON public.junta_condominio;
DROP POLICY IF EXISTS "INSERT libre junta_condominio" ON public.junta_condominio;
DROP POLICY IF EXISTS "UPDATE libre junta_condominio" ON public.junta_condominio;
DROP POLICY IF EXISTS "DELETE libre junta_condominio" ON public.junta_condominio;

CREATE POLICY "SELECT libre junta_condominio" ON public.junta_condominio FOR SELECT USING (true);
CREATE POLICY "INSERT libre junta_condominio" ON public.junta_condominio FOR INSERT WITH CHECK (true);
CREATE POLICY "UPDATE libre junta_condominio" ON public.junta_condominio FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "DELETE libre junta_condominio" ON public.junta_condominio FOR DELETE USING (true);

-- Permisos y Realtime
GRANT ALL ON public.junta_condominio TO anon, authenticated, service_role;
ALTER TABLE public.junta_condominio REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'junta_condominio') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.junta_condominio;
  END IF;
END $$;

-- Datos iniciales representativos (Seed)
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

INSERT INTO public.junta_condominio (nombre, cargo, categoria, telefono, email, apartamento, descripcion_rol, horario_atencion, orden)
SELECT 'Ing. Fernando Páez', 'Vocal Principal de Mantenimiento', 'comite_vocal', '0414-7778899', 'mantenimiento@torre5.com', 'Apto 515', 'Inspección técnica de ascensores, bombas hidroneumáticas y áreas comunes', 'Atención de emergencias técnicas', 5
WHERE NOT EXISTS (SELECT 1 FROM public.junta_condominio WHERE cargo = 'Vocal Principal de Mantenimiento');

INSERT INTO public.junta_condominio (nombre, cargo, categoria, telefono, email, apartamento, descripcion_rol, horario_atencion, orden)
SELECT 'José Ramos', 'Conserje y Mantenimiento Operativo', 'operativo', '0424-1110022', '', 'Conserjería PB', 'Aseo de áreas comunes, control de llaves y mantenimiento diario', 'Lunes a Sábado 7:00 AM - 4:00 PM', 6
WHERE NOT EXISTS (SELECT 1 FROM public.junta_condominio WHERE cargo = 'Conserje y Mantenimiento Operativo');
