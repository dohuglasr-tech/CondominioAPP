import { supabase } from './supabase'
import { getBasePortalUrl } from './emailService'
import { getActiveEdificioId } from './tenantContext'
import { extractTenantSubdomain } from './tenantService'
import { getErrorMessage } from '../utils/logger'

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
 * Ejemplo: usuario@ejemplo.com -> u*****o@ejemplo.com
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
 * Envía el correo de restablecimiento de contraseña delegando la resolución segura
 * de apartamento / cédula / correo al servidor (Edge Function `enviar-email`),
 * sin realizar lecturas anónimas a tablas sensibles ni filtrar cuentas existentes.
 */
export async function sendResidentPasswordReset(identifier: string): Promise<ResolveResidentResult> {
  const clean = identifier.trim()
  if (!clean) {
    return {
      success: false,
      error: 'Por favor ingresa tu correo electrónico, número de apartamento o cédula.',
    }
  }

  const isEmail = clean.includes('@')
  const cleanEmail = isEmail ? clean.toLowerCase() : undefined
  const maskedFallback = cleanEmail ? maskEmail(cleanEmail) : 'el correo registrado de tu cuenta'

  try {
    const portalBase = getBasePortalUrl()
    const redirectUrl = `${portalBase}/reset-password`
    const edificioId = getActiveEdificioId() || undefined
    const tenantSlug = extractTenantSubdomain() || undefined

    // 1. Envío seguro resuelto íntegramente en la Edge Function con service_role
    const { data: edgeData, error: edgeError } = await supabase.functions.invoke('enviar-email', {
      body: {
        tipo: 'recuperar-password',
        identifier: clean,
        email: cleanEmail,
        redirectTo: redirectUrl,
        edificioId,
        tenantSlug,
      }
    })

    if (!edgeError && edgeData?.ok) {
      return {
        success: true,
        maskedEmail: edgeData.maskedEmail || maskedFallback,
        apto: edgeData.apto || undefined,
        source: isEmail ? 'email' : 'apto',
      }
    }

    if (edgeData?.error && edgeData?.status !== 500) {
      return {
        success: false,
        error: edgeData.error,
      }
    }

    // 2. Fallback a Supabase Auth nativo únicamente cuando el usuario ingresó un correo directo
    if (cleanEmail) {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: redirectUrl,
      })

      if (!error) {
        return {
          success: true,
          email: cleanEmail,
          maskedEmail: maskedFallback,
          source: 'email',
        }
      }
    }

    return {
      success: false,
      error: edgeError?.message || edgeData?.error || 'No se pudo procesar la solicitud de recuperación. Intenta nuevamente.',
    }
  } catch (err: unknown) {
    console.error('[passwordRecoveryService] Excepción enviando reset:', err)
    return {
      success: false,
      error: getErrorMessage(err) || 'Error inesperado al solicitar el restablecimiento.',
    }
  }
}

/**
 * Verifica un código OTP de recuperación por correo, apartamento o cédula
 * delegando al servidor la resolución sin lecturas anónimas a la BD.
 */
export async function verifyResidentRecoveryOtp(
  identifier: string,
  token: string
): Promise<{ success: boolean; hasSession?: boolean; error?: string }> {
  const cleanId = identifier.trim()
  const cleanCode = token.trim()

  if (!cleanId || !cleanCode) {
    return { success: false, error: 'Por favor ingresa tu correo (o apartamento) y el código recibido.' }
  }

  try {
    if (cleanId.includes('@')) {
      const { data, error } = await supabase.auth.verifyOtp({
        email: cleanId.toLowerCase(),
        token: cleanCode,
        type: 'recovery',
      })
      if (error || !data?.session) {
        return { success: false, error: error?.message || 'Código incorrecto o expirado.' }
      }
      return { success: true, hasSession: true }
    }

    const { data: edgeData, error: edgeError } = await supabase.functions.invoke('enviar-email', {
      body: {
        tipo: 'verificar-otp-recovery',
        identifier: cleanId,
        token: cleanCode,
        edificioId: getActiveEdificioId() || undefined,
        tenantSlug: extractTenantSubdomain() || undefined,
      },
    })

    if (edgeError || !edgeData?.ok || !edgeData?.access_token || !edgeData?.refresh_token) {
      return {
        success: false,
        error: edgeData?.error || edgeError?.message || 'Código incorrecto o expirado.',
      }
    }

    const { error: sessErr } = await supabase.auth.setSession({
      access_token: edgeData.access_token,
      refresh_token: edgeData.refresh_token,
    })

    if (sessErr) {
      return { success: false, error: sessErr.message || 'No se pudo iniciar la sesión de recuperación.' }
    }

    return { success: true, hasSession: true }
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) || 'Error verificando el código.' }
  }
}
