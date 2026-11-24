const IS_DEV = Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV)

export function getErrorMessage(err: unknown, fallback = 'Error inesperado'): string {
  if (err instanceof Error && err.message) return err.message
  if (typeof err === 'string' && err.trim()) return err
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = (err as { message?: unknown }).message
    if (typeof msg === 'string' && msg.trim()) return msg
  }
  return fallback
}

export const logger = {
  debug(scope: string, message: string, data?: unknown): void {
    if (!IS_DEV) return
    if (data !== undefined) {
      console.debug(`[${scope}] ${message}`, data)
    } else {
      console.debug(`[${scope}] ${message}`)
    }
  },
  info(scope: string, message: string, data?: unknown): void {
    if (!IS_DEV) return
    if (data !== undefined) {
      console.info(`[${scope}] ${message}`, data)
    } else {
      console.info(`[${scope}] ${message}`)
    }
  },
  warn(scope: string, message: string, data?: unknown): void {
    if (data !== undefined) {
      console.warn(`[${scope}] ${message}`, data)
    } else {
      console.warn(`[${scope}] ${message}`)
    }
  },
  error(scope: string, message: string, data?: unknown): void {
    if (data !== undefined) {
      console.error(`[${scope}] ${message}`, data)
    } else {
      console.error(`[${scope}] ${message}`)
    }
  }
}
