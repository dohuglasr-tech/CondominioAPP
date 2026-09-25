import React from 'react'
import { useBcvRate } from '../../../data/useBcvRate'

interface StatCardProps {
  icon: string
  label: string
  value: string
  sub?: string
  color?: string
}

const StatCard: React.FC<StatCardProps> = ({ icon, label, value, sub, color = '#f97316' }) => (
  <div style={{
    backgroundColor: '#141414', border: '1px solid #1e1e1e', borderRadius: '14px',
    padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px'
  }}>
    <span style={{ fontSize: '24px' }}>{icon}</span>
    <p style={{ color: '#888', fontSize: '12px', fontWeight: 500 }}>{label}</p>
    <p style={{ color: '#fff', fontSize: '24px', fontWeight: 800 }}>{value}</p>
    {sub && <p style={{ color, fontSize: '12px', fontWeight: 600 }}>{sub}</p>}
  </div>
)

export const AdminDashboard: React.FC = () => {
  const mes = new Date().toLocaleString('es-VE', { month: 'long', year: 'numeric' })
  const { rate, loading, error } = useBcvRate()

  const totalUsd = 2180
  const totalBs = totalUsd * rate

  return (
    <div style={{ padding: '32px' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ color: '#fff', fontSize: '28px', fontWeight: 800, margin: 0 }}>Panel de Administración</h1>
        <p style={{ color: '#666', fontSize: '14px', marginTop: '4px', textTransform: 'capitalize' }}>{mes}</p>
        {!loading && !error && <p style={{ color: '#f97316', fontSize: '12px', marginTop: '8px' }}>Tasa BCV Oficial: {rate} Bs/$</p>}
      </div>

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '32px' }}>
        <StatCard icon="🏠" label="Apartamentos" value="24" sub="Total en torre" />
        <StatCard icon="✅" label="Pagos Aprobados" value="18" sub="Este mes" color="#10b981" />
        <StatCard icon="⏳" label="Pagos Pendientes" value="6" sub="Por revisar" color="#f59e0b" />
        <StatCard 
          icon="💰" 
          label="Total Recaudado" 
          value={`Bs. ${totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} 
          sub={`Ref: $${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })} (BCV: ${rate})`} 
          color="#f97316" 
        />
        <StatCard icon="📢" label="Reportes Abiertos" value="3" sub="Requieren atención" color="#ef4444" />
        <StatCard icon="🗳️" label="Propuestas Activas" value="2" sub="En votación" color="#8b5cf6" />
      </div>

      {/* Actividad reciente */}
      <div style={{ backgroundColor: '#141414', border: '1px solid #1e1e1e', borderRadius: '16px', padding: '24px' }}>
        <h2 style={{ color: '#fff', fontSize: '16px', fontWeight: 700, marginBottom: '20px' }}>Actividad Reciente</h2>
        {[
          { icon: '✅', text: 'Pago aprobado - Apto 12', time: 'Hace 2h', color: '#10b981' },
          { icon: '📢', text: 'Nuevo reporte de incidencia - Apto 7', time: 'Hace 4h', color: '#ef4444' },
          { icon: '⏳', text: 'Pago pendiente de revisión - Apto 23', time: 'Hace 6h', color: '#f59e0b' },
          { icon: '💸', text: 'Gasto registrado: Corpoelec Septiembre', time: 'Ayer', color: '#888' },
        ].map((a, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0', borderBottom: i < 3 ? '1px solid #1e1e1e' : 'none' }}>
            <span style={{ fontSize: '18px' }}>{a.icon}</span>
            <div style={{ flex: 1 }}>
              <p style={{ color: '#ddd', fontSize: '13px' }}>{a.text}</p>
            </div>
            <span style={{ color: '#555', fontSize: '11px' }}>{a.time}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
