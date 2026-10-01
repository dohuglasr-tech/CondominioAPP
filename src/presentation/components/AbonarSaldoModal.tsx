import React, { useState, useEffect } from 'react'
import { abonarSaldoAFavorApartamento } from '../../data/saldoFavorService'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  apartamentoId: string
  apartamentoNumero: string
  propietarioNombre: string
  deudaActualUsd?: number
  deudaActualBs?: number
  tasaBcv: number
  autorNombre: string
  autorEmail?: string | null
}

export const AbonarSaldoModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSuccess,
  apartamentoId,
  apartamentoNumero,
  propietarioNombre,
  deudaActualUsd = 0,
  deudaActualBs = 0,
  tasaBcv,
  autorNombre,
  autorEmail,
}) => {
  const [montoUsd, setMontoUsd] = useState<string>('')
  const [montoBs, setMontoBs] = useState<string>('')
  const [motivo, setMotivo] = useState<string>('')
  const [aplicarADeuda, setAplicarADeuda] = useState<boolean>(deudaActualUsd > 0)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tasaValida = tasaBcv > 1 ? tasaBcv : 859.06

  useEffect(() => {
    if (isOpen) {
      setMontoUsd('')
      setMontoBs('')
      setMotivo('')
      setAplicarADeuda(deudaActualUsd > 0)
      setError(null)
      setGuardando(false)
    }
  }, [isOpen, deudaActualUsd])

  if (!isOpen) return null

  // Sincronización bidireccional USD <-> Bs
  const handleUsdChange = (val: string) => {
    setMontoUsd(val)
    const num = parseFloat(val)
    if (!isNaN(num) && num > 0) {
      setMontoBs((num * tasaValida).toFixed(2))
    } else {
      setMontoBs('')
    }
  }

  const handleBsChange = (val: string) => {
    setMontoBs(val)
    const num = parseFloat(val)
    if (!isNaN(num) && num > 0) {
      setMontoUsd((num / tasaValida).toFixed(2))
    } else {
      setMontoUsd('')
    }
  }

  const numUsd = parseFloat(montoUsd) || 0
  const tieneDeuda = deudaActualUsd > 0.05 || deudaActualBs > 0.05
  const deudaTotalUsd = deudaActualUsd > 0 ? deudaActualUsd : (deudaActualBs / tasaValida)

  // Cálculo proyectado si aplica a deuda
  const amortizacionProyectada = aplicarADeuda ? Math.min(numUsd, deudaTotalUsd) : 0
  const remanenteFavorProyectado = Math.max(0, numUsd - amortizacionProyectada)
  const deudaRestanteProyectada = Math.max(0, deudaTotalUsd - amortizacionProyectada)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (numUsd <= 0) {
      setError('El monto a abonar debe ser mayor a 0.')
      return
    }

    if (!motivo.trim() || motivo.trim().length < 4) {
      setError('Debes ingresar un motivo descriptivo del abono (mínimo 4 caracteres) para el registro de auditoría.')
      return
    }

    setGuardando(true)
    try {
      const res = await abonarSaldoAFavorApartamento({
        apartamento_id: apartamentoId,
        apartamento_numero: apartamentoNumero,
        propietario_nombre: propietarioNombre,
        monto_usd: numUsd,
        monto_bs: parseFloat(montoBs) || (numUsd * tasaValida),
        motivo: motivo.trim(),
        aplicar_a_deuda: aplicarADeuda && tieneDeuda,
        autor_nombre: autorNombre || 'Administrador',
        autor_email: autorEmail,
        tasaBcv: tasaValida,
      })

      if (!res.success) {
        setError(res.error || 'No se pudo registrar el abono.')
        setGuardando(false)
        return
      }

      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Error inesperado al abonar saldo.')
      setGuardando(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100050,
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#121418',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '520px',
          padding: '24px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.7)',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '22px' }}>➕</span>
              <h2 style={{ color: '#fff', fontSize: '18px', fontWeight: 800, margin: 0 }}>
                Abonar Saldo Positivo (A Favor)
              </h2>
            </div>
            <p style={{ color: '#94a3b8', fontSize: '12px', margin: '4px 0 0' }}>
              Apto <strong>{apartamentoNumero}</strong> · {propietarioNombre || 'Copropietario'}
            </p>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#8e8e93',
              fontSize: '20px',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            ✕
          </button>
        </div>

        {error && (
          <div
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#f87171',
              borderRadius: '10px',
              padding: '10px 14px',
              fontSize: '12.5px',
              marginBottom: '16px',
            }}
          >
            ⚠️ {error}
          </div>
        )}

        {/* Alerta de Deuda Existente */}
        {tieneDeuda && (
          <div
            style={{
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: '12px',
              padding: '12px 14px',
              marginBottom: '16px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#fbbf24', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>⚠️</span> Deuda pendiente registrada:
              </span>
              <span style={{ color: '#fef3c7', fontSize: '13px', fontWeight: 800 }}>
                ≈ ${deudaTotalUsd.toFixed(2)} USD
              </span>
            </div>
            {deudaActualBs > 0 && (
              <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '3px' }}>
                Incluye Bs. {deudaActualBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })} anclados a Bolívares.
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Montos Duales */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>
                Monto en Dólares ($ USD) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={montoUsd}
                onChange={(e) => handleUsdChange(e.target.value)}
                required
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  backgroundColor: '#0a0a0a',
                  border: '1px solid #2a2a2a',
                  borderRadius: '10px',
                  color: '#4ade80',
                  fontWeight: 800,
                  fontSize: '15px',
                  padding: '10px 12px',
                  outline: 'none',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>
                Monto en Bolívares (Bs.)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={montoBs}
                onChange={(e) => handleBsChange(e.target.value)}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  backgroundColor: '#0a0a0a',
                  border: '1px solid #2a2a2a',
                  borderRadius: '10px',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '15px',
                  padding: '10px 12px',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '-4px' }}>
            Tasa BCV de cálculo: <strong>Bs. {tasaValida.toLocaleString('es-VE', { minimumFractionDigits: 2 })}/USD</strong>
          </div>

          {/* Motivo OBLIGATORIO */}
          <div>
            <label style={{ display: 'block', color: '#f59e0b', fontSize: '11.5px', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px' }}>
              Motivo del Abono (Obligatorio para Auditoría) *
            </label>
            <textarea
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: Pago de $20 en efectivo entregado a junta en asamblea / Compensación por cobro duplicado / Saldo a favor acordado..."
              required
              style={{
                width: '100%',
                boxSizing: 'border-box',
                backgroundColor: '#0a0a0a',
                border: '1px solid #334155',
                borderRadius: '10px',
                color: '#fff',
                fontSize: '13px',
                padding: '10px 12px',
                outline: 'none',
                resize: 'none',
                lineHeight: '1.4',
              }}
            />
          </div>

          {/* Checkbox condicional si tiene deuda */}
          {tieneDeuda && (
            <div
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                padding: '12px 14px',
              }}
            >
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={aplicarADeuda}
                  onChange={(e) => setAplicarADeuda(e.target.checked)}
                  style={{ width: '18px', height: '18px', marginTop: '2px', accentColor: '#22c55e', cursor: 'pointer' }}
                />
                <div>
                  <span style={{ color: '#fff', fontSize: '13px', fontWeight: 700 }}>
                    Restar automáticamente de la deuda actual
                  </span>
                  <p style={{ color: '#94a3b8', fontSize: '11.5px', margin: '3px 0 0', lineHeight: '1.3' }}>
                    Si marcas esta casilla, el abono se utilizará de inmediato para liquidar o amortizar los recibos y deudas pendientes.
                  </p>
                </div>
              </label>

              {aplicarADeuda && numUsd > 0 && (
                <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed rgba(255, 255, 255, 0.1)', fontSize: '12px', color: '#cbd5e1' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span>Deuda a amortizar:</span>
                    <strong style={{ color: '#4ade80' }}>-${amortizacionProyectada.toFixed(2)} USD</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span>Deuda restante:</span>
                    <strong style={{ color: deudaRestanteProyectada <= 0.05 ? '#22c55e' : '#f59e0b' }}>
                      ${deudaRestanteProyectada.toFixed(2)} USD {deudaRestanteProyectada <= 0.05 && ' (¡Solvente!)'}
                    </strong>
                  </div>
                  {remanenteFavorProyectado > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Saldo que quedará a favor:</span>
                      <strong style={{ color: '#38bdf8' }}>+${remanenteFavorProyectado.toFixed(2)} USD</strong>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Botones de Acción */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={guardando}
              style={{
                backgroundColor: 'transparent',
                border: '1px solid #334155',
                color: '#94a3b8',
                borderRadius: '10px',
                padding: '10px 18px',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={guardando || numUsd <= 0}
              style={{
                backgroundColor: '#22c55e',
                border: 'none',
                color: '#000',
                borderRadius: '10px',
                padding: '10px 20px',
                fontWeight: 800,
                fontSize: '13px',
                cursor: guardando || numUsd <= 0 ? 'not-allowed' : 'pointer',
                opacity: guardando || numUsd <= 0 ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 4px 15px rgba(34, 197, 94, 0.3)',
              }}
            >
              {guardando ? 'Guardando...' : aplicarADeuda && tieneDeuda ? 'Abonar y Descontar Deuda' : 'Guardar Saldo a Favor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
