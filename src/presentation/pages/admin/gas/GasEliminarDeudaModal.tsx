import React from 'react'

export interface FormEliminarDeudaGasState {
  apartamentoId: string
  apartamentoNumero: string
  tipoEliminacion: 'anterior' | 'mes' | 'todas'
  mesKey: string
  aplicarATodoEdificio: boolean
  palabraConfirmacion: string
  checkConfirmacion: boolean
}

interface ApartamentoSimpleGas {
  id?: string
  numero: string
  propietario_nombre?: string | null
}

interface MesConfigGasItem {
  mesKey: string
  label: string
}

interface GasEliminarDeudaModalProps {
  open: boolean
  apartamentosDb: ApartamentoSimpleGas[]
  mesesConfig: MesConfigGasItem[]
  formEliminarDeuda: FormEliminarDeudaGasState
  eliminandoDeuda: boolean
  onChangeForm: React.Dispatch<React.SetStateAction<FormEliminarDeudaGasState>>
  onClose: () => void
  onSubmit: (e: React.FormEvent) => void
}

export const GasEliminarDeudaModal = React.memo<GasEliminarDeudaModalProps>(({
  open,
  apartamentosDb,
  mesesConfig,
  formEliminarDeuda,
  eliminandoDeuda,
  onChangeForm,
  onClose,
  onSubmit
}) => {
  if (!open) return null

  const confirmDisabled =
    eliminandoDeuda ||
    (formEliminarDeuda.aplicarATodoEdificio
      ? formEliminarDeuda.palabraConfirmacion.trim() !== 'BORRAR'
      : (!formEliminarDeuda.apartamentoNumero || !formEliminarDeuda.checkConfirmacion))

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
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#f87171', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🗑️</span>
              <span>Eliminar Deuda de Gas</span>
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94a3b8' }}>
              Elimina o perdona saldos adeudados para dejar al apartamento solvente
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
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#cbd5e1', marginBottom: '8px' }}>
                Alcance de la Eliminación:
              </label>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
                backgroundColor: '#030712',
                padding: '4px',
                borderRadius: '12px',
                border: '1px solid #1f2937'
              }}>
                <button
                  type="button"
                  onClick={() => onChangeForm(prev => ({
                    ...prev,
                    aplicarATodoEdificio: false,
                    palabraConfirmacion: '',
                    checkConfirmacion: false
                  }))}
                  style={{
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: !formEliminarDeuda.aplicarATodoEdificio ? '#1f2937' : 'transparent',
                    color: !formEliminarDeuda.aplicarATodoEdificio ? '#fff' : '#94a3b8',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <span>🏠</span>
                  <span>Un Apartamento</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeForm(prev => ({
                    ...prev,
                    aplicarATodoEdificio: true,
                    apartamentoNumero: 'EDIFICIO',
                    palabraConfirmacion: '',
                    checkConfirmacion: false
                  }))}
                  style={{
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: formEliminarDeuda.aplicarATodoEdificio ? '#ef4444' : 'transparent',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    boxShadow: formEliminarDeuda.aplicarATodoEdificio ? '0 2px 10px rgba(239, 68, 68, 0.4)' : 'none'
                  }}
                >
                  <span>🏢</span>
                  <span>Todo el Edificio</span>
                </button>
              </div>
            </div>

            {!formEliminarDeuda.aplicarATodoEdificio ? (
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                  Apartamento con deuda a eliminar:
                </label>
                <select
                  value={formEliminarDeuda.apartamentoNumero}
                  onChange={e => {
                    const selNum = e.target.value
                    const aptoObj = apartamentosDb.find(a => a.numero === selNum)
                    onChangeForm(prev => ({
                      ...prev,
                      apartamentoNumero: selNum,
                      apartamentoId: aptoObj?.id || selNum
                    }))
                  }}
                  required={!formEliminarDeuda.aplicarATodoEdificio}
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
            ) : (
              <div style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                borderRadius: '12px',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}>
                <span style={{ fontSize: '22px' }}>🏢</span>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#fca5a5' }}>
                    Borrando deuda de TODO EL EDIFICIO
                  </div>
                  <div style={{ fontSize: '11px', color: '#cbd5e1', marginTop: '2px' }}>
                    Se condonará la deuda de los <strong>{apartamentosDb.length} apartamentos</strong> registrados en la comunidad.
                  </div>
                </div>
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#cbd5e1', marginBottom: '8px' }}>
                ¿Qué deuda deseas eliminar?
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 14px',
                  backgroundColor: formEliminarDeuda.tipoEliminacion === 'anterior' ? 'rgba(234, 88, 12, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                  border: formEliminarDeuda.tipoEliminacion === 'anterior' ? '1px solid #ea580c' : '1px solid #374151',
                  borderRadius: '10px',
                  cursor: 'pointer'
                }}>
                  <input
                    type="radio"
                    name="tipoEliminacion"
                    value="anterior"
                    checked={formEliminarDeuda.tipoEliminacion === 'anterior'}
                    onChange={() => onChangeForm(prev => ({ ...prev, tipoEliminacion: 'anterior' }))}
                    style={{ accentColor: '#ea580c' }}
                  />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>
                      {formEliminarDeuda.aplicarATodoEdificio ? 'Solo Deuda Anterior de TODO el Edificio' : 'Solo Deuda Anterior Histórica'}
                    </div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                      {formEliminarDeuda.aplicarATodoEdificio ? 'Elimina los saldos anteriores acumulados de todos los inmuebles' : 'Elimina el saldo acumulado previo a este año'}
                    </div>
                  </div>
                </label>

                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 14px',
                  backgroundColor: formEliminarDeuda.tipoEliminacion === 'mes' ? 'rgba(59, 130, 246, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                  border: formEliminarDeuda.tipoEliminacion === 'mes' ? '1px solid #3b82f6' : '1px solid #374151',
                  borderRadius: '10px',
                  cursor: 'pointer'
                }}>
                  <input
                    type="radio"
                    name="tipoEliminacion"
                    value="mes"
                    checked={formEliminarDeuda.tipoEliminacion === 'mes'}
                    onChange={() => onChangeForm(prev => ({ ...prev, tipoEliminacion: 'mes' }))}
                    style={{ accentColor: '#3b82f6' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>
                      {formEliminarDeuda.aplicarATodoEdificio ? 'Deuda de un Mes Específico en TODO el Edificio' : 'Deuda de un Mes Específico'}
                    </div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                      {formEliminarDeuda.aplicarATodoEdificio ? 'Borra la cuota mensual de todos los apartamentos en el mes elegido' : 'Borra la obligación de gas del mes seleccionado'}
                    </div>
                  </div>
                </label>

                {formEliminarDeuda.tipoEliminacion === 'mes' && (
                  <div style={{ paddingLeft: '28px', marginTop: '-4px' }}>
                    <select
                      value={formEliminarDeuda.mesKey}
                      onChange={e => onChangeForm(prev => ({ ...prev, mesKey: e.target.value }))}
                      style={{
                        width: '100%',
                        backgroundColor: '#030712',
                        border: '1px solid #3b82f6',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        color: '#fff',
                        fontSize: '12px',
                        fontWeight: 600
                      }}
                    >
                      {mesesConfig.map(m => (
                        <option key={m.mesKey} value={m.mesKey}>
                          {m.label} ({m.mesKey})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 14px',
                  backgroundColor: formEliminarDeuda.tipoEliminacion === 'todas' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                  border: formEliminarDeuda.tipoEliminacion === 'todas' ? '1px solid #ef4444' : '1px solid #374151',
                  borderRadius: '10px',
                  cursor: 'pointer'
                }}>
                  <input
                    type="radio"
                    name="tipoEliminacion"
                    value="todas"
                    checked={formEliminarDeuda.tipoEliminacion === 'todas'}
                    onChange={() => onChangeForm(prev => ({ ...prev, tipoEliminacion: 'todas' }))}
                    style={{ accentColor: '#ef4444' }}
                  />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#fca5a5' }}>
                      {formEliminarDeuda.aplicarATodoEdificio ? 'TODAS las Deudas de Gas de TODO EL EDIFICIO' : 'TODAS las Deudas de Gas (Anterior + Todos los Meses)'}
                    </div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                      {formEliminarDeuda.aplicarATodoEdificio ? 'Deja a absolutamente todos los apartamentos en 0 deuda y solventes' : 'Limpia por completo cualquier deuda y lo deja solvente'}
                    </div>
                  </div>
                </label>
              </div>
            </div>

            {formEliminarDeuda.aplicarATodoEdificio ? (
              <div style={{
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                borderRadius: '12px',
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '16px' }}>🔒</span>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#fca5a5', textTransform: 'uppercase' }}>
                    Confirmación de Seguridad Obligatoria
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '12px', color: '#cbd5e1', lineHeight: 1.4 }}>
                  Para autorizar el borrado de la deuda de <strong>TODO EL EDIFICIO</strong>, escribe la palabra <strong style={{ color: '#ef4444', letterSpacing: '1px' }}>BORRAR</strong> a continuación:
                </p>
                <input
                  type="text"
                  value={formEliminarDeuda.palabraConfirmacion}
                  onChange={e => onChangeForm(prev => ({ ...prev, palabraConfirmacion: e.target.value.toUpperCase() }))}
                  placeholder="Escribe BORRAR aquí"
                  autoComplete="off"
                  style={{
                    width: '100%',
                    backgroundColor: '#030712',
                    border: formEliminarDeuda.palabraConfirmacion.trim() === 'BORRAR' ? '2px solid #10b981' : '1px solid #ef4444',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    color: '#fff',
                    fontSize: '14px',
                    fontWeight: 800,
                    letterSpacing: '2px',
                    textAlign: 'center',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
                <div style={{ fontSize: '11px', textAlign: 'center', fontWeight: 600 }}>
                  {formEliminarDeuda.palabraConfirmacion.trim() === 'BORRAR' ? (
                    <span style={{ color: '#34d399' }}>✓ Confirmación aceptada. Botón de eliminación habilitado.</span>
                  ) : (
                    <span style={{ color: '#f87171' }}>⚠️ Escribe exactamente "BORRAR" para habilitar la eliminación.</span>
                  )}
                </div>
              </div>
            ) : (
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: formEliminarDeuda.checkConfirmacion ? '1px solid #10b981' : '1px solid #374151',
                borderRadius: '10px',
                padding: '10px 14px',
                cursor: 'pointer'
              }}>
                <input
                  type="checkbox"
                  checked={formEliminarDeuda.checkConfirmacion}
                  onChange={e => onChangeForm(prev => ({ ...prev, checkConfirmacion: e.target.checked }))}
                  style={{ width: '18px', height: '18px', accentColor: '#ef4444', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '12px', color: '#cbd5e1', fontWeight: 600 }}>
                  Confirmo que deseo perdonar/eliminar esta deuda del Apto {formEliminarDeuda.apartamentoNumero || 'seleccionado'}
                </span>
              </label>
            )}

            <div style={{
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: '10px',
              padding: '12px 14px',
              fontSize: '12px',
              color: '#fca5a5',
              lineHeight: 1.4
            }}>
              ⚠️ <strong>Atención:</strong> Al confirmar, el saldo pasará a 0 y no figurará como pendiente de cobro en el calendario ni en el estado de cuenta del residente.
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
              disabled={eliminandoDeuda}
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
              disabled={confirmDisabled}
              style={{
                padding: '9px 20px',
                backgroundColor: '#ef4444',
                color: '#fff',
                border: 'none',
                borderRadius: '10px',
                fontSize: '12px',
                fontWeight: 800,
                cursor: confirmDisabled ? 'not-allowed' : 'pointer',
                opacity: confirmDisabled ? 0.5 : 1,
                boxShadow: '0 4px 12px rgba(239, 68, 68, 0.4)'
              }}
            >
              {eliminandoDeuda
                ? 'Eliminando...'
                : formEliminarDeuda.aplicarATodoEdificio
                ? 'Confirmar Eliminación de Todo el Edificio'
                : 'Confirmar Eliminación'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
})
