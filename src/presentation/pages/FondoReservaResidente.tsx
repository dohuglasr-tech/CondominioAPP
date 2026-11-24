import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../application/contexts/AuthContext'
import { useTheme } from '../../application/contexts/ThemeContext'
import { useBcvRate } from '../../data/useBcvRate'
import {
  calcularTotalesFondoReserva,
  obtenerFondoReservaPortalResidente,
  ResumenFondoReserva,
  TipoMovimientoFondo,
} from '../../data/fondoReservaService'
import { FondoReservaCard } from '../components/FondoReservaCard'
import { getTasaBcvNumerica } from '../../utils/tasaBcvHelper'

export const FondoReservaResidente: React.FC = () => {
  const navigate = useNavigate()
  const { config } = useAuth()
  const { isLight } = useTheme()
  const { rate } = useBcvRate()

  const tasaVigente = getTasaBcvNumerica(rate, config?.tasa_bcv_actual)
  const [resumen, setResumen] = useState<ResumenFondoReserva>({
    ubicaciones: [],
    movimientos: [],
    totales: calcularTotalesFondoReserva([], tasaVigente),
  })
  const [loading, setLoading] = useState(true)
  const [filtroMoneda, setFiltroMoneda] = useState<'TODAS' | 'USD' | 'BS'>('TODAS')
  const [filtroTipo, setFiltroTipo] = useState<'TODOS' | TipoMovimientoFondo>('TODOS')

  const cargar = useCallback(
    async (force = false) => {
      setLoading(true)
      try {
        const data = await obtenerFondoReservaPortalResidente(tasaVigente, force, 40)
        setResumen({
          ...data,
          totales: calcularTotalesFondoReserva(data.ubicaciones, tasaVigente),
        })
      } finally {
        setLoading(false)
      }
    },
    [tasaVigente]
  )

  useEffect(() => {
    cargar(false)
  }, [cargar])

  const movimientosFiltrados = resumen.movimientos.filter((m) => {
    if (filtroMoneda !== 'TODAS' && m.moneda !== filtroMoneda) return false
    if (filtroTipo !== 'TODOS' && m.tipo !== filtroTipo) return false
    return true
  })

  const pageBg = isLight ? '#eef2f6' : '#070b14'
  const textPrimary = isLight ? '#0f172a' : '#ffffff'
  const textMuted = isLight ? '#64748b' : '#94a3b8'
  const pillBg = isLight ? '#ffffff' : 'rgba(255, 255, 255, 0.06)'
  const pillBorder = isLight ? '1px solid #cbd5e1' : '1px solid rgba(255, 255, 255, 0.14)'

  return (
    <div style={{ minHeight: '100%', backgroundColor: pageBg, padding: '20px 16px 48px' }}>
      <div style={{ maxWidth: '1040px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => navigate('/')}
              style={{
                background: pillBg,
                border: pillBorder,
                color: textPrimary,
                borderRadius: '10px',
                padding: '8px 12px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              ← Volver
            </button>
            <div>
              <h1 style={{ margin: 0, fontSize: '21px', fontWeight: 900, color: textPrimary }}>
                Fondo de Reserva del Edificio
              </h1>
              <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: textMuted }}>
                Vista de transparencia · Saldos reales por ubicación y movimientos registrados
              </p>
            </div>
          </div>

          <button
            onClick={() => cargar(true)}
            disabled={loading}
            style={{
              background: pillBg,
              border: pillBorder,
              color: textPrimary,
              borderRadius: '10px',
              padding: '8px 14px',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: loading ? 'wait' : 'pointer',
            }}
          >
            {loading ? 'Actualizando...' : '🔄 Actualizar'}
          </button>
        </div>

        {/* Nota explicativa de reglas de transparencia */}
        <div
          style={{
            backgroundColor: isLight ? '#f0f9ff' : 'rgba(14, 165, 233, 0.08)',
            border: isLight ? '1px solid #bae6fd' : '1px solid rgba(56, 189, 248, 0.25)',
            borderRadius: '14px',
            padding: '12px 16px',
            fontSize: '12px',
            color: isLight ? '#0369a1' : '#bae6fd',
            lineHeight: 1.5,
          }}
        >
          El Fondo de Reserva acumula únicamente los aportes ordinarios de cada cuota mensual cuando queda 100% solvente (excluyendo gas, locales y cuotas extraordinarias). Los movimientos individuales muestran la actividad agregada protegiendo la privacidad de cada propietario.
        </div>

        {/* Filtros de movimientos */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: textMuted }}>Filtrar movimientos:</span>
          {(['TODAS', 'USD', 'BS'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setFiltroMoneda(m)}
              style={{
                background: filtroMoneda === m ? 'var(--color-accent, #f97316)' : pillBg,
                border: filtroMoneda === m ? '1px solid var(--color-accent, #f97316)' : pillBorder,
                color: filtroMoneda === m ? '#fff' : textPrimary,
                borderRadius: '999px',
                padding: '5px 12px',
                fontSize: '11.5px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {m === 'TODAS' ? 'Todas las monedas' : m}
            </button>
          ))}

          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value as 'TODOS' | TipoMovimientoFondo)}
            style={{
              backgroundColor: isLight ? '#ffffff' : '#111827',
              border: pillBorder,
              color: textPrimary,
              borderRadius: '10px',
              padding: '6px 10px',
              fontSize: '12px',
              fontWeight: 600,
              outline: 'none',
            }}
          >
            <option value="TODOS">Todos los movimientos</option>
            <option value="aporte_cuota">Aportes mensuales</option>
            <option value="egreso">Egresos / usos</option>
            <option value="ajuste_manual">Ajustes de junta</option>
            <option value="transferencia_divisa">Cambios de divisa</option>
            <option value="saldo_inicial">Saldos iniciales</option>
          </select>
        </div>

        {/* Tarjeta completa */}
        <FondoReservaCard
          ubicaciones={resumen.ubicaciones}
          movimientos={movimientosFiltrados}
          totales={resumen.totales}
          loading={loading}
          compact={false}
        />
      </div>
    </div>
  )
}
