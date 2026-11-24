import { describe, it, expect } from 'vitest'
import {
  encodePagoMeta,
  parsePagoMeta,
  stripPagoMeta,
  obtenerDeudaGasApartamento,
  obtenerTodasLasDeudasGasApartamento,
  calcularMetricasGas,
  GasServicioData
} from '../data/gasService'

function buildFixtureGasData(): GasServicioData {
  return {
    config: {
      capacidadLitros: 2500,
      nivelActualPorcentaje: 60,
      porcentajeAlertaMinimo: 25,
      proveedorActual: 'Gas Demo',
      telefonoProveedor: '',
      monedaCuota: 'BS',
      costoPorAptoDefectoBs: 5000,
      costoPorAptoDefectoUsd: 5.8,
      tasaBcv: 860,
      datosPago: {
        banco: 'Banco de Venezuela',
        telefono: '04140000000',
        rifCedula: 'J-00000000-0',
        titular: 'Condominio',
        tipoCuenta: 'Corriente'
      }
    },
    llenados: [],
    jornadas: [
      {
        id: 'jornada-oct',
        titulo: 'Gas Octubre',
        esEspecial: false,
        mes: '2026-10',
        fechaInicio: '2026-10-01',
        fechaLimite: '2026-10-15',
        monedaPrincipal: 'BS',
        costoPorAptoBs: 4500,
        costoPorAptoUsd: 5.2,
        metaTotalBs: 45000,
        metaTotalUsd: 52,
        estado: 'activa',
        pagos: {
          'apto-501': {
            apartamentoId: 'apto-501',
            apartamentoNumero: '501',
            estado: 'pendiente',
            montoBs: 4500,
            montoUsd: 5.2
          },
          'apto-502': {
            apartamentoId: 'apto-502',
            apartamentoNumero: '502',
            estado: 'pagado',
            montoBs: 4500,
            montoUsd: 5.2
          }
        }
      },
      {
        id: 'jornada-nov-esp',
        titulo: 'Cuota Especial Tanque',
        esEspecial: true,
        mes: '2026-11',
        fechaInicio: '2026-11-01',
        fechaLimite: '2026-11-30',
        monedaPrincipal: 'USD',
        costoPorAptoBs: 8600,
        costoPorAptoUsd: 10,
        metaTotalBs: 86000,
        metaTotalUsd: 100,
        estado: 'activa',
        pagos: {
          'apto-501': {
            apartamentoId: 'apto-501',
            apartamentoNumero: '501',
            estado: 'en_verificacion',
            montoBs: 8600,
            montoUsd: 10
          }
        }
      }
    ],
    eventosCalendario: [],
    deudasAnteriores: {
      'apto-501': {
        id: 'da-501',
        apartamentoId: 'apto-501',
        apartamentoNumero: '501',
        montoBs: 1500,
        montoUsd: 1.75,
        moneda: 'BS',
        estado: 'pendiente',
        nota: 'Saldo Anterior Gas'
      }
    },
    updatedAt: '2026-11-24T12:00:00Z'
  }
}

describe('prelacionPagos y consolidación de gas', () => {
  it('codifica, decodifica y limpia metadatos DOMUS_META preservando notas administrativas', () => {
    const encoded = encodePagoMeta('Pago verificado en banco | Nota Admin: Conciliado', {
      tipoServicio: 'mixto',
      gasMontoBs: 1500,
      condominioMontoBs: 3500,
      esAdelantoCuotaFutura: true,
      esAbonoParcialAdelanto: true
    })

    const decoded = parsePagoMeta(encoded)
    expect(decoded).not.toBeNull()
    expect(decoded?.tipoServicio).toBe('mixto')
    expect(decoded?.gasMontoBs).toBe(1500)
    expect(decoded?.esAbonoParcialAdelanto).toBe(true)

    expect(stripPagoMeta(encoded)).toBe('Pago verificado en banco | Nota Admin: Conciliado')
    expect(parsePagoMeta('Abono a cuota especial gas 2026')?.tipoServicio).toBe('gas')
  })

  it('consolida deuda anterior, jornadas activas pendientes y cuotas en verificación', () => {
    const data = buildFixtureGasData()
    const resumenTodas = obtenerTodasLasDeudasGasApartamento(data, 'apto-501', '501')

    expect(resumenTodas.tieneDeuda).toBe(true)
    expect(resumenTodas.enVerificacion).toBe(true)
    expect(resumenTodas.cuotasPendientes).toHaveLength(2) // deuda anterior + jornada-oct
    expect(resumenTodas.cuotasEnVerificacion).toHaveLength(1) // jornada-nov-esp
    expect(resumenTodas.totalBs).toBeCloseTo(6000, 2)
    expect(resumenTodas.totalUsd).toBeCloseTo(6.95, 2)
    expect(resumenTodas.totalEnVerificacionUsd).toBe(10)

    const resumenApto = obtenerDeudaGasApartamento(data, 'apto-501', '501')
    expect(resumenApto.campanaTitulo).toBe('2 cuotas de gas pendientes')

    const metricas = calcularMetricasGas(data)
    expect(metricas.capacidadTotal).toBe(2500)
    expect(metricas.litrosActuales).toBe(1500)
    expect(metricas.aptosSolventes).toBe(1)
  })
})
