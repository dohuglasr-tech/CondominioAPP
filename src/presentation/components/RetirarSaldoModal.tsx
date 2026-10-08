import React, { useState, useEffect } from 'react'
import { retirarSaldoAFavorApartamento } from '../../data/saldoFavorService'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  apartamentoId: string
  apartamentoNumero: string
  propietarioNombre: string
  saldoAFavorUsd: number
  saldoAFavorBs: number
  tasaBcv: number
  autorNombre: string
  autorEmail?: string | null
}

export const RetirarSaldoModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSuccess,
  apartamentoId,
  apartamentoNumero,
  propietarioNombre,
  saldoAFavorUsd,
  saldoAFavorBs,
  tasaBcv,
  autorNombre,
  autorEmail,
}) => {
  const [montoRetirar, setMontoRetirar] = useState<string>('')
  const [motivo, setMotivo] = useState<string>('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      const calcUsd = saldoAFavorUsd > 0 ? saldoAFavorUsd : (saldoAFavorBs > 0 ? (saldoAFavorBs / (tasaBcv > 1 ? tasaBcv : 859.06)) : 0)
      setMontoRetirar(calcUsd > 0 ? calcUsd.toFixed(2) : '0')
      setMotivo('')
      setError(null)
      setGuardando(false)
    }
  }, [isOpen, saldoAFavorUsd, saldoAFavorBs, tasaBcv])

  if (!isOpen) return null

  const montoNum = parseFloat(montoRetirar.replace(',', '.')) || 0
  const tasaValida = tasaBcv > 1 ? tasaBcv : 859.06
  const montoBs = montoNum * tasaValida
  const saldoRestante = Math.max(0, saldoAFavorUsd - montoNum)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (montoNum <= 0) {
      setError('El monto a retirar debe ser mayor a 0.')
      return
    }

    if (montoNum > saldoAFavorUsd + 0.01) {
      setError(`No puedes retirar más del saldo a favor disponible ($${saldoAFavorUsd.toFixed(2)} USD).`)
      return
    }

    if (!motivo.trim() || motivo.trim().length < 5) {
      setError('Debes ingresar un motivo descriptivo (mínimo 5 caracteres) para el registro de auditoría.')
      return
    }

    setGuardando(true)
    try {
      const res = await retirarSaldoAFavorApartamento({
        apartamento_id: apartamentoId,
        apartamento_numero: apartamentoNumero,
        monto_usd: montoNum,
        motivo: motivo.trim(),
        autor_nombre: autorNombre || 'Administrador',
        autor_email: autorEmail,
        tasaBcv: tasaValida,
      })

      if (!res.success) {
        setError(res.error || 'No se pudo retirar el saldo.')
        setGuardando(false)
        return
      }

      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Error inesperado al registrar el retiro.')
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
          maxWidth: '480px',
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
              <span style={{ fontSize: '20px' }}>💚</span>
              <h2 style={{ color: '#fff', fontSize: '18px', fontWeight: 800, margin: 0 }}>
                Retirar Saldo a Favor
              </h2>
            </div>
            <p style={{ color: '#94a3b8', fontSize: '12px', margin: '4px 0 0' }}>
              Apto <strong>{apartamentoNumero}</strong> · {propietarioNombre}
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

        {/* Tarjeta de Saldo Disponible */}
        <div
          style={{
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            borderRadius: '14px',
            padding: '14px 16px',
            marginBottom: '18px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ color: '#4ade80', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              Saldo a Favor Actual
            </div>
            <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '2px' }}>
              Tasa BCV: Bs. {tasaValida.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: '#4ade80', fontSize: '18px', fontWeight: 900 }}>
              {saldoAFavorUsd >= 1 ? `+$${saldoAFavorUsd.toFixed(2)} USD` : `+Bs. ${saldoAFavorBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            </div>
            <div style={{ color: '#86efac', fontSize: '11px', fontWeight: 600 }}>
              {saldoAFavorUsd >= 1 ? `≈ Bs. ${(saldoAFavorBs > 0 ? saldoAFavorBs : saldoAFavorUsd * tasaValida).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `≈ $${saldoAFavorUsd.toFixed(2)} USD`}
            </div>
          </div>
        </div>

        {error && (
          <div
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              color: '#f87171',
              padding: '10px 14px',
              borderRadius: '10px',
              fontSize: '12px',
              marginBottom: '16px',
            }}
          >
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Monto a retirar */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{ color: '#fff', fontSize: '12.5px', fontWeight: 700 }}>
                Monto a retirar ($ USD)
              </label>
              <button
                type="button"
                onClick={() => setMontoRetirar(saldoAFavorUsd.toFixed(2))}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-accent, #f97316)',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Retirar Todo (${saldoAFavorUsd.toFixed(2)})
              </button>
            </div>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max={saldoAFavorUsd}
              value={montoRetirar}
              onChange={(e) => setMontoRetirar(e.target.value)}
              placeholder="0.00"
              style={{
                width: '100%',
                backgroundColor: '#0a0b0e',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#fff',
                padding: '12px 14px',
                borderRadius: '10px',
                fontSize: '15px',
                fontWeight: 800,
                boxSizing: 'border-box',
                outline: 'none',
              }}
              required
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '11px', color: '#8e8e93' }}>
              <span>Equivalente: Bs. {montoBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span>Quedará: ${saldoRestante.toFixed(2)} USD</span>
            </div>
          </div>

          {/* Motivo de la acción */}
          <div style={{ marginBottom: '18px' }}>
            <label style={{ display: 'block', color: '#fff', fontSize: '12.5px', fontWeight: 700, marginBottom: '6px' }}>
              Motivo del retiro (Requerido para Auditoría)
            </label>
            <textarea
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: Devolución acordada por pago duplicado, entrega en efectivo o ajuste contable..."
              style={{
                width: '100%',
                backgroundColor: '#0a0b0e',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#fff',
                padding: '10px 14px',
                borderRadius: '10px',
                fontSize: '13px',
                boxSizing: 'border-box',
                outline: 'none',
                resize: 'none',
              }}
              required
            />
          </div>

          {/* Advertencia de Auditoría */}
          <div
            style={{
              backgroundColor: 'rgba(59, 130, 246, 0.08)',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              borderRadius: '10px',
              padding: '10px 12px',
              marginBottom: '20px',
              fontSize: '11px',
              color: '#93c5fd',
              lineHeight: 1.4,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>🛡️</span>
            <span>
              Esta acción se registrará automáticamente en el <strong>Historial de Auditoría</strong> bajo tu usuario <strong>({autorNombre || 'Administrador'})</strong> con fecha inmutable.
            </span>
          </div>

          {/* Botones de acción */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={guardando}
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#d1d5db',
                padding: '10px 18px',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={guardando || montoNum <= 0}
              style={{
                background: guardando
                  ? '#6b7280'
                  : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                border: 'none',
                color: '#fff',
                padding: '10px 20px',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: 800,
                cursor: guardando || montoNum <= 0 ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {guardando ? 'Registrando en Auditoría...' : '✓ Confirmar Retiro'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
