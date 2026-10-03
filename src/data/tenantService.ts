import { supabase, ConfigEdificio } from './supabase'

export interface TenantInfo {
  id: string
  nombre_edificio: string
  slug: string
  color_primario?: string | null
  logo_url?: string | null
  total_apartamentos?: number
  direccion?: string | null
}

/**
 * Convierte un nombre de edificio a un slug limpio para subdominios o URLs.
 * Ejemplo: "Condominio Ocutuy 5" -> "ocutuy5" o "ocutuy-5"
 */
export function slugifyBuildingName(name: string): string {
  if (!name) return ''
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quitar tildes
    .replace(/^(condominio|edificio|residencias|residencia|torre)\s+/i, '') // Simplificar prefijos comunes
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'edificio'
}

/**
 * Detecta el subdominio o tenant actual desde la URL.
 * Soporta:
 * 1. Subdominios reales: ocutuy5.domus.ve, torre-avila.domus.ve
 * 2. Subdominios locales: ocutuy5.localhost:3000
 * 3. Parámetro de búsqueda: ?edificio=ocutuy5 o ?tenant=ocutuy5
 * 4. Rutas directas: /e/ocutuy5 o /e/ocutuy5/login
 */
export function extractTenantSubdomain(): string | null {
  if (typeof window === 'undefined') return null

  // 1. Probar Query Params (?edificio=xxx o ?tenant=xxx)
  const params = new URLSearchParams(window.location.search)
  const queryTenant = params.get('edificio') || params.get('tenant')
  if (queryTenant) return queryTenant.toLowerCase().trim()

  // 2. Probar Ruta Directa (/e/:slug)
  const pathParts = window.location.pathname.split('/').filter(Boolean)
  if (pathParts[0] === 'e' && pathParts[1]) {
    return pathParts[1].toLowerCase().trim()
  }

  // 3. Probar Hostname / Subdominio
  const hostname = window.location.hostname.toLowerCase()

  // Ignorar localhost plano y direcciones IP directas
  if (hostname === 'localhost' || /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)) {
    return null
  }

  // Soporte para subdominio en localhost: ej. "ocutuy5.localhost"
  if (hostname.endsWith('.localhost')) {
    const sub = hostname.replace('.localhost', '')
    if (sub && sub !== 'www' && sub !== 'app') return sub
  }

  // Dominios de producción: ej. "ocutuy5.domus.ve" o "ocutuy5.domus-ve.vercel.app"
  const parts = hostname.split('.')

  // Si tiene al menos 3 partes (subdominio.dominio.tld)
  if (parts.length >= 3) {
    const potentialSub = parts[0]
    // Ignorar subdominios reservados de infraestructura
    const reserved = ['www', 'api', 'admin', 'app', 'cdn', 'mail', 'superadmin']
    if (!reserved.includes(potentialSub)) {
      return potentialSub
    }
  }

  return null
}

/**
 * Resuelve la configuración del edificio a partir de un slug, subdominio o ID.
 */
export async function resolveTenantBuilding(slugOrId?: string | null): Promise<ConfigEdificio | null> {
  const target = (slugOrId || extractTenantSubdomain() || '').trim().toLowerCase()
  if (!target) return null

  // Cachear resultado para no saturar la base de datos
  const cacheKey = `tenant_config_${target}`
  const cached = sessionStorage.getItem(cacheKey)
  if (cached) {
    try {
      return JSON.parse(cached)
    } catch {}
  }

  try {
    // 1. Intentar buscar por columna 'slug' si existe
    try {
      const { data: bySlug } = await supabase
        .from('configuracion_edificio')
        .select('*')
        .eq('slug', target)
        .limit(1)
        .maybeSingle()

      if (bySlug) {
        sessionStorage.setItem(cacheKey, JSON.stringify(bySlug))
        return bySlug
      }
    } catch {}

    // 2. Intentar buscar por UUID directo si el target tiene formato UUID
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target)
    if (isUuid) {
      const { data: byId } = await supabase
        .from('configuracion_edificio')
        .select('*')
        .eq('id', target)
        .limit(1)
        .maybeSingle()

      if (byId) {
        sessionStorage.setItem(cacheKey, JSON.stringify(byId))
        return byId
      }
    }

    // 3. Fallback inteligente: buscar en todos los edificios comparando slug generado de 'nombre_edificio'
    const { data: allBuildings } = await supabase
      .from('configuracion_edificio')
      .select('*')

    if (allBuildings && allBuildings.length > 0) {
      const matched = allBuildings.find(b => {
        const slugNorm = slugifyBuildingName(b.nombre_edificio)
        const cleanName = (b.nombre_edificio || '').toLowerCase().replace(/[^a-z0-9]/g, '')
        const cleanTarget = target.replace(/[^a-z0-9]/g, '')
        return (
          slugNorm === target ||
          cleanName.includes(cleanTarget) ||
          cleanTarget.includes(cleanName)
        )
      })

      if (matched) {
        sessionStorage.setItem(cacheKey, JSON.stringify(matched))
        return matched
      }
    }

    return null
  } catch (e) {
    console.warn('[TenantService] Error resolviendo edificio:', e)
    return null
  }
}

/**
 * Genera la URL canónica para acceder al subdominio o portal del edificio.
 */
export function buildTenantAccessUrl(slug: string): string {
  if (typeof window === 'undefined') return `/e/${slug}`

  const hostname = window.location.hostname
  const port = window.location.port ? `:${window.location.port}` : ''
  const protocol = window.location.protocol

  // Si estamos en localhost:
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    return `${protocol}//${slug}.localhost${port}`
  }

  // Si es un dominio real (ej. domus.ve o vercel.app):
  const domainParts = hostname.split('.')
  if (domainParts.length >= 2) {
    // Tomar los últimos dos segmentos (ej. domus.ve)
    const baseDomain = domainParts.slice(-2).join('.')
    return `${protocol}//${slug}.${baseDomain}${port}`
  }

  // Fallback por ruta
  return `/e/${slug}`
}
