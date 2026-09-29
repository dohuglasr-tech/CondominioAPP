import React, { useState, useEffect, useCallback } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../application/contexts/AuthContext'
import { supabase } from '../../data/supabase'

// ── Minimalist SVG Line Icons para Admin ──
const ADMIN_ICONS: Record<string, React.ReactNode> = {
  dashboard: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1"/>
      <rect x="14" y="3" width="7" height="5" rx="1"/>
      <rect x="14" y="12" width="7" height="9" rx="1"/>
      <rect x="3" y="16" width="7" height="5" rx="1"/>
    </svg>
  ),
  edificio: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2"/>
      <line x1="9" y1="6" x2="9" y2="6.01"/>
      <line x1="15" y1="6" x2="15" y2="6.01"/>
      <line x1="9" y1="10" x2="9" y2="10.01"/>
      <line x1="15" y1="10" x2="15" y2="10.01"/>
      <line x1="9" y1="14" x2="9" y2="14.01"/>
      <line x1="15" y1="14" x2="15" y2="14.01"/>
      <path d="M10 22v-4h4v4"/>
    </svg>
  ),
  gastos: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23"/>
      <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
    </svg>
  ),
  recibos: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <path d="M9 13l2 2 4-4"/>
    </svg>
  ),
  generarRecibos: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="12" y1="11" x2="12" y2="17"/>
      <line x1="9" y1="14" x2="15" y2="14"/>
    </svg>
  ),
  recibosEmitidos: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  ),
  residentes: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 00-3-3.87"/>
      <path d="M16 3.13a4 4 0 010 7.75"/>
    </svg>
  ),
  propuestas: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
      <polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
  ),
  reportes: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  ),
  chat: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
    </svg>
  ),
}

const adminNav = [
  { key: 'dashboard', label: 'Dashboard', path: '/admin', desc: 'Estadísticas generales' },
  { key: 'edificio', label: 'Edificio', path: '/admin/edificio', desc: 'Información general' },
  { key: 'gastos', label: 'Gastos', path: '/admin/gastos', desc: 'Registrar egresos del mes' },
  { key: 'recibos', label: 'Recibos', path: '/admin/recibos', desc: 'Aprobar / rechazar pagos', isRecibos: true },
  { key: 'generarRecibos', label: 'Generar Recibos', path: '/admin/generar-recibos', desc: 'Emisión masiva del mes' },
  { key: 'recibosEmitidos', label: 'Recibos Emitidos', path: '/admin/recibos-emitidos', desc: 'Historial y estadísticas de mora' },
  { key: 'residentes', label: 'Residentes', path: '/admin/residentes', desc: 'Gestión de apartamentos' },
  { key: 'propuestas', label: 'Propuestas', path: '/admin/propuestas', desc: 'Crear votaciones' },
  { key: 'reportes', label: 'Reportes', path: '/admin/reportes', desc: 'Responder incidencias' },
  { key: 'chat', label: 'Chat', path: '/admin/chat', desc: 'Enviar avisos a todos' },
]

export const AdminLayout: React.FC = () => {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { perfil, config } = useAuth()

  const [pendingCount, setPendingCount] = useState<number>(0)

  const edificioNombre = config?.nombre_edificio || 'Mi Edificio'
  const edificioLogo   = config?.logo_url || null

  const cargarPendientes = useCallback(async () => {
    try {
      const { count, error } = await supabase
        .from('pagos_reportados')
        .select('*', { count: 'exact', head: true })
        .eq('estado', 'pendiente')

      if (!error && count !== null) {
        setPendingCount(count)
      }
    } catch (err) {
      console.warn('[AdminLayout] Error consultando pendientes:', err)
    }
  }, [])

  useEffect(() => {
    cargarPendientes()

    // ── Suscripción en Tiempo Real para Pagos ──
    const channel = supabase
      .channel('admin_layout_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pagos_reportados' },
        () => {
          cargarPendientes()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [cargarPendientes])

  const handleLogout = () => {
    localStorage.removeItem('admin_auth')
    window.location.href = '/admin-login'
  }

  return (
    <div className="admin-layout-container">
      <style>{`
        .admin-layout-container {
          display: flex; height: 100vh; background-color: #0a0a0a; font-family: Inter, sans-serif;
        }
        .admin-sidebar {
          width: 240px; flex-shrink: 0; background: linear-gradient(180deg, #121620 0%, #0a0d13 100%);
          border-right: 1px solid rgba(255, 255, 255, 0.08); display: flex; flex-direction: column;
          padding: 24px 0;
        }
        .admin-main {
          flex: 1; overflow-y: auto; background-color: #0a0a0a;
        }
        
        /* MOBILE TOP BAR */
        .admin-mobile-top-bar {
          display: none;
          position: fixed;
          top: 0; left: 0; right: 0;
          z-index: 1001;
          background: rgba(12, 16, 23, 0.88);
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 4px 30px rgba(0, 0, 0, 0.4);
          padding-top: env(safe-area-inset-top, 0px);
        }
        .admin-mobile-top-inner {
          height: 60px; display: flex; align-items: center; justify-content: space-between;
          padding: 0 20px;
        }

        /* MOBILE BOTTOM BAR */
        .admin-mobile-bottom-bar {
          display: none;
          position: fixed;
          bottom: 0; left: 0; right: 0;
          z-index: 1000;
          background: rgba(13, 17, 24, 0.94);
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.55);
          padding-bottom: env(safe-area-inset-bottom);
          height: calc(64px + env(safe-area-inset-bottom));
          overflow-x: auto;
          white-space: nowrap;
          -webkit-overflow-scrolling: touch;
        }
        .admin-mobile-bottom-bar::-webkit-scrollbar { display: none; }
        
        .admin-bottom-nav-inner {
          display: flex; height: 64px; min-width: max-content; padding: 0 10px; align-items: center;
        }
        
        .admin-bottom-btn {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 4px; background: transparent; border: none; color: #71717a; cursor: pointer;
          padding: 0 14px; min-width: 68px; position: relative; transition: color 0.18s;
        }
        .admin-bottom-btn.active { color: #f97316; }
        .admin-bottom-btn svg { width: 20px; height: 20px; transition: transform 0.18s; }
        .admin-bottom-btn.active svg { transform: translateY(-1px); }

        @keyframes badgePulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.15); opacity: 0.9; }
          100% { transform: scale(1); opacity: 1; }
        }

        .pulse-badge {
          animation: badgePulse 2s infinite ease-in-out;
        }

        @media (max-width: 768px) {
          .admin-sidebar { display: none; }
          .admin-mobile-top-bar { display: block; }
          .admin-mobile-bottom-bar { display: block; }
          .admin-main {
            padding-top: calc(75px + env(safe-area-inset-top, 0px));
            padding-bottom: calc(75px + env(safe-area-inset-bottom, 0px));
          }
        }
      `}</style>
      
      {/* MOBILE TOP BAR */}
      <div className="admin-mobile-top-bar">
        <div className="admin-mobile-top-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px',
              background: 'rgba(249,115,22,0.1)',
              border: '1px solid rgba(249,115,22,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden', flexShrink: 0,
            }}>
              {edificioLogo
                ? <img src={edificioLogo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ color: '#f97316' }}>{ADMIN_ICONS.edificio}</span>
              }
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ color: '#fff', fontSize: '14px', fontWeight: 700, lineHeight: 1.2 }}>{edificioNombre}</span>
              <span style={{ color: '#f97316', fontSize: '10px', fontWeight: 600 }}>ADMINISTRADOR</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {pendingCount > 0 && (
              <button
                onClick={() => navigate('/admin/recibos?filtro=pendiente')}
                style={{
                  backgroundColor: '#f59e0b20',
                  border: '1px solid #f59e0b50',
                  color: '#f59e0b',
                  padding: '4px 10px',
                  borderRadius: '20px',
                  fontSize: '11px',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer',
                }}
              >
                <span>⏳</span>
                <span>{pendingCount}</span>
              </button>
            )}
            <button
              onClick={handleLogout}
              style={{ background: 'transparent', border: 'none', color: '#888', fontSize: '16px', padding: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              title="Cerrar Sesión"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* MOBILE BOTTOM BAR */}
      <div className="admin-mobile-bottom-bar">
        <div className="admin-bottom-nav-inner">
          {adminNav.map(item => {
            const isActive = pathname === item.path || (item.path !== '/admin' && pathname.startsWith(item.path))
            const isRecibos = item.isRecibos
            return (
              <button
                key={item.path}
                className={`admin-bottom-btn ${isActive ? 'active' : ''}`}
                onClick={() => navigate(item.path)}
              >
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{ADMIN_ICONS[item.key]}</span>
                  {isRecibos && pendingCount > 0 && (
                    <span
                      className="pulse-badge"
                      style={{
                        position: 'absolute',
                        top: '-4px',
                        right: '-8px',
                        backgroundColor: '#f59e0b',
                        color: '#000',
                        fontSize: '10px',
                        fontWeight: 900,
                        padding: '1px 5px',
                        borderRadius: '999px',
                        boxShadow: '0 0 8px rgba(245,158,11,0.6)',
                      }}
                    >
                      {pendingCount}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: '10px', fontWeight: 600 }}>{item.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* SIDEBAR DESKTOP */}
      <aside className="admin-sidebar">
        {/* Brand */}
        <div style={{ padding: '0 20px 24px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '14px', marginBottom: '10px',
            background: 'rgba(249,115,22,0.08)',
            border: '1px solid rgba(249,115,22,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
          }}>
            {edificioLogo
              ? <img src={edificioLogo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ color: '#f97316' }}>{ADMIN_ICONS.edificio}</span>
            }
          </div>
          <h1 style={{ color: '#fff', fontSize: '15px', fontWeight: 700, margin: '0 0 6px' }}>{edificioNombre}</h1>
          <span style={{
            display: 'inline-block',
            backgroundColor: '#f9731620', color: '#f97316',
            fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px',
            border: '1px solid #f9731640'
          }}>ADMINISTRADOR</span>
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, padding: '12px 12px', display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto' }}>
          {adminNav.map(item => {
            const isActive = pathname === item.path || (item.path !== '/admin' && pathname.startsWith(item.path))
            const isRecibos = item.isRecibos

            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '10px 12px', borderRadius: '12px', border: 'none', cursor: 'pointer', textAlign: 'left',
                  backgroundColor: isActive ? 'rgba(249, 115, 22, 0.12)' : 'transparent',
                  borderLeft: isActive ? '3px solid #f97316' : '3px solid transparent',
                  transition: 'all 0.2s',
                  position: 'relative',
                  color: isActive ? '#f97316' : '#71717a'
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: isActive ? '#f97316' : '#94a3b8' }}>{ADMIN_ICONS[item.key]}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ color: isActive ? '#f97316' : '#ccc', fontSize: '13px', fontWeight: 600 }}>{item.label}</div>
                  <div style={{ color: '#555', fontSize: '11px' }}>{item.desc}</div>
                </div>

                {isRecibos && pendingCount > 0 && (
                  <span
                    className="pulse-badge"
                    style={{
                      backgroundColor: '#f59e0b',
                      color: '#000',
                      fontSize: '11px',
                      fontWeight: 900,
                      padding: '2px 8px',
                      borderRadius: '999px',
                      boxShadow: '0 0 10px rgba(245,158,11,0.5)',
                    }}
                    title={`${pendingCount} pagos pendientes por revisar`}
                  >
                    {pendingCount}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #1e1e1e' }}>
          <p style={{ color: '#555', fontSize: '11px', marginBottom: '8px' }}>{perfil?.nombre_completo || 'Administrador'}</p>
          <button
            onClick={handleLogout}
            style={{
              width: '100%', backgroundColor: '#1a1a1a', color: '#888', border: '1px solid #2a2a2a',
              padding: '8px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer'
            }}
          >
            🚪 Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  )
}
