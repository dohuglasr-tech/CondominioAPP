import { supabase } from './supabase'
import { getBasePortalUrl } from './emailService'

export interface ResolveResidentResult {
  success: boolean
  email?: string
  maskedEmail?: string
  nombre?: string
  apto?: string
  source?: 'email' | 'apto' | 'cedula'
  error?: string
}

/**
 * Enmascara un correo electrónico para proteger la privacidad del residente
 * Ejemplo: dohuglas.r@gmail.com -> d*******r@gmail.com
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return email
  const [user, domain] = email.split('@')
  if (!user || !domain) return email

  if (user.length <= 2) {
    return `${user[0]}*@${domain}`
  }
  const first = user[0]
  const last = user[user.length - 1]
  const asterisks = '*'.repeat(Math.min(6, Math.max(3, user.length - 2)))
  return `${first}${asterisks}${last}@${domain}`
}

/**
 * Resuelve el correo electrónico registrado de un residente a partir de:
 * 1. Correo electrónico directo (ej: usuario@gmail.com)
 * 2. Número de Apartamento (ej: 565, 518, PH-1, PB-2)
 * 3. Cédula de identidad (ej: 27818767, V-27818767)
 */
export async function resolveResidentAccount(identifier: string): Promise<ResolveResidentResult> {
  const clean = identifier.trim()
  if (!clean) {
    return {
      success: false,
      error: 'Por favor ingresa tu correo electrónico, número de apartamento o cédula.',
    }
  }

  // ── 1. Correo directo ──────────────────────────────────────────
  if (clean.includes('@')) {
    const cleanEmail = clean.toLowerCase()
    return {
      success: true,
      email: cleanEmail,
      maskedEmail: maskEmail(cleanEmail),
      source: 'email',
    }
  }

  try {
    // ── 2. Búsqueda por número de apartamento ────────────────────
    const { data: aptos } = await supabase
      .from('apartamentos')
      .select('id, numero')
      .ilike('numero', clean)
      .limit(1)

    if (aptos && aptos.length > 0) {
      const apto = aptos[0]
      const { data: perfiles } = await supabase
        .from('perfiles')
        .select('id, nombre_completo, propietario_email, email')
        .eq('apartamento_id', apto.id)
        .limit(1)

      const residentEmail = perfiles?.[0]?.propietario_email || perfiles?.[0]?.email
      if (residentEmail) {
        const cleanEmail = residentEmail.trim().toLowerCase()
        return {
          success: true,
          email: cleanEmail,
          maskedEmail: maskEmail(cleanEmail),
          nombre: perfiles[0].nombre_completo,
          apto: apto.numero,
          source: 'apto',
        }
      } else {
        return {
          success: false,
          error: `El apartamento ${apto.numero} no tiene un correo electrónico registrado en el sistema. Por favor contacta a la administración.`,
        }
      }
    }

    // ── 3. Búsqueda por Cédula de Identidad ───────────────────────
    const rawCedulaDigits = clean.replace(/[^0-9]/g, '')
    if (rawCedulaDigits.length >= 5) {
      const { data: perfilesCed } = await supabase
        .from('perfiles')
        .select('id, nombre_completo, propietario_email, email, apartamento:apartamento_id(numero)')
        .or(`cedula.ilike.%${rawCedulaDigits}%,propietario_cedula.ilike.%${rawCedulaDigits}%`)
        .limit(1)

      if (perfilesCed && perfilesCed.length > 0) {
        const p = perfilesCed[0]
        const residentEmail = p.propietario_email || p.email
        if (residentEmail) {
          const cleanEmail = residentEmail.trim().toLowerCase()
          return {
            success: true,
            email: cleanEmail,
            maskedEmail: maskEmail(cleanEmail),
            nombre: p.nombre_completo,
            apto: (p as any)?.apartamento?.numero,
            source: 'cedula',
          }
        }
      }
    }

    return {
      success: false,
      error: 'No encontramos ninguna cuenta asociada al apartamento, cédula o correo ingresado.',
    }
  } catch (err: any) {
    console.error('[passwordRecoveryService] Error resolviendo cuenta:', err)
    return {
      success: false,
      error: 'Error consultando los datos del residente. Intenta de nuevo.',
    }
  }
}

/**
 * Envía el correo de restablecimiento de contraseña a través de Supabase Auth
 * con el redirect URL configurado para producción y móviles.
 */
export async function sendResidentPasswordReset(identifier: string): Promise<ResolveResidentResult> {
  const resolved = await resolveResidentAccount(identifier)
  if (!resolved.success || !resolved.email) {
    return resolved
  }

  try {
    const portalBase = getBasePortalUrl()
    const redirectUrl = `${portalBase}/reset-password`

    // 1. Intentar envío prioritario a través de Edge Function con Gmail SMTP oficial
    try {
      const { data: edgeData, error: edgeError } = await supabase.functions.invoke('enviar-email', {
        body: {
          tipo: 'recuperar-password',
          email: resolved.email,
          redirectTo: redirectUrl,
          nombre: resolved.nombre,
          apto: resolved.apto,
          edificio: 'Residencias Ocutuy 5'
        }
      })

      if (!edgeError && edgeData?.ok) {
        console.info('[passwordRecoveryService] ✓ Correo de restablecimiento enviado exitosamente vía Gmail SMTP.')
        return {
          ...resolved,
          success: true,
        }
      }
      if (edgeError) {
        console.warn('[passwordRecoveryService] Advertencia en Edge Function Gmail, probando fallback Supabase Auth:', edgeError)
      }
    } catch (edgeCallErr) {
      console.warn('[passwordRecoveryService] Error al invocar Edge Function, probando fallback Supabase Auth:', edgeCallErr)
    }

    // 2. Fallback a método nativo de Supabase Auth
    const { error } = await supabase.auth.resetPasswordForEmail(resolved.email, {
      redirectTo: redirectUrl,
    })

    if (error) {
      console.warn('[passwordRecoveryService] Error al enviar reset de Supabase:', error.message)
      return {
        ...resolved,
        success: false,
        error: error.message || 'No se pudo enviar el correo de recuperación.',
      }
    }

    return {
      ...resolved,
      success: true,
    }
  } catch (err: any) {
    console.error('[passwordRecoveryService] Excepción enviando reset:', err)
    return {
      ...resolved,
      success: false,
      error: err?.message || 'Error inesperado al solicitar el restablecimiento.',
    }
  }
}
