import React from 'react'
import { useTheme } from '../../application/contexts/ThemeContext'
import {
  FondoReservaMovimiento,
  FondoReservaUbicacion,
  TotalesFondoReserva,
} from '../../data/fondoReservaService'

interface FondoReservaCardProps {
  ubicaciones: FondoReservaUbicacion[]
  movimientos: FondoReservaMovimiento[]
  totales: TotalesFondoReserva
  loading?: boolean
  ocultarSaldos?: boolean
  compact?: boolean
  onVerDetalle?: () => void
}

const fmtUsd = (n: number) =>
  (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtBs = (n: number) =>
  (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const TIPO_UBICACION_ICON: Record<string, string> = {
  banco: '🏦',
  efectivo: '💵',
  digital: '💳',
  otro: '🏛️',
}

const TIPO_MOV_BADGE: Record<string, { label: string; colorDark: string; colorLight: string; bg: string }> = {
  aporte_cuota: { label: 'Aporte Mensual', colorDark: '#4ade80', colorLight: '#15803d', bg: 'rgba(34, 197, 94, 0.14)' },
  saldo_inicial: { label: 'Saldo Inicial', colorDark: '#60a5fa', colorLight: '#1d4ed8', bg: 'rgba(59, 130, 246, 0.14)' },
  ajuste_manual: { label: 'Ajuste Junta', colorDark: '#c084fc', colorLight: '#7e22ce', bg: 'rgba(168, 85, 247, 0.14)' },
  egreso: { label: 'Egreso / Uso', colorDark: '#f87171', colorLight: '#dc2626', bg: 'rgba(239, 68, 68, 0.14)' },
  transferencia_divisa: { label: 'Cambio Divisa', colorDark: '#fbbf24', colorLight: '#b45309', bg: 'rgba(245, 158, 11, 0.14)' },
}

export const FondoReservaCard = React.memo<FondoReservaCardProps>(({
  ubicaciones,
  movimientos,
  totales,
  loading = false,
  ocultarSaldos = false,
  compact = false,
  onVerDetalle,
}) => {
  const { isLight } = useTheme()

  const cardBg = isLight
    ? '#ffffff'
    : 'linear-gradient(145deg, rgba(16, 23, 38, 0.96) 0%, rgba(15, 20, 30, 0.98) 100%)'
  const cardBorder = isLight ? '1px solid #e2e8f0' : '1px solid rgba(56, 189, 248, 0.22)'
  const cardShadow = isLight ? '0 8px 24px rgba(15, 23, 42, 0.06)' : '0 10px 28px rgba(0, 0, 0, 0.4)'
  const innerBg = isLight ? '#f8fafc' : 'rgba(255, 255, 255, 0.035)'
  const innerBorder = isLight ? '1px solid #e2e8f0' : '1px solid rgba(255, 255, 255, 0.07)'
  const textPrimary = isLight ? '#0f172a' : '#ffffff'
  const textMuted = isLight ? '#64748b' : '#94a3b8'

  const mask = (v: string) => (ocultarSaldos ? '••••••' : v)

  const resumenUbicacionesTexto =
    ubicaciones.length === 0
      ? 'Aún no se han configurado ubicaciones de resguardo.'
      : ubicaciones
          .map((u) => {
            const montoStr = u.moneda === 'USD' ? `$${fmtUsd(u.saldo)}` : `Bs. ${fmtBs(u.saldo)}`
            return `${mask(montoStr)} ubicado en ${u.nombre}`
          })
          .join(' · ')

  const movimientosMostrar = compact ? movimientos.slice(0, 3) : movimientos

  return (
    <div
      style={{
        background: cardBg,
        border: cardBorder,
        borderRadius: '22px',
        padding: compact ? '20px' : '24px',
        boxShadow: cardShadow,
      }}
    >
      {/* Cabecera */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '12px',
          flexWrap: 'wrap',
          marginBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '14px',
              backgroundColor: isLight ? 'rgba(14, 165, 233, 0.12)' : 'rgba(56, 189, 248, 0.16)',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px',
              flexShrink: 0,
            }}
          >
            🏦
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: textPrimary }}>
                Estatus del Fondo de Reserva
              </h3>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: '999px',
                  backgroundColor: isLight ? 'rgba(16, 185, 129, 0.12)' : 'rgba(34, 197, 94, 0.16)',
                  color: isLight ? '#047857' : '#4ade80',
                  border: '1px solid rgba(34, 197, 94, 0.35)',
                }}
              >
                Transparencia · Solo Lectura
              </span>
            </div>
            <p style={{ margin: '3px 0 0', fontSize: '12px', color: textMuted }}>
              Fondo de Reserva Principal: {loading ? 'Cargando saldos...' : resumenUbicacionesTexto}
            </p>
          </div>
        </div>

        {onVerDetalle && (
          <button
            onClick={onVerDetalle}
            style={{
              background: isLight ? '#f1f5f9' : 'rgba(56, 189, 248, 0.14)',
              border: isLight ? '1px solid #cbd5e1' : '1px solid rgba(56, 189, 248, 0.35)',
              color: isLight ? '#0369a1' : '#38bdf8',
              padding: '7px 12px',
              borderRadius: '10px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Ver detalle →
          </button>
        )}
      </div>

      {/* Sumatoria Consolidada + Totales Nativos */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        <div
          style={{
            background: isLight
              ? 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)'
              : 'linear-gradient(135deg, rgba(14, 165, 233, 0.14) 0%, rgba(37, 99, 235, 0.14) 100%)',
            border: isLight ? '1px solid #bae6fd' : '1px solid rgba(56, 189, 248, 0.3)',
            borderRadius: '14px',
            padding: '12px 14px',
          }}
        >
          <div style={{ fontSize: '10.5px', fontWeight: 800, textTransform: 'uppercase', color: isLight ? '#0369a1' : '#7dd3fc' }}>
            Total Consolidado (BCV Bs. {totales.tasaBcvUsada.toFixed(2)})
          </div>
          <div style={{ fontSize: '20px', fontWeight: 900, color: textPrimary, marginTop: '4px' }}>
            {mask(`$${fmtUsd(totales.totalConsolidadoUsd)} USD`)}
          </div>
          <div style={{ fontSize: '11.5px', fontWeight: 600, color: textMuted, marginTop: '2px' }}>
            {mask(`≈ Bs. ${fmtBs(totales.totalConsolidadoBs)}`)}
          </div>
        </div>

        <div style={{ background: innerBg, border: innerBorder, borderRadius: '14px', padding: '12px 14px' }}>
          <div style={{ fontSize: '10.5px', fontWeight: 800, textTransform: 'uppercase', color: textMuted }}>
            Disponible Nativo USD
          </div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: isLight ? '#047857' : '#4ade80', marginTop: '4px' }}>
            {mask(`$${fmtUsd(totales.totalNativoUsd)}`)}
          </div>
          <div style={{ fontSize: '11px', color: textMuted, marginTop: '2px' }}>
            {ubicaciones.filter((u) => u.moneda === 'USD').length} ubicación(es) USD
          </div>
        </div>

        <div style={{ background: innerBg, border: innerBorder, borderRadius: '14px', padding: '12px 14px' }}>
          <div style={{ fontSize: '10.5px', fontWeight: 800, textTransform: 'uppercase', color: textMuted }}>
            Disponible Nativo Bs.
          </div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: isLight ? '#b45309' : '#fbbf24', marginTop: '4px' }}>
            {mask(`Bs. ${fmtBs(totales.totalNativoBs)}`)}
          </div>
          <div style={{ fontSize: '11px', color: textMuted, marginTop: '2px' }}>
            {ubicaciones.filter((u) => u.moneda === 'BS').length} ubicación(es) Bs.
          </div>
        </div>
      </div>

      {/* Desglose por Ubicación */}
      {ubicaciones.length > 0 && (
        <div style={{ marginBottom: movimientosMostrar.length > 0 ? '16px' : '0' }}>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: textMuted,
              marginBottom: '8px',
            }}
          >
            Desglose por Ubicación Física o Bancaria
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {ubicaciones.map((u) => (
              <div
                key={u.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  padding: '10px 12px',
                  backgroundColor: innerBg,
                  border: innerBorder,
                  borderRadius: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                  <span style={{ fontSize: '18px', flexShrink: 0 }}>
                    {TIPO_UBICACION_ICON[u.tipo] || '🏦'}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: textPrimary, display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span>{u.nombre}</span>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 800,
                          padding: '1px 6px',
                          borderRadius: '999px',
                          backgroundColor: u.moneda === 'USD' ? 'rgba(34, 197, 94, 0.14)' : 'rgba(245, 158, 11, 0.16)',
                          color: u.moneda === 'USD' ? (isLight ? '#15803d' : '#4ade80') : (isLight ? '#b45309' : '#fbbf24'),
                        }}
                      >
                        {u.moneda}
                      </span>
                    </div>
                    {u.descripcion && (
                      <div style={{ fontSize: '11px', color: textMuted, marginTop: '1px' }}>{u.descripcion}</div>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: textPrimary }}>
                    {mask(u.moneda === 'USD' ? `$${fmtUsd(u.saldo)}` : `Bs. ${fmtBs(u.saldo)}`)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Movimientos recientes */}
      {movimientosMostrar.length > 0 && (
        <div>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: textMuted,
              marginBottom: '8px',
            }}
          >
            Movimientos Recientes
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {movimientosMostrar.map((m) => {
              const badge = TIPO_MOV_BADGE[m.tipo] || TIPO_MOV_BADGE.ajuste_manual
              const esPositivo = m.monto >= 0
              const montoFmt =
                m.moneda === 'USD'
                  ? `${esPositivo ? '+' : '-'}$${fmtUsd(Math.abs(m.monto))}`
                  : `${esPositivo ? '+' : '-'}Bs. ${fmtBs(Math.abs(m.monto))}`

              return (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    padding: '10px 12px',
                    backgroundColor: innerBg,
                    border: innerBorder,
                    borderRadius: '12px',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 800,
                          padding: '1px 7px',
                          borderRadius: '999px',
                          backgroundColor: badge.bg,
                          color: isLight ? badge.colorLight : badge.colorDark,
                        }}
                      >
                        {badge.label}
                      </span>
                      {m.ubicacion_nombre && (
                        <span style={{ fontSize: '11px', fontWeight: 700, color: textMuted }}>
                          · {m.ubicacion_nombre}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '12.5px', fontWeight: 600, color: textPrimary, marginTop: '3px' }}>
                      {m.descripcion}
                    </div>
                    <div style={{ fontSize: '10.5px', color: textMuted, marginTop: '2px' }}>
                      {new Date(m.created_at).toLocaleDateString('es-VE', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div
                      style={{
                        fontSize: '13.5px',
                        fontWeight: 800,
                        color: esPositivo
                          ? isLight
                            ? '#15803d'
                            : '#4ade80'
                          : isLight
                            ? '#dc2626'
                            : '#f87171',
                      }}
                    >
                      {mask(montoFmt)}
                    </div>
                    <div style={{ fontSize: '10.5px', color: textMuted }}>
                      Saldo: {mask(m.moneda === 'USD' ? `$${fmtUsd(m.saldo_nuevo)}` : `Bs. ${fmtBs(m.saldo_nuevo)}`)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
})

FondoReservaCard.displayName = 'FondoReservaCard'
