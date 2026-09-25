import React from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../application/contexts/AuthContext'

// ── SVG Icons monocolor stroke delgado ──────────────────────────────
const SVG = {
  inicio: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  ),
  recibos: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>
  ),
  gastos: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23"/>
      <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
    </svg>
  ),
  chat: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
    </svg>
  ),
  propuestas: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
      <polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
  ),
  reportes: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  ),
  perfil: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4"/>
      <path d="M5 20c0-4 3.5-7 7-7s7 3 7 7"/>
    </svg>
  ),
  salir: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  ),
}

export const Layout: React.FC = () => {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { signOut, perfil, config } = useAuth()
  const p = perfil as any
  const c = config as any

  const edificioNombre = c?.nombre || p?.edificio?.nombre || 'Mi Edificio'
  const edificioLogo   = c?.logo_url || p?.edificio?.logo || ''
  const aptoNumero     = p?.apartamento?.numero || p?.apartamento_id || ''

  const navItems: { label: string; desc: string; path: string; badge: number; icon: keyof typeof SVG; isNew?: boolean }[] = [
    { label: 'Inicio',     desc: 'Resumen y estado',       path: '/',           badge: 0,              icon: 'inicio' },
    { label: 'Recibos',    desc: 'Historial de pagos',     path: '/recibos',    badge: 0,              icon: 'recibos' },
    { label: 'Chat',       desc: 'Avisos de la comunidad', path: '/chat',       badge: 3,              icon: 'chat' },
    { label: 'Reportes',   desc: 'Incidencias y tickets',  path: '/reportes',   badge: 0,              icon: 'reportes' },
    { label: 'Perfil',     desc: 'Mis datos',              path: '/perfil',     badge: 0,              icon: 'perfil' },
  ]

  return (
    <div className="layout-container">

      {/* ── SIDEBAR (Desktop) ─────────────────────────────── */}
      <aside className="layout-sidebar">
        <div className="sidebar-header">
          {edificioLogo
            ? <img src={edificioLogo} alt="Logo" className="brand-logo-img" />
            : (
              <div className="brand-logo">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="2" width="16" height="20" rx="2"/>
                  <line x1="9"  y1="7"  x2="9"  y2="7.01"/>
                  <line x1="15" y1="7"  x2="15" y2="7.01"/>
                  <line x1="9"  y1="11" x2="9"  y2="11.01"/>
                  <line x1="15" y1="11" x2="15" y2="11.01"/>
                  <path d="M9 16h6v6H9z"/>
                </svg>
              </div>
            )}
          <div>
            <h2 className="brand-title">{edificioNombre}</h2>
            {aptoNumero && <p className="brand-subtitle">Apto {aptoNumero}</p>}
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(item => {
            const isActive = item.path === '/' ? pathname === '/' : pathname.startsWith(item.path)
            return (
              <button key={item.path} onClick={() => navigate(item.path)}
                className={`nav-btn ${isActive ? 'active' : ''}`}>
                <span className="nav-icon-sidebar">{SVG[item.icon]}</span>
                <div className="nav-text-block">
                  <span className="nav-label">
                    {item.label}
                    {item.badge > 0 && <span className="nav-badge-count">{item.badge}</span>}
                    {item.isNew && !item.badge && <span className="nav-badge-dot"/>}
                  </span>
                  <span className="nav-desc">{item.desc}</span>
                </div>
              </button>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <button className="logout-btn" onClick={() => signOut()}>
            {SVG.salir} Salir
          </button>
        </div>
      </aside>

      {/* ── MOBILE TOP BAR ────────────────────────────────── */}
      <header className="mobile-top-bar">
        <div className="mobile-top-inner">
          {edificioLogo
            ? <img src={edificioLogo} alt="Logo" className="mobile-logo-img" />
            : (
              <div className="mobile-logo">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="2" width="16" height="20" rx="2"/>
                  <line x1="9"  y1="7"  x2="9"  y2="7.01"/>
                  <line x1="15" y1="7"  x2="15" y2="7.01"/>
                  <line x1="9"  y1="11" x2="9"  y2="11.01"/>
                  <line x1="15" y1="11" x2="15" y2="11.01"/>
                  <path d="M9 16h6v6H9z"/>
                </svg>
              </div>
            )}

          <div className="mobile-header-text">
            <span className="mobile-header-label">RESIDENTE</span>
            <span className="mobile-header-building">{edificioNombre}</span>
            {aptoNumero && <span className="mobile-header-apto">Apto {aptoNumero}</span>}
          </div>

          <button className="mobile-profile-btn" onClick={() => navigate('/perfil')} title="Mi perfil">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4"/>
              <path d="M5 20c0-4 3.5-7 7-7s7 3 7 7"/>
            </svg>
          </button>
        </div>
      </header>

      {/* ── MAIN CONTENT ──────────────────────────────────── */}
      <main className="layout-main">
        <div className="page-transition">
          <Outlet />
        </div>
      </main>

      {/* ── BOTTOM BAR (Mobile) ───────────────────────────── */}
      <nav className="layout-bottom-bar">
        {navItems.map(item => {
          const isActive = item.path === '/' ? pathname === '/' : pathname.startsWith(item.path)
          return (
            <button key={item.path} onClick={() => navigate(item.path)}
              className={`bottom-nav-btn ${isActive ? 'active' : ''}`}>
              <div style={{ position: 'relative' }}>
                <span className="nav-icon">{SVG[item.icon]}</span>
                {item.badge > 0 && <span className="bottom-badge-count">{item.badge}</span>}
                {item.isNew && !item.badge && <span className="bottom-badge-dot"/>}
              </div>
              <span className="bottom-nav-label">{item.label}</span>
            </button>
          )
        })}
      </nav>

      {/* ── STYLES ────────────────────────────────────────── */}
      <style>{`
        * { box-sizing: border-box; }
        .layout-container {
          display: flex;
          height: 100vh;
          width: 100vw;
          background-color: #0a0a0a;
          overflow: hidden;
        }

        /* ─── SIDEBAR ───────────────────────────────────── */
        .layout-sidebar {
          width: 260px;
          background-color: #141414;
          border-right: 1px solid #1e1e1e;
          display: flex;
          flex-direction: column;
          padding: 24px 20px;
          flex-shrink: 0;
        }
        .sidebar-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 36px;
          padding: 0 10px;
        }
        .brand-logo {
          width: 42px; height: 42px;
          background: rgba(249,115,22,0.12);
          border-radius: 12px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .brand-logo-img {
          width: 42px; height: 42px;
          border-radius: 12px;
          object-fit: cover;
          flex-shrink: 0;
        }
        .brand-title {
          color: #fff;
          font-size: 16px;
          font-weight: 800;
          margin: 0;
          line-height: 1.2;
        }
        .brand-subtitle {
          color: #555;
          font-size: 12px;
          font-weight: 500;
          margin: 3px 0 0;
        }
        .sidebar-nav {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2px;
          overflow-y: auto;
        }
        .nav-btn {
          display: flex;
          align-items: center;
          gap: 12px;
          background: transparent;
          border: none;
          padding: 10px 12px;
          color: #666;
          cursor: pointer;
          transition: all 0.18s;
          text-align: left;
          border-radius: 10px;
          width: 100%;
        }
        .nav-btn:hover { background: rgba(255,255,255,0.04); color: #ccc; }
        .nav-btn.active { background: rgba(249,115,22,0.1); color: #f97316; }
        .nav-icon-sidebar {
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; width: 22px; color: inherit;
        }
        .nav-text-block { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .nav-label {
          font-size: 14px; font-weight: 600; color: inherit;
          display: flex; align-items: center; gap: 6px;
        }
        .nav-desc {
          font-size: 11px; color: #444; font-weight: 400;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .nav-btn.active .nav-desc { color: rgba(249,115,22,0.5); }
        .nav-badge-count {
          background: #ef4444; color: #fff; font-size: 10px;
          font-weight: 800; padding: 1px 5px; border-radius: 8px; line-height: 1.4;
        }
        .nav-badge-dot {
          width: 7px; height: 7px; background: #f97316;
          border-radius: 50%; display: inline-block;
          box-shadow: 0 0 5px rgba(249,115,22,0.7);
        }
        .sidebar-footer {
          margin-top: auto; padding-top: 16px; border-top: 1px solid #1e1e1e;
        }
        .logout-btn {
          width: 100%; display: flex; align-items: center; gap: 10px;
          padding: 12px 16px; background: transparent; border: none;
          color: #555; font-size: 14px; font-weight: 600;
          cursor: pointer; border-radius: 10px; transition: all 0.18s;
        }
        .logout-btn:hover { background: rgba(239,68,68,0.08); color: #ef4444; }

        /* ─── MOBILE TOP BAR ────────────────────────────── */
        .mobile-top-bar {
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
        .mobile-top-inner {
          display: flex; align-items: center; gap: 12px;
          padding: 31px 16px 12px;
        }
        .mobile-logo {
          width: 40px; height: 40px;
          background: rgba(249,115,22,0.1);
          border-radius: 11px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .mobile-logo-img {
          width: 40px; height: 40px; border-radius: 11px;
          object-fit: cover; flex-shrink: 0;
        }
        .mobile-header-text {
          flex: 1; display: flex; flex-direction: column; gap: 0;
          overflow: hidden;
        }
        .mobile-header-label {
          font-size: 9px; color: #f97316; text-transform: uppercase;
          letter-spacing: 1.2px; font-weight: 700; line-height: 1; margin-bottom: 2px;
        }
        .mobile-header-building {
          font-size: 14px; color: #fff; font-weight: 700; line-height: 1.2;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .mobile-header-apto {
          font-size: 11px; color: #555; font-weight: 500; line-height: 1.2;
        }
        .mobile-profile-btn {
          width: 36px; height: 36px;
          background: rgba(255,255,255,0.05);
          border: 1px solid #2a2a2a; border-radius: 10px;
          color: #888; display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: all 0.18s; flex-shrink: 0;
        }
        .mobile-profile-btn:active {
          border-color: #f97316; color: #f97316;
          background: rgba(249,115,22,0.08);
        }

        /* ─── MAIN ──────────────────────────────────────── */
        .layout-main {
          flex: 1; height: 100vh; overflow-y: auto; position: relative;
        }
        .page-transition {
          animation: fade-in-up 0.35s cubic-bezier(0.16, 1, 0.3, 1);
          min-height: 100%;
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* ─── BOTTOM BAR ────────────────────────────────── */
        .layout-bottom-bar {
          display: none;
          position: fixed;
          bottom: 0; left: 0; right: 0;
          background: rgba(10, 10, 10, 0.65);
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 -4px 30px rgba(0, 0, 0, 0.3);
          z-index: 1000;
          padding-bottom: env(safe-area-inset-bottom);
          height: calc(60px + env(safe-area-inset-bottom));
        }
        .bottom-nav-btn {
          flex: 1; display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 3px;
          background: transparent; border: none; color: #4a4a4a;
          cursor: pointer; transition: color 0.18s; padding: 6px 0;
        }
        .bottom-nav-btn.active { color: #f97316; }
        .nav-icon {
          display: flex; align-items: center; justify-content: center;
          transition: transform 0.18s; color: inherit;
        }
        .nav-icon svg {
          width: 26px; height: 26px;
        }
        .bottom-nav-btn.active .nav-icon { transform: translateY(-1px); }
        .bottom-nav-label {
          font-size: 9px; font-weight: 600; color: inherit; letter-spacing: 0.2px;
        }
        .bottom-badge-count {
          position: absolute; top: -5px; right: -8px;
          background: #ef4444; color: #fff; font-size: 9px;
          font-weight: 800; padding: 1px 4px; border-radius: 8px;
          min-width: 16px; text-align: center;
        }
        .bottom-badge-dot {
          position: absolute; top: -2px; right: -4px;
          width: 7px; height: 7px; background: #f97316;
          border-radius: 50%; box-shadow: 0 0 5px rgba(249,115,22,0.6);
        }

        /* ─── RESPONSIVE ────────────────────────────────── */
        @media (max-width: 768px) {
          .layout-sidebar { display: none; }
          .mobile-top-bar { display: block; }
          .layout-main {
            padding-top: calc(83px + env(safe-area-inset-top, 0px));
            padding-bottom: calc(60px + env(safe-area-inset-bottom));
            height: 100vh;
          }
          .layout-bottom-bar { display: flex; }
        }
      `}</style>
    </div>
  )
}
