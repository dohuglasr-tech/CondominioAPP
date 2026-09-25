import React, { useState } from 'react'
import { useAuth } from '../../application/contexts/AuthContext'
import { useBcvRate } from '../../data/useBcvRate'
import { ReportarPagoModal } from '../components/ReportarPagoModal'
import { useNavigate } from 'react-router-dom'

export function Dashboard() {
  const { signOut, perfil, isAdmin } = useAuth()
  const aptoNumero = (perfil as any)?.apartamento?.numero || perfil?.apartamento_id || ''
  const apartamentoId = perfil?.apartamento_id ?? ''

  const navigate = useNavigate()
  const [modalOpen, setModalOpen] = useState(false)
  
  const { rate, loading: loadingRate } = useBcvRate()
  const deudaUsd = 0 // Mock actual
  const deudaBs = deudaUsd * rate

  const s = {
    page: {
      minHeight: '100vh',
      backgroundColor: '#0a0a0a',
      fontFamily: "'Inter', sans-serif",
      color: '#ffffff',
      padding: '24px',
      boxSizing: 'border-box' as const,
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      maxWidth: '960px',
      margin: '0 auto 28px auto',
    },
    profileRow: {
      display: 'flex',
      alignItems: 'center',
      gap: '14px',
    },
    avatar: {
      width: '46px',
      height: '46px',
      backgroundColor: '#1c1c1c',
      border: '1px solid #2a2a2a',
      borderRadius: '14px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '22px',
    },
    aptoLabel: {
      fontSize: '12px',
      color: '#666',
      textTransform: 'uppercase' as const,
      letterSpacing: '1px',
      marginBottom: '2px',
      fontWeight: 600,
    },
    aptoTitle: {
      fontSize: '20px',
      fontWeight: 700,
      color: '#fff',
      lineHeight: 1.2,
    },
    btnGhost: {
      background: 'transparent',
      border: '1px solid #2a2a2a',
      color: '#888',
      padding: '10px 20px',
      borderRadius: '10px',
      fontSize: '13px',
      fontWeight: 600,
      cursor: 'pointer',
    },
    card: (extra?: React.CSSProperties): React.CSSProperties => ({
      backgroundColor: '#1c1c1c',
      border: '1px solid #2a2a2a',
      borderRadius: '20px',
      padding: '28px',
      display: 'flex',
      flexDirection: 'column' as const,
      justifyContent: 'space-between',
      ...extra,
    }),
    tag: {
      fontSize: '11px',
      color: '#666',
      textTransform: 'uppercase' as const,
      letterSpacing: '1px',
      fontWeight: 700,
      marginBottom: '6px',
    },
    bigAmount: {
      fontSize: '42px',
      fontWeight: 800,
      letterSpacing: '-2px',
      color: '#fff',
      lineHeight: 1,
    },
    badge: (color: string): React.CSSProperties => ({
      display: 'inline-flex',
      alignItems: 'center',
      gap: '5px',
      backgroundColor: `${color}18`,
      border: `1px solid ${color}30`,
      color: color,
      fontSize: '11px',
      fontWeight: 700,
      padding: '5px 10px',
      borderRadius: '999px',
    }),
    divider: {
      height: '1px',
      backgroundColor: '#2a2a2a',
      margin: '18px 0',
    },
    btnPrimary: {
      width: '100%',
      backgroundColor: '#f97316',
      color: '#fff',
      border: 'none',
      borderRadius: '12px',
      padding: '15px',
      fontSize: '15px',
      fontWeight: 700,
      cursor: 'pointer',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      gap: '8px',
      boxShadow: '0 4px 20px rgba(249,115,22,0.35)',
      marginTop: '20px',
    },
    actionRow: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
    },
    iconBox: (color: string): React.CSSProperties => ({
      width: '44px',
      height: '44px',
      backgroundColor: `${color}15`,
      border: `1px solid ${color}25`,
      borderRadius: '12px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '20px',
      flexShrink: 0,
    }),
    arrowBtn: {
      width: '36px',
      height: '36px',
      backgroundColor: '#2a2a2a',
      border: 'none',
      borderRadius: '50%',
      color: '#888',
      fontSize: '16px',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
  }

  return (
    <>
      {modalOpen && (
        <ReportarPagoModal
          apartamentoId={apartamentoId}
          onClose={() => setModalOpen(false)}
          onSuccess={() => setModalOpen(false)}
        />
      )}

      <div style={s.page}>
        {/* HEADER */}
        <header style={s.header} className="animate-slide-up">
          <div style={s.profileRow}>
            <div style={s.avatar}>🏢</div>
            <div>
              <p style={s.aptoLabel}>{isAdmin ? 'Administración' : 'Residente'}</p>
              <h1 style={s.aptoTitle}>{isAdmin ? 'Panel Admin' : `Apto ${aptoNumero}`}</h1>
            </div>
          </div>
          <button
            style={s.btnGhost}
            onClick={() => signOut()}
            onMouseOver={(e) => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#444' }}
            onMouseOut={(e) => { e.currentTarget.style.color = '#888'; e.currentTarget.style.borderColor = '#2a2a2a' }}
          >
            Salir
          </button>
        </header>

        {/* BENTO GRID — desktop */}
        <div className="dashboard-grid stagger-children">

          {/* ── 1. DEUDA USD — Grande (7 cols, 2 rows) */}
          <div style={s.card()} className="dashboard-card--main">
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                <p style={s.tag}>Estado de Cuenta</p>
                <div style={s.badge('#10b981')}>● Al día</div>
              </div>
              <p style={{ ...s.tag, marginBottom: '10px' }}>Deuda Total (Referencial)</p>
              <div style={s.bigAmount}>$0.00</div>
              <div style={{ fontSize: '15px', color: '#f97316', fontWeight: 700, marginTop: '4px' }}>USD</div>
            </div>
            <button
              className="btn-premium ripple-container"
              style={s.btnPrimary}
              onClick={(e) => {
                // Ripple
                const btn = e.currentTarget
                const rect = btn.getBoundingClientRect()
                const size = Math.max(rect.width, rect.height)
                const x = e.clientX - rect.left - size / 2
                const y = e.clientY - rect.top - size / 2
                const ripple = document.createElement('span')
                ripple.className = 'ripple'
                ripple.style.width = ripple.style.height = `${size}px`
                ripple.style.left = `${x}px`
                ripple.style.top = `${y}px`
                btn.appendChild(ripple)
                setTimeout(() => ripple.remove(), 600)
                // Abrir modal después del ripple
                setTimeout(() => setModalOpen(true), 150)
              }}
            >
              Reportar Pago
            </button>
          </div>

          {/* ── 2. EQUIVALENTE BCV */}
          <div style={s.card()} className="dashboard-card--bcv">
            <div>
              <p style={s.tag}>Equivalente BCV</p>
              <div style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '-1px', color: '#fff' }}>
                Bs. {deudaBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
              <span style={{ fontSize: '13px', color: '#666' }}>Tasa BCV</span>
              <span style={{ fontSize: '14px', fontFamily: 'monospace', color: '#aaa', fontWeight: 600 }}>
                {loadingRate ? 'Cargando...' : rate.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
              </span>
            </div>
          </div>

          {/* ── 3. RECIBOS */}
          <div
            style={{ ...s.card(), cursor: 'pointer' }}
            className="dashboard-card--recibos card-interactive"
            onClick={() => navigate('/recibos')}
          >
            <div style={s.actionRow}>
              <div style={s.iconBox('#f97316')} className="icon-bounce">📄</div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>Recibos</p>
                <p style={{ fontSize: '13px', color: '#666', marginTop: '2px' }}>Ver historial de pagos</p>
              </div>
              <button style={s.arrowBtn}>→</button>
            </div>
          </div>

          {/* ── 4. GASTOS */}
          <div
            style={{ ...s.card(), cursor: 'pointer' }}
            className="dashboard-card--gastos card-interactive"
            onClick={() => navigate('/gastos')}
          >
            <div style={s.actionRow}>
              <div style={s.iconBox('#10b981')} className="icon-bounce">📊</div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '15px', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  Gastos
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
                </p>
                <p style={{ fontSize: '13px', color: '#666', marginTop: '2px' }}>Comunes del mes</p>
              </div>
              <button style={s.arrowBtn}>→</button>
            </div>
          </div>

          {/* ── 5. CHAT */}
          <div
            style={{ ...s.card(), cursor: 'pointer' }}
            className="dashboard-card--chat card-interactive"
            onClick={() => navigate('/chat')}
          >
            <div style={s.actionRow}>
              <div style={{ position: 'relative' }}>
                <div style={s.iconBox('#a855f7')} className="icon-bounce">💬</div>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>Chat</p>
                <p style={{ fontSize: '13px', color: '#666', marginTop: '2px' }}>Mensajes y avisos</p>
              </div>
              <button style={s.arrowBtn}>→</button>
            </div>
          </div>

          {/* ── PROPUESTAS */}
          <div
            style={{ ...s.card(), cursor: 'pointer' }}
            className="dashboard-card--propuestas card-interactive"
            onClick={() => navigate('/propuestas')}
          >
            <div style={s.actionRow}>
              <div style={s.iconBox('#eab308')} className="icon-bounce">🗳️</div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '15px', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  Propuestas
                  <span style={{ fontSize: '12px' }}>🔔</span>
                </p>
                <p style={{ fontSize: '13px', color: '#666', marginTop: '2px' }}>Votaciones activas</p>
              </div>
              <button style={s.arrowBtn}>→</button>
            </div>
          </div>

          {/* ── REPORTES */}
          <div
            style={{ ...s.card(), cursor: 'pointer' }}
            className="dashboard-card--reportes card-interactive"
            onClick={() => navigate('/reportes')}
          >
            <div style={s.actionRow}>
              <div style={s.iconBox('#ef4444')} className="icon-bounce">⚠️</div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>Reportes</p>
                <p style={{ fontSize: '13px', color: '#666', marginTop: '2px' }}>Incidencias y quejas</p>
              </div>
              <button style={s.arrowBtn}>→</button>
            </div>
          </div>

          {/* ── 6. ACTIVIDAD */}
          <div style={s.card()} className="dashboard-card--actividad">
            <p style={s.tag}>Actividad</p>
            <p style={{ fontSize: '14px', color: '#666', marginTop: '8px', lineHeight: 1.5 }}>
              No hay movimientos recientes.
            </p>
          </div>

        </div>
      </div>

      {/* CSS responsive via style tag */}
      <style>{`
        .dashboard-grid {
          display: grid;
          grid-template-columns: repeat(12, 1fr);
          gap: 14px;
          max-width: 960px;
          margin: 0 auto;
        }
        .dashboard-card--main    { grid-column: 1 / 8; grid-row: 1 / 3; }
        .dashboard-card--bcv     { grid-column: 8 / 13; grid-row: 1 / 2; }
        .dashboard-card--recibos { grid-column: 8 / 13; grid-row: 2 / 3; }
        
        .dashboard-card--gastos  { grid-column: 1 / 5;  grid-row: 3 / 4; }
        .dashboard-card--chat    { grid-column: 5 / 9;  grid-row: 3 / 4; }
        .dashboard-card--actividad { grid-column: 9 / 13; grid-row: 3 / 5; }

        .dashboard-card--propuestas { grid-column: 1 / 5; grid-row: 4 / 5; }
        .dashboard-card--reportes   { grid-column: 5 / 9; grid-row: 4 / 5; }

        /* ── Mobile: columna única ─────────────────────────── */
        @media (max-width: 680px) {
          .dashboard-grid {
            grid-template-columns: 1fr;
          }
          .dashboard-card--main,
          .dashboard-card--bcv,
          .dashboard-card--recibos,
          .dashboard-card--gastos,
          .dashboard-card--chat,
          .dashboard-card--propuestas,
          .dashboard-card--reportes,
          .dashboard-card--actividad {
            grid-column: 1;
            grid-row: auto;
          }
        }
      `}</style>
    </>
  )
}
