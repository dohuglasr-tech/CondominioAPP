import React, { useState, useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../application/contexts/AuthContext'
import { ReportarPagoModal } from './ReportarPagoModal'
import { NotificationBell } from './NotificationBell'
import { ThemeToggle } from './ThemeToggle'

// ── Minimalist SVG Line Icons monocolor stroke delgado ──────────────────
const SVG = {
  inicio: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5L12 3l9 7.5V20a1.5 1.5 0 01-1.5 1.5H4.5A1.5 1.5 0 013 20v-9.5z"/>
      <path d="M9 21V12h6v9"/>
    </svg>
  ),
  recibos: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  ),
  pago: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2"/>
      <line x1="2" y1="10" x2="22" y2="10"/>
    </svg>
  ),
  gastos: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23"/>
      <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
    </svg>
  ),
  chat: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
    </svg>
  ),
  propuestas: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
      <polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
  ),
  reportes: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  ),
  perfil: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4"/>
      <path d="M5 20c0-3.8 3.1-7 7-7s7 3.2 7 7"/>
    </svg>
  ),
  mora: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  ),
  junta: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 00-3-3.87"/>
      <path d="M16 3.13a4 4 0 010 7.75"/>
    </svg>
  ),
  salir: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  ),
  gas: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 22V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v17"/>
      <path d="M15 9h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L20.5 6.5"/>
      <path d="M7 9h4"/>
      <path d="M3 22h12"/>
    </svg>
  ),
}

export const Layout: React.FC = () => {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { signOut, perfil, config, user } = useAuth()
  const [reportarPagoModalOpen, setReportarPagoModalOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const p = perfil as any
  const c = config as any

  const edificioNombre = c?.nombre_edificio || c?.nombre || p?.edificio?.nombre || 'Residencias Ocutuy 5'
  const edificioLogo   = c?.logo_url || p?.edificio?.logo || ''
  const aptoNumero     = p?.apartamento?.numero || p?.apartamentos?.numero || p?.apartamento_id || ''
  const apartamentoId  = p?.apartamento_id || p?.apartamento?.id || ''
  const residenteNombre = p?.nombre_completo || 'Propietario Residente'
  const residenteEmail  = p?.propietario_email || user?.email || p?.email || ''

  
  const residenteInitials = residenteNombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w: string) => w[0].toUpperCase())
    .join('') || (aptoNumero ? `A${aptoNumero}` : 'R')

  // Cerrar el Drawer al cambiar de ruta
  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  const navItems: { label: string; desc: string; path: string; icon: keyof typeof SVG }[] = [
    { label: 'Inicio',               desc: 'Estado de cuenta y resumen', path: '/',           icon: 'inicio' },
    { label: 'Mis Recibos',          desc: 'Historial y recibos emitidos', path: '/recibos',  icon: 'recibos' },
    { label: 'Servicio de Gas',      desc: 'Tanque y cuota independiente', path: '/gas',      icon: 'gas' },
    { label: 'Junta de Condominio',  desc: 'Organigrama y directiva',    path: '/junta',    icon: 'junta' },
    { label: 'Lista de Mora',        desc: 'Transparencia comunitaria',  path: '/mora',     icon: 'mora' },
    { label: 'Chat Edificio',        desc: 'Avisos y chat en vivo',      path: '/chat',     icon: 'chat' },
    { label: 'Incidencias',          desc: 'Reportar averías y tickets', path: '/reportes', icon: 'reportes' },
    { label: 'Propuestas',           desc: 'Votaciones activas',         path: '/propuestas', icon: 'propuestas' },
    { label: 'Gastos Comunes',       desc: 'Relación de egresos',        path: '/gastos',   icon: 'gastos' },
    { label: 'Mi Perfil',            desc: 'Mis datos de contacto',      path: '/perfil',   icon: 'perfil' },
  ]

  return (
    <div className="layout-container">

      {/* ── MODAL REPORTAR PAGO (Disponible globalmente para Desktop y Móvil) ── */}
      {reportarPagoModalOpen && (
        <ReportarPagoModal
          apartamentoId={apartamentoId}
          onClose={() => setReportarPagoModalOpen(false)}
          onSuccess={() => setReportarPagoModalOpen(false)}
          config={config}
        />
      )}

      {/* ── SIDEBAR (Desktop) ─────────────────────────────── */}
      <aside className="layout-sidebar">
        {/* Brand / Logo */}
        <div className="sidebar-header" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          {edificioLogo ? (
            <img src={edificioLogo} alt="Logo" className="brand-logo-img" />
          ) : (
            <div className="brand-logo">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent, #f97316)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
            <p className="brand-subtitle">
              {aptoNumero ? `Apartamento ${aptoNumero}` : 'Portal Residentes'}
            </p>
          </div>
        </div>

        {/* Tarjeta de Residente en Sidebar */}
        <div className="sidebar-user-card" onClick={() => navigate('/perfil')}>
          <div className="sidebar-user-avatar">
            {residenteInitials}
          </div>
          <div className="sidebar-user-info">
            <span className="sidebar-user-name">{residenteNombre}</span>
            <span className="sidebar-user-badge">
              {aptoNumero ? `Apto ${aptoNumero}` : 'Residente'}
            </span>
          </div>
          {/* Campanita en sidebar */}
          <div onClick={(e) => e.stopPropagation()}>
            <NotificationBell apartamentoId={apartamentoId || null} iconColor="#a1a1aa" />
          </div>
        </div>

        {/* Botón Destacado de Reportar Pago en Sidebar */}
        <div style={{ padding: '0 8px 16px' }}>
          <button
            onClick={() => setReportarPagoModalOpen(true)}
            className="sidebar-reportar-pago-btn"
            title="Reportar nuevo pago de condominio"
          >
            <div className="sidebar-btn-glow" />
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            <span>Reportar Pago</span>
          </button>
        </div>

        {/* Navegación Desktop */}
        <nav className="sidebar-nav">
          {navItems.map(item => {
            const isActive = item.path === '/' ? pathname === '/' : pathname.startsWith(item.path)
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`nav-btn ${isActive ? 'active' : ''}`}
              >
                <span className="nav-icon-sidebar">{SVG[item.icon]}</span>
                <div className="nav-text-block">
                  <span className="nav-label">{item.label}</span>
                  <span className="nav-desc">{item.desc}</span>
                </div>
              </button>
            )
          })}
        </nav>

        {/* Footer Sidebar */}
        <div className="sidebar-footer">
          <div style={{ marginBottom: '10px' }}>
            <ThemeToggle variant="button" />
          </div>
          <button className="logout-btn" onClick={() => signOut()}>
            {SVG.salir} Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* ── MOBILE TOP BAR (Alineada con el estilo del panel admin) ──────────────── */}
      <header className="mobile-top-bar">
        <div className="mobile-top-inner">
          {/* Izquierda: Hamburguesa + Logo + Apto */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => setDrawerOpen(true)}
              className="mobile-hamburger-btn"
              title="Abrir menú"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="3" y1="6" x2="21" y2="6"/>
                <line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>

            {/* Logo en círculo naranja + Título */}
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
              onClick={() => navigate('/')}
            >
              <div className="mobile-logo-circle">
                {edificioLogo ? (
                  <img src={edificioLogo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="2" width="16" height="20" rx="2"/>
                    <line x1="9"  y1="7"  x2="9"  y2="7.01"/>
                    <line x1="15" y1="7"  x2="15" y2="7.01"/>
                    <line x1="9"  y1="11" x2="9"  y2="11.01"/>
                    <line x1="15" y1="11" x2="15" y2="11.01"/>
                  </svg>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span className="mobile-header-building">{edificioNombre.toUpperCase()}</span>
                <span className="mobile-header-apto">
                  {aptoNumero ? `APTO ${aptoNumero} · RESIDENTE` : 'PORTAL RESIDENTE'}
                </span>
              </div>
            </div>
          </div>

          {/* Derecha: Campanita de Notificaciones + Toggle Tema + Chat + Avatar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Toggle Modo Claro / Oscuro */}
            <ThemeToggle variant="icon" />

            {/* Notificaciones */}
            <NotificationBell apartamentoId={apartamentoId || null} iconColor="#a1a1aa" />

            <button
              className="mobile-header-action-btn"
              onClick={() => navigate('/chat')}
              title="Chat comunitario"
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
              </svg>
            </button>

            {/* Avatar circular naranja interactivo */}
            <div
              className="mobile-header-avatar"
              onClick={() => setDrawerOpen(true)}
              title="Abrir menú"
            >
              {residenteInitials}
            </div>
          </div>
        </div>
      </header>

      {/* ── MENÚ FUERA DE LIENZO (OFF-CANVAS DRAWER) ───────────────────────── */}
      <div
        className={`resident-offcanvas-overlay ${drawerOpen ? 'open' : ''}`}
        onClick={() => setDrawerOpen(false)}
      />

      <aside className={`resident-offcanvas-drawer ${drawerOpen ? 'open' : ''}`}>
        {/* Header del Drawer */}
        <div className="drawer-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="drawer-logo-circle">
              {edificioLogo ? (
                <img src={edificioLogo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="2" width="16" height="20" rx="2"/>
                  <line x1="9"  y1="6"  x2="9"  y2="6.01"/>
                  <line x1="15" y1="6"  x2="15" y2="6.01"/>
                </svg>
              )}
            </div>
            <div>
              <div style={{ color: '#fff', fontSize: '13px', fontWeight: 800, lineHeight: 1.1 }}>
                {edificioNombre.toUpperCase()}
              </div>
              <div style={{ color: 'var(--color-accent, #f97316)', fontSize: '10px', fontWeight: 700, marginTop: '2px' }}>
                Portal del Propietario
              </div>
            </div>
          </div>

          <button
            onClick={() => setDrawerOpen(false)}
            className="drawer-close-btn"
            title="Cerrar menú"
          >
            ✕
          </button>
        </div>

        {/* Tarjeta de Residente en Drawer */}
        <div className="drawer-user-card" onClick={() => { setDrawerOpen(false); navigate('/perfil') }}>
          <div className="drawer-user-avatar">
            {residenteInitials}
          </div>
          <div style={{ overflow: 'hidden', flex: 1 }}>
            <div style={{ color: '#fff', fontSize: '14px', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {residenteNombre}
            </div>
            {residenteEmail ? (
              <div style={{ color: '#8e8e93', fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {residenteEmail}
              </div>
            ) : null}
            <div style={{ marginTop: '4px' }}>
              <span style={{
                fontSize: '10px',
                fontWeight: 800,
                color: '#22c55e',
                backgroundColor: 'rgba(34, 197, 94, 0.15)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                padding: '2px 8px',
                borderRadius: '999px',
                display: 'inline-block'
              }}>
                {aptoNumero ? `Apartamento ${aptoNumero}` : 'Residente'}
              </span>
            </div>
          </div>
        </div>

        {/* Contenido con Scroll de Opciones Categorizadas en Botones Circulares */}
        <div className="drawer-scrollable">
          {/* SECCIÓN 1: FINANZAS Y PAGOS */}
          <div>
            <div className="drawer-section-title">
              <span>💳</span> FINANZAS Y PAGOS
            </div>
            <div className="drawer-grid">
              {/* 1. Reportar Pago */}
              <button
                className="drawer-item-btn"
                onClick={() => {
                  setDrawerOpen(false)
                  setReportarPagoModalOpen(true)
                }}
              >
                <div className="drawer-circle-icon highlight-pulse">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"/>
                    <line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                </div>
                <span className="drawer-label" style={{ color: '#22c55e', fontWeight: 700 }}>+ Pago</span>
              </button>

              {/* 2. Mis Recibos */}
              <button
                className="drawer-item-btn"
                onClick={() => {
                  setDrawerOpen(false)
                  navigate('/recibos')
                }}
              >
                <div className={`drawer-circle-icon ${pathname.startsWith('/recibos') ? 'active' : ''}`}>
                  {SVG.recibos}
                </div>
                <span className={`drawer-label ${pathname.startsWith('/recibos') ? 'active' : ''}`}>Recibos</span>
              </button>

              {/* 3. Lista de Mora */}
              <button
                className="drawer-item-btn"
                onClick={() => {
                  setDrawerOpen(false)
                  navigate('/mora')
                }}
              >
                <div className={`drawer-circle-icon ${pathname.startsWith('/mora') ? 'active' : ''}`}>
                  {SVG.mora}
                </div>
                <span className={`drawer-label ${pathname.startsWith('/mora') ? 'active' : ''}`}>Mora</span>
              </button>

              {/* 4. Gastos Comunes */}
              <button
                className="drawer-item-btn"
                onClick={() => {
                  setDrawerOpen(false)
                  navigate('/gastos')
                }}
              >
                <div className={`drawer-circle-icon ${pathname.startsWith('/gastos') ? 'active' : ''}`}>
                  {SVG.gastos}
                </div>
                <span className={`drawer-label ${pathname.startsWith('/gastos') ? 'active' : ''}`}>Gastos</span>
              </button>

              {/* 5. Gas Comunal */}
              <button
                className="drawer-item-btn"
                onClick={() => {
                  setDrawerOpen(false)
                  navigate('/gas')
                }}
              >
                <div className={`drawer-circle-icon ${pathname.startsWith('/gas') ? 'active' : ''}`}>
                  {SVG.gas}
                </div>
                <span className={`drawer-label ${pathname.startsWith('/gas') ? 'active' : ''}`}>Gas</span>
              </button>
            </div>
          </div>

          {/* SECCIÓN 2: COMUNIDAD Y CONVIVENCIA */}
          <div>
            <div className="drawer-section-title">
              <span>👥</span> COMUNIDAD Y CONVIVENCIA
            </div>
            <div className="drawer-grid">
              {/* Junta Directiva */}
              <button
                className="drawer-item-btn"
                onClick={() => {
                  setDrawerOpen(false)
                  navigate('/junta')
                }}
              >
                <div className={`drawer-circle-icon ${pathname.startsWith('/junta') ? 'active' : ''}`}>
                  {SVG.junta}
                </div>
                <span className={`drawer-label ${pathname.startsWith('/junta') ? 'active' : ''}`}>Junta</span>
              </button>

              {/* Chat Edificio */}
              <button
                className="drawer-item-btn"
                onClick={() => {
                  setDrawerOpen(false)
                  navigate('/chat')
                }}
              >
                <div className={`drawer-circle-icon ${pathname.startsWith('/chat') ? 'active' : ''}`}>
                  {SVG.chat}
                </div>
                <span className={`drawer-label ${pathname.startsWith('/chat') ? 'active' : ''}`}>Chat</span>
              </button>

              {/* Reportes de Averías */}
              <button
                className="drawer-item-btn"
                onClick={() => {
                  setDrawerOpen(false)
                  navigate('/reportes')
                }}
              >
                <div className={`drawer-circle-icon ${pathname.startsWith('/reportes') ? 'active' : ''}`}>
                  {SVG.reportes}
                </div>
                <span className={`drawer-label ${pathname.startsWith('/reportes') ? 'active' : ''}`}>Averías</span>
              </button>

              {/* Propuestas / Votaciones */}
              <button
                className="drawer-item-btn"
                onClick={() => {
                  setDrawerOpen(false)
                  navigate('/propuestas')
                }}
              >
                <div className={`drawer-circle-icon ${pathname.startsWith('/propuestas') ? 'active' : ''}`}>
                  {SVG.propuestas}
                </div>
                <span className={`drawer-label ${pathname.startsWith('/propuestas') ? 'active' : ''}`}>Votaciones</span>
              </button>
            </div>
          </div>

          {/* SECCIÓN 3: MI CUENTA */}
          <div>
            <div className="drawer-section-title">
              <span>👤</span> MI CUENTA
            </div>
            <div className="drawer-grid">
              <button
                className="drawer-item-btn"
                onClick={() => {
                  setDrawerOpen(false)
                  navigate('/perfil')
                }}
              >
                <div className={`drawer-circle-icon ${pathname.startsWith('/perfil') ? 'active' : ''}`}>
                  {SVG.perfil}
                </div>
                <span className={`drawer-label ${pathname.startsWith('/perfil') ? 'active' : ''}`}>Mi Perfil</span>
              </button>

              <button
                className="drawer-item-btn"
                onClick={() => {
                  setDrawerOpen(false)
                  navigate('/reportes')
                }}
              >
                <div className={`drawer-circle-icon ${pathname.startsWith('/reportes') ? 'active' : ''}`}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                  </svg>
                </div>
                <span className={`drawer-label ${pathname.startsWith('/reportes') ? 'active' : ''}`}>Avisos</span>
              </button>
            </div>
          </div>

          {/* SECCIÓN APARIENCIA (MODO CLARO / OSCURO) */}
          <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }} className="drawer-theme-section">
            <div className="drawer-section-title">
              <span>🎨</span> APARIENCIA
            </div>
            <div style={{ background: 'rgba(255, 255, 255, 0.04)', borderRadius: '12px', padding: '4px 10px' }} className="drawer-theme-box">
              <ThemeToggle variant="switch" />
            </div>
          </div>

          {/* BOTÓN CERRAR SESIÓN */}
          <div style={{ marginTop: '14px', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <button
              onClick={() => signOut()}
              className="drawer-logout-btn"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              <span>Cerrar sesión</span>
            </button>
          </div>
        </div>
      </aside>

      {/* ── MAIN CONTENT ──────────────────────────────────── */}
      <main className="layout-main">
        <div className="page-transition">
          <Outlet />
        </div>
      </main>

      {/* ── BOTTOM DOCK (Mobile - 5 Slots con Botón Central Flotante de Reportar Pago) ── */}
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

        {/* 3. BOTÓN CENTRAL HERO ELEVADO: REPORTAR PAGO */}
        <button
          type="button"
          onClick={() => setReportarPagoModalOpen(true)}
          className="bottom-nav-center-action"
          title="Reportar Pago"
        >
          <div className="center-btn-glow" />
          <div className="center-btn-circle">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="2"/>
              <line x1="2" y1="10" x2="22" y2="10"/>
              <line x1="12" y1="14" x2="12" y2="14"/>
            </svg>
          </div>
          <span className="center-btn-label">Reportar</span>
        </button>

        {/* 4. Mora */}
        <button
          onClick={() => navigate('/mora')}
          className={`bottom-nav-btn ${pathname.startsWith('/mora') ? 'active' : ''}`}
        >
          <span className="nav-icon">{SVG.mora}</span>
          <span className="bottom-nav-label">Mora</span>
        </button>

        {/* 5. Chat */}
        <button
          onClick={() => navigate('/chat')}
          className={`bottom-nav-btn ${pathname.startsWith('/chat') ? 'active' : ''}`}
        >
          <span className="nav-icon">{SVG.chat}</span>
          <span className="bottom-nav-label">Chat</span>
        </button>
      </nav>

      {/* ── STYLES ────────────────────────────────────────── */}
      <style>{`
        * { box-sizing: border-box; }
        .layout-container {
          display: flex;
          height: 100vh;
          height: 100dvh;
          width: 100%;
          background-color: #090a0d;
          font-family: 'Inter', sans-serif;
          overflow: hidden;
        }

        /* ─── SIDEBAR DESKTOP ────────────────────────────── */
        .layout-sidebar {
          width: 260px;
          background: linear-gradient(180deg, #121620 0%, #0a0d13 100%);
          border-right: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          flex-direction: column;
          padding: 24px 16px;
          flex-shrink: 0;
        }
        .sidebar-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 20px;
          padding: 0 8px;
        }
        .brand-logo {
          width: 42px; height: 42px;
          background: linear-gradient(135deg, rgba(249,115,22,0.2) 0%, rgba(234,88,12,0.1) 100%);
          border: 1px solid rgba(249,115,22,0.3);
          border-radius: 12px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          box-shadow: 0 4px 12px rgba(249,115,22,0.2);
        }
        .brand-logo-img {
          width: 42px; height: 42px;
          border-radius: 12px;
          object-fit: cover;
          flex-shrink: 0;
          border: 1px solid rgba(255, 255, 255, 0.12);
        }
        .brand-title {
          color: #fff;
          font-size: 15px;
          font-weight: 800;
          margin: 0;
          line-height: 1.2;
          letter-spacing: 0.3px;
        }
        .brand-subtitle {
          color: var(--color-accent, #f97316);
          font-size: 11px;
          font-weight: 700;
          margin: 2px 0 0;
          letter-spacing: 0.4px;
        }

        /* Tarjeta de usuario en sidebar */
        .sidebar-user-card {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 14px;
          padding: 10px 12px;
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .sidebar-user-card:hover {
          background: rgba(255, 255, 255, 0.06);
          border-color: var(--border-accent, rgba(249, 115, 22, 0.3));
        }
        .sidebar-user-avatar {
          width: 36px; height: 36px;
          border-radius: 50%;
          background: var(--color-brand-gradient, linear-gradient(135deg, #fb923c 0%, #ea580c 100%));
          color: #fff;
          font-size: 12px;
          font-weight: 800;
          display: flex; align-items: center; justify-content: center;
          box-shadow: var(--color-brand-shadow, 0 2px 8px rgba(234, 88, 12, 0.4));
          flex-shrink: 0;
        }
        .sidebar-user-info {
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .sidebar-user-name {
          color: #fff;
          font-size: 13px;
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .sidebar-user-badge {
          color: #22c55e;
          font-size: 10px;
          font-weight: 700;
        }

        /* Botón de Reportar Pago en Sidebar */
        .sidebar-reportar-pago-btn {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px 14px;
          background: var(--color-brand-gradient, linear-gradient(135deg, var(--color-accent, #f97316) 0%, var(--color-accent-hover, #ea580c) 100%));
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 12px;
          color: #fff;
          font-size: 13px;
          font-weight: 800;
          cursor: pointer;
          position: relative;
          box-shadow: var(--color-brand-shadow, 0 4px 16px rgba(234, 88, 12, 0.45));
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .sidebar-reportar-pago-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 22px rgba(234, 88, 12, 0.6);
        }
        .sidebar-reportar-pago-btn:active {
          transform: translateY(0);
        }

        .sidebar-nav {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 3px;
          overflow-y: auto;
          padding-right: 2px;
        }
        .sidebar-nav::-webkit-scrollbar { width: 4px; }
        .sidebar-nav::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }

        .nav-btn {
          display: flex;
          align-items: center;
          gap: 12px;
          background: transparent;
          border: none;
          padding: 9px 12px;
          color: #94a3b8;
          cursor: pointer;
          transition: all 0.18s;
          text-align: left;
          border-radius: 10px;
          width: 100%;
        }
        .nav-btn:hover { background: rgba(255,255,255,0.04); color: #fff; }
        .nav-btn.active {
          background: var(--color-accent-light, rgba(249,115,22,0.12));
          color: var(--color-accent, #f97316);
          border-left: 3px solid var(--color-accent, #f97316);
          border-radius: 0 10px 10px 0;
        }
        .nav-icon-sidebar {
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; width: 22px; color: inherit;
        }
        .nav-text-block { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
        .nav-label {
          font-size: 13px; font-weight: 700; color: inherit;
        }
        .nav-desc {
          font-size: 10px; color: #64748b; font-weight: 500;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .nav-btn.active .nav-desc { color: var(--color-accent, #f97316); opacity: 0.85; }

        .sidebar-footer {
          margin-top: auto; padding-top: 14px; border-top: 1px solid rgba(255, 255, 255, 0.08);
        }
        .logout-btn {
          width: 100%; display: flex; align-items: center; gap: 10px;
          padding: 10px 12px; background: transparent; border: none;
          color: #ef4444; font-size: 13px; font-weight: 700;
          cursor: pointer; border-radius: 10px; transition: all 0.18s;
        }
        .logout-btn:hover { background: rgba(239,68,68,0.08); }

        /* ─── MOBILE TOP BAR ────────────────────────────── */
        .mobile-top-bar {
          display: none;
          position: fixed;
          top: 0; left: 0; right: 0;
          z-index: 1001;
          background: rgba(10, 11, 14, 0.95);
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.6);
          padding-top: env(safe-area-inset-top, 0px);
        }
        .mobile-top-inner {
          height: 62px;
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 16px;
        }
        .mobile-hamburger-btn {
          background: transparent;
          border: none;
          color: #fff;
          padding: 4px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .mobile-logo-circle {
          width: 34px; height: 34px;
          border-radius: 50%;
          background: var(--color-brand-gradient, linear-gradient(135deg, #fb923c 0%, #ea580c 100%));
          display: flex; align-items: center; justify-content: center;
          box-shadow: var(--color-brand-shadow, 0 2px 10px rgba(249, 115, 22, 0.4));
          overflow: hidden;
          flex-shrink: 0;
        }
        .mobile-header-building {
          color: #fff;
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.4px;
          line-height: 1.1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 180px;
        }
        .mobile-header-apto {
          color: var(--color-accent, #f97316);
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.6px;
          margin-top: 1px;
        }
        .mobile-header-action-btn {
          background: transparent;
          border: none;
          color: #a1a1aa;
          padding: 6px;
          cursor: pointer;
          display: flex;
          align-items: center;
        }
        .mobile-header-avatar {
          width: 32px; height: 32px;
          border-radius: 50%;
          background: var(--color-brand-gradient, linear-gradient(135deg, var(--color-accent, #f97316) 0%, var(--color-accent-hover, #ea580c) 100%));
          color: #fff;
          font-size: 12px;
          font-weight: 800;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
          box-shadow: var(--color-brand-shadow, 0 2px 8px rgba(234, 88, 12, 0.4));
        }

        /* ─── OFF-CANVAS DRAWER (MENÚ FUERA DE LIENZO) ───── */
        .resident-offcanvas-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          z-index: 100000;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.28s ease;
        }
        .resident-offcanvas-overlay.open {
          opacity: 1;
          pointer-events: auto;
        }
        .resident-offcanvas-drawer {
          position: fixed;
          top: 0; bottom: 0; left: 0;
          width: 86%;
          max-width: 360px;
          background-color: #0c0d10;
          border-right: 1px solid rgba(255, 255, 255, 0.08);
          z-index: 100001;
          transform: translateX(-100%);
          transition: transform 0.32s cubic-bezier(0.16, 1, 0.3, 1);
          display: flex;
          flex-direction: column;
          box-shadow: 10px 0 40px rgba(0, 0, 0, 0.85);
          overflow: hidden;
        }
        .resident-offcanvas-drawer.open {
          transform: translateX(0);
        }
        .drawer-header {
          padding: 20px 20px 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .drawer-logo-circle {
          width: 36px; height: 36px;
          border-radius: 50%;
          background: var(--color-brand-gradient, linear-gradient(135deg, var(--color-accent, #f97316) 0%, var(--color-accent-hover, #ea580c) 100%));
          display: flex; align-items: center; justify-content: center;
          box-shadow: var(--color-brand-shadow, 0 2px 10px rgba(249, 115, 22, 0.4));
        }
        .drawer-close-btn {
          width: 34px; height: 34px;
          border-radius: 50%;
          background-color: #1c1d22;
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #a1a1aa;
          font-size: 15px;
          cursor: pointer;
          display: flex; align-items: center; justify-content: center;
        }
        .drawer-user-card {
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          display: flex;
          align-items: center;
          gap: 12px;
          background: rgba(255, 255, 255, 0.015);
          cursor: pointer;
        }
        .drawer-user-avatar {
          width: 44px; height: 44px;
          border-radius: 50%;
          background: var(--color-brand-gradient, linear-gradient(135deg, var(--color-accent, #f97316) 0%, var(--color-accent-hover, #ea580c) 100%));
          color: #fff;
          font-size: 15px;
          font-weight: 800;
          display: flex; align-items: center; justify-content: center;
          box-shadow: var(--color-brand-shadow, 0 2px 10px rgba(234, 88, 12, 0.45));
          flex-shrink: 0;
        }
        .drawer-scrollable {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 22px;
        }
        .drawer-scrollable::-webkit-scrollbar { display: none; }
        .drawer-section-title {
          font-size: 11px;
          font-weight: 800;
          color: #71717a;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .drawer-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px 10px;
        }
        .drawer-item-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          background: none;
          border: none;
          cursor: pointer;
          padding: 0;
          outline: none;
        }
        .drawer-circle-icon {
          width: 52px; height: 52px;
          border-radius: 50%;
          background: #18191e;
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #d4d4d8;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .drawer-item-btn:hover .drawer-circle-icon,
        .drawer-item-btn:active .drawer-circle-icon {
          background: #24252d;
          color: #fff;
          transform: scale(1.05);
        }
        .drawer-circle-icon.active {
          background: var(--color-brand-gradient, linear-gradient(135deg, var(--color-accent, #f97316) 0%, var(--color-accent-hover, #ea580c) 100%)) !important;
          border: none !important;
          color: #fff !important;
          box-shadow: var(--color-brand-shadow, 0 4px 18px rgba(249, 115, 22, 0.5)) !important;
        }
        .drawer-label {
          font-size: 11px;
          color: #a1a1aa;
          font-weight: 500;
          text-align: center;
          line-height: 1.2;
          max-width: 68px;
          overflow: hidden;
          text-overflow: ellipsis;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }
        .drawer-label.active {
          color: var(--color-accent, #f97316);
          font-weight: 700;
        }
        .drawer-logout-btn {
          display: flex;
          align-items: center;
          gap: 12px;
          background: none;
          border: none;
          color: #ef4444;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          padding: 8px 4px;
        }

        /* ─── MAIN ──────────────────────────────────────── */
        .layout-main {
          flex: 1;
          height: 100vh;
          height: 100dvh;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          position: relative;
          background-color: #090a0d;
        }
        .page-transition {
          animation: fade-in-up 0.35s cubic-bezier(0.16, 1, 0.3, 1);
          min-height: 100%;
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* ─── BOTTOM DOCK (Mobile) ───────────────────────── */
        .layout-bottom-bar {
          display: none;
          position: fixed;
          bottom: 0; left: 0; right: 0;
          width: 100%;
          background: rgba(11, 13, 16, 0.96);
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.75);
          z-index: 9999;
          transform: translate3d(0, 0, 0);
          -webkit-transform: translate3d(0, 0, 0);
          will-change: transform;
          -webkit-backface-visibility: hidden;
          backface-visibility: hidden;
          padding-bottom: max(12px, env(safe-area-inset-bottom, 12px));
          height: calc(64px + max(12px, env(safe-area-inset-bottom, 12px)));
          align-items: center;
          justify-content: space-around;
          padding-left: 8px;
          padding-right: 8px;
        }
        .bottom-nav-btn {
          flex: 1; display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 4px;
          background: transparent; border: none; color: #82828e;
          cursor: pointer; transition: color 0.18s; padding: 6px 0;
          user-select: none;
          -webkit-user-select: none;
          -webkit-tap-highlight-color: transparent;
        }
        .bottom-nav-btn.active { color: var(--color-accent, #f97316); }
        .nav-icon {
          display: flex; align-items: center; justify-content: center;
          transition: transform 0.18s; color: inherit;
        }
        .bottom-nav-btn.active .nav-icon { transform: translateY(-1px); }
        .bottom-nav-label {
          font-size: 10px; font-weight: 600; color: inherit; letter-spacing: 0.2px;
        }

        /* ─── BOTÓN CENTRAL HERO FLOTANTE: REPORTAR PAGO ─── */
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
          margin-top: -18px;
          outline: none;
          user-select: none;
          -webkit-user-select: none;
          -webkit-tap-highlight-color: transparent;
        }
        .center-btn-glow {
          position: absolute;
          top: -2px;
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: radial-gradient(circle, var(--color-accent-glow, rgba(249, 115, 22, 0.8)) 0%, transparent 70%);
          filter: blur(10px);
          pointer-events: none;
          animation: centerPulse 2.8s infinite ease-in-out;
        }
        @keyframes centerPulse {
          0%, 100% { transform: scale(1); opacity: 0.85; }
          50%      { transform: scale(1.18); opacity: 1; }
        }
        .center-btn-circle {
          width: 54px;
          height: 54px;
          border-radius: 50%;
          background: var(--color-brand-gradient, linear-gradient(135deg, #fb923c 0%, #ea580c 100%));
          border: 3px solid #090a0d;
          box-shadow: var(--color-brand-shadow, 0 6px 20px rgba(234, 88, 12, 0.55)), 0 0 10px var(--color-accent-glow);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          position: relative;
          z-index: 2;
        }
        .bottom-nav-center-action:active .center-btn-circle {
          transform: scale(0.92);
        }
        .center-btn-label {
          font-size: 9px;
          font-weight: 800;
          color: var(--color-accent, #f97316);
          letter-spacing: 0.3px;
          margin-top: 4px;
          text-transform: uppercase;
        }

        /* ─── RESPONSIVE RULES ──────────────────────────── */
        @media (max-width: 768px) {
          .layout-container {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            width: 100%;
            height: 100%;
            height: 100dvh;
            min-height: -webkit-fill-available;
            overflow: hidden;
            display: flex;
            flex-direction: column;
          }
          .layout-sidebar { display: none; }
          .mobile-top-bar { display: block; }
          .layout-main {
            padding-top: calc(62px + env(safe-area-inset-top, 0px));
            padding-bottom: calc(88px + max(16px, env(safe-area-inset-bottom, 0px)));
            height: 100%;
            flex: 1 1 auto;
            min-height: 0;
            overflow-y: auto;
            overflow-x: hidden;
            -webkit-overflow-scrolling: touch;
            overscroll-behavior-y: contain;
          }
          .layout-bottom-bar {
            display: flex;
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            width: 100%;
            z-index: 9999;
            transform: translate3d(0, 0, 0);
            -webkit-transform: translate3d(0, 0, 0);
            will-change: transform;
            -webkit-backface-visibility: hidden;
            backface-visibility: hidden;
          }
        }
      `}</style>
    </div>
  )
}
