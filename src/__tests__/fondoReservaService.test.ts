import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRpc = vi.hoisted(() => vi.fn())

vi.mock('../data/supabase', () => ({
  supabase: {
    rpc: mockRpc,
    from: vi.fn(),
  },
}))

vi.mock('../data/cacheService', () => ({
  appCache: {
    fetch: async (_key: string, fetcher: () => Promise<unknown>) => fetcher(),
    invalidateTags: vi.fn(),
  },
}))

import {
  acreditarFondoReservaPorRecibo,
  calcularTotalesFondoReserva,
  inferirMonedaPago,
  type FondoReservaUbicacion,
} from '../data/fondoReservaService'

describe('fondoReservaService', () => {
  beforeEach(() => {
    mockRpc.mockReset()
  })

  it('calcula totales nativos USD/Bs y consolidado equivalente usando tasa BCV vigente', () => {
    const ubicaciones: FondoReservaUbicacion[] = [
      { id: '1', nombre: 'Caja Fuerte USD', tipo: 'efectivo', moneda: 'USD', saldo: 1200, es_destino_default: true, activa: true },
      { id: '2', nombre: 'Zelle Junta', tipo: 'digital', moneda: 'USD', saldo: 300.5, es_destino_default: false, activa: true },
      { id: '3', nombre: 'Cuenta Bancaria Bs', tipo: 'banco', moneda: 'BS', saldo: 50000, es_destino_default: true, activa: true },
      { id: '4', nombre: 'Cuenta Inactiva', tipo: 'banco', moneda: 'USD', saldo: 9999, es_destino_default: false, activa: false },
    ]

    const tot = calcularTotalesFondoReserva(ubicaciones, 100)
    expect(tot.totalNativoUsd).toBe(1500.5)
    expect(tot.totalNativoBs).toBe(50000)
    // 50000 / 100 = 500 USD -> 1500.5 + 500 = 2000.5 USD
    expect(tot.totalConsolidadoUsd).toBe(2000.5)
    // 1500.5 * 100 + 50000 = 200050 Bs
    expect(tot.totalConsolidadoBs).toBe(200050)
    expect(tot.defaultUsd?.id).toBe('1')
    expect(tot.defaultBs?.id).toBe('3')
  })

  it('infiere correctamente la moneda del pago según método y montos', () => {
    expect(inferirMonedaPago({ metodo: 'zelle', montoUsd: 20 })).toBe('USD')
    expect(inferirMonedaPago({ metodo: 'efectivo_usd', montoUsd: 15 })).toBe('USD')
    expect(inferirMonedaPago({ metodo: 'pago_movil', montoBs: 2500 })).toBe('BS')
    expect(inferirMonedaPago({ metodo: 'transferencia_bs', montoBs: 3000 })).toBe('BS')
    expect(inferirMonedaPago({ monedaExplicita: 'USD', metodo: 'otro' })).toBe('USD')
    expect(inferirMonedaPago({ metodo: 'otro', montoUsd: 50, montoBs: 0 })).toBe('USD')
  })

  it('acredita de forma idempotente vía RPC y respeta banderas already_credited / skipped', async () => {
    mockRpc.mockResolvedValueOnce({
      data: { ok: true, already_credited: true },
      error: null,
    })

    const dup = await acreditarFondoReservaPorRecibo({
      reciboId: 'rec-1',
      monedaPago: 'BS',
      tasaBcv: 100,
      referencia: '123456',
      autorNombre: 'Admin',
    })
    expect(dup.ok).toBe(true)
    expect(dup.alreadyCredited).toBe(true)
    expect(mockRpc).toHaveBeenCalledWith('acreditar_fondo_reserva_recibo', {
      p_recibo_id: 'rec-1',
      p_moneda_pago: 'BS',
      p_tasa_bcv: 100,
      p_pago_reportado_id: null,
      p_referencia: '123456',
      p_autor_nombre: 'Admin',
    })

    mockRpc.mockResolvedValueOnce({
      data: { ok: true, skipped: true, reason: 'recibo_no_pagado' },
      error: null,
    })
    const partial = await acreditarFondoReservaPorRecibo({
      reciboId: 'rec-partial',
      monedaPago: 'USD',
    })
    expect(partial.ok).toBe(true)
    expect(partial.skipped).toBe(true)
  })
})
