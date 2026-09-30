import React, { useState, useCallback } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './application/contexts/AuthContext'
import { Loader } from './presentation/components/Loader'
import { SplashScreen } from './presentation/components/SplashScreen'
import { Login } from './presentation/pages/Login'
import { ChangePassword } from './presentation/pages/ChangePassword'
import { ProfileSetup } from './presentation/pages/ProfileSetup'
import { Dashboard } from './presentation/pages/Dashboard'
import { Layout } from './presentation/components/Layout'
import { GastosPanel } from './presentation/components/GastosPanel'
import { RecibosPanel } from './presentation/components/RecibosPanel'
import { ChatPanel } from './presentation/components/ChatPanel'
import { PropuestasPanel } from './presentation/components/PropuestasPanel'
import { ReportesPanel } from './presentation/components/ReportesPanel'
import { PerfilResidente } from './presentation/pages/PerfilResidente'
// Admin
import { AdminLogin } from './presentation/pages/admin/AdminLogin'
import { AdminLayout } from './presentation/components/AdminLayout'
import { AdminDashboard } from './presentation/pages/admin/AdminDashboard'
import { AdminEdificio } from './presentation/pages/admin/AdminEdificio'
import { AdminGastos } from './presentation/pages/admin/AdminGastos'
import { AdminRecibos } from './presentation/pages/admin/AdminRecibos'
import { AdminResidentes } from './presentation/pages/admin/AdminResidentes'
import { AdminPropuestas } from './presentation/pages/admin/AdminPropuestas'
import { AdminReportes } from './presentation/pages/admin/AdminReportes'
import { AdminChat } from './presentation/pages/admin/AdminChat'
import { AdminGenerarRecibos } from './presentation/pages/admin/AdminGenerarRecibos'
import { AdminRecibosEmitidos } from './presentation/pages/admin/AdminRecibosEmitidos'
import { AdminCasos } from './presentation/pages/admin/AdminCasos'
import { AdminMora } from './presentation/pages/admin/AdminMora'
import { AdminHistorial } from './presentation/pages/admin/AdminHistorial'
import { ListaMoraResidente } from './presentation/pages/ListaMoraResidente'
import { JuntaCondominioResidente } from './presentation/pages/JuntaCondominioResidente'
import { Register } from './presentation/pages/Register'

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
                backgroundColor: '#f97316',
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
  const { session, perfil, loading, needsPasswordChange, needsProfileSetup, isAdmin, refreshPerfil, signOut } = useAuth()

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
              backgroundColor: '#f97316',
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
  // Si el usuario autenticado tiene rol de administrador, redirigir a su panel
  if (isAdmin) return <Navigate to="/admin" replace />
  if (needsPasswordChange) return <Navigate to="/cambiar-password" replace />
  if (needsProfileSetup) return <Navigate to="/completar-perfil" replace />

  return <>{children}</>
}

// ── Ruta exclusiva cambio de contraseña ───────────────────────────
const ChangePasswordRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading, needsPasswordChange } = useAuth()

  if (loading) return <Loader />
  if (!session) return <Navigate to="/login" replace />
  if (!needsPasswordChange) return <Navigate to="/" replace />

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
  // Sin sesión o sin rol de administrador → ir al login de admin
  if (!session || perfil?.rol !== 'administrador') return <Navigate to="/admin-login" replace />

  return <>{children}</>
}

// ── Shell de la app (con splash) ─────────────────────────────────
function AppShell() {
  const { config } = useAuth()
  const [splashDone, setSplashDone] = useState(false)
  const handleSplashDone = useCallback(() => setSplashDone(true), [])

  return (
    <>
      {!splashDone && (
        <SplashScreen
          logoUrl={config?.logo_url}
          buildingName={config?.nombre_edificio}
          onDone={handleSplashDone}
        />
      )}
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

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
          <Route path="historial"  element={<AdminHistorial />} />
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
          <Route path="gastos"     element={<GastosPanel onClose={() => {}} />} />
          <Route path="recibos"    element={<RecibosPanel onClose={() => {}} />} />
          <Route path="junta"      element={<JuntaCondominioResidente />} />
          <Route path="mora"       element={<ListaMoraResidente />} />
          <Route path="chat"       element={<ChatPanel onClose={() => {}} />} />
          <Route path="propuestas" element={<PropuestasPanel />} />
          <Route path="reportes"   element={<ReportesPanel />} />
          <Route path="perfil"     element={<PerfilResidente />} />
        </Route>
      </Routes>
    </>
  )
}

export function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <AppShell />
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  )
}

export default App
