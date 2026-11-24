import { describe, it, expect, vi, beforeEach } from 'vitest'

// Hoisted mock state for Supabase query builder responses
const mockState = vi.hoisted(() => ({
  moraRow: null as Record<string, any> | null,
  recibos: [] as Array<Record<string, any>>,
  updates: [] as Array<{ table: string; id: string; payload: Record<string, any> }>,
}))

vi.mock('../data/supabase', () => {
  const from = (table: string) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: mockState.moraRow, error: null }),
        order: async () => ({ data: mockState.recibos, error: null }),
      }),
    }),
    update: (payload: Record<string, any>) => ({
      eq: async (_col: string, id: string) => {
        mockState.updates.push({ table, id, payload })
        return { data: null, error: null }
      },
    }),
  })
  return { supabase: { from } }
})

vi.mock('../data/auditoriaService', () => ({
  registrarEventoAuditoria: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock('../data/cacheService', () => ({
  appCache: { invalidateTags: vi.fn() },
}))

vi.mock('../data/moraService', () => ({
  limpiarCacheMora: vi.fn(),
}))

import { aplicarPagoConPrelacion } from '../data/pagosPrelacionService'

describe('aplicarPagoConPrelacion', () => {
  beforeEach(() => {
    mockState.moraRow = null
    mockState.recibos = []
    mockState.updates = []
  })

  it('respeta la cascada estricta: Mora Bs -> Recibos no indexados -> Recibos indexados USD -> Saldo a favor', async () => {
    mockState.moraRow = {
      id: 'mora-1',
      apartamento_id: 'apto-1',
      monto_bs: 500,
      monto_usd: 0,
      estado: 'activo',
      conceptos_detalle: '{}',
      observaciones: '',
    }

    mockState.recibos = [
      {
        id: 'rec-no-idx',
        apartamento_id: 'apto-1',
        mes_facturado: '2026-01-01',
        total_bs: 1000,
        total_usd: 10,
        estado: 'pendiente',
        es_indexado: false,
        data_json: {},
      },
      {
        id: 'rec-idx',
        apartamento_id: 'apto-1',
        mes_facturado: '2026-03-01',
        total_bs: 2000,
        total_usd: 20,
        estado: 'pendiente',
        es_indexado: true,
        data_json: {},
      },
    ]

    // Tasa 100 Bs/USD -> mora 500 Bs + no-idx 1000 Bs + idx 20*100=2000 Bs = 3500 Bs; pago 4000 Bs => 500 Bs (5 USD) saldo a favor
    const res = await aplicarPagoConPrelacion(
      {
        id: 'pago-1',
        apartamento_id: 'apto-1',
        monto_bs: 4000,
        referencia: 'REF-001',
      },
      100,
      '2026-02-01'
    )

    expect(res.success).toBe(true)
    expect(res.descontadoMoraBs).toBe(500)
    expect(res.moraSolventada).toBe(true)
    expect(res.descontadoRecibosNoIndexadosBs).toBe(1000)
    expect(res.descontadoRecibosIndexadosBs).toBe(2000)
    expect(res.descontadoRecibosIndexadosUsd).toBe(20)
    expect(res.recibosLiquidados).toEqual(['rec-no-idx', 'rec-idx'])
    expect(res.esSaldoAFavor).toBe(true)
    expect(res.saldoRestanteBs).toBe(500)
    expect(res.saldoRestanteUsd).toBe(5)
    expect(mockState.updates.map((u) => u.id)).toEqual(['mora-1', 'rec-no-idx', 'rec-idx'])
  })

  it('realiza abono parcial indexado preservando el estado pendiente y evitando reprocesar pagos idempotentes', async () => {
    mockState.recibos = [
      {
        id: 'rec-idx-partial',
        apartamento_id: 'apto-2',
        mes_facturado: '2026-05-01',
        total_bs: 2000,
        total_usd: 20,
        estado: 'pendiente',
        es_indexado: true,
        data_json: {},
      },
    ]

    const res = await aplicarPagoConPrelacion(
      {
        id: 'pago-2',
        apartamento_id: 'apto-2',
        monto_bs: 500, // equivale a $5 a tasa 100 -> quedan $15 (Bs 1500)
        referencia: 'REF-002',
      },
      100,
      '2026-02-01'
    )

    expect(res.success).toBe(true)
    expect(res.recibosLiquidados).toEqual([])
    expect(res.recibosAbonados).toHaveLength(1)
    expect(res.recibosAbonados[0]).toMatchObject({
      id: 'rec-idx-partial',
      abonoBs: 500,
      abonoUsd: 5,
      saldoRestanteUsd: 15,
      saldoRestanteBs: 1500,
    })
    expect(mockState.updates[0].payload.estado).toBe('pendiente')
    expect(mockState.updates[0].payload.total_usd).toBe(15)

    // Si el mismo pago_id ya figura en el recibo, el guard de idempotencia no muta registros
    mockState.updates = []
    mockState.recibos[0].data_json = { abonos: [{ pago_id: 'pago-2' }] }
    const dup = await aplicarPagoConPrelacion(
      { id: 'pago-2', apartamento_id: 'apto-2', monto_bs: 500 },
      100
    )
    expect(dup.descontadoRecibosIndexadosBs).toBe(0)
    expect(mockState.updates).toHaveLength(0)
  })
})
