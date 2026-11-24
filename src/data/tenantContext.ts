import { ConfigEdificio } from './supabase'

let activeEdificioId: string | null = null
let activeEdificioConfig: Partial<ConfigEdificio> | null = null

export function setActiveEdificioId(edificioId: string | null | undefined): void {
  const clean = typeof edificioId === 'string' && edificioId.trim() ? edificioId.trim() : null
  activeEdificioId = clean
}

export function getActiveEdificioId(): string | null {
  return activeEdificioId
}

export function setActiveEdificioConfig(config: Partial<ConfigEdificio> | null | undefined): void {
  if (!config) {
    activeEdificioConfig = null
    return
  }
  activeEdificioConfig = config
  if (config.id) {
    setActiveEdificioId(config.id)
  }
}

export function getActiveEdificioConfig(): Partial<ConfigEdificio> | null {
  return activeEdificioConfig
}

export function getActiveEdificioNombre(fallback = 'Condominio Domus'): string {
  const nombre = activeEdificioConfig?.nombre_edificio?.trim()
  return nombre || fallback
}

export function withEdificioId<T extends Record<string, any>>(payload: T): T & { edificio_id?: string } {
  if (payload.edificio_id) return payload
  return activeEdificioId ? { ...payload, edificio_id: activeEdificioId } : payload
}
