import { describe, it, expect, vi } from 'vitest'

vi.mock('../data/supabase', () => ({
  supabase: {},
}))

import { construirOpcionesPropuesta } from '../data/propuestasService'

describe('propuestasService · construirOpcionesPropuesta', () => {
  it('devuelve las 3 opciones estándar en cero cuando no hay votos', () => {
    const res = construirOpcionesPropuesta([])
    expect(res).toEqual([
      { id: 'favor', texto: 'Sí, estoy de acuerdo', votos_count: 0 },
      { id: 'contra', texto: 'No estoy de acuerdo', votos_count: 0 },
      { id: 'abstencion', texto: 'Me abstengo', votos_count: 0 },
    ])
  })

  it('agrupa correctamente los votos reales por opción e ignora valores desconocidos', () => {
    const res = construirOpcionesPropuesta([
      { voto: 'favor' },
      { voto: 'favor' },
      { voto: 'contra' },
      { voto: 'abstencion' },
      { voto: 'invalido' },
      { voto: 'favor' },
    ])

    expect(res.find(o => o.id === 'favor')?.votos_count).toBe(3)
    expect(res.find(o => o.id === 'contra')?.votos_count).toBe(1)
    expect(res.find(o => o.id === 'abstencion')?.votos_count).toBe(1)
  })
})
