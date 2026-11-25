import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('../data/supabase', () => ({
  supabase: {
    channel: () => ({ on: () => ({ subscribe: () => ({}) }), send: () => ({}) }),
  },
}))

import { appCache } from '../data/cacheService'
import { setActiveEdificioId, getTenantStorageKey } from '../data/tenantContext'
import { getChatChannelName, CHAT_CHANNEL_NAME } from '../data/chatService'

describe('Aislamiento multi-tenant de caché y chat', () => {
  beforeEach(() => {
    appCache.clear()
    setActiveEdificioId(null)
  })

  afterEach(() => {
    appCache.clear()
    setActiveEdificioId(null)
  })

  it('separa entradas de appCache por edificio_id y comparte claves globales', async () => {
    setActiveEdificioId('edificio-A')
    const valA = await appCache.fetch('gastos_mes_2026-11-01', async () => 'gastos-A', { tags: ['gastos'] })

    setActiveEdificioId('edificio-B')
    const valB = await appCache.fetch('gastos_mes_2026-11-01', async () => 'gastos-B', { tags: ['gastos'] })

    expect(valA).toBe('gastos-A')
    expect(valB).toBe('gastos-B')

    // Volver al edificio A debe devolver su propio valor cacheado
    setActiveEdificioId('edificio-A')
    const hitA = await appCache.fetch('gastos_mes_2026-11-01', async () => 'no-debe-ejecutarse')
    expect(hitA).toBe('gastos-A')

    // Clave global tasa_bcv_oficial se comparte entre edificios
    let bcvCalls = 0
    await appCache.fetch('tasa_bcv_oficial', async () => {
      bcvCalls++
      return { rate: 95.5 }
    })
    setActiveEdificioId('edificio-B')
    await appCache.fetch('tasa_bcv_oficial', async () => {
      bcvCalls++
      return { rate: 99.9 }
    })
    expect(bcvCalls).toBe(1)
  })

  it('invalida entradas prefijadas al invalidar por tag o clave', async () => {
    setActiveEdificioId('edificio-A')
    let calls = 0
    await appCache.fetch('locales_comerciales_lista', async () => {
      calls++
      return calls
    }, { tags: ['locales'] })

    appCache.invalidateTag('locales')

    const refreshed = await appCache.fetch('locales_comerciales_lista', async () => {
      calls++
      return calls
    }, { tags: ['locales'] })
    expect(refreshed).toBe(2)
  })

  it('genera canales Realtime Broadcast independientes por edificio', () => {
    expect(getChatChannelName()).toBe(CHAT_CHANNEL_NAME)

    setActiveEdificioId('torre-alpha')
    expect(getChatChannelName()).toBe(`${CHAT_CHANNEL_NAME}_torre-alpha`)

    setActiveEdificioId('torre-beta')
    expect(getChatChannelName()).toBe(`${CHAT_CHANNEL_NAME}_torre-beta`)
    expect(getChatChannelName('custom-id')).toBe(`${CHAT_CHANNEL_NAME}_custom-id`)
  })

  it('segmenta claves de localStorage por edificio activo con getTenantStorageKey', () => {
    expect(getTenantStorageKey('condominio_gas_servicio_v3')).toBe('condominio_gas_servicio_v3')

    setActiveEdificioId('edif-101')
    expect(getTenantStorageKey('condominio_gas_servicio_v3')).toBe('condominio_gas_servicio_v3_edif-101')

    setActiveEdificioId('edif-202')
    expect(getTenantStorageKey('condominio_gas_servicio_v3')).toBe('condominio_gas_servicio_v3_edif-202')
  })
})
