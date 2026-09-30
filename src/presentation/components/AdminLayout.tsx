import React, { useState, useEffect, useCallback } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../application/contexts/AuthContext'
import { supabase } from '../../data/supabase'

// ── Minimalist SVG Line Icons para Admin ──
const ADMIN_ICONS: Record<string, React.ReactNode> = {
  dashboard: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1"/>
      <rect x="14" y="3" width="7" height="5" rx="1"/>
      <rect x="14" y="12" width="7" height="9" rx="1"/>
      <rect x="3" y="16" width="7" height="5" rx="1"/>
    </svg>
  ),
  edificio: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
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
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23"/>
      <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
    </svg>
  ),
  recibos: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <path d="M9 13l2 2 4-4"/>
    </svg>
  ),
  generarRecibos: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="12" y1="11" x2="12" y2="17"/>
      <line x1="9" y1="14" x2="15" y2="14"/>
    </svg>
  ),
  recibosEmitidos: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  ),
  residentes: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 010 7.75"/>
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
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  ),
  chat: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
    </svg>
  ),
  casos: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
      <line x1="12" y1="11" x2="12" y2="17"/>
      <line x1="9" y1="14" x2="15" y2="14"/>
    </svg>
  ),
  mora: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  ),
  historial: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      <polyline points="9 12 11 14 15 10"/>
    </svg>
  ),
}

const adminNav = [
  { key: 'dashboard', label: 'Dashboard', path: '/admin', desc: 'Estadísticas generales' },
  { key: 'edificio', label: 'Edificio', path: '/admin/edificio', desc: 'Información general' },
  { key: 'gastos', label: 'Gastos', path: '/admin/gastos', desc: 'Registrar egresos del mes' },
  { key: 'recibos', label: 'Recibos', path: '/admin/recibos', desc: 'Aprobar / rechazar pagos', isRecibos: true },
  { key: 'generarRecibos', label: 'Generar Recibos', path: '/admin/generar-recibos', desc: 'Emisión masiva del mes' },
  { key: 'recibosEmitidos', label: 'Recibos Emitidos', path: '/admin/recibos-emitidos', desc: 'Historial y recibos emitidos' },
  { key: 'casos', label: 'Casos', path: '/admin/casos', desc: 'Multas, acuerdos y locales' },
  { key: 'mora', label: 'Mora y Deudores', path: '/admin/mora', desc: 'Deudas > 3 meses y riesgo legal' },
  { key: 'residentes', label: 'Residentes', path: '/admin/residentes', desc: 'Gestión de apartamentos' },
  { key: 'propuestas', label: 'Propuestas', path: '/admin/propuestas', desc: 'Crear votaciones' },
  { key: 'reportes', label: 'Reportes', path: '/admin/reportes', desc: 'Responder incidencias' },
  { key: 'chat', label: 'Chat', path: '/admin/chat', desc: 'Enviar avisos a todos' },
  { key: 'historial', label: 'Historial', path: '/admin/historial', desc: 'Auditoría y arqueo inmutable' },
]

export const AdminLayout: React.FC = () => {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { perfil, config } = useAuth()

  const [pendingCount, setPendingCount] = useState<number>(0)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const edificioNombre = config?.nombre_edificio || 'Residencias Ocutuy 5'
  const edificioLogo = config?.logo_url || null

  // Cargar pagos pendientes
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

    // Suscripción Realtime para Pagos Pendientes
    const channel = supabase
      .channel('admin_layout_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pagos_reportados' },
        () => cargarPendientes()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [cargarPendientes])

  // Cerrar el Drawer al cambiar de ruta
  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/admin-login'
  }

  // Nombre e iniciales del usuario
  const adminNombre = perfil?.nombre_completo || 'Dohuglas Rafael Guevara'
  const adminEmail = (perfil as any)?.email || config?.email_contacto || 'dohuglas.r@gmail.com'
  const adminInitials = adminNombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('') || 'DG'

  return (
    <div className="admin-layout-container">
      <style>{`
        .admin-layout-container {
          display: flex; height: 100vh; height: 100dvh; background-color: #090a0d; font-family: Inter, sans-serif;
        }
        .admin-sidebar {
          width: 240px; flex-shrink: 0; background: linear-gradient(180deg, #121620 0%, #0a0d13 100%);
          border-right: 1px solid rgba(255, 255, 255, 0.08); display: flex; flex-direction: column;
          padding: 24px 0;
        }
        .admin-main {
          flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; background-color: #090a0d;
        }
        
        /* MOBILE TOP BAR */
        .admin-mobile-top-bar {
          display: none;
          position: fixed;
          top: 0; left: 0; right: 0;
          z-index: 1001;
          background: rgba(10, 11, 14, 0.95);
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6);
          padding-top: env(safe-area-inset-top, 0px);
        }
        .admin-mobile-top-inner {
          height: 62px; display: flex; align-items: center; justify-content: space-between;
          padding: 0 16px;
        }

        /* MOBILE BOTTOM BAR */
        .admin-mobile-bottom-bar {
          display: none;
          position: fixed;
          bottom: 0; left: 0; right: 0;
          z-index: 1000;
          background: rgba(11, 13, 16, 0.96);
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.7);
          padding-bottom: env(safe-area-inset-bottom, 0px);
          height: calc(66px + env(safe-area-inset-bottom, 0px));
        }
        
        .admin-bottom-nav-inner {
          display: flex; height: 66px; width: 100%; align-items: center; justify-content: space-around;
          padding: 0 8px; position: relative;
        }
        
        .admin-bottom-btn {
          flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 4px; background: transparent; border: none; color: #82828e; cursor: pointer;
          padding: 6px 0; position: relative; transition: color 0.18s;
        }
        .admin-bottom-btn.active { color: #f97316; }
        .admin-bottom-btn svg { width: 20px; height: 20px; transition: transform 0.18s; }
        .admin-bottom-btn.active svg { transform: translateY(-1px); }

        /* Botón Central Elevado con Resplandor (Ícono de Recibo) */
        .admin-bottom-center-btn {
          position: relative;
          top: -14px;
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: linear-gradient(135deg, #fb923c 0%, #ea580c 100%);
          border: 3px solid #090a0d;
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 6px 20px rgba(234, 88, 12, 0.55), 0 0 10px rgba(249, 115, 22, 0.4);
          cursor: pointer;
          transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
          flex-shrink: 0;
        }
        .admin-bottom-center-btn:active {
          transform: scale(0.92);
        }

        /* MENÚ FUERA DE LIENZO (DRAWER OFF-CANVAS) */
        .admin-offcanvas-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          z-index: 2000;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.28s ease;
        }
        .admin-offcanvas-overlay.open {
          opacity: 1;
          pointer-events: auto;
        }

        .admin-offcanvas-drawer {
          position: fixed;
          top: 0; bottom: 0; left: 0;
          width: 86%;
          max-width: 360px;
          background-color: #0c0d10;
          border-right: 1px solid rgba(255, 255, 255, 0.08);
          z-index: 2001;
          transform: translateX(-100%);
          transition: transform 0.32s cubic-bezier(0.16, 1, 0.3, 1);
          display: flex;
          flex-direction: column;
          box-shadow: 10px 0 40px rgba(0, 0, 0, 0.8);
          overflow: hidden;
        }
        .admin-offcanvas-drawer.open {
          transform: translateX(0);
        }

        .offcanvas-scrollable {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .offcanvas-scrollable::-webkit-scrollbar { display: none; }

        /* Categorías y Grilla de Iconos Circulares */
        .offcanvas-section-title {
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

        .offcanvas-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px 10px;
        }

        .offcanvas-item-btn {
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

        .offcanvas-circle-icon {
          width: 52px;
          height: 52px;
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

        .offcanvas-item-btn:hover .offcanvas-circle-icon,
        .offcanvas-item-btn:active .offcanvas-circle-icon {
          background: #24252d;
          color: #fff;
          transform: scale(1.05);
        }

        .offcanvas-circle-icon.active {
          background: linear-gradient(135deg, #fb923c 0%, #ea580c 100%) !important;
          border: none !important;
          color: #fff !important;
          box-shadow: 0 4px 18px rgba(249, 115, 22, 0.5) !important;
        }

        .offcanvas-label {
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
        .offcanvas-label.active {
          color: #f97316;
          font-weight: 700;
        }

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
            padding-top: calc(64px + env(safe-area-inset-top, 0px));
            padding-bottom: calc(76px + env(safe-area-inset-bottom, 0px));
            height: 100vh;
            height: 100dvh;
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
          }
        }
      `}</style>

      {/* ── MOBILE TOP BAR ────────────────────────────────────────────── */}
      <div className="admin-mobile-top-bar">
        <div className="admin-mobile-top-inner">
          {/* Izquierda: Botón Hamburguesa + Logo / Título */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => setDrawerOpen(true)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#fff',
                padding: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title="Abrir menú"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="3" y1="6" x2="21" y2="6"/>
                <line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>

            {/* Logo del edificio en círculo naranja */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }} onClick={() => navigate('/admin')}>
              <div style={{
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #fb923c 0%, #ea580c 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 10px rgba(249, 115, 22, 0.4)',
                overflow: 'hidden'
              }}>
                {edificioLogo ? (
                  <img src={edificioLogo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="2" width="16" height="20" rx="2"/>
                    <line x1="9" y1="6" x2="9" y2="6.01"/>
                    <line x1="15" y1="6" x2="15" y2="6.01"/>
                    <line x1="9" y1="10" x2="9" y2="10.01"/>
                    <line x1="15" y1="10" x2="15" y2="10.01"/>
                  </svg>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ color: '#fff', fontSize: '13px', fontWeight: 800, letterSpacing: '0.4px', lineHeight: 1.1 }}>
                  {edificioNombre.toUpperCase()}
                </span>
                <span style={{ color: '#f97316', fontSize: '9px', fontWeight: 700, letterSpacing: '0.6px' }}>
                  PANEL ADMINISTRADOR
                </span>
              </div>
            </div>
          </div>

          {/* Derecha: Buscador, Notificaciones y Avatar DG */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Buscador */}
            <button
              onClick={() => navigate('/admin/residentes')}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#a1a1aa',
                padding: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center'
              }}
              title="Buscar apartamentos"
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </button>

            {/* Campana de Notificaciones con contador */}
            <button
              onClick={() => navigate('/admin/recibos?filtro=pendiente')}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#a1a1aa',
                padding: '6px',
                position: 'relative',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center'
              }}
              title="Pagos pendientes por verificar"
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              {pendingCount > 0 && (
                <span style={{
                  position: 'absolute',
                  top: '4px',
                  right: '5px',
                  width: '8px',
                  height: '8px',
                  backgroundColor: '#ea580c',
                  borderRadius: '50%',
                  border: '2px solid #0c0d10'
                }} />
              )}
            </button>

            {/* Avatar DG en círculo naranja */}
            <div
              onClick={() => setDrawerOpen(true)}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: '#ea580c',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(234, 88, 12, 0.4)'
              }}
            >
              {adminInitials}
            </div>
          </div>
        </div>
      </div>

      {/* ── MENÚ FUERA DE LIENZO (DRAWER OFF-CANVAS) ─────────────────────── */}
      <div
        className={`admin-offcanvas-overlay ${drawerOpen ? 'open' : ''}`}
        onClick={() => setDrawerOpen(false)}
      />

      <aside className={`admin-offcanvas-drawer ${drawerOpen ? 'open' : ''}`}>
        {/* Header del Drawer */}
        <div style={{
          padding: '20px 20px 16px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #fb923c 0%, #ea580c 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 10px rgba(249, 115, 22, 0.4)'
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="2" width="16" height="20" rx="2"/>
                <line x1="9" y1="6" x2="9" y2="6.01"/>
                <line x1="15" y1="6" x2="15" y2="6.01"/>
              </svg>
            </div>
            <div>
              <div style={{ color: '#fff', fontSize: '14px', fontWeight: 800, lineHeight: 1.1 }}>
                {edificioNombre.toUpperCase()}
              </div>
              <div style={{ color: '#888', fontSize: '11px', marginTop: '2px' }}>
                Administración de Condominio
              </div>
            </div>
          </div>

          <button
            onClick={() => setDrawerOpen(false)}
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '50%',
              backgroundColor: '#1c1d22',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: '#a1a1aa',
              fontSize: '15px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ✕
          </button>
        </div>

        {/* Tarjeta de Administrador */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '50%',
            backgroundColor: '#ea580c',
            color: '#fff',
            fontSize: '16px',
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 10px rgba(234, 88, 12, 0.45)',
            flexShrink: 0
          }}>
            {adminInitials}
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ color: '#fff', fontSize: '13px', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {adminNombre}
            </div>
            <div style={{ color: '#888', fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {adminEmail}
            </div>
          </div>
        </div>

        {/* Contenido con Scroll de Opciones de Condominio */}
        <div className="offcanvas-scrollable">
          {/* SECCIÓN 1: GESTIÓN DE COBRANZA Y GASTOS */}
          <div>
            <div className="offcanvas-section-title">
              <span>💳</span> FINANZAS Y RECIBOS
            </div>
            <div className="offcanvas-grid">
              <button className="offcanvas-item-btn" onClick={() => navigate('/admin')}>
                <div className={`offcanvas-circle-icon ${pathname === '/admin' ? 'active' : ''}`}>
                  {ADMIN_ICONS.dashboard}
                </div>
                <span className={`offcanvas-label ${pathname === '/admin' ? 'active' : ''}`}>Resumen</span>
              </button>

              <button className="offcanvas-item-btn" onClick={() => navigate('/admin/gastos')}>
                <div className={`offcanvas-circle-icon ${pathname.startsWith('/admin/gastos') ? 'active' : ''}`}>
                  {ADMIN_ICONS.gastos}
                </div>
                <span className={`offcanvas-label ${pathname.startsWith('/admin/gastos') ? 'active' : ''}`}>Gastos</span>
              </button>

              <button className="offcanvas-item-btn" onClick={() => navigate('/admin/recibos')}>
                <div className={`offcanvas-circle-icon ${pathname.startsWith('/admin/recibos') && !pathname.includes('emitidos') ? 'active' : ''}`}>
                  {ADMIN_ICONS.recibos}
                  {pendingCount > 0 && (
                    <span style={{
                      position: 'absolute',
                      top: '-2px',
                      right: '-2px',
                      backgroundColor: '#ea580c',
                      color: '#fff',
                      fontSize: '10px',
                      fontWeight: 800,
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '2px solid #0c0d10'
                    }}>
                      {pendingCount}
                    </span>
                  )}
                </div>
                <span className={`offcanvas-label ${pathname.startsWith('/admin/recibos') && !pathname.includes('emitidos') ? 'active' : ''}`}>Recibos</span>
              </button>

              <button className="offcanvas-item-btn" onClick={() => navigate('/admin/generar-recibos')}>
                <div className={`offcanvas-circle-icon ${pathname.startsWith('/admin/generar-recibos') ? 'active' : ''}`}>
                  {ADMIN_ICONS.generarRecibos}
                </div>
                <span className={`offcanvas-label ${pathname.startsWith('/admin/generar-recibos') ? 'active' : ''}`}>Generar</span>
              </button>

              <button className="offcanvas-item-btn" onClick={() => navigate('/admin/recibos-emitidos')}>
                <div className={`offcanvas-circle-icon ${pathname.startsWith('/admin/recibos-emitidos') ? 'active' : ''}`}>
                  {ADMIN_ICONS.recibosEmitidos}
                </div>
                <span className={`offcanvas-label ${pathname.startsWith('/admin/recibos-emitidos') ? 'active' : ''}`}>Emitidos</span>
              </button>

              <button className="offcanvas-item-btn" onClick={() => navigate('/admin/mora')}>
                <div className={`offcanvas-circle-icon ${pathname.startsWith('/admin/mora') ? 'active' : ''}`}>
                  {ADMIN_ICONS.mora}
                </div>
                <span className={`offcanvas-label ${pathname.startsWith('/admin/mora') ? 'active' : ''}`}>Mora</span>
              </button>

              <button className="offcanvas-item-btn" onClick={() => navigate('/admin/casos')}>
                <div className={`offcanvas-circle-icon ${pathname.startsWith('/admin/casos') ? 'active' : ''}`}>
                  {ADMIN_ICONS.casos}
                </div>
                <span className={`offcanvas-label ${pathname.startsWith('/admin/casos') ? 'active' : ''}`}>Casos</span>
              </button>

              <button className="offcanvas-item-btn" onClick={() => navigate('/admin/edificio')}>
                <div className="offcanvas-circle-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="1" x2="12" y2="23"/>
                    <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
                  </svg>
                </div>
                <span className="offcanvas-label">Tasa BCV</span>
              </button>
            </div>
          </div>

          {/* SECCIÓN 2: COMUNIDAD Y PROPIEDADES */}
          <div>
            <div className="offcanvas-section-title">
              <span>👥</span> COMUNIDAD Y CONVIVENCIA
            </div>
            <div className="offcanvas-grid">
              <button className="offcanvas-item-btn" onClick={() => navigate('/admin/residentes')}>
                <div className={`offcanvas-circle-icon ${pathname.startsWith('/admin/residentes') ? 'active' : ''}`}>
                  {ADMIN_ICONS.residentes}
                </div>
                <span className={`offcanvas-label ${pathname.startsWith('/admin/residentes') ? 'active' : ''}`}>Apartamentos</span>
              </button>

              <button className="offcanvas-item-btn" onClick={() => navigate('/admin/residentes')}>
                <div className="offcanvas-circle-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="8.5" cy="7" r="4"/>
                    <line x1="20" y1="8" x2="20" y2="14"/>
                    <line x1="23" y1="11" x2="17" y2="11"/>
                  </svg>
                </div>
                <span className="offcanvas-label">Residentes</span>
              </button>

              <button className="offcanvas-item-btn" onClick={() => navigate('/admin/edificio')}>
                <div className="offcanvas-circle-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <polygon points="12 6 12 12 16 14"/>
                  </svg>
                </div>
                <span className="offcanvas-label">Junta</span>
              </button>

              <button className="offcanvas-item-btn" onClick={() => navigate('/admin/chat')}>
                <div className={`offcanvas-circle-icon ${pathname.startsWith('/admin/chat') ? 'active' : ''}`}>
                  {ADMIN_ICONS.chat}
                </div>
                <span className={`offcanvas-label ${pathname.startsWith('/admin/chat') ? 'active' : ''}`}>Chat</span>
              </button>

              <button className="offcanvas-item-btn" onClick={() => navigate('/admin/propuestas')}>
                <div className={`offcanvas-circle-icon ${pathname.startsWith('/admin/propuestas') ? 'active' : ''}`}>
                  {ADMIN_ICONS.propuestas}
                </div>
                <span className={`offcanvas-label ${pathname.startsWith('/admin/propuestas') ? 'active' : ''}`}>Votaciones</span>
              </button>

              <button className="offcanvas-item-btn" onClick={() => navigate('/admin/reportes')}>
                <div className={`offcanvas-circle-icon ${pathname.startsWith('/admin/reportes') ? 'active' : ''}`}>
                  {ADMIN_ICONS.reportes}
                </div>
                <span className={`offcanvas-label ${pathname.startsWith('/admin/reportes') ? 'active' : ''}`}>Incidencias</span>
              </button>
            </div>
          </div>

          {/* SECCIÓN 3: CONFIGURACIÓN */}
          <div>
            <div className="offcanvas-section-title">
              <span>⚙️</span> SISTEMA
            </div>
            <div className="offcanvas-grid">
              <button className="offcanvas-item-btn" onClick={() => navigate('/admin/edificio')}>
                <div className={`offcanvas-circle-icon ${pathname.startsWith('/admin/edificio') ? 'active' : ''}`}>
                  {ADMIN_ICONS.edificio}
                </div>
                <span className={`offcanvas-label ${pathname.startsWith('/admin/edificio') ? 'active' : ''}`}>Edificio</span>
              </button>

              <button className="offcanvas-item-btn" onClick={() => navigate('/admin/historial')}>
                <div className={`offcanvas-circle-icon ${pathname.startsWith('/admin/historial') ? 'active' : ''}`}>
                  {ADMIN_ICONS.historial}
                </div>
                <span className={`offcanvas-label ${pathname.startsWith('/admin/historial') ? 'active' : ''}`}>Historial</span>
              </button>

              <button className="offcanvas-item-btn" onClick={() => navigate('/admin/recibos?filtro=pendiente')}>
                <div className="offcanvas-circle-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                  </svg>
                  {pendingCount > 0 && (
                    <span style={{
                      position: 'absolute',
                      top: '-2px',
                      right: '-2px',
                      backgroundColor: '#ea580c',
                      color: '#fff',
                      fontSize: '10px',
                      fontWeight: 800,
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '2px solid #0c0d10'
                    }}>
                      {pendingCount}
                    </span>
                  )}
                </div>
                <span className="offcanvas-label">Avisos</span>
              </button>
            </div>
          </div>

          {/* BOTÓN CERRAR SESIÓN */}
          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <button
              onClick={handleLogout}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: 'none',
                border: 'none',
                color: '#ef4444',
                fontSize: '15px',
                fontWeight: 700,
                cursor: 'pointer',
                padding: '8px 4px'
              }}
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

      {/* ── MOBILE BOTTOM BAR (5 Botones Relevantes con Botón Central Recibos) ── */}
      <div className="admin-mobile-bottom-bar">
        <div className="admin-bottom-nav-inner">
          {/* 1. Inicio */}
          <button
            className={`admin-bottom-btn ${pathname === '/admin' ? 'active' : ''}`}
            onClick={() => navigate('/admin')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            <span style={{ fontSize: '10px', fontWeight: 600 }}>Inicio</span>
          </button>

          {/* 2. Gastos */}
          <button
            className={`admin-bottom-btn ${pathname.startsWith('/admin/gastos') ? 'active' : ''}`}
            onClick={() => navigate('/admin/gastos')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="1" x2="12" y2="23"/>
              <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
            </svg>
            <span style={{ fontSize: '10px', fontWeight: 600 }}>Gastos</span>
          </button>

          {/* 3. BOTÓN CENTRAL ELEVADO EN NARANJA: RECIBOS (Con Ícono de Recibo) */}
          <button
            className="admin-bottom-center-btn"
            onClick={() => navigate('/admin/recibos')}
            title="Recibos y Pagos"
          >
            <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="9" y1="13" x2="15" y2="13"/>
              <line x1="9" y1="17" x2="13" y2="17"/>
            </svg>
          </button>

          {/* 4. Residentes / Apartamentos */}
          <button
            className={`admin-bottom-btn ${pathname.startsWith('/admin/residentes') ? 'active' : ''}`}
            onClick={() => navigate('/admin/residentes')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 010 7.75"/>
            </svg>
            <span style={{ fontSize: '10px', fontWeight: 600 }}>Residentes</span>
          </button>

          {/* 5. Chat Comunitario */}
          <button
            className={`admin-bottom-btn ${pathname.startsWith('/admin/chat') ? 'active' : ''}`}
            onClick={() => navigate('/admin/chat')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
            </svg>
            <span style={{ fontSize: '10px', fontWeight: 600 }}>Chat</span>
          </button>
        </div>
      </div>

      {/* ── SIDEBAR DESKTOP (Preservado) ───────────────────────────────── */}
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
          <p style={{ color: '#555', fontSize: '11px', marginBottom: '8px' }}>{adminNombre}</p>
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

      {/* ── MAIN CONTENT ──────────────────────────────────────────────── */}
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  )
}
