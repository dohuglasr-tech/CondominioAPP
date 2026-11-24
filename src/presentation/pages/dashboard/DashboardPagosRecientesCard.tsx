import React from 'react'
import { parsePagoMeta } from '../../../data/gasService'

export interface DashboardPagoItem {
  id: string
  monto_bs: number
  monto_usd?: number
  referencia: string
  estado: string
  created_at: string
  notas_admin?: string | null
}

interface DashboardPagosRecientesCardProps {
  pagosRecientes: DashboardPagoItem[]
  onVerHistorialCompleto: () => void
}

export const DashboardPagosRecientesCard = React.memo<DashboardPagosRecientesCardProps>(({
  pagosRecientes,
  onVerHistorialCompleto
}) => {
  return (
    <div className="desktop-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
        <h3 style={{ color: '#fff', fontSize: '17px', fontWeight: 800, margin: 0 }}>
          Historial de Pagos Reportados
        </h3>
        <button
          onClick={onVerHistorialCompleto}
          style={{ background: 'none', border: 'none', color: 'var(--color-accent, #f97316)', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
        >
          Ver historial completo →
        </button>
      </div>

      {pagosRecientes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '36px 20px', color: '#64748b' }}>
          <p style={{ margin: 0, fontSize: '14px' }}>No hay pagos registrados para este apartamento.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {pagosRecientes.map((pago) => {
            const isAprobado = pago.estado === 'aprobado'
            const isRechazado = pago.estado === 'rechazado'

            return (
              <div
                key={pago.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 16px',
                  backgroundColor: '#161922',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  borderRadius: '14px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{
                    width: '42px', height: '42px', borderRadius: '12px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px',
                    backgroundColor: isAprobado ? 'rgba(34, 197, 94, 0.15)' : isRechazado ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                    color: isAprobado ? '#22c55e' : isRechazado ? '#ef4444' : '#f59e0b',
                    flexShrink: 0
                  }}>
                    {isAprobado ? '✓' : isRechazado ? '✕' : '⏳'}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ color: '#fff', fontSize: '14px', fontWeight: 700 }}>
                        Referencia Bancaria: {pago.referencia}
                      </span>
                      {(() => {
                        const m = parsePagoMeta(pago.notas_admin)
                        if (m?.esAdelantoCuotaFutura) {
                          return (
                            <span style={{ fontSize: '10px', fontWeight: 800, color: '#38bdf8', backgroundColor: 'rgba(14,165,233,0.16)', border: '1px solid rgba(56,189,248,0.3)', padding: '2px 7px', borderRadius: '6px' }}>
                              {m.esAbonoParcialAdelanto ? '🌗 Abono Adelantado Cuota Extra' : '🗓️ Pago Adelantado Cuota Extra'}
                            </span>
                          )
                        }
                        if (m?.tipoServicio === 'gas') return <span style={{ fontSize: '10px', fontWeight: 800, color: '#fb923c', backgroundColor: 'rgba(249,115,22,0.16)', border: '1px solid rgba(249,115,22,0.3)', padding: '2px 7px', borderRadius: '6px' }}>⛽ Gas</span>
                        if (m?.tipoServicio === 'mixto') return <span style={{ fontSize: '10px', fontWeight: 800, color: '#c084fc', backgroundColor: 'rgba(168,85,247,0.16)', border: '1px solid rgba(168,85,247,0.3)', padding: '2px 7px', borderRadius: '6px' }}>🔀 Mixto</span>
                        return null
                      })()}
                    </div>
                    <div style={{ color: '#7e8b9b', fontSize: '12px', marginTop: '2px' }}>
                      Fecha: {new Date(pago.created_at).toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' })}
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: '#fff', fontSize: '15px', fontWeight: 800 }}>
                    Bs. {pago.monto_bs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                  </div>
                  <span style={{
                    fontSize: '11px', fontWeight: 800,
                    color: isAprobado ? '#22c55e' : isRechazado ? '#ef4444' : '#f59e0b',
                    textTransform: 'uppercase'
                  }}>
                    {isAprobado ? 'Conciliado · Aprobado' : isRechazado ? 'Rechazado' : 'En Verificación'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
})
