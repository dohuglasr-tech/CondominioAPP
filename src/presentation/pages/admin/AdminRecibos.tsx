import React, { useState } from 'react'
// useAuth y supabase se usarán cuando se conecte la DB real
// import { useAuth } from '../../../application/contexts/AuthContext'
// import { supabase } from '../../../data/supabase'

interface PagoAdmin {
  id: string
  monto_bs: number
  monto_usd: number
  banco_origen: string
  numero_referencia: string
  estado: string
  created_at: string
  nota_admin?: string
  apartamento: { numero: string } | null
}

const ESTADO_CONFIG: Record<string, { label: string, color: string, icon: string }> = {
  pendiente: { label: 'Pendiente', color: '#f59e0b', icon: '⏳' },
  aprobado: { label: 'Aprobado', color: '#10b981', icon: '✅' },
  rechazado: { label: 'Rechazado', color: '#ef4444', icon: '❌' },
}

const MOCK_PAGOS: PagoAdmin[] = []

export const AdminRecibos: React.FC = () => {
  const [pagos, setPagos] = useState<PagoAdmin[]>(MOCK_PAGOS)
  const [filtro, setFiltro] = useState<string>('todos')
  const [selected, setSelected] = useState<PagoAdmin | null>(null)
  const [nota, setNota] = useState('')
  const [procesando, setProcesando] = useState(false)

  const filtrados = filtro === 'todos' ? pagos : pagos.filter(p => p.estado === filtro)

  const handleAction = async (id: string, accion: 'aprobado' | 'rechazado') => {
    setProcesando(true)
    // En producción: await supabase.from('pagos').update({ estado: accion, nota_admin: nota }).eq('id', id)
    setPagos(prev => prev.map(p => p.id === id ? { ...p, estado: accion, nota_admin: nota } : p))
    setSelected(null)
    setNota('')
    setProcesando(false)
  }

  return (
    <div style={{ padding: '32px' }}>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ color: '#fff', fontSize: '24px', fontWeight: 800, margin: 0 }}>🧾 Gestión de Recibos</h1>
        <p style={{ color: '#666', fontSize: '14px', marginTop: '4px' }}>Aprobar o rechazar pagos reportados por residentes</p>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {['todos', 'pendiente', 'aprobado', 'rechazado'].map(f => (
          <button key={f} onClick={() => setFiltro(f)} style={{
            padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
            backgroundColor: filtro === f ? '#f97316' : '#1e1e1e', color: filtro === f ? '#fff' : '#888',
            textTransform: 'capitalize'
          }}>{f}</button>
        ))}
      </div>

      {/* Lista */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {filtrados.map(pago => {
          const cfg = ESTADO_CONFIG[pago.estado]
          const isSelected = selected?.id === pago.id
          return (
            <div key={pago.id} style={{ backgroundColor: '#141414', border: `1px solid ${isSelected ? '#f97316' : '#1e1e1e'}`, borderRadius: '12px', padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ color: '#fff', fontSize: '16px', fontWeight: 700 }}>Apto {pago.apartamento?.numero} — Bs. {pago.monto_bs.toLocaleString()}</p>
                  <p style={{ color: '#666', fontSize: '12px', marginTop: '4px' }}>{pago.banco_origen} · Ref: {pago.numero_referencia}</p>
                  {pago.nota_admin && <p style={{ color: '#fca5a5', fontSize: '12px', marginTop: '4px' }}>Nota: {pago.nota_admin}</p>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ backgroundColor: `${cfg.color}20`, color: cfg.color, border: `1px solid ${cfg.color}30`, padding: '4px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 700 }}>
                    {cfg.icon} {cfg.label}
                  </span>
                  {pago.estado === 'pendiente' && (
                    <button onClick={() => setSelected(isSelected ? null : pago)} style={{ backgroundColor: '#2a2a2a', color: '#fff', border: '1px solid #333', padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' }}>
                      {isSelected ? 'Cancelar' : 'Revisar'}
                    </button>
                  )}
                </div>
              </div>

              {/* Panel de acción */}
              {isSelected && (
                <div style={{ marginTop: '16px', borderTop: '1px solid #2a2a2a', paddingTop: '16px' }}>
                  <label style={{ display: 'block', color: '#888', fontSize: '12px', marginBottom: '8px' }}>Nota para el residente (opcional)</label>
                  <input
                    value={nota}
                    onChange={e => setNota(e.target.value)}
                    placeholder="Ej: Pago verificado correctamente..."
                    style={{ width: '100%', backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a', color: '#fff', padding: '10px', borderRadius: '8px', fontSize: '13px', marginBottom: '12px' }}
                  />
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={() => handleAction(pago.id, 'aprobado')} disabled={procesando} style={{ flex: 1, backgroundColor: '#10b981', color: '#fff', border: 'none', padding: '10px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>
                      ✅ Aprobar
                    </button>
                    <button onClick={() => handleAction(pago.id, 'rechazado')} disabled={procesando} style={{ flex: 1, backgroundColor: '#ef4444', color: '#fff', border: 'none', padding: '10px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>
                      ❌ Rechazar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
