import React, { useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../application/contexts/AuthContext'
import { ReportarPagoModal } from './ReportarPagoModal'

// ── Minimalist SVG Icons monocolor stroke delgado ──────────────────
const SVG = {
  inicio: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5L12 3l9 7.5V20a1.5 1.5 0 01-1.5 1.5H4.5A1.5 1.5 0 013 20v-9.5z"/>
      <path d="M9 21V12h6v9"/>
    </svg>
  ),
  recibos: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>
  ),
  gastos: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23"/>
      <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
    </svg>
  ),
  chat: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
    </svg>
  ),
  propuestas: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
      <polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
  ),
  reportes: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  ),
  perfil: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4"/>
      <path d="M5 20c0-3.8 3.1-7 7-7s7 3.2 7 7"/>
    </svg>
  ),
  salir: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
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
  const [reportarPagoModalOpen, setReportarPagoModalOpen] = useState(false)

  const p = perfil as any
  const c = config as any

  const edificioNombre = c?.nombre_edificio || c?.nombre || p?.edificio?.nombre || 'Mi Edificio'
  const edificioLogo   = c?.logo_url || p?.edificio?.logo || ''
  const aptoNumero     = p?.apartamento?.numero || p?.apartamentos?.numero || p?.apartamento_id || ''
  const apartamentoId  = p?.apartamento_id || p?.apartamento?.id || ''

  const navItems: { label: string; desc: string; path: string; badge: number; icon: keyof typeof SVG; isNew?: boolean }[] = [
    { label: 'Inicio',     desc: 'Resumen y estado',       path: '/',           badge: 0,              icon: 'inicio' },
    { label: 'Recibos',    desc: 'Historial de pagos',     path: '/recibos',    badge: 0,              icon: 'recibos' },
    { label: 'Chat',       desc: 'Avisos de la comunidad', path: '/chat',       badge: 0,              icon: 'chat' },
    { label: 'Reportes',   desc: 'Incidencias y tickets',  path: '/reportes',   badge: 0,              icon: 'reportes' },
    { label: 'Perfil',     desc: 'Mis datos',              path: '/perfil',     badge: 0,              icon: 'perfil' },
  ]

  return (
    <div className="layout-container">

      {/* ── MODAL REPORTAR PAGO (Disponible desde cualquier pantalla en móvil) ── */}
      {reportarPagoModalOpen && (
        <ReportarPagoModal
          apartamentoId={apartamentoId}
          onClose={() => setReportarPagoModalOpen(false)}
          onSuccess={() => setReportarPagoModalOpen(false)}
        />
      )}

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

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button className="mobile-profile-btn" onClick={() => navigate('/chat')} title="Chat">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
              </svg>
            </button>
            <button className="mobile-profile-btn" onClick={() => navigate('/perfil')} title="Mi perfil">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4"/>
                <path d="M5 20c0-3.8 3.1-7 7-7s7 3.2 7 7"/>
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* ── MAIN CONTENT ──────────────────────────────────── */}
      <main className="layout-main">
        <div className="page-transition">
          <Outlet />
        </div>
      </main>

      {/* ── BOTTOM BAR (Mobile - 5 Slots con Botón Central de Reportar Pago) ── */}
      <nav className="layout-bottom-bar">
        {/* 1. Inicio */}
        <button
          onClick={() => navigate('/')}
          className={`bottom-nav-btn ${pathname === '/' ? 'active' : ''}`}
        >
          <span className="nav-icon">{SVG.inicio}</span>
          <span className="bottom-nav-label">Inicio</span>
        </button>

        {/* 2. Recibos */}
        <button
          onClick={() => navigate('/recibos')}
          className={`bottom-nav-btn ${pathname.startsWith('/recibos') ? 'active' : ''}`}
        >
          <span className="nav-icon">{SVG.recibos}</span>
          <span className="bottom-nav-label">Recibos</span>
        </button>

        {/* 3. BOTÓN CENTRAL HERO: REPORTAR PAGO */}
        <button
          type="button"
          onClick={() => setReportarPagoModalOpen(true)}
          className="bottom-nav-center-action"
          title="Reportar Pago"
        >
          <div className="center-btn-glow" />
          <div className="center-btn-circle">
            {/* Emblema estrella / brújula de 8 puntas idéntico a la imagen de referencia */}
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" strokeWidth="1.4" opacity="0.65"/>
              <path d="M12 3v18M3 12h18" strokeWidth="2.2"/>
              <path d="M5.64 5.64l12.72 12.72M5.64 18.36L18.36 5.64" strokeWidth="1.4" opacity="0.8"/>
            </svg>
          </div>
          <span className="center-btn-label">Reportar</span>
        </button>

        {/* 4. Reportes */}
        <button
          onClick={() => navigate('/reportes')}
          className={`bottom-nav-btn ${pathname.startsWith('/reportes') ? 'active' : ''}`}
        >
          <span className="nav-icon">{SVG.reportes}</span>
          <span className="bottom-nav-label">Reportes</span>
        </button>

        {/* 5. Perfil */}
        <button
          onClick={() => navigate('/perfil')}
          className={`bottom-nav-btn ${pathname.startsWith('/perfil') ? 'active' : ''}`}
        >
          <span className="nav-icon">{SVG.perfil}</span>
          <span className="bottom-nav-label">Perfil</span>
        </button>
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
          background: rgba(12, 16, 23, 0.85);
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 4px 30px rgba(0, 0, 0, 0.4);
          padding-top: env(safe-area-inset-top, 0px);
        }
        .mobile-top-inner {
          display: flex; align-items: center; gap: 12px;
          padding: 26px 16px 12px;
        }
        .mobile-logo {
          width: 38px; height: 38px;
          background: rgba(249,115,22,0.12);
          border-radius: 12px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          border: 1px solid rgba(249,115,22,0.25);
        }
        .mobile-logo-img {
          width: 38px; height: 38px; border-radius: 12px;
          object-fit: cover; flex-shrink: 0;
          border: 1px solid rgba(255,255,255,0.1);
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
          font-size: 11px; color: #64748b; font-weight: 500; line-height: 1.2;
        }
        .mobile-profile-btn {
          width: 36px; height: 36px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08); border-radius: 10px;
          color: #94a3b8; display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: all 0.18s; flex-shrink: 0;
        }
        .mobile-profile-btn:active {
          border-color: #f97316; color: #f97316;
          background: rgba(249,115,22,0.12);
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

        /* ─── BOTTOM BAR (DOCK) ─────────────────────────── */
        .layout-bottom-bar {
          display: none;
          position: fixed;
          bottom: 0; left: 0; right: 0;
          background: rgba(13, 17, 24, 0.94);
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.55);
          z-index: 1000;
          padding-bottom: env(safe-area-inset-bottom);
          height: calc(66px + env(safe-area-inset-bottom));
          align-items: center;
          justify-content: space-around;
          padding-left: 6px;
          padding-right: 6px;
        }
        .bottom-nav-btn {
          flex: 1; display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 3px;
          background: transparent; border: none; color: #71717a;
          cursor: pointer; transition: color 0.18s; padding: 6px 0;
          user-select: none;
        }
        .bottom-nav-btn.active { color: #f97316; }
        .nav-icon {
          display: flex; align-items: center; justify-content: center;
          transition: transform 0.18s; color: inherit;
        }
        .nav-icon svg {
          width: 22px; height: 22px;
        }
        .bottom-nav-btn.active .nav-icon { transform: translateY(-1px); }
        .bottom-nav-label {
          font-size: 10px; font-weight: 600; color: inherit; letter-spacing: 0.2px;
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

        /* ─── BOTÓN CENTRAL DESTACADO (Reportar Pago) ──────── */
        .bottom-nav-center-action {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          cursor: pointer;
          position: relative;
          padding: 0;
          margin-top: -18px; /* Flota sobre la barra superior del dock */
          outline: none;
          user-select: none;
        }
        .center-btn-glow {
          position: absolute;
          top: -2px;
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(249, 115, 22, 0.75) 0%, rgba(249, 115, 22, 0) 70%);
          filter: blur(10px);
          pointer-events: none;
          animation: centerPulse 2.8s infinite ease-in-out;
        }
        @keyframes centerPulse {
          0%, 100% { transform: scale(1); opacity: 0.85; }
          50%      { transform: scale(1.18); opacity: 1; }
        }
        .center-btn-circle {
          width: 52px;
          height: 52px;
          border-radius: 50%;
          background: linear-gradient(135deg, #fb923c 0%, #f97316 55%, #ea580c 100%);
          border: 2px solid rgba(255, 255, 255, 0.35);
          box-shadow: 0 0 25px rgba(249, 115, 22, 0.65), 0 8px 18px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s;
          position: relative;
          z-index: 2;
        }
        .bottom-nav-center-action:active .center-btn-circle {
          transform: scale(0.92);
        }
        .center-btn-label {
          font-size: 9px;
          font-weight: 700;
          color: #f97316;
          letter-spacing: 0.3px;
          margin-top: 4px;
          text-transform: uppercase;
        }

        /* ─── RESPONSIVE ────────────────────────────────── */
        @media (max-width: 768px) {
          .layout-sidebar { display: none; }
          .mobile-top-bar { display: block; }
          .layout-main {
            padding-top: calc(75px + env(safe-area-inset-top, 0px));
            padding-bottom: calc(70px + env(safe-area-inset-bottom));
            height: 100vh;
          }
          .layout-bottom-bar { display: flex; }
        }
      `}</style>
    </div>
  )
}
