import React from 'react'

export interface FormDeudaAnteriorGasState {
  apartamentoId: string
  apartamentoNumero: string
  monto: string
  moneda: 'BS' | 'USD'
  nota: string
  aplicarATodos: boolean
}

interface ApartamentoSimpleGas {
  id?: string
  numero: string
  propietario_nombre?: string | null
}

interface GasDeudaAnteriorModalProps {
  open: boolean
  apartamentosDb: ApartamentoSimpleGas[]
  formDeudaAnterior: FormDeudaAnteriorGasState
  guardandoDeudaAnterior: boolean
  onChangeForm: React.Dispatch<React.SetStateAction<FormDeudaAnteriorGasState>>
  onClose: () => void
  onSubmit: (e: React.FormEvent) => void
}

export const GasDeudaAnteriorModal = React.memo<GasDeudaAnteriorModalProps>(({
  open,
  apartamentosDb,
  formDeudaAnterior,
  guardandoDeudaAnterior,
  onChangeForm,
  onClose,
  onSubmit
}) => {
  if (!open) return null

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(5px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 99999,
      padding: '16px'
    }}>
      <div style={{
        backgroundColor: '#111827',
        border: '1px solid #374151',
        borderRadius: '20px',
        width: '100%',
        maxWidth: '480px',
        maxHeight: '92vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 60px rgba(0, 0, 0, 0.8)',
        overflow: 'hidden'
      }}>
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid #1f2937',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>📋</span>
              <span>Colocar Deuda Anterior de Gas</span>
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94a3b8' }}>
              Asigna un saldo deudor histórico previo a las jornadas
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              fontSize: '20px',
              cursor: 'pointer',
              padding: '4px 8px'
            }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 14px',
              backgroundColor: formDeudaAnterior.aplicarATodos ? 'rgba(249, 115, 22, 0.12)' : 'rgba(255, 255, 255, 0.03)',
              border: formDeudaAnterior.aplicarATodos ? '1px solid #ea580c' : '1px solid #374151',
              borderRadius: '10px',
              cursor: 'pointer'
            }}>
              <input
                type="checkbox"
                checked={formDeudaAnterior.aplicarATodos}
                onChange={e => onChangeForm(prev => ({ ...prev, aplicarATodos: e.target.checked }))}
                style={{ width: '18px', height: '18px', accentColor: '#ea580c', cursor: 'pointer' }}
              />
              <div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#fff' }}>
                  Aplicar monto a TODOS los apartamentos ({apartamentosDb.length})
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                  Asigna la misma deuda anterior general a cada inmueble registrado
                </div>
              </div>
            </label>

            {!formDeudaAnterior.aplicarATodos && (
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                  Seleccionar Apartamento:
                </label>
                <select
                  value={formDeudaAnterior.apartamentoNumero}
                  onChange={e => {
                    const selNum = e.target.value
                    const aptoObj = apartamentosDb.find(a => a.numero === selNum)
                    onChangeForm(prev => ({
                      ...prev,
                      apartamentoNumero: selNum,
                      apartamentoId: aptoObj?.id || selNum
                    }))
                  }}
                  required
                  style={{
                    width: '100%',
                    backgroundColor: '#030712',
                    border: '1px solid #374151',
                    borderRadius: '10px',
                    padding: '10px 14px',
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: 600
                  }}
                >
                  <option value="">-- Elige un apartamento --</option>
                  {apartamentosDb.map(a => (
                    <option key={a.id || a.numero} value={a.numero}>
                      Apto {a.numero} {a.propietario_nombre ? `· ${a.propietario_nombre}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                Monto de Deuda Anterior:
              </label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  value={formDeudaAnterior.monto}
                  onChange={e => onChangeForm(prev => ({ ...prev, monto: e.target.value }))}
                  placeholder="Ej: 150.00"
                  style={{
                    flex: 1,
                    backgroundColor: '#030712',
                    border: '1px solid #374151',
                    borderRadius: '10px',
                    padding: '10px 14px',
                    color: '#fff',
                    fontSize: '18px',
                    fontWeight: 800,
                    outline: 'none'
                  }}
                />
                <select
                  value={formDeudaAnterior.moneda}
                  onChange={e => onChangeForm(prev => ({ ...prev, moneda: e.target.value as 'BS' | 'USD' }))}
                  style={{
                    backgroundColor: '#030712',
                    border: '1px solid #374151',
                    borderRadius: '10px',
                    padding: '10px 14px',
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  <option value="BS">Bolívares (Bs)</option>
                  <option value="USD">Dólares (USD)</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                Concepto o Motivo:
              </label>
              <input
                type="text"
                value={formDeudaAnterior.nota}
                onChange={e => onChangeForm(prev => ({ ...prev, nota: e.target.value }))}
                placeholder="Ej: Saldo pendiente de gas año anterior"
                style={{
                  width: '100%',
                  backgroundColor: '#030712',
                  border: '1px solid #374151',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  color: '#fff',
                  fontSize: '13px',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          <div style={{
            padding: '16px 24px',
            backgroundColor: '#030712',
            borderTop: '1px solid #1f2937',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px'
          }}>
            <button
              type="button"
              onClick={onClose}
              disabled={guardandoDeudaAnterior}
              style={{
                padding: '9px 16px',
                backgroundColor: 'transparent',
                color: '#cbd5e1',
                border: '1px solid #374151',
                borderRadius: '10px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardandoDeudaAnterior}
              style={{
                padding: '9px 20px',
                backgroundColor: '#ea580c',
                color: '#fff',
                border: 'none',
                borderRadius: '10px',
                fontSize: '12px',
                fontWeight: 800,
                cursor: guardandoDeudaAnterior ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 12px rgba(234, 88, 12, 0.4)'
              }}
            >
              {guardandoDeudaAnterior ? 'Guardando...' : 'Asignar Deuda Anterior'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
})
