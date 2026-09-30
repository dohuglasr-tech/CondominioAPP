-- Migración: Sincronización automática de email del propietario desde auth.users
-- Garantiza que cada perfil tenga registrado el correo real con el que se registró

UPDATE public.perfiles p
SET propietario_email = u.email
FROM auth.users u
WHERE p.id = u.id
  AND (p.propietario_email IS NULL OR p.propietario_email = '')
  AND (p.condicion_habitacional IS NULL OR p.condicion_habitacional != 'alquilado');

-- Trigger para mantener sincronizado siempre el email ante nuevos registros o cambios
CREATE OR REPLACE FUNCTION public.sync_propietario_email_from_auth()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.perfiles
  SET propietario_email = NEW.email
  WHERE id = NEW.id
    AND (propietario_email IS NULL OR propietario_email = '')
    AND (condicion_habitacional IS NULL OR condicion_habitacional != 'alquilado');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_sync_propietario_email ON auth.users;
CREATE TRIGGER tr_sync_propietario_email
AFTER INSERT OR UPDATE OF email ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.sync_propietario_email_from_auth();
