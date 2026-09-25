import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './application/contexts/AuthContext'
import { Loader } from './presentation/components/Loader'
import { Login } from './presentation/pages/Login'
import { ChangePassword } from './presentation/pages/ChangePassword'
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

import { Register } from './presentation/pages/Register'

// Componente para proteger rutas privadas
const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading, needsPasswordChange } = useAuth()

  if (loading) return <Loader />

  if (!session) {
    return <Navigate to="/login" replace />
  }

  // Si necesita cambiar contraseña y no está en la ruta de cambio, redirigir
  if (needsPasswordChange) {
    return <Navigate to="/cambiar-password" replace />
  }

  return <>{children}</>
}

// Ruta especial para cambiar contraseña
const ChangePasswordRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading, needsPasswordChange } = useAuth()

  if (loading) return <Loader />

  if (!session) {
    return <Navigate to="/login" replace />
  }

  if (!needsPasswordChange) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

// Guarda para rutas de administrador
const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const isAdmin = localStorage.getItem('admin_auth') === 'true'
  return isAdmin ? <>{children}</> : <Navigate to="/admin-login" replace />
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
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
          
          <Route path="/admin-login" element={<AdminLogin />} />

          <Route
            path="/admin/*"
            element={<AdminRoute><AdminLayout /></AdminRoute>}
          >
            <Route index element={<AdminDashboard />} />
            <Route path="edificio" element={<AdminEdificio />} />
            <Route path="gastos" element={<AdminGastos />} />
            <Route path="recibos" element={<AdminRecibos />} />
            <Route path="residentes" element={<AdminResidentes />} />
            <Route path="propuestas" element={<AdminPropuestas />} />
            <Route path="reportes" element={<AdminReportes />} />
            <Route path="chat" element={<AdminChat />} />
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
            <Route path="gastos" element={<GastosPanel onClose={() => {}} />} />
            <Route path="recibos" element={<RecibosPanel onClose={() => {}} />} />
            <Route path="chat" element={<ChatPanel onClose={() => {}} />} />
            <Route path="propuestas" element={<PropuestasPanel />} />
            <Route path="reportes" element={<ReportesPanel />} />
            <Route path="perfil" element={<PerfilResidente />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
