import React, { useState, useEffect } from 'react'
import { aplicarSaldoAFavorADeuda } from '../../data/saldoFavorService'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  apartamentoId: string
  apartamentoNumero: string
  propietarioNombre: string
  saldoAFavorDisponibleUsd: number
  deudaActualUsd: number
  tasaBcv: number
  autorNombre: string
  autorEmail?: string | null
}

export const CompensarDeudaModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSuccess,
  apartamentoId,
  apartamentoNumero,
  propietarioNombre,
  saldoAFavorDisponibleUsd,
  deudaActualUsd,
  tasaBcv,
  autorNombre,
  autorEmail,
}) => {
  const maxAplicable = Math.min(saldoAFavorDisponibleUsd, deudaActualUsd)
  const [montoAplicar, setMontoAplicar] = useState<string>('')
  const [motivo, setMotivo] = useState<string>('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tasaValida = tasaBcv > 1 ? tasaBcv : 859.06

  useEffect(() => {
    if (isOpen) {
      setMontoAplicar(maxAplicable > 0 ? maxAplicable.toFixed(2) : '0')
      setMotivo('Compensación de deuda pendiente mediante saldo a favor acumulado.')
      setError(null)
      setGuardando(false)
    }
  }, [isOpen, maxAplicable])

  if (!isOpen) return null

  const montoNum = parseFloat(montoAplicar) || 0
  const saldoRestanteUsd = Math.max(0, saldoAFavorDisponibleUsd - montoNum)
  const deudaRestanteUsd = Math.max(0, deudaActualUsd - montoNum)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (montoNum <= 0) {
      setError('El monto a compensar debe ser mayor a 0.')
      return
    }

    if (montoNum > saldoAFavorDisponibleUsd + 0.01) {
      setError(`No puedes aplicar más del saldo a favor disponible ($${saldoAFavorDisponibleUsd.toFixed(2)} USD).`)
      return
    }

    if (!motivo.trim() || motivo.trim().length < 4) {
      setError('Debes ingresar un motivo para el registro de auditoría.')
      return
    }

    setGuardando(true)
    try {
      const res = await aplicarSaldoAFavorADeuda({
        apartamento_id: apartamentoId,
        apartamento_numero: apartamentoNumero,
        monto_usd_a_aplicar: montoNum,
        motivo: motivo.trim(),
        autor_nombre: autorNombre || 'Administrador',
        autor_email: autorEmail,
        tasaBcv: tasaValida,
      })

      if (!res.success) {
        setError(res.error || 'No se pudo aplicar el saldo a la deuda.')
        setGuardando(false)
        return
      }

      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Error inesperado al aplicar saldo.')
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '22px' }}>⚡</span>
              <h2 style={{ color: '#fff', fontSize: '18px', fontWeight: 800, margin: 0 }}>
                Compensar Deuda con Saldo a Favor
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

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Tarjeta de Comparativa */}
          <div
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '12px',
              padding: '12px 16px',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
            }}
          >
            <div>
              <div style={{ color: '#4ade80', fontSize: '10.5px', fontWeight: 800, textTransform: 'uppercase' }}>
                Saldo a Favor
              </div>
              <div style={{ color: '#fff', fontSize: '18px', fontWeight: 900, marginTop: '2px' }}>
                ${saldoAFavorDisponibleUsd.toFixed(2)} USD
              </div>
            </div>

            <div>
              <div style={{ color: '#f59e0b', fontSize: '10.5px', fontWeight: 800, textTransform: 'uppercase' }}>
                Deuda Pendiente
              </div>
              <div style={{ color: '#fff', fontSize: '18px', fontWeight: 900, marginTop: '2px' }}>
                ${deudaActualUsd.toFixed(2)} USD
              </div>
            </div>
          </div>

          {/* Monto a Aplicar */}
          <div>
            <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>
              Monto a restar de la deuda ($ USD) *
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max={saldoAFavorDisponibleUsd}
              value={montoAplicar}
              onChange={(e) => setMontoAplicar(e.target.value)}
              required
              style={{
                width: '100%',
                boxSizing: 'border-box',
                backgroundColor: '#0a0a0a',
                border: '1px solid #2a2a2a',
                borderRadius: '10px',
                color: '#38bdf8',
                fontWeight: 800,
                fontSize: '16px',
                padding: '10px 12px',
                outline: 'none',
              }}
            />
          </div>

          {/* Proyección */}
          <div style={{ fontSize: '12px', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Deuda restante tras compensar:</span>
              <strong style={{ color: deudaRestanteUsd <= 0.05 ? '#22c55e' : '#f59e0b' }}>
                ${deudaRestanteUsd.toFixed(2)} USD {deudaRestanteUsd <= 0.05 && ' (¡Solvente!)'}
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Saldo a favor remanente:</span>
              <strong style={{ color: '#4ade80' }}>
                ${saldoRestanteUsd.toFixed(2)} USD
              </strong>
            </div>
          </div>

          {/* Motivo de Auditoría */}
          <div>
            <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>
              Motivo / Justificación *
            </label>
            <input
              type="text"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: Amortización de recibo con saldo acumulado..."
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
              }}
            />
          </div>

          {/* Botones */}
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
              disabled={guardando || montoNum <= 0}
              style={{
                backgroundColor: '#3b82f6',
                border: 'none',
                color: '#fff',
                borderRadius: '10px',
                padding: '10px 20px',
                fontWeight: 800,
                fontSize: '13px',
                cursor: guardando || montoNum <= 0 ? 'not-allowed' : 'pointer',
                opacity: guardando || montoNum <= 0 ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 4px 15px rgba(59, 130, 246, 0.3)',
              }}
            >
              {guardando ? 'Aplicando...' : 'Confirmar Compensación'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
