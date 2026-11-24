import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './application/contexts/AuthContext'
import { ThemeProvider } from './application/contexts/ThemeContext'
import { Loader } from './presentation/components/Loader'
import { SplashScreen } from './presentation/components/SplashScreen'
import { InstallAppPrompt } from './presentation/components/InstallAppPrompt'
import { InactivityManager } from './presentation/components/InactivityManager'
import { Login } from './presentation/pages/Login'
import { Layout } from './presentation/components/Layout'

function lazyNamed<P = any>(
  importer: () => Promise<Record<string, any>>,
  exportName: string
): React.LazyExoticComponent<React.ComponentType<P>> {
  return lazy(async () => {
    try {
      const mod = await importer()
      return { default: mod[exportName] as React.ComponentType<P> }
    } catch (err) {
      if (typeof window !== 'undefined') {
        const lastReload = Number(sessionStorage.getItem('domus_chunk_reload_at') || '0')
        if (!lastReload || Date.now() - lastReload > 15000) {
          sessionStorage.setItem('domus_chunk_reload_at', String(Date.now()))
          window.location.reload()
          return new Promise<never>(() => {})
        }
      }
      throw err
    }
  })
}

const ChangePassword = lazyNamed(() => import('./presentation/pages/ChangePassword'), 'ChangePassword')
const ResetPassword = lazyNamed(() => import('./presentation/pages/ResetPassword'), 'ResetPassword')
const ProfileSetup = lazyNamed(() => import('./presentation/pages/ProfileSetup'), 'ProfileSetup')
const Register = lazyNamed(() => import('./presentation/pages/Register'), 'Register')
const DescargarReciboPublico = lazyNamed(() => import('./presentation/pages/DescargarReciboPublico'), 'DescargarReciboPublico')

const Dashboard = lazyNamed(() => import('./presentation/pages/Dashboard'), 'Dashboard')
const GastosPanel = lazyNamed<{ onClose: () => void }>(() => import('./presentation/components/GastosPanel'), 'GastosPanel')
const RecibosPanel = lazyNamed<{ onClose: () => void }>(() => import('./presentation/components/RecibosPanel'), 'RecibosPanel')
const ChatPanel = lazyNamed<{ onClose: () => void }>(() => import('./presentation/components/ChatPanel'), 'ChatPanel')
const PropuestasPanel = lazyNamed(() => import('./presentation/components/PropuestasPanel'), 'PropuestasPanel')
const ReportesPanel = lazyNamed(() => import('./presentation/components/ReportesPanel'), 'ReportesPanel')
const PerfilResidente = lazyNamed(() => import('./presentation/pages/PerfilResidente'), 'PerfilResidente')
const ListaMoraResidente = lazyNamed(() => import('./presentation/pages/ListaMoraResidente'), 'ListaMoraResidente')
const JuntaCondominioResidente = lazyNamed(() => import('./presentation/pages/JuntaCondominioResidente'), 'JuntaCondominioResidente')
const GasResidente = lazyNamed(() => import('./presentation/pages/GasResidente'), 'GasResidente')
const LocalesResidente = lazyNamed(() => import('./presentation/pages/LocalesResidente'), 'LocalesResidente')
const NormasResidente = lazyNamed(() => import('./presentation/pages/NormasResidente'), 'NormasResidente')

// Admin & SuperAdmin
const AdminLogin = lazyNamed(() => import('./presentation/pages/admin/AdminLogin'), 'AdminLogin')
const AdminLayout = lazyNamed(() => import('./presentation/components/AdminLayout'), 'AdminLayout')
const AdminDashboard = lazyNamed(() => import('./presentation/pages/admin/AdminDashboard'), 'AdminDashboard')
const AdminEdificio = lazyNamed(() => import('./presentation/pages/admin/AdminEdificio'), 'AdminEdificio')
const AdminGastos = lazyNamed(() => import('./presentation/pages/admin/AdminGastos'), 'AdminGastos')
const AdminRecibos = lazyNamed(() => import('./presentation/pages/admin/AdminRecibos'), 'AdminRecibos')
const AdminResidentes = lazyNamed(() => import('./presentation/pages/admin/AdminResidentes'), 'AdminResidentes')
const AdminPropuestas = lazyNamed(() => import('./presentation/pages/admin/AdminPropuestas'), 'AdminPropuestas')
const AdminReportes = lazyNamed(() => import('./presentation/pages/admin/AdminReportes'), 'AdminReportes')
const AdminChat = lazyNamed(() => import('./presentation/pages/admin/AdminChat'), 'AdminChat')
const AdminGenerarRecibos = lazyNamed(() => import('./presentation/pages/admin/AdminGenerarRecibos'), 'AdminGenerarRecibos')
const AdminRecibosEmitidos = lazyNamed(() => import('./presentation/pages/admin/AdminRecibosEmitidos'), 'AdminRecibosEmitidos')
const AdminCasos = lazyNamed(() => import('./presentation/pages/admin/AdminCasos'), 'AdminCasos')
const AdminMora = lazyNamed(() => import('./presentation/pages/admin/AdminMora'), 'AdminMora')
const AdminCalendarioDeudas = lazyNamed(() => import('./presentation/pages/admin/AdminCalendarioDeudas'), 'AdminCalendarioDeudas')
const AdminHistorial = lazyNamed(() => import('./presentation/pages/admin/AdminHistorial'), 'AdminHistorial')
const AdminLogs = lazyNamed(() => import('./presentation/pages/admin/AdminLogs'), 'AdminLogs')
const AdminGas = lazyNamed(() => import('./presentation/pages/admin/AdminGas'), 'AdminGas')
const AdminLocales = lazyNamed(() => import('./presentation/pages/admin/AdminLocales'), 'AdminLocales')
const AdminNotificacionesGlobales = lazyNamed(() => import('./presentation/pages/admin/AdminNotificacionesGlobales'), 'AdminNotificacionesGlobales')
const SuperAdminDashboard = lazyNamed(() => import('./presentation/pages/superadmin/SuperAdminDashboard'), 'SuperAdminDashboard')

// ── Error Boundary para prevenir pantalla en negro ante errores imprevistos ──
interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Error capturado:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          backgroundColor: '#070b14',
          color: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          textAlign: 'center',
          fontFamily: 'Inter, system-ui, sans-serif'
        }}>
          <div style={{ fontSize: '42px', marginBottom: '16px' }}>⚠️</div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 8px', color: '#f87171' }}>
            Hubo un problema al cargar la pantalla
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '13px', maxWidth: '380px', margin: '0 0 20px', lineHeight: 1.5 }}>
            {this.state.error?.message || 'Error inesperado al inicializar componentes.'}
          </p>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null })
                window.location.reload()
              }}
              style={{
                backgroundColor: 'var(--color-accent, #f97316)',
                color: '#fff',
                border: 'none',
                padding: '10px 18px',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Reintentar
            </button>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null })
                window.location.href = '/'
              }}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                color: '#fff',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                padding: '10px 18px',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Ir al Inicio
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ── Protege rutas privadas ────────────────────────────────────────
const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, perfil, loading, needsPasswordChange, needsProfileSetup, isAdmin, isSuperAdmin, refreshPerfil, signOut, isPasswordRecovery } = useAuth()

  if (loading) return <Loader />
  if (!session) return <Navigate to="/login" replace />
  // Si terminó de cargar pero el perfil no se pudo recuperar, mostrar opción de reintento/salir
  if (perfil === null) {
    return (
      <div style={{
        minHeight: '100dvh',
        backgroundColor: '#070b14',
        color: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        textAlign: 'center',
        fontFamily: 'Inter, system-ui, sans-serif'
      }}>
        <div style={{ fontSize: '40px', marginBottom: '16px' }}>🏢</div>
        <h2 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 8px', color: '#fff' }}>
          Sincronizando información...
        </h2>
        <p style={{ color: '#94a3b8', fontSize: '13px', maxWidth: '340px', margin: '0 0 20px', lineHeight: 1.5 }}>
          Estamos conectando con tu perfil. Si tarda más de lo habitual, presiona reintentar o vuelve a iniciar sesión.
        </p>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => refreshPerfil()}
            style={{
              backgroundColor: 'var(--color-accent, #f97316)',
              color: '#fff',
              border: 'none',
              padding: '10px 18px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Reintentar
          </button>
          <button
            onClick={() => signOut()}
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              color: '#fff',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              padding: '10px 18px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    )
  }
  // Si el usuario llega de un enlace de recuperación de contraseña, obligar a definir su nueva clave
  if (isPasswordRecovery) return <Navigate to="/reset-password" replace />
  // Redirigir a panel maestro si es superadmin o administrador
  if (isSuperAdmin) return <Navigate to="/superadmin" replace />
  if (isAdmin) return <Navigate to="/admin" replace />
  if (needsPasswordChange) return <Navigate to="/cambiar-password" replace />
  if (needsProfileSetup) return <Navigate to="/completar-perfil" replace />

  return <>{children}</>
}

// ── Ruta exclusiva cambio de contraseña ───────────────────────────
const ChangePasswordRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading } = useAuth()

  if (loading) return <Loader />
  if (!session) return <Navigate to="/login" replace />

  return <>{children}</>
}

// ── Ruta exclusiva setup de perfil ────────────────────────────────
const ProfileSetupRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading, needsPasswordChange, needsProfileSetup } = useAuth()

  if (loading) return <Loader />
  if (!session) return <Navigate to="/login" replace />
  if (needsPasswordChange) return <Navigate to="/cambiar-password" replace />
  if (!needsProfileSetup) return <Navigate to="/" replace />

  return <>{children}</>
}

// ── Guarda para rutas de administrador (Supabase Auth real) ─────────
const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, perfil, loading } = useAuth()

  // Esperar a que AuthContext termine de cargar la sesión y el perfil
  if (loading) return <Loader />
  // Si hay sesión activa pero el perfil aún se está cargando, esperar
  if (session && perfil === null) return <Loader />
  // Sin sesión o sin rol de administrador / superadmin → ir al login de admin
  if (!session || (perfil?.rol !== 'administrador' && perfil?.rol !== 'superadmin')) return <Navigate to="/admin-login" replace />

  return <>{children}</>
}

// ── Guarda exclusiva para SuperAdmin (Supabase Auth real) ───────────
const SuperAdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, perfil, loading } = useAuth()

  if (loading) return <Loader />
  if (session && perfil === null) return <Loader />
  if (!session || perfil?.rol !== 'superadmin') return <Navigate to="/admin-login" replace />

  return <>{children}</>
}

// ── Shell de la app (con splash) ─────────────────────────────────
function AppShell() {
  const { config, isPasswordRecovery } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [splashDone, setSplashDone] = useState(false)
  const handleSplashDone = useCallback(() => setSplashDone(true), [])

  // Detectar recuperación de contraseña globalmente y redirigir a /reset-password
  useEffect(() => {
    const hash = typeof window !== 'undefined' ? window.location.hash : ''
    const search = typeof window !== 'undefined' ? window.location.search : ''
    const isRecoveryHash =
      hash.includes('type=recovery') ||
      hash.includes('otp_expired') ||
      (hash.includes('error=access_denied') && (hash.includes('otp') || hash.includes('expired')))
    const isRecoverySearch =
      search.includes('type=recovery') ||
      search.includes('code=') ||
      (search.includes('error=access_denied') && (search.includes('otp') || search.includes('expired')))
    const isRecoveryStorage = typeof window !== 'undefined' && sessionStorage.getItem('condominio_is_recovery') === 'true'

    if (isRecoveryHash || isRecoverySearch || isRecoveryStorage || isPasswordRecovery) {
      if (location.pathname !== '/reset-password') {
        navigate('/reset-password' + search + hash, { replace: true })
      }
    }
  }, [location.pathname, isPasswordRecovery, navigate])

  const isSuperAdminRoute = location.pathname.startsWith('/superadmin')
  const isPublicDownloadRoute = location.pathname.startsWith('/descargar-recibo')

  return (
    <>
      <InactivityManager />
      {!splashDone && !isSuperAdminRoute && !isPublicDownloadRoute && (
        <SplashScreen
          logoUrl={config?.logo_url}
          buildingName={config?.nombre_edificio}
          onDone={handleSplashDone}
        />
      )}
      {splashDone && !isSuperAdminRoute && !isPublicDownloadRoute && <InstallAppPrompt />}
      <Suspense fallback={<Loader />}>
      <Routes>
        {/* ── Descarga Directa Pública de Recibo (Sin login ni app) ── */}
        <Route path="/descargar-recibo/:reciboId" element={<DescargarReciboPublico />} />
        <Route path="/descargar-recibo" element={<DescargarReciboPublico />} />

        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* ── Rutas Multi-tenant con Slug (/e/:tenantSlug) ── */}
        <Route path="/e/:tenantSlug" element={<Login />} />
        <Route path="/e/:tenantSlug/login" element={<Login />} />
        <Route path="/e/:tenantSlug/register" element={<Register />} />

        <Route
          path="/cambiar-password"
          element={
            <ChangePasswordRoute>
              <ChangePassword />
            </ChangePasswordRoute>
          }
        />

        <Route
          path="/completar-perfil"
          element={
            <ProfileSetupRoute>
              <ProfileSetup />
            </ProfileSetupRoute>
          }
        />

        <Route path="/admin-login" element={<AdminLogin />} />
        <Route
          path="/superadmin"
          element={
            <SuperAdminRoute>
              <SuperAdminDashboard />
            </SuperAdminRoute>
          }
        />

        <Route
          path="/admin/*"
          element={<AdminRoute><AdminLayout /></AdminRoute>}
        >
          <Route index element={<AdminDashboard />} />
          <Route path="edificio"   element={<AdminEdificio />} />
          <Route path="gastos"     element={<AdminGastos />} />
          <Route path="recibos"    element={<AdminRecibos />} />
          <Route path="residentes" element={<AdminResidentes />} />
          <Route path="propuestas" element={<AdminPropuestas />} />
          <Route path="reportes"   element={<AdminReportes />} />
          <Route path="chat"       element={<AdminChat />} />
          <Route path="generar-recibos" element={<AdminGenerarRecibos />} />
          <Route path="recibos-emitidos" element={<AdminRecibosEmitidos />} />
          <Route path="casos"      element={<AdminCasos />} />
          <Route path="mora"       element={<AdminMora />} />
          <Route path="calendario-deudas" element={<AdminCalendarioDeudas />} />
          <Route path="gas"        element={<AdminGas />} />
          <Route path="locales"    element={<AdminLocales />} />
          <Route path="notificaciones-globales" element={<AdminNotificacionesGlobales />} />
          <Route path="historial"  element={<AdminHistorial />} />
          <Route path="logs"       element={<AdminLogs />} />
        </Route>

        <Route
          path="/*"
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="gastos"     element={<GastosPanel onClose={() => navigate('/')} />} />
          <Route path="recibos"    element={<RecibosPanel onClose={() => navigate('/')} />} />
          <Route path="normas"     element={<NormasResidente />} />
          <Route path="locales"    element={<LocalesResidente />} />
          <Route path="gas"        element={<GasResidente />} />
          <Route path="junta"      element={<JuntaCondominioResidente />} />
          <Route path="mora"       element={<ListaMoraResidente />} />
          <Route path="chat"       element={<ChatPanel onClose={() => navigate('/')} />} />
          <Route path="propuestas" element={<PropuestasPanel />} />
          <Route path="reportes"   element={<ReportesPanel />} />
          <Route path="perfil"     element={<PerfilResidente />} />
        </Route>
      </Routes>
      </Suspense>
    </>
  )
}

export function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <AppShell />
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}

export default App
