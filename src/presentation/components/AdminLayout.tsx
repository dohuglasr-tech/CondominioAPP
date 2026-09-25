import React from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../application/contexts/AuthContext'

const adminNav = [
  { label: 'Dashboard', icon: '📊', path: '/admin', desc: 'Estadísticas generales' },
  { label: 'Edificio', icon: '🏢', path: '/admin/edificio', desc: 'Información general' },
  { label: 'Gastos', icon: '💸', path: '/admin/gastos', desc: 'Registrar egresos del mes' },
  { label: 'Recibos', icon: '🧾', path: '/admin/recibos', desc: 'Aprobar / rechazar pagos' },
  { label: 'Residentes', icon: '🏠', path: '/admin/residentes', desc: 'Gestión de apartamentos' },
  { label: 'Propuestas', icon: '🗳️', path: '/admin/propuestas', desc: 'Crear votaciones' },
  { label: 'Reportes', icon: '📢', path: '/admin/reportes', desc: 'Responder incidencias' },
  { label: 'Chat', icon: '💬', path: '/admin/chat', desc: 'Enviar avisos a todos' },
]

export const AdminLayout: React.FC = () => {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { perfil, config } = useAuth()

  const edificioNombre = config?.nombre_edificio || 'Mi Edificio'
  const edificioLogo   = config?.logo_url || null

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
          width: 240px; flex-shrink: 0; background-color: #111;
          border-right: 1px solid #1e1e1e; display: flex; flex-direction: column;
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
          background: rgba(10, 10, 10, 0.65);
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 4px 30px rgba(0, 0, 0, 0.3);
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
          background: rgba(10, 10, 10, 0.65);
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 -4px 30px rgba(0, 0, 0, 0.3);
          padding-bottom: env(safe-area-inset-bottom);
          height: calc(60px + env(safe-area-inset-bottom));
          overflow-x: auto;
          white-space: nowrap;
          -webkit-overflow-scrolling: touch;
        }
        .admin-mobile-bottom-bar::-webkit-scrollbar { display: none; }
        
        .admin-bottom-nav-inner {
          display: flex; height: 60px; min-width: max-content; padding: 0 10px;
        }
        
        .admin-bottom-btn {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 4px; background: transparent; border: none; color: #4a4a4a; cursor: pointer;
          padding: 0 16px; min-width: 72px;
        }
        .admin-bottom-btn.active { color: #f97316; }

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
                : <span style={{ fontSize: '18px' }}>🏢</span>
              }
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ color: '#fff', fontSize: '14px', fontWeight: 700, lineHeight: 1.2 }}>{edificioNombre}</span>
              <span style={{ color: '#f97316', fontSize: '10px', fontWeight: 600 }}>ADMINISTRADOR</span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            style={{ background: 'transparent', border: 'none', color: '#888', fontSize: '20px', padding: '8px' }}
          >
            🚪
          </button>
        </div>
      </div>

      {/* MOBILE BOTTOM BAR */}
      <div className="admin-mobile-bottom-bar">
        <div className="admin-bottom-nav-inner">
          {adminNav.map(item => {
            const isActive = pathname === item.path || (item.path !== '/admin' && pathname.startsWith(item.path))
            return (
              <button
                key={item.path}
                className={`admin-bottom-btn ${isActive ? 'active' : ''}`}
                onClick={() => navigate(item.path)}
              >
                <span style={{ fontSize: '22px' }}>{item.icon}</span>
                <span style={{ fontSize: '10px', fontWeight: 600 }}>{item.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* SIDEBAR DESKTOP */}
      <aside className="admin-sidebar">
        {/* Brand */}
        <div style={{ padding: '0 20px 24px', borderBottom: '1px solid #1e1e1e' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '14px', marginBottom: '10px',
            background: 'rgba(249,115,22,0.08)',
            border: '1px solid rgba(249,115,22,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
          }}>
            {edificioLogo
              ? <img src={edificioLogo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: '24px' }}>🏢</span>
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
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '10px 12px', borderRadius: '10px', border: 'none', cursor: 'pointer', textAlign: 'left',
                  backgroundColor: isActive ? '#f9731618' : 'transparent',
                  borderLeft: isActive ? '3px solid #f97316' : '3px solid transparent',
                  transition: 'all 0.2s'
                }}
              >
                <span style={{ fontSize: '18px' }}>{item.icon}</span>
                <div>
                  <div style={{ color: isActive ? '#f97316' : '#ccc', fontSize: '13px', fontWeight: 600 }}>{item.label}</div>
                  <div style={{ color: '#555', fontSize: '11px' }}>{item.desc}</div>
                </div>
              </button>
            )
          })}
        </nav>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #1e1e1e' }}>
          <p style={{ color: '#555', fontSize: '11px', marginBottom: '8px' }}>{perfil?.nombre_completo || 'Admin'}</p>
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
