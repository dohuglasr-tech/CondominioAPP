import React from 'react'

interface DashboardQuickActionsProps {
  estaSolvente: boolean
  onReportarPago: () => void
  onOpenSolvencia: () => void
  onNavigate: (path: string) => void
}

export const DashboardQuickActions = React.memo<DashboardQuickActionsProps>(({
  estaSolvente,
  onReportarPago,
  onOpenSolvencia,
  onNavigate
}) => {
  return (
    <div>
      <h2 style={{ color: '#fff', fontSize: '18px', fontWeight: 800, margin: '0 0 16px', letterSpacing: '-0.3px' }}>
        Acciones rápidas
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '18px 12px' }}>
        <button className="quick-action-btn" onClick={onReportarPago}>
          <div className="quick-action-circle" style={{
            backgroundColor: '#13281f',
            border: '1px solid rgba(34, 197, 94, 0.35)',
            color: '#22c55e',
            boxShadow: '0 4px 18px rgba(34, 197, 94, 0.25)'
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </div>
          <span className="quick-action-label" style={{ color: '#22c55e', fontWeight: 700 }}>+ Pago</span>
        </button>

        <button className="quick-action-btn" onClick={() => onNavigate('/recibos')}>
          <div className="quick-action-circle" style={{
            backgroundColor: '#261215',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            color: '#f87171'
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
          </div>
          <span className="quick-action-label">Recibos</span>
        </button>

        <button className="quick-action-btn" onClick={() => onNavigate('/junta')}>
          <div className="quick-action-circle" style={{
            backgroundColor: '#101d2c',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            color: '#60a5fa'
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <span className="quick-action-label">Junta</span>
        </button>

        <button className="quick-action-btn" onClick={() => onNavigate('/mora')}>
          <div className="quick-action-circle" style={{
            backgroundColor: '#23122c',
            border: '1px solid rgba(168, 85, 247, 0.25)',
            color: '#c084fc'
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <span className="quick-action-label">Mora</span>
        </button>

        <button className="quick-action-btn" onClick={() => onNavigate('/chat')}>
          <div className="quick-action-circle" style={{
            backgroundColor: '#0c2229',
            border: '1px solid rgba(6, 182, 212, 0.25)',
            color: '#22d3ee'
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <span className="quick-action-label">Chat</span>
        </button>

        <button className="quick-action-btn" onClick={() => onNavigate('/reportes')}>
          <div className="quick-action-circle" style={{
            backgroundColor: '#261e0e',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            color: '#fbbf24'
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <span className="quick-action-label">Averías</span>
        </button>

        <button className="quick-action-btn" onClick={() => onNavigate('/normas')}>
          <div className="quick-action-circle" style={{
            backgroundColor: 'rgba(249, 115, 22, 0.15)',
            border: '1px solid rgba(249, 115, 22, 0.35)',
            color: 'var(--color-accent, #f97316)'
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
              <line x1="8" y1="6" x2="16" y2="6"/>
              <line x1="8" y1="10" x2="16" y2="10"/>
            </svg>
          </div>
          <span className="quick-action-label">Normas</span>
        </button>

        <button className="quick-action-btn" onClick={() => onNavigate('/gas')}>
          <div className="quick-action-circle" style={{
            backgroundColor: 'rgba(249, 115, 22, 0.15)',
            border: '1px solid rgba(249, 115, 22, 0.4)',
            color: '#f97316'
          }}>
            <span style={{ fontSize: '22px' }}>⛽</span>
          </div>
          <span className="quick-action-label" style={{ color: '#fed7aa' }}>Gas</span>
        </button>

        <button
          className="quick-action-btn"
          onClick={() => onNavigate('/locales')}
          title="Consultar locales comerciales y donaciones de espacios"
        >
          <div className="quick-action-circle" style={{
            backgroundColor: 'rgba(56, 189, 248, 0.15)',
            border: '1px solid rgba(56, 189, 248, 0.4)',
            color: '#38bdf8'
          }}>
            <span style={{ fontSize: '22px' }}>🏢</span>
          </div>
          <span className="quick-action-label" style={{ color: '#bae6fd' }}>Locales</span>
        </button>

        {estaSolvente && (
          <button
            className="quick-action-btn"
            onClick={onOpenSolvencia}
            title="Consultar y descargar Carta de Solvencia Oficial"
          >
            <div className="quick-action-circle" style={{
              backgroundColor: 'rgba(22, 163, 74, 0.2)',
              border: '1.5px solid rgba(34, 197, 94, 0.5)',
              color: '#4ade80',
              boxShadow: '0 4px 18px rgba(34, 197, 94, 0.3)'
            }}>
              <span style={{ fontSize: '22px' }}>📜</span>
            </div>
            <span className="quick-action-label" style={{ color: '#4ade80', fontWeight: 800 }}>
              Solvencia
            </span>
          </button>
        )}
      </div>
    </div>
  )
})
