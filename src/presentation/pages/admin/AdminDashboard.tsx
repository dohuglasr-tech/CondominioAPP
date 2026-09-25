import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useBcvRate } from '../../../data/useBcvRate'

interface StatCardProps {
  icon: string
  label: string
  value: string
  sub?: string
  color?: string
  onClick?: () => void
}

const StatCard: React.FC<StatCardProps> = ({ icon, label, value, sub, color = '#f97316', onClick }) => (
  <div onClick={onClick} style={{
    backgroundColor: '#141414', border: '1px solid #1e1e1e', borderRadius: '14px',
    padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px',
    cursor: onClick ? 'pointer' : 'default', transition: 'border-color 0.2s',
  }}
  onMouseOver={e => { if (onClick) e.currentTarget.style.borderColor = color }}
  onMouseOut={e => { if (onClick) e.currentTarget.style.borderColor = '#1e1e1e' }}
  >
    <span style={{ fontSize: '24px' }}>{icon}</span>
    <p style={{ color: '#888', fontSize: '12px', fontWeight: 500 }}>{label}</p>
    <p style={{ color: '#fff', fontSize: '24px', fontWeight: 800 }}>{value}</p>
    {sub && <p style={{ color, fontSize: '12px', fontWeight: 600 }}>{sub}</p>}
  </div>
)

export const AdminDashboard: React.FC = () => {
  const navigate = useNavigate()
  const mes = new Date().toLocaleString('es-VE', { month: 'long', year: 'numeric' })
  const { rate, loading, error } = useBcvRate()

  const totalUsd = 0
  const totalBs = 0

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
        <StatCard icon="🏠" label="Apartamentos" value="24" sub="Total en torre" onClick={() => navigate('/admin/residentes')} />
        <StatCard icon="✅" label="Pagos Aprobados" value="0" sub="Este mes" color="#10b981" onClick={() => navigate('/admin/recibos')} />
        <StatCard icon="⏳" label="Pagos Pendientes" value="0" sub="Por revisar" color="#f59e0b" onClick={() => navigate('/admin/recibos')} />
        <StatCard 
          icon="💰" 
          label="Total Recaudado" 
          value={`Bs. ${totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} 
          sub={`Ref: $${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} 
          color="#f97316" 
          onClick={() => navigate('/admin/gastos')}
        />
        <StatCard icon="📢" label="Reportes Abiertos" value="0" sub="Requieren atención" color="#ef4444" onClick={() => navigate('/admin/reportes')} />
        <StatCard icon="🗳️" label="Propuestas Activas" value="0" sub="En votación" color="#8b5cf6" onClick={() => navigate('/admin/propuestas')} />
      </div>

      {/* Actividad reciente */}
      <div style={{ backgroundColor: '#141414', border: '1px solid #1e1e1e', borderRadius: '16px', padding: '24px' }}>
        <h2 style={{ color: '#fff', fontSize: '16px', fontWeight: 700, marginBottom: '20px' }}>Actividad Reciente</h2>
        <div style={{ padding: '20px', textAlign: 'center', color: '#666', fontSize: '14px' }}>
          No hay actividad reciente registrada en la plataforma.
        </div>
      </div>
    </div>
  )
}
