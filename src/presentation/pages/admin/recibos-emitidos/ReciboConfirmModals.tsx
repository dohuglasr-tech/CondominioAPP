import React from 'react'
import { ReciboEmitidoModalData } from './ReciboDetalleModal'

interface ReciboConfirmModalsProps {
  mesLabelActivo: string
  totalRecibos: number
  totalFacturadoUsd: number
  totalFacturadoBs: number

  modalEliminarEmisionOpen: boolean
  motivoEliminarEmision: string
  palabraConfirmacion: string
  eliminandoEmision: boolean
  onChangeMotivoEliminarEmision: (v: string) => void
  onChangePalabraConfirmacion: (v: string) => void
  onCloseEliminarEmision: () => void
  onConfirmarEliminarEmision: () => void

  modalEliminarReciboOpen: boolean
  reciboParaEliminar: ReciboEmitidoModalData | null
  motivoEliminarRecibo: string
  eliminandoRecibo: boolean
  onChangeMotivoEliminarRecibo: (v: string) => void
  onCloseEliminarRecibo: () => void
  onConfirmarEliminarRecibo: () => void

  modalBulkPagadosOpen: boolean
  modalBulkMoraOpen: boolean
  ejecutandoBulk: boolean
  onCloseBulkPagados: () => void
  onCloseBulkMora: () => void
  onEjecutarBulkEstado: (estado: 'pagado' | 'pendiente') => void
}

const fmtBs = (n: number) => (n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtUsd = (n: number) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const ReciboConfirmModals = React.memo<ReciboConfirmModalsProps>(({
  mesLabelActivo,
  totalRecibos,
  totalFacturadoUsd,
  totalFacturadoBs,
  modalEliminarEmisionOpen,
  motivoEliminarEmision,
  palabraConfirmacion,
  eliminandoEmision,
  onChangeMotivoEliminarEmision,
  onChangePalabraConfirmacion,
  onCloseEliminarEmision,
  onConfirmarEliminarEmision,
  modalEliminarReciboOpen,
  reciboParaEliminar,
  motivoEliminarRecibo,
  eliminandoRecibo,
  onChangeMotivoEliminarRecibo,
  onCloseEliminarRecibo,
  onConfirmarEliminarRecibo,
  modalBulkPagadosOpen,
  modalBulkMoraOpen,
  ejecutandoBulk,
  onCloseBulkPagados,
  onCloseBulkMora,
  onEjecutarBulkEstado
}) => {
  return (
    <>
      {modalEliminarEmisionOpen && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#111318', border: '2px solid #ef4444', borderRadius: '20px',
            maxWidth: '540px', width: '100%', padding: '26px', boxShadow: '0 25px 60px rgba(239, 68, 68, 0.25)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
              <div style={{
                width: '46px', height: '46px', borderRadius: '12px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px'
              }}>
                🗑️
              </div>
              <div>
                <h3 style={{ color: '#fff', fontSize: '18px', fontWeight: 800, margin: 0 }}>
                  Retirar Deuda y Eliminar Emisión Completa
                </h3>
                <span style={{ color: '#ef4444', fontSize: '12px', fontWeight: 700 }}>
                  Mes a anular: {mesLabelActivo}
                </span>
              </div>
            </div>

            <p style={{ color: '#cbd5e1', fontSize: '13px', lineHeight: 1.45, margin: '0 0 16px' }}>
              Esta acción eliminará <strong>en su totalidad la emisión de recibos de {mesLabelActivo}</strong> para todos los <strong>{totalRecibos} apartamentos</strong>, retirando una deuda total de <strong style={{ color: 'var(--color-accent, #f97316)' }}>$ {fmtUsd(totalFacturadoUsd)} USD (Bs. {fmtBs(totalFacturadoBs)})</strong>.
            </p>

            <div style={{
              backgroundColor: 'rgba(234, 179, 8, 0.1)',
              border: '1px solid rgba(234, 179, 8, 0.3)',
              borderRadius: '12px',
              padding: '12px 14px',
              marginBottom: '16px',
              fontSize: '12px',
              color: '#fef08a',
              lineHeight: 1.4
            }}>
              🛡️ <strong>REGISTRO INMUTABLE DE AUDITORÍA:</strong><br />
              Para garantizar la transparencia ante la comunidad y los auditores, este movimiento quedará grabado permanentemente con tu nombre, sello de tiempo, monto exacto y el motivo que especifiques.
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px' }}>
                Motivo / Justificación obligatoria de la anulación:
              </label>
              <textarea
                value={motivoEliminarEmision}
                onChange={e => onChangeMotivoEliminarEmision(e.target.value)}
                placeholder="Ej: Se detectó error en la alícuota de gas común. Se anula la emisión para corregir los gastos y reemitir nuevamente."
                rows={3}
                style={{
                  width: '100%', backgroundColor: '#090a0d', border: '1px solid #334155',
                  borderRadius: '10px', padding: '10px 12px', color: '#fff', fontSize: '12.5px',
                  outline: 'none', boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', color: '#ef4444', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px' }}>
                Escribe la palabra "ELIMINAR" para confirmar:
              </label>
              <input
                type="text"
                value={palabraConfirmacion}
                onChange={e => onChangePalabraConfirmacion(e.target.value)}
                placeholder="ELIMINAR"
                style={{
                  width: '100%', backgroundColor: '#090a0d', border: '1px solid #ef444450',
                  borderRadius: '10px', padding: '10px 12px', color: '#fff', fontSize: '13px',
                  fontWeight: 800, letterSpacing: '1px', outline: 'none', boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={onCloseEliminarEmision}
                disabled={eliminandoEmision}
                style={{
                  backgroundColor: '#1f2937', color: '#94a3b8', border: '1px solid #374151',
                  padding: '10px 18px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer'
                }}
              >
                Cancelar
              </button>

              <button
                onClick={onConfirmarEliminarEmision}
                disabled={eliminandoEmision || palabraConfirmacion.trim().toUpperCase() !== 'ELIMINAR' || motivoEliminarEmision.trim().length < 8}
                style={{
                  backgroundColor: (palabraConfirmacion.trim().toUpperCase() === 'ELIMINAR' && motivoEliminarEmision.trim().length >= 8) ? '#dc2626' : '#451a1a',
                  color: (palabraConfirmacion.trim().toUpperCase() === 'ELIMINAR' && motivoEliminarEmision.trim().length >= 8) ? '#fff' : '#888',
                  border: 'none', padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 800,
                  cursor: (palabraConfirmacion.trim().toUpperCase() === 'ELIMINAR' && motivoEliminarEmision.trim().length >= 8) ? 'pointer' : 'not-allowed',
                  boxShadow: '0 4px 14px rgba(220, 38, 38, 0.4)'
                }}
              >
                {eliminandoEmision ? 'Eliminando y auditando...' : 'Confirmar y Retirar Emisión'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalEliminarReciboOpen && reciboParaEliminar && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#111318', border: '2px solid var(--color-accent, #f97316)', borderRadius: '20px',
            maxWidth: '500px', width: '100%', padding: '24px', boxShadow: 'var(--color-brand-shadow, 0 25px 60px rgba(249, 115, 22, 0.25))'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
              <div style={{
                width: '44px', height: '44px', borderRadius: '12px',
                backgroundColor: 'var(--color-accent-light, rgba(249, 115, 22, 0.15))', border: '1px solid var(--color-accent-glow, rgba(249, 115, 22, 0.35))',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px'
              }}>
                📄
              </div>
              <div>
                <h3 style={{ color: '#fff', fontSize: '18px', fontWeight: 800, margin: 0 }}>
                  Retirar Deuda - Apto {reciboParaEliminar.apartamento?.numero}
                </h3>
                <span style={{ color: 'var(--color-accent, #f97316)', fontSize: '12px', fontWeight: 700 }}>
                  Mes: {mesLabelActivo}
                </span>
              </div>
            </div>

            <p style={{ color: '#cbd5e1', fontSize: '13px', lineHeight: 1.45, margin: '0 0 14px' }}>
              Se anulará el recibo emitido y se retirará la deuda del <strong>Apartamento {reciboParaEliminar.apartamento?.numero}</strong> por un monto de <strong style={{ color: 'var(--color-accent, #f97316)' }}>$ {fmtUsd(reciboParaEliminar.total_usd)} USD (Bs. {fmtBs(reciboParaEliminar.total_bs)})</strong>. El apartamento quedará sin deuda para este mes.
            </p>

            <div style={{
              backgroundColor: 'var(--color-accent-light, rgba(249, 115, 22, 0.08))',
              border: '1px solid var(--color-accent-glow, rgba(249, 115, 22, 0.25))',
              borderRadius: '10px', padding: '10px 12px', marginBottom: '16px',
              fontSize: '11.5px', color: '#fed7aa'
            }}>
              🛡️ <strong>REGISTRO EN AUDITORÍA:</strong> Este retiro quedará guardado para los arqueos del edificio.
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px' }}>
                Motivo del retiro de deuda:
              </label>
              <textarea
                value={motivoEliminarRecibo}
                onChange={e => onChangeMotivoEliminarRecibo(e.target.value)}
                placeholder="Ej: Cobro indebido corregido / Pago reportado por adelantado verificado / Condonación autorizada por la junta."
                rows={2}
                style={{
                  width: '100%', backgroundColor: '#090a0d', border: '1px solid #334155',
                  borderRadius: '10px', padding: '9px 12px', color: '#fff', fontSize: '12.5px',
                  outline: 'none', boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={onCloseEliminarRecibo}
                disabled={eliminandoRecibo}
                style={{
                  backgroundColor: '#1f2937', color: '#94a3b8', border: '1px solid #374151',
                  padding: '9px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer'
                }}
              >
                Cancelar
              </button>

              <button
                onClick={onConfirmarEliminarRecibo}
                disabled={eliminandoRecibo || motivoEliminarRecibo.trim().length < 6}
                style={{
                  backgroundColor: motivoEliminarRecibo.trim().length >= 6 ? 'var(--color-accent-hover, #ea580c)' : '#451a1a',
                  color: motivoEliminarRecibo.trim().length >= 6 ? '#fff' : '#888',
                  border: 'none', padding: '9px 18px', borderRadius: '10px', fontSize: '13px', fontWeight: 800,
                  cursor: motivoEliminarRecibo.trim().length >= 6 ? 'pointer' : 'not-allowed'
                }}
              >
                {eliminandoRecibo ? 'Retirando...' : 'Confirmar y Retirar Deuda'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalBulkPagadosOpen && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#111318', border: '2px solid #10b981', borderRadius: '20px',
            maxWidth: '520px', width: '100%', padding: '26px', boxShadow: '0 25px 60px rgba(16, 185, 129, 0.25)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
              <div style={{
                width: '46px', height: '46px', borderRadius: '12px',
                backgroundColor: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px'
              }}>
                🏛️
              </div>
              <div>
                <h3 style={{ color: '#fff', fontSize: '18px', fontWeight: 800, margin: 0 }}>
                  Marcar Todos como Pagados
                </h3>
                <span style={{ color: '#10b981', fontSize: '12px', fontWeight: 700 }}>
                  Mes: {mesLabelActivo} ({totalRecibos} apartamentos)
                </span>
              </div>
            </div>

            <p style={{ color: '#cbd5e1', fontSize: '13px', lineHeight: 1.5, margin: '0 0 16px' }}>
              ¿Deseas marcar todos los recibos de este mes histórico como <strong>PAGADOS</strong>?
              <br /><br />
              Esta herramienta acelera la carga de la administración anterior si la mayoría de los residentes estaban al día. Luego podrás alternar individualmente los pocos que hayan quedado en mora.
            </p>

            <div style={{
              backgroundColor: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)',
              borderRadius: '10px', padding: '10px 14px', marginBottom: '20px',
              fontSize: '12px', color: '#a7f3d0'
            }}>
              🛡️ Se actualizarán de inmediato las cuentas de los copropietarios y se registrará en el Historial de Auditoría.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={onCloseBulkPagados}
                disabled={ejecutandoBulk}
                style={{
                  backgroundColor: '#1f2937', color: '#94a3b8', border: '1px solid #374151',
                  padding: '9px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              <button
                onClick={() => onEjecutarBulkEstado('pagado')}
                disabled={ejecutandoBulk}
                style={{
                  backgroundColor: '#10b981', color: '#fff', border: 'none',
                  padding: '9px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 800, cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)'
                }}
              >
                {ejecutandoBulk ? 'Actualizando...' : '✓ Confirmar y Marcar Todos Pagados'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalBulkMoraOpen && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#111318', border: '2px solid #ef4444', borderRadius: '20px',
            maxWidth: '520px', width: '100%', padding: '26px', boxShadow: '0 25px 60px rgba(239, 68, 68, 0.25)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
              <div style={{
                width: '46px', height: '46px', borderRadius: '12px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px'
              }}>
                ⚠️
              </div>
              <div>
                <h3 style={{ color: '#fff', fontSize: '18px', fontWeight: 800, margin: 0 }}>
                  Marcar Todos en Mora / Pendiente
                </h3>
                <span style={{ color: '#f87171', fontSize: '12px', fontWeight: 700 }}>
                  Mes: {mesLabelActivo} ({totalRecibos} apartamentos)
                </span>
              </div>
            </div>

            <p style={{ color: '#cbd5e1', fontSize: '13px', lineHeight: 1.5, margin: '0 0 16px' }}>
              ¿Deseas marcar todos los recibos de este mes como <strong>EN MORA (Pendientes)</strong>?
              <br /><br />
              Todos los apartamentos figurarán con deuda pendiente de este mes hasta que sean marcados como pagados.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={onCloseBulkMora}
                disabled={ejecutandoBulk}
                style={{
                  backgroundColor: '#1f2937', color: '#94a3b8', border: '1px solid #374151',
                  padding: '9px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              <button
                onClick={() => onEjecutarBulkEstado('pendiente')}
                disabled={ejecutandoBulk}
                style={{
                  backgroundColor: '#ef4444', color: '#fff', border: 'none',
                  padding: '9px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 800, cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(239, 68, 68, 0.4)'
                }}
              >
                {ejecutandoBulk ? 'Actualizando...' : '⚠️ Confirmar y Marcar en Mora'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
})
