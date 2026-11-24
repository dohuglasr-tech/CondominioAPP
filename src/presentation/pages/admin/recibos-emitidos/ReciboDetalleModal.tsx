import React from 'react'
import { formatAlicuotaPct } from '../../../../utils/alicuota'

export interface ReciboEmitidoModalData {
  id: string
  apartamento_id: string
  mes_facturado: string
  tasa_bcv: number
  total_gastos_usd: number
  alicuota: number
  subtotal_usd: number
  fondo_reserva_pct: number
  fondo_reserva_usd: number
  cargos_extra_usd: number
  total_usd: number
  total_bs: number
  estado: 'pendiente' | 'pagado'
  es_indexado?: boolean
  data_json: {
    gastos?: Array<{ descripcion: string; monto_usd: number; monto_bs: number; categoria?: string }>
    cargos_especiales?: Array<{ tipo: string; descripcion: string; monto_usd: number; monto_bs?: number }>
    fondo_reserva_pct?: number
    notas_residentes?: string
    es_indexado?: boolean
    [key: string]: any
  } | null
  emitido_at: string
  apartamento?: {
    numero: string
    piso: number | null
    alicuota: number
    propietario_nombre: string | null
    propietario_email?: string | null
    telefono_contacto: string | null
  }
}

interface ReciboDetalleModalProps<T extends ReciboEmitidoModalData> {
  reciboModal: T | null
  mesLabelActivo: string
  enviandoEmailId: string | null
  onClose: () => void
  onCambiarEstado: (recibo: T) => void
  onSolicitarEliminar: (recibo: T) => void
  onWhatsApp: (recibo: T) => void
  onEmail: (recibo: T) => void
  onDescargarPdf: (recibo: T) => void
}

const fmtBs = (n: number) => (n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtUsd = (n: number) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function ReciboDetalleModalInner<T extends ReciboEmitidoModalData>({
  reciboModal,
  mesLabelActivo,
  enviandoEmailId,
  onClose,
  onCambiarEstado,
  onSolicitarEliminar,
  onWhatsApp,
  onEmail,
  onDescargarPdf
}: ReciboDetalleModalProps<T>) {
  if (!reciboModal) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px'
    }}>
      <div style={{
        backgroundColor: '#141414', border: '1px solid #2a2a2a', borderRadius: '16px',
        maxWidth: '650px', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '24px',
        boxShadow: '0 25px 60px rgba(0,0,0,0.8)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #222', paddingBottom: '14px', marginBottom: '16px' }}>
          <div>
            <span style={{ color: 'var(--color-accent, #f97316)', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase' }}>
              Detalle del Recibo Emitido
            </span>
            <h2 style={{ fontSize: '20px', fontWeight: 800, margin: '2px 0 0' }}>
              Apartamento {reciboModal.apartamento?.numero} — {mesLabelActivo}
            </h2>
            <p style={{ color: '#888', fontSize: '12px', margin: '2px 0 0' }}>
              Propietario: {reciboModal.apartamento?.propietario_nombre || 'Sin registrar'} · Alícuota: {formatAlicuotaPct(reciboModal.alicuota)}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#888', fontSize: '20px', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
          <div style={{ backgroundColor: '#0a0a0a', padding: '10px 14px', borderRadius: '10px', border: '1px solid #1e1e1e' }}>
            <div style={{ color: '#888', fontSize: '10px', textTransform: 'uppercase', fontWeight: 600 }}>Total USD a Pagar</div>
            <div style={{ color: 'var(--color-accent, #f97316)', fontSize: '20px', fontWeight: 900 }}>$ {fmtUsd(reciboModal.total_usd)}</div>
          </div>
          <div style={{ backgroundColor: '#0a0a0a', padding: '10px 14px', borderRadius: '10px', border: '1px solid #1e1e1e' }}>
            <div style={{ color: '#888', fontSize: '10px', textTransform: 'uppercase', fontWeight: 600 }}>Total en Bolívares</div>
            <div style={{ color: '#10b981', fontSize: '20px', fontWeight: 900 }}>Bs. {fmtBs(reciboModal.total_bs)}</div>
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <h4 style={{ fontSize: '12px', color: '#cbd5e1', fontWeight: 700, margin: '0 0 8px' }}>
            Desglose de Gastos Comunes
          </h4>
          <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #1e1e1e', borderRadius: '8px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <tbody>
                {(reciboModal.data_json?.gastos || []).map((g, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #1a1a1a', backgroundColor: idx % 2 === 0 ? '#0f0f0f' : '#0a0a0a' }}>
                    <td style={{ padding: '6px 10px', color: '#ccc' }}>{g.descripcion}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', color: '#10b981' }}>{fmtBs(g.monto_bs)} Bs</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', color: '#fff', fontWeight: 600 }}>$ {fmtUsd(g.monto_usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {reciboModal.data_json?.notas_residentes && (
          <div style={{ marginBottom: '18px', backgroundColor: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: '10px', padding: '12px' }}>
            <div style={{ color: 'var(--color-accent, #f97316)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>
              Notas para los Residentes emitidas en este recibo:
            </div>
            <div style={{ color: '#94a3b8', fontSize: '11px', whiteSpace: 'pre-line', lineHeight: '1.4' }}>
              {reciboModal.data_json.notas_residentes}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #222', paddingTop: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={() => onCambiarEstado(reciboModal)}
              style={{
                backgroundColor: reciboModal.estado === 'pagado' ? '#ef444420' : '#10b98120',
                color: reciboModal.estado === 'pagado' ? '#ef4444' : '#10b981',
                border: reciboModal.estado === 'pagado' ? '1px solid #ef444440' : '1px solid #10b98140',
                padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '12px'
              }}
            >
              {reciboModal.estado === 'pagado' ? 'Marcar como Pendiente' : 'Marcar como Pagado'}
            </button>

            <button
              onClick={() => onSolicitarEliminar(reciboModal)}
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                color: '#ef4444',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                padding: '8px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
              title="Retirar deuda y anular este recibo"
            >
              <span>🗑️</span> Retirar Deuda
            </button>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={onClose}
              style={{
                backgroundColor: '#1f2937', color: '#ccc', border: '1px solid #374151',
                padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 600
              }}
            >
              Cerrar
            </button>
            <button
              onClick={() => onWhatsApp(reciboModal)}
              style={{
                backgroundColor: '#16a34a', color: '#fff', border: 'none',
                padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: '6px'
              }}
              title="Enviar por WhatsApp con 1 clic"
            >
              <span>📲</span> {reciboModal.estado === 'pagado' ? 'Solvencia WhatsApp' : 'Enviar por WhatsApp'}
            </button>
            <button
              onClick={() => onEmail(reciboModal)}
              disabled={enviandoEmailId === reciboModal.id}
              style={{
                backgroundColor: '#2563eb', color: '#fff', border: 'none',
                padding: '8px 16px', borderRadius: '8px', cursor: enviandoEmailId === reciboModal.id ? 'wait' : 'pointer',
                fontSize: '12px', fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: '6px'
              }}
              title="Enviar por correo electrónico al residente"
            >
              <span>📧</span> {enviandoEmailId === reciboModal.id ? 'Enviando...' : (reciboModal.estado === 'pagado' ? 'Enviar Solvencia Email' : 'Enviar por Correo')}
            </button>
            <button
              onClick={() => onDescargarPdf(reciboModal)}
              style={{
                backgroundColor: 'var(--color-accent, #f97316)', color: '#fff', border: 'none',
                padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: '6px'
              }}
            >
              <span>📥</span> Descargar PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export const ReciboDetalleModal = React.memo(ReciboDetalleModalInner) as typeof ReciboDetalleModalInner
