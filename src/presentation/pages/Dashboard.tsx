import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../application/contexts/AuthContext'
import { useBcvRate } from '../../data/useBcvRate'
import { ReportarPagoModal } from '../components/ReportarPagoModal'
import { supabase } from '../../data/supabase'
import { useNavigate } from 'react-router-dom'
import { buscarMoraPorApto, TASA_RIESGO_CONFIG, DeudaMoraItem } from '../../data/moraService'

export function Dashboard() {
  const { signOut, perfil, isAdmin } = useAuth()
  const aptoNumero = (perfil as any)?.apartamento?.numero || perfil?.apartamento_id || ''
  const apartamentoId = perfil?.apartamento_id ?? ''

  const navigate = useNavigate()
  const [modalOpen, setModalOpen] = useState(false)
  const [ultimoPago, setUltimoPago] = useState<{ id: string; monto_bs: number; referencia: string; estado: string } | null>(null)
  const [reciboPendiente, setReciboPendiente] = useState<{ id: string; total_usd: number; total_bs: number; mes_facturado: string; emitido_at: string } | null>(null)
  const [moraRecord, setMoraRecord] = useState<DeudaMoraItem | null>(null)
  
  const { rate, loading: loadingRate } = useBcvRate()
  const deudaUsd = reciboPendiente ? Number(reciboPendiente.total_usd) : 0
  const deudaBs = deudaUsd * (rate || 1)

  const cargarDatosResidente = useCallback(async () => {
    if (!apartamentoId) return
    try {
      const [pagoRes, reciboRes] = await Promise.all([
        supabase
          .from('pagos_reportados')
          .select('id, monto_bs, referencia, estado')
          .eq('apartamento_id', apartamentoId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('recibos_generados')
          .select('id, total_usd, total_bs, mes_facturado, estado, emitido_at')
          .eq('apartamento_id', apartamentoId)
          .eq('estado', 'pendiente')
          .order('mes_facturado', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      if (pagoRes.data) setUltimoPago(pagoRes.data)
      else setUltimoPago(null)

      if (reciboRes.data) setReciboPendiente(reciboRes.data)
      else setReciboPendiente(null)

      // Consultar si está en mora
      const mora = buscarMoraPorApto(aptoNumero || apartamentoId)
      setMoraRecord(mora)
    } catch (err) {
      console.warn('[Dashboard] Error cargando datos del residente:', err)
    }
  }, [apartamentoId, aptoNumero])

  useEffect(() => {
    cargarDatosResidente()
    if (!apartamentoId) return

    const channel = supabase
      .channel(`dashboard_resident_${apartamentoId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pagos_reportados',
          filter: `apartamento_id=eq.${apartamentoId}`,
        },
        () => {
          cargarDatosResidente()
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'recibos_generados',
          filter: `apartamento_id=eq.${apartamentoId}`,
        },
        () => {
          cargarDatosResidente()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [apartamentoId, cargarDatosResidente])

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
      backgroundColor: 'rgba(255, 255, 255, 0.05)',
      border: '1px solid rgba(255, 255, 255, 0.09)',
      borderRadius: '16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '22px',
    },
    aptoLabel: {
      fontSize: '11px',
      color: '#7e8b9b',
      textTransform: 'uppercase' as const,
      letterSpacing: '0.8px',
      marginBottom: '2px',
      fontWeight: 700,
    },
    aptoTitle: {
      fontSize: '20px',
      fontWeight: 700,
      color: '#fff',
      lineHeight: 1.2,
    },
    btnGhost: {
      background: 'rgba(255, 255, 255, 0.04)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      color: '#94a3b8',
      padding: '8px 18px',
      borderRadius: '12px',
      fontSize: '13px',
      fontWeight: 600,
      cursor: 'pointer',
      transition: 'all 0.2s',
    },
    card: (extra?: React.CSSProperties): React.CSSProperties => ({
      background: 'linear-gradient(180deg, #151922 0%, #0d1117 100%)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderTop: '1px solid rgba(255, 255, 255, 0.14)',
      borderRadius: '22px',
      boxShadow: '0 14px 34px -4px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
      padding: '24px 26px',
      display: 'flex',
      flexDirection: 'column' as const,
      justifyContent: 'space-between',
      position: 'relative',
      overflow: 'hidden',
      ...extra,
    }),
    tag: {
      fontSize: '11px',
      color: '#7e8b9b',
      textTransform: 'uppercase' as const,
      letterSpacing: '0.8px',
      fontWeight: 700,
      marginBottom: '6px',
    },
    bigAmount: {
      fontSize: '40px',
      fontWeight: 800,
      letterSpacing: '-1.5px',
      color: '#fff',
      lineHeight: 1,
    },
    badge: (color: string): React.CSSProperties => ({
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      backgroundColor: `${color}18`,
      border: `1px solid ${color}35`,
      color: color,
      fontSize: '11px',
      fontWeight: 700,
      padding: '4px 12px',
      borderRadius: '999px',
      boxShadow: `0 2px 8px ${color}15`,
    }),
    divider: {
      height: '1px',
      backgroundColor: 'rgba(255, 255, 255, 0.06)',
      margin: '18px 0',
    },
    btnPrimary: {
      width: '100%',
      background: 'linear-gradient(135deg, #fb923c 0%, #f97316 55%, #ea580c 100%)',
      color: '#fff',
      border: '1px solid rgba(255, 255, 255, 0.25)',
      borderRadius: '14px',
      padding: '14px 20px',
      fontSize: '15px',
      fontWeight: 700,
      cursor: 'pointer',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      gap: '8px',
      boxShadow: '0 4px 20px rgba(249, 115, 22, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
      marginTop: '20px',
    },
    actionRow: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
    },
    iconBox: (color: string): React.CSSProperties => ({
      width: '46px',
      height: '46px',
      backgroundColor: `${color}14`,
      border: `1px solid ${color}28`,
      borderRadius: '14px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '20px',
      flexShrink: 0,
      boxShadow: `0 4px 12px ${color}15`,
    }),
    arrowBtn: {
      width: '34px',
      height: '34px',
      backgroundColor: 'rgba(255, 255, 255, 0.05)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '50%',
      color: '#888',
      fontSize: '15px',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      transition: 'all 0.2s',
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

        {/* ── ALERTA DE MORA PROLONGADA (Si el apartamento está en la lista de mora) ── */}
        {moraRecord && (
          <div
            style={{
              maxWidth: '960px',
              margin: '0 auto 24px auto',
              background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.16) 0%, rgba(239, 68, 68, 0.16) 100%)',
              border: `2px solid ${TASA_RIESGO_CONFIG[moraRecord.tasa_riesgo].color}`,
              borderRadius: '20px',
              padding: '18px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '16px',
              boxShadow: `0 8px 30px rgba(0, 0, 0, 0.5), 0 0 16px ${TASA_RIESGO_CONFIG[moraRecord.tasa_riesgo].color}25`
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{
                width: '44px', height: '44px', borderRadius: '12px',
                background: TASA_RIESGO_CONFIG[moraRecord.tasa_riesgo].bg,
                border: `1px solid ${TASA_RIESGO_CONFIG[moraRecord.tasa_riesgo].border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '22px', flexShrink: 0
              }}>
                ⚠️
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 800, fontSize: '15px', color: '#fff' }}>
                    Tu Apartamento (Apto {moraRecord.apartamento_numero}) figura en la Lista de Mora
                  </span>
                  <span style={{
                    fontSize: '11px', fontWeight: 800,
                    color: TASA_RIESGO_CONFIG[moraRecord.tasa_riesgo].color,
                    background: TASA_RIESGO_CONFIG[moraRecord.tasa_riesgo].bg,
                    border: `1px solid ${TASA_RIESGO_CONFIG[moraRecord.tasa_riesgo].border}`,
                    padding: '2px 8px', borderRadius: '999px'
                  }}>
                    {TASA_RIESGO_CONFIG[moraRecord.tasa_riesgo].badgeText}
                  </span>
                </div>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#cbd5e1' }}>
                  Presentas <strong>{moraRecord.meses_deuda} meses de atraso</strong> con una deuda anterior acumulada de{' '}
                  <strong style={{ color: '#f97316' }}>${moraRecord.monto_usd.toFixed(2)} USD</strong>. Regulariza tu situación para evitar restricciones comunitarias.
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                onClick={() => navigate('/mora')}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.16)',
                  color: '#fff',
                  padding: '8px 14px',
                  borderRadius: '10px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Ver Lista de Mora
              </button>
              <button
                onClick={() => setModalOpen(true)}
                style={{
                  background: 'linear-gradient(135deg, #fb923c 0%, #f97316 100%)',
                  border: 'none',
                  color: '#fff',
                  padding: '8px 16px',
                  borderRadius: '10px',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 2px 10px rgba(249, 115, 22, 0.4)'
                }}
              >
                Reportar Pago
              </button>
            </div>
          </div>
        )}

        {/* BENTO GRID — desktop */}
        <div className="dashboard-grid stagger-children">

          {/* ── 1. DEUDA USD — Grande (7 cols, 2 rows) */}
          <div style={s.card()} className="dashboard-card--main">
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                <p style={s.tag}>Estado de Cuenta</p>
                {ultimoPago?.estado === 'pendiente' ? (
                  <div style={s.badge('#f59e0b')}>⏳ Pago en Revisión</div>
                ) : deudaUsd > 0 ? (
                  <div style={s.badge('#ef4444')}>🔴 Pago Pendiente</div>
                ) : (
                  <div style={s.badge('#10b981')}>● Al día · Solvente</div>
                )}
              </div>
              <p style={{ ...s.tag, marginBottom: '10px' }}>Deuda Total (Referencial)</p>
              <div style={s.bigAmount}>${deudaUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div style={{ fontSize: '15px', color: '#f97316', fontWeight: 700, marginTop: '4px', display:'flex', alignItems:'center', gap:'8px' }}>
                <span>USD</span>
                {reciboPendiente && (
                  <span style={{ fontSize: '12px', color: '#888', fontWeight: 500 }}>
                    · Recibo de {new Date(reciboPendiente.mes_facturado).toLocaleDateString('es-VE', { month: 'long', year: 'numeric' })}
                  </span>
                )}
              </div>

              {ultimoPago?.estado === 'pendiente' && (
                <div style={{
                  marginTop: '12px',
                  backgroundColor: '#f59e0b15',
                  border: '1px solid #f59e0b35',
                  borderRadius: '10px',
                  padding: '8px 12px',
                  fontSize: '12px',
                  color: '#f59e0b',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}>
                  <span>⏳</span>
                  <span>
                    Reportaste Bs. {ultimoPago.monto_bs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Ref: {ultimoPago.referencia}). En revisión por administración.
                  </span>
                </div>
              )}
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

          {/* ── LISTA DE MORA */}
          <div
            style={{ ...s.card(), cursor: 'pointer' }}
            className="dashboard-card--mora card-interactive"
            onClick={() => navigate('/mora')}
          >
            <div style={s.actionRow}>
              <div style={s.iconBox('#a855f7')} className="icon-bounce">⚖️</div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '15px', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  Lista de Mora
                  <span style={{
                    fontSize: '10px', fontWeight: 800,
                    background: 'rgba(168, 85, 247, 0.2)', color: '#d8b4fe',
                    padding: '1px 6px', borderRadius: '999px', border: '1px solid rgba(168,85,247,0.4)'
                  }}>
                    &gt;3 Meses
                  </span>
                </p>
                <p style={{ fontSize: '13px', color: '#666', marginTop: '2px' }}>Transparencia comunitaria</p>
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
        
        .dashboard-card--gastos     { grid-column: 1 / 5;  grid-row: 3 / 4; }
        .dashboard-card--chat       { grid-column: 5 / 9;  grid-row: 3 / 4; }
        .dashboard-card--mora       { grid-column: 9 / 13; grid-row: 3 / 4; }

        .dashboard-card--propuestas { grid-column: 1 / 5;  grid-row: 4 / 5; }
        .dashboard-card--reportes   { grid-column: 5 / 9;  grid-row: 4 / 5; }
        .dashboard-card--actividad  { grid-column: 9 / 13; grid-row: 4 / 5; }

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
          .dashboard-card--mora,
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
