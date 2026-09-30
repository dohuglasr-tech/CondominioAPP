/**
 * Utilidades para autenticación biométrica (Face ID, Touch ID, Huella dactilar, Windows Hello)
 * basadas en el estándar W3C Web Authentication API (WebAuthn) y Web Crypto API.
 * 
 * Totalmente compatible con:
 * - iPhone / iPad (Safari Face ID / Touch ID)
 * - Android (Chrome Huella dactilar / Desbloqueo facial)
 * - Mac (Touch ID en Safari / Chrome)
 * - Windows (Windows Hello)
 */

export interface BiometricSupport {
  supported: boolean
  label: string
  type: 'face' | 'fingerprint' | 'biometric'
  reason?: string
}

const STORAGE_KEYS = {
  ENROLLED: 'condominio_bio_enrolled',
  EMAIL: 'condominio_bio_email',
  VAULT: 'condominio_bio_vault',
  KEY: 'condominio_bio_key',
  CRED_ID: 'condominio_bio_cred_id',
  SAVED_EMAIL: 'condominio_saved_email',
  REMEMBER_ME: 'condominio_remember_me',
}

// ── Helpers de conversión Base64 <-> ArrayBuffer ─────────────────────────
function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return window.btoa(binary)
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = window.atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes.buffer
}

// ── Detección de Plataforma para etiquetas personalizadas ─────────────────
export function getBiometricPlatformInfo(): { label: string; type: 'face' | 'fingerprint' | 'biometric' } {
  if (typeof navigator === 'undefined') {
    return { label: 'Face ID / Huella', type: 'biometric' }
  }

  const ua = navigator.userAgent || ''
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isAndroid = /android/i.test(ua)
  const isMac = /Macintosh/.test(ua) && !isIOS
  const isWindows = /Windows/.test(ua)

  if (isIOS) {
    return { label: 'Face ID / Touch ID', type: 'face' }
  }
  if (isAndroid) {
    return { label: 'Huella Dactilar', type: 'fingerprint' }
  }
  if (isMac) {
    return { label: 'Touch ID', type: 'fingerprint' }
  }
  if (isWindows) {
    return { label: 'Windows Hello / Huella', type: 'biometric' }
  }

  return { label: 'Face ID / Huella', type: 'biometric' }
}

// ── Verificar si el dispositivo soporta Biometría WebAuthn ───────────────
export async function isBiometricsSupported(): Promise<BiometricSupport> {
  const { label, type } = getBiometricPlatformInfo()

  if (typeof window === 'undefined') {
    return { supported: false, label, type, reason: 'Entorno no disponible' }
  }

  // WebAuthn y WebCrypto requieren entorno seguro (HTTPS o localhost)
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  if (!window.isSecureContext && !isLocal) {
    return {
      supported: false,
      label,
      type,
      reason: 'Se requiere una conexión segura (HTTPS) para habilitar Face ID o Huella.'
    }
  }

  // Verificar soporte de PublicKeyCredential
  if (!window.PublicKeyCredential) {
    return {
      supported: false,
      label,
      type,
      reason: 'El navegador no soporta autenticación biométrica WebAuthn.'
    }
  }

  try {
    // Comprobar si el dispositivo cuenta con autenticador de plataforma (sensor biométrico)
    if (typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
      const available = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
      if (!available) {
        return {
          supported: false,
          label,
          type,
          reason: 'No se detectó un lector biométrico (Face ID / Huella) en este dispositivo.'
        }
      }
    }
    return { supported: true, label, type }
  } catch (err) {
    return {
      supported: false,
      label,
      type,
      reason: 'Error al consultar disponibilidad biométrica.'
    }
  }
}

// ── Criptografía Local AES-GCM (Protege las credenciales en el dispositivo) ──
async function getOrCreateCryptoKey(): Promise<CryptoKey> {
  const existingKeyBase64 = localStorage.getItem(STORAGE_KEYS.KEY)
  if (existingKeyBase64) {
    const rawKey = base64ToArrayBuffer(existingKeyBase64)
    return await window.crypto.subtle.importKey(
      'raw',
      rawKey,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    )
  }

  // Generar clave de 256 bits nueva
  const rawKey = window.crypto.getRandomValues(new Uint8Array(32))
  localStorage.setItem(STORAGE_KEYS.KEY, arrayBufferToBase64(rawKey))
  return await window.crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  )
}

async function encryptData(payload: object): Promise<string> {
  const key = await getOrCreateCryptoKey()
  const iv = window.crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(JSON.stringify(payload))
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  )

  return JSON.stringify({
    iv: arrayBufferToBase64(iv),
    data: arrayBufferToBase64(ciphertext),
  })
}

async function decryptData(vaultJson: string): Promise<any> {
  const { iv: ivB64, data: dataB64 } = JSON.parse(vaultJson)
  const key = await getOrCreateCryptoKey()
  const iv = new Uint8Array(base64ToArrayBuffer(ivB64))
  const ciphertext = base64ToArrayBuffer(dataB64)

  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  )

  const decoded = new TextDecoder().decode(decrypted)
  return JSON.parse(decoded)
}

// ── Consultar si ya hay biometría registrada en este dispositivo ──────────
export function isBiometricsEnrolled(): boolean {
  if (typeof window === 'undefined') return false
  const isEnrolled = localStorage.getItem(STORAGE_KEYS.ENROLLED) === 'true'
  const hasVault = !!localStorage.getItem(STORAGE_KEYS.VAULT)
  return isEnrolled && hasVault
}

export function getEnrolledBiometricEmail(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(STORAGE_KEYS.EMAIL) || localStorage.getItem(STORAGE_KEYS.SAVED_EMAIL)
}

// ── Registrar Biometría (Enrolar Face ID / Huella) ────────────────────────
export async function enrollBiometrics(
  email: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const support = await isBiometricsSupported()
    if (!support.supported) {
      return { success: false, error: support.reason || 'Biometría no disponible en este dispositivo' }
    }

    const challenge = window.crypto.getRandomValues(new Uint8Array(32))
    const userId = new TextEncoder().encode(email)

    // Configuración RP
    const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(window.location.hostname)
    const rp: PublicKeyCredentialRpEntity = {
      name: 'Torre 5 Residencias',
    }
    if (!isIp && window.location.hostname) {
      rp.id = window.location.hostname
    }

    // Solicitar al sistema operativo / dispositivo la creación de credencial biométrica
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp,
        user: {
          id: userId,
          name: email,
          displayName: email.split('@')[0],
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' },  // ES256
          { alg: -257, type: 'public-key' }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform', // Sensor nativo del dispositivo (Face ID / Huella)
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60000,
        attestation: 'none',
      },
    })) as PublicKeyCredential | null

    if (!credential) {
      return { success: false, error: 'No se pudo crear la credencial biométrica.' }
    }

    // Guardar credencial y bóveda cifrada
    const vault = await encryptData({ email, password, enrolledAt: Date.now() })
    localStorage.setItem(STORAGE_KEYS.VAULT, vault)
    localStorage.setItem(STORAGE_KEYS.EMAIL, email)
    localStorage.setItem(STORAGE_KEYS.ENROLLED, 'true')
    localStorage.setItem(STORAGE_KEYS.SAVED_EMAIL, email)
    localStorage.setItem(STORAGE_KEYS.REMEMBER_ME, 'true')
    localStorage.setItem(STORAGE_KEYS.CRED_ID, credential.id)

    return { success: true }
  } catch (err: any) {
    console.warn('[BiometricAuth] Error al registrar biometría:', err)
    if (err.name === 'NotAllowedError') {
      return { success: false, error: 'Registro cancelado o rechazado por el usuario.' }
    }
    return { success: false, error: err.message || 'Error al configurar Face ID / Huella.' }
  }
}

// ── Iniciar sesión con Biometría (Face ID / Huella) ───────────────────────
export async function authenticateWithBiometrics(): Promise<{
  success: boolean
  email?: string
  password?: string
  error?: string
}> {
  try {
    if (!isBiometricsEnrolled()) {
      return { success: false, error: 'No hay biometría configurada en este dispositivo.' }
    }

    const challenge = window.crypto.getRandomValues(new Uint8Array(32))
    const credId = localStorage.getItem(STORAGE_KEYS.CRED_ID)
    const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(window.location.hostname)

    const getOptions: PublicKeyCredentialRequestOptions = {
      challenge,
      timeout: 60000,
      userVerification: 'required',
    }

    if (!isIp && window.location.hostname) {
      getOptions.rpId = window.location.hostname
    }

    if (credId) {
      try {
        getOptions.allowCredentials = [
          {
            id: base64ToArrayBuffer(credId),
            type: 'public-key',
            transports: ['internal'],
          },
        ]
      } catch {
        // Si el ID no era base64 puro, permitir que el autenticador de plataforma use la credencial residente
      }
    }

    // Esto despliega la ventana nativa de Face ID / Touch ID / Huella del dispositivo
    const assertion = await navigator.credentials.get({
      publicKey: getOptions,
    })

    if (!assertion) {
      return { success: false, error: 'No se completó la verificación biométrica.' }
    }

    // Desencriptar bóveda local protegida
    const vaultJson = localStorage.getItem(STORAGE_KEYS.VAULT)
    if (!vaultJson) {
      return { success: false, error: 'No se encontraron las credenciales guardadas en este equipo.' }
    }

    const creds = await decryptData(vaultJson)
    if (!creds?.email || !creds?.password) {
      return { success: false, error: 'Los datos guardados están corruptos. Ingrese con su contraseña.' }
    }

    return {
      success: true,
      email: creds.email,
      password: creds.password,
    }
  } catch (err: any) {
    console.warn('[BiometricAuth] Error al autenticar con biometría:', err)
    if (err.name === 'NotAllowedError') {
      return { success: false, error: 'Autenticación biométrica cancelada.' }
    }
    return { success: false, error: err.message || 'Error en la verificación biométrica.' }
  }
}

// ── Desactivar Biometría en este dispositivo ──────────────────────────────
export function disableBiometrics(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(STORAGE_KEYS.ENROLLED)
  localStorage.removeItem(STORAGE_KEYS.VAULT)
  localStorage.removeItem(STORAGE_KEYS.CRED_ID)
  localStorage.removeItem(STORAGE_KEYS.KEY)
  localStorage.removeItem(STORAGE_KEYS.EMAIL)
}
