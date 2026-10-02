import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../application/contexts/AuthContext'
import { supabase } from '../../../data/supabase'
import {
  getSystemHealth,
  purgeGlobalCache,
  getMasterUsers,
  updateUserRole,
  toggleUserStatus,
  getMasterAuditLogs,
  getFinancialSanityCheck,
  updateEmergencySettings,
  forceBcvRate,
  generateFullDatabaseSnapshot,
  SystemHealthData,
  MasterUserData,
  FinancialSanityCheck
} from '../../../data/superAdminService'

export const SuperAdminDashboard: React.FC = () => {
  const navigate = useNavigate()
  const { user, perfil, isSuperAdmin, loading, signIn, signOut } = useAuth()

  // Estado de Login para cuando no se ha iniciado sesión como superadmin
  const [loginEmail, setLoginEmail] = useState('condominioapp.v@gmail.com')
  const [loginPass, setLoginPass] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)

  // Pestaña activa del Command Center
  const [activeTab, setActiveTab] = useState<'health' | 'users' | 'audit' | 'emergency' | 'backups'>('health')

  // Datos en vivo
  const [healthData, setHealthData] = useState<SystemHealthData | null>(null)
  const [loadingHealth, setLoadingHealth] = useState(true)
  const [users, setUsers] = useState<MasterUserData[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [userRoleFilter, setUserRoleFilter] = useState<string>('todos')
  const [userStatusFilter, setUserStatusFilter] = useState<string>('todos')

  // Auditoría y Finanzas
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [financials, setFinancials] = useState<FinancialSanityCheck | null>(null)
  const [loadingAudit, setLoadingAudit] = useState(false)

  // Emergencias y Config
  const [bannerActivo, setBannerActivo] = useState(false)
  const [bannerTexto, setBannerTexto] = useState('')
  const [bannerNivel, setBannerNivel] = useState<'info' | 'warning' | 'critical'>('warning')
  const [modoMantenimiento, setModoMantenimiento] = useState(false)
  const [mantenimientoMotivo, setMantenimientoMotivo] = useState('')
  const [customBcvRate, setCustomBcvRate] = useState<string>('')
  const [savingEmergency, setSavingEmergency] = useState(false)
  const [emergencySuccess, setEmergencySuccess] = useState<string | null>(null)

  // Modal Cambio de Rol
  const [roleModalUser, setRoleModalUser] = useState<MasterUserData | null>(null)
  const [newSelectedRole, setNewSelectedRole] = useState<'residente' | 'administrador' | 'conserje' | 'superadmin'>('residente')
  const [savingRole, setSavingRole] = useState(false)

  // Snapshot
  const [exportingBackup, setExportingBackup] = useState(false)
  const [notification, setNotification] = useState<string | null>(null)

  const showNotification = (msg: string) => {
    setNotification(msg)
    setTimeout(() => setNotification(null), 4000)
  }

  // ── 1. Cargar Salud del Sistema ──
  const refreshHealth = useCallback(async () => {
    setLoadingHealth(true)
    try {
      const data = await getSystemHealth()
      setHealthData(data)
    } finally {
      setLoadingHealth(false)
    }
  }, [])

  // ── 2. Cargar Usuarios ──
  const refreshUsers = useCallback(async () => {
    setLoadingUsers(true)
    try {
      const data = await getMasterUsers()
      setUsers(data)
    } finally {
      setLoadingUsers(false)
    }
  }, [])

  // ── 3. Cargar Auditoría y Finanzas ──
  const refreshAudit = useCallback(async () => {
    setLoadingAudit(true)
    try {
      const [logs, fin] = await Promise.all([
        getMasterAuditLogs(80),
        getFinancialSanityCheck()
      ])
      setAuditLogs(logs)
      setFinancials(fin)
    } finally {
      setLoadingAudit(false)
    }
  }, [])

  // ── 4. Cargar Configuración de Emergencia Actual ──
  const loadEmergencySettings = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('configuracion_edificio')
        .select('banner_emergencia_activo, banner_emergencia_texto, banner_emergencia_nivel, modo_mantenimiento, modo_mantenimiento_motivo, tasa_bcv_actual')
        .limit(1)
        .single()

      if (data) {
        setBannerActivo(Boolean(data.banner_emergencia_activo))
        setBannerTexto(data.banner_emergencia_texto || '')
        setBannerNivel(data.banner_emergencia_nivel || 'warning')
        setModoMantenimiento(Boolean(data.modo_mantenimiento))
        setMantenimientoMotivo(data.modo_mantenimiento_motivo || '')
        setCustomBcvRate(data.tasa_bcv_actual ? String(data.tasa_bcv_actual) : '')
      }
    } catch (e) {
      console.warn('[SuperAdmin] Error cargando settings de emergencia:', e)
    }
  }, [])

  // Inicialización cuando el usuario es superadmin
  useEffect(() => {
    if (isSuperAdmin) {
      refreshHealth()
      refreshUsers()
      refreshAudit()
      loadEmergencySettings()

      const interval = setInterval(() => {
        refreshHealth()
      }, 45000)

      return () => clearInterval(interval)
    }
  }, [isSuperAdmin, refreshHealth, refreshUsers, refreshAudit, loadEmergencySettings])

  // Manejar Login Directo en /superadmin
  const handleSuperAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginLoading(true)
    setLoginError(null)

    const res = await signIn(loginEmail.trim(), loginPass)
    if (res.error) {
      setLoginError(res.error)
      setLoginLoading(false)
      return
    }

    // Comprobar rol del usuario tras autenticarse
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (authUser) {
      const { data: p } = await supabase.from('perfiles').select('rol').eq('id', authUser.id).single()
      if (p?.rol !== 'superadmin') {
        setLoginError('Acceso denegado: Esta cuenta no cuenta con rol de Super Administrador.')
        await signOut()
        setLoginLoading(false)
        return
      }
    }
    setLoginLoading(false)
  }

  // Manejadores de acciones
  const handlePurgeCache = () => {
    purgeGlobalCache()
    showNotification('⚡ Caché global invalidada en memoria y sesión.')
    refreshHealth()
  }

  const handleOpenRoleModal = (u: MasterUserData) => {
    setRoleModalUser(u)
    setNewSelectedRole(u.rol)
  }

  const handleSaveRole = async () => {
    if (!roleModalUser) return
    setSavingRole(true)
    const adminEmail = user?.email || 'superadmin'
    const res = await updateUserRole(roleModalUser.id, newSelectedRole, adminEmail)
    if (res.success) {
      showNotification(`✓ Rol de ${roleModalUser.nombre_completo} actualizado a ${newSelectedRole}.`)
      setRoleModalUser(null)
      refreshUsers()
    } else {
      alert(res.error || 'Error actualizando rol')
    }
    setSavingRole(false)
  }

  const handleToggleStatus = async (u: MasterUserData) => {
    const nextStatus = u.estado_cuenta === 'activa' ? 'suspendida' : 'activa'
    if (window.confirm(`¿Confirmas cambiar el estado de ${u.nombre_completo} a ${nextStatus.toUpperCase()}?`)) {
      const adminEmail = user?.email || 'superadmin'
      const res = await toggleUserStatus(u.id, nextStatus, adminEmail)
      if (res.success) {
        showNotification(`✓ Cuenta de ${u.nombre_completo} marcada como ${nextStatus}.`)
        refreshUsers()
      } else {
        alert(res.error || 'Error cambiando estado')
      }
    }
  }

  const handleSaveEmergencies = async () => {
    setSavingEmergency(true)
    setEmergencySuccess(null)
    const res = await updateEmergencySettings({
      bannerActivo,
      bannerTexto,
      bannerNivel,
      modoMantenimiento,
      modoMantenimientoMotivo: mantenimientoMotivo
    })
    if (res.success) {
      setEmergencySuccess('✓ Configuración de emergencias y contingencias guardada en tiempo real.')
      showNotification('✓ Alertas comunitarias sincronizadas.')
    } else {
      alert(res.error || 'Error guardando emergencia')
    }
    setSavingEmergency(false)
  }

  const handleForceBcv = async () => {
    const val = parseFloat(customBcvRate)
    if (isNaN(val) || val <= 0) {
      alert('Ingresa una tasa numérica válida mayor a 0.')
      return
    }
    if (window.confirm(`¿Confirmas fijar forzadamente la tasa BCV a ${val.toFixed(4)} Bs/USD?`)) {
      const res = await forceBcvRate(val)
      if (res.success) {
        showNotification(`✓ Tasa BCV forzada a ${val.toFixed(4)} Bs/USD.`)
      } else {
        alert(res.error || 'Error forzando tasa')
      }
    }
  }

  const handleDownloadSnapshot = async () => {
    setExportingBackup(true)
    try {
      const { filename, jsonContent } = await generateFullDatabaseSnapshot()
      const blob = new Blob([jsonContent], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      showNotification(`✓ Respaldo ${filename} descargado exitosamente.`)
    } catch (e: any) {
      alert('Error generando snapshot: ' + e.message)
    } finally {
      setExportingBackup(false)
    }
  }

  // Filtrado de usuarios
  const filteredUsers = users.filter(u => {
    if (userRoleFilter !== 'todos' && u.rol !== userRoleFilter) return false
    if (userStatusFilter !== 'todos' && u.estado_cuenta !== userStatusFilter) return false
    if (userSearch.trim()) {
      const q = userSearch.toLowerCase().trim()
      const matchName = u.nombre_completo?.toLowerCase().includes(q)
      const matchEmail = u.email?.toLowerCase().includes(q)
      const matchCedula = u.cedula?.toLowerCase().includes(q)
      const matchApto = u.apartamento_numero?.toLowerCase().includes(q)
      return matchName || matchEmail || matchCedula || matchApto
    }
    return true
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // VISTA 0: ESTADO DE CARGA DE AUTENTICACIÓN
  // ─────────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{
        minHeight: '100dvh',
        backgroundColor: '#05070b',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Inter', system-ui, sans-serif",
        color: '#38bdf8'
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '3px solid rgba(6, 182, 212, 0.2)',
          borderTopColor: '#06b6d4',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
          marginBottom: '16px'
        }} />
        <span style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '0.5px' }}>
          Iniciando Consola Maestra...
        </span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // VISTA 1: LOGIN DE SUPER ADMIN (Si no tiene sesión o no es superadmin)
  // ─────────────────────────────────────────────────────────────────────────────
  if (!isSuperAdmin) {
    return (
      <div style={{
        minHeight: '100dvh',
        backgroundColor: '#05070b',
        backgroundImage: 'radial-gradient(circle at 50% 20%, rgba(6, 182, 212, 0.08) 0%, rgba(5, 7, 11, 0.95) 75%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px', fontFamily: "'Inter', system-ui, sans-serif", color: '#fff'
      }}>
        <div style={{
          width: '100%', maxWidth: '440px',
          background: 'linear-gradient(180deg, rgba(18, 22, 34, 0.95) 0%, rgba(10, 13, 20, 0.98) 100%)',
          border: '1px solid rgba(6, 182, 212, 0.25)',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.8), 0 0 35px rgba(6, 182, 212, 0.15)',
          borderRadius: '24px', padding: '36px 32px', boxSizing: 'border-box', position: 'relative'
        }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <div style={{
              width: '64px', height: '64px', margin: '0 auto 16px', borderRadius: '20px',
              background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.2) 0%, rgba(139, 92, 246, 0.2) 100%)',
              border: '1px solid rgba(6, 182, 212, 0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '30px',
              boxShadow: '0 0 25px rgba(6, 182, 212, 0.3)'
            }}>
              🛡️
            </div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              background: 'rgba(6, 182, 212, 0.12)', border: '1px solid rgba(6, 182, 212, 0.3)',
              padding: '4px 12px', borderRadius: '999px', color: '#38bdf8', fontSize: '11px',
              fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px'
            }}>
              <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#38bdf8' }} />
              <span>Consola Maestra</span>
            </div>
            <h1 style={{ fontSize: '24px', fontWeight: 900, margin: '0 0 6px', letterSpacing: '-0.5px' }}>
              DOMUS VE · Super Admin
            </h1>
            <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8', lineHeight: 1.5 }}>
              Ingreso restringido exclusivo para auditoría y gobernanza suprema del sistema.
            </p>
          </div>

          {/* Aviso si ya hay una sesión activa de otro usuario */}
          {user && (
            <div style={{
              background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.3)',
              borderRadius: '12px', padding: '12px 14px', marginBottom: '18px', color: '#fef08a',
              fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '8px'
            }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span>ℹ️</span>
                <span>Sesión activa como: <strong>{user.email}</strong> (rol: {perfil?.rol || 'residente'})</span>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await signOut()
                  setLoginEmail('condominioapp.v@gmail.com')
                  setLoginPass('')
                }}
                style={{
                  background: 'rgba(234, 179, 8, 0.2)', border: '1px solid rgba(234, 179, 8, 0.4)',
                  color: '#fef08a', borderRadius: '8px', padding: '6px 12px', fontSize: '11px',
                  fontWeight: 700, cursor: 'pointer', alignSelf: 'flex-start'
                }}
              >
                Cerrar sesión actual
              </button>
            </div>
          )}

          {loginError && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.35)',
              borderRadius: '12px', padding: '12px 14px', marginBottom: '20px', color: '#fca5a5',
              fontSize: '13px', display: 'flex', gap: '10px', alignItems: 'center'
            }}>
              <span>⚠️</span>
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleSuperAdminLogin}>
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', color: '#cbd5e1', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>
                Correo Super Admin
              </label>
              <input
                type="email"
                required
                value={loginEmail}
                onChange={e => setLoginEmail(e.target.value)}
                placeholder="condominioapp.v@gmail.com"
                style={{
                  width: '100%', boxSizing: 'border-box', background: '#0a0d14',
                  border: '1px solid rgba(255, 255, 255, 0.12)', borderRadius: '12px',
                  color: '#fff', padding: '12px 14px', fontSize: '14px', outline: 'none'
                }}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', color: '#cbd5e1', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>
                Clave de Seguridad
              </label>
              <input
                type="password"
                required
                value={loginPass}
                onChange={e => setLoginPass(e.target.value)}
                placeholder="••••••••••••"
                style={{
                  width: '100%', boxSizing: 'border-box', background: '#0a0d14',
                  border: '1px solid rgba(255, 255, 255, 0.12)', borderRadius: '12px',
                  color: '#fff', padding: '12px 14px', fontSize: '14px', outline: 'none'
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              style={{
                width: '100%', padding: '14px',
                background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 50%, #8b5cf6 100%)',
                border: 'none', borderRadius: '14px', color: '#fff', fontSize: '14px',
                fontWeight: 800, cursor: loginLoading ? 'not-allowed' : 'pointer',
                opacity: loginLoading ? 0.7 : 1, transition: 'all 0.2s',
                boxShadow: '0 4px 20px rgba(6, 182, 212, 0.35)'
              }}
            >
              {loginLoading ? 'Verificando credenciales...' : 'Desbloquear Mando Supremo →'}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: '22px' }}>
            <button
              onClick={() => navigate('/')}
              style={{
                background: 'transparent', border: 'none', color: '#64748b',
                fontSize: '12px', cursor: 'pointer', textDecoration: 'underline'
              }}
            >
              ← Volver al portal general
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // VISTA 2: COMMAND CENTER OBSIDIAN (USUARIO AUTENTICADO COMO SUPERADMIN)
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100dvh',
      backgroundColor: '#05070b',
      backgroundImage: 'radial-gradient(circle at 50% 0%, rgba(6, 182, 212, 0.05) 0%, rgba(5, 7, 11, 0.98) 60%)',
      color: '#fff', fontFamily: "'Inter', system-ui, sans-serif", boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column'
    }}>
      {/* Toast Notification Flotante */}
      {notification && (
        <div style={{
          position: 'fixed', bottom: '24px', right: '24px', zIndex: 99999,
          background: 'rgba(15, 23, 42, 0.95)', border: '1px solid #38bdf8',
          color: '#38bdf8', padding: '12px 20px', borderRadius: '12px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.8), 0 0 20px rgba(56, 189, 248, 0.3)',
          fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '10px'
        }}>
          <span>⚡</span>
          <span>{notification}</span>
        </div>
      )}

      {/* ── TOP HUD HEADER MAESTRO ── */}
      <header style={{
        background: 'rgba(10, 13, 20, 0.9)', backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        position: 'sticky', top: 0, zIndex: 1000, padding: '14px 20px'
      }}>
        <div style={{
          maxWidth: '1360px', margin: '0 auto', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px'
        }}>
          {/* Logo / Badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '42px', height: '42px', borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.3) 0%, rgba(139, 92, 246, 0.3) 100%)',
              border: '1px solid #06b6d4', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: '20px', boxShadow: '0 0 15px rgba(6, 182, 212, 0.3)'
            }}>
              👑
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontWeight: 900, fontSize: '18px', letterSpacing: '-0.5px' }}>
                  DOMUS VE
                </span>
                <span style={{
                  background: 'linear-gradient(135deg, #06b6d4, #8b5cf6)',
                  color: '#fff', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase',
                  padding: '2px 8px', borderRadius: '6px', letterSpacing: '0.8px'
                }}>
                  Super Admin
                </span>
              </div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>
                Consola Central de Auditoría, Telemetría y Seguridad
              </div>
            </div>
          </div>

          {/* Quick Stats & User Profile HUD */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {/* Ping Pulse */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '6px 12px', borderRadius: '10px', fontSize: '12px'
            }}>
              <span style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: healthData?.status === 'healthy' ? '#22c55e' : '#eab308',
                boxShadow: healthData?.status === 'healthy' ? '0 0 8px #22c55e' : '0 0 8px #eab308'
              }} />
              <span style={{ color: '#94a3b8' }}>API Latency:</span>
              <strong style={{ color: '#fff' }}>{healthData?.latencyMs ?? 0} ms</strong>
            </div>

            {/* Sesión Activa */}
            <div style={{ fontSize: '12px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>{user?.email}</span>
            </div>

            {/* Botón Salir */}
            <button
              onClick={async () => {
                await signOut()
                navigate('/')
              }}
              style={{
                background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.25)',
                color: '#f87171', padding: '6px 12px', borderRadius: '8px', fontSize: '12px',
                fontWeight: 700, cursor: 'pointer'
              }}
            >
              Cerrar Sesión
            </button>
          </div>
        </div>

        {/* ── NAVEGADOR DE PESTAÑAS RESPONSIVE ── */}
        <div style={{ maxWidth: '1360px', margin: '14px auto 0', overflowX: 'auto', scrollbarWidth: 'none' }}>
          <div style={{ display: 'flex', gap: '8px', minWidth: 'max-content' }}>
            {[
              { id: 'health',    label: 'Telemetría & Salud', icon: '⚡' },
              { id: 'users',     label: 'Directorio & Roles', icon: '👥' },
              { id: 'audit',     label: 'Auditoría & Finanzas', icon: '🛡️' },
              { id: 'emergency', label: 'Centro de Contingencias', icon: '🚨' },
              { id: 'backups',   label: 'Respaldos & Snapshot', icon: '💾' }
            ].map(tab => {
              const active = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  style={{
                    background: active
                      ? 'linear-gradient(135deg, rgba(6, 182, 212, 0.2) 0%, rgba(139, 92, 246, 0.2) 100%)'
                      : 'rgba(255, 255, 255, 0.03)',
                    border: active ? '1px solid #06b6d4' : '1px solid rgba(255, 255, 255, 0.08)',
                    color: active ? '#38bdf8' : '#94a3b8',
                    padding: '8px 16px', borderRadius: '10px', fontSize: '13px',
                    fontWeight: active ? 800 : 500, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '8px',
                    transition: 'all 0.15s'
                  }}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </header>

      {/* ── CUERPO PRINCIPAL DEL DASHBOARD ── */}
      <main style={{ maxWidth: '1360px', width: '100%', margin: '0 auto', padding: '24px 20px', flex: 1 }}>

        {/* ── TAB 1: TELEMETRÍA & SALUD DEL SISTEMA ── */}
        {activeTab === 'health' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 4px' }}>
                  ⚡ Telemetría y Salud de la Infraestructura
                </h2>
                <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>
                  Supervisión de rendimiento de base de datos en Supabase, conteo de filas e invalidación de caché.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={refreshHealth}
                  style={{
                    background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.12)',
                    color: '#fff', padding: '8px 14px', borderRadius: '10px', fontSize: '12px',
                    fontWeight: 600, cursor: 'pointer'
                  }}
                >
                  🔄 Probar Latencia
                </button>
                <button
                  onClick={handlePurgeCache}
                  style={{
                    background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.2), rgba(249, 115, 22, 0.2))',
                    border: '1px solid #eab308', color: '#fde047', padding: '8px 14px',
                    borderRadius: '10px', fontSize: '12px', fontWeight: 700, cursor: 'pointer'
                  }}
                >
                  ⚡ Purgar Caché Global
                </button>
              </div>
            </div>

            {/* Bento Grid KPIs */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '16px', marginBottom: '24px'
            }}>
              {/* Card 1: Estado DB */}
              <div style={{
                background: 'rgba(15, 23, 42, 0.65)',
                border: `1px solid ${
                  healthData?.status === 'healthy'
                    ? 'rgba(34, 197, 94, 0.35)'
                    : healthData?.status === 'degraded'
                    ? 'rgba(251, 191, 36, 0.35)'
                    : 'rgba(239, 68, 68, 0.35)'
                }`,
                borderRadius: '16px', padding: '20px', position: 'relative'
              }}>
                <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Estado de la Base de Datos</span>
                  <span style={{
                    width: '8px', height: '8px', borderRadius: '50%',
                    background: healthData?.status === 'healthy' ? '#22c55e' : healthData?.status === 'degraded' ? '#fbbf24' : '#ef4444',
                    boxShadow: `0 0 10px ${healthData?.status === 'healthy' ? '#22c55e' : '#fbbf24'}`
                  }} />
                </div>
                <div style={{
                  fontSize: '22px', fontWeight: 900, marginTop: '8px',
                  color: healthData?.status === 'healthy' ? '#22c55e' : healthData?.status === 'degraded' ? '#fbbf24' : '#ef4444'
                }}>
                  {healthData?.status === 'healthy' && '✓ Operativa y Saludable'}
                  {healthData?.status === 'degraded' && '⚡ Conectada (Red Moderada)'}
                  {healthData?.status === 'error' && '⚠️ Incidencia en Tablas'}
                  {healthData?.status === 'offline' && '🔴 Desconectada'}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>
                  {healthData?.statusMessage || 'Conectada a db.kevslcecttfxifcplgzx'}
                </div>
              </div>

              {/* Card 2: Latencia */}
              <div style={{
                background: 'rgba(15, 23, 42, 0.65)', border: '1px solid rgba(139, 92, 246, 0.25)',
                borderRadius: '16px', padding: '20px'
              }}>
                <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Latencia de Petición
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginTop: '8px' }}>
                  <span style={{ fontSize: '26px', fontWeight: 900, color: '#c084fc' }}>
                    {healthData?.latencyMs ?? 0} ms
                  </span>
                  {(healthData?.latencyMs ?? 0) < 600 ? (
                    <span style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>
                      🟢 Rápida
                    </span>
                  ) : (healthData?.latencyMs ?? 0) <= 2000 ? (
                    <span style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>
                      🌐 Normal (Red Móvil / Int.)
                    </span>
                  ) : (
                    <span style={{ background: 'rgba(251, 191, 36, 0.15)', color: '#fbbf24', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>
                      🟡 Moderada
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>
                  Tiempo de respuesta HTTP PostgREST
                </div>
              </div>

              {/* Card 3: Registros */}
              <div style={{
                background: 'rgba(15, 23, 42, 0.65)', border: '1px solid rgba(34, 197, 94, 0.25)',
                borderRadius: '16px', padding: '20px'
              }}>
                <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Total de Registros en Tablas</span>
                  <span style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700 }}>
                    11/11 Tablas
                  </span>
                </div>
                <div style={{ fontSize: '26px', fontWeight: 900, color: '#4ade80', marginTop: '8px' }}>
                  {healthData?.totalRecords?.toLocaleString() ?? 0}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>
                  Suma global en todas las entidades activas
                </div>
              </div>
            </div>

            {/* Recuento de Tablas */}
            <h3 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 14px', color: '#cbd5e1' }}>
              📊 Registro de Entidades y Conteos Reales
            </h3>

            {loadingHealth ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                Consultando tablas maestras...
              </div>
            ) : (
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '14px'
              }}>
                {healthData?.tables.map(t => (
                  <div
                    key={t.name}
                    style={{
                      background: 'rgba(10, 14, 23, 0.7)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '14px', padding: '16px', display: 'flex',
                      alignItems: 'center', justifyContent: 'space-between'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '22px' }}>{t.icon}</span>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '14px', color: '#fff' }}>
                          {t.label}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>
                          public.{t.name}
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <span style={{
                        fontSize: '18px', fontWeight: 900,
                        color: t.status === 'ok' ? '#38bdf8' : t.status === 'empty' ? '#64748b' : '#ef4444'
                      }}>
                        {t.count}
                      </span>
                      <div style={{ fontSize: '10px', color: '#64748b' }}>filas</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB 2: DIRECTORIO MAESTRO DE USUARIOS & ROLES ── */}
        {activeTab === 'users' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 4px' }}>
                  👥 Directorio y Gobernanza de Cuentas
                </h2>
                <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>
                  Control de privilegios: ascenso/descenso de administradores y bloqueo asistido.
                </p>
              </div>

              <button
                onClick={refreshUsers}
                style={{
                  background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: '#fff', padding: '8px 14px', borderRadius: '10px', fontSize: '12px',
                  fontWeight: 600, cursor: 'pointer'
                }}
              >
                🔄 Actualizar Directorio
              </button>
            </div>

            {/* Barra de Búsqueda y Filtros */}
            <div style={{
              display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap',
              background: 'rgba(10, 14, 23, 0.7)', border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '12px 16px', borderRadius: '14px'
            }}>
              <input
                type="text"
                placeholder="Buscar por nombre, correo, cédula o apartamento..."
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                style={{
                  flex: 1, minWidth: '220px', background: '#070a10', border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '10px', padding: '10px 14px', color: '#fff', fontSize: '13px', outline: 'none'
                }}
              />

              <select
                value={userRoleFilter}
                onChange={e => setUserRoleFilter(e.target.value)}
                style={{
                  background: '#070a10', border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '10px', padding: '10px 14px', color: '#fff', fontSize: '13px', outline: 'none'
                }}
              >
                <option value="todos">Todos los Roles</option>
                <option value="superadmin">Superadmin</option>
                <option value="administrador">Administrador</option>
                <option value="residente">Residente</option>
                <option value="conserje">Conserje</option>
              </select>

              <select
                value={userStatusFilter}
                onChange={e => setUserStatusFilter(e.target.value)}
                style={{
                  background: '#070a10', border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '10px', padding: '10px 14px', color: '#fff', fontSize: '13px', outline: 'none'
                }}
              >
                <option value="todos">Todos los Estados</option>
                <option value="activa">Activa</option>
                <option value="suspendida">Suspendida</option>
              </select>
            </div>

            {/* Listado de Usuarios */}
            {loadingUsers ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                Cargando directorio maestro...
              </div>
            ) : filteredUsers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                No se encontraron usuarios con esos filtros.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {filteredUsers.map(u => {
                  const isSuspended = u.estado_cuenta === 'suspendida'
                  const isSuper = u.rol === 'superadmin'
                  const isAdminRole = u.rol === 'administrador'

                  return (
                    <div
                      key={u.id}
                      style={{
                        background: 'rgba(10, 14, 23, 0.8)',
                        border: isSuper ? '1px solid rgba(139, 92, 246, 0.4)' : isAdminRole ? '1px solid rgba(6, 182, 212, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '14px', padding: '16px 20px',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        flexWrap: 'wrap', gap: '14px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{
                          width: '42px', height: '42px', borderRadius: '12px',
                          background: isSuper ? 'rgba(139, 92, 246, 0.2)' : isAdminRole ? 'rgba(6, 182, 212, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                          border: isSuper ? '1px solid #8b5cf6' : isAdminRole ? '1px solid #06b6d4' : '1px solid rgba(255, 255, 255, 0.1)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px'
                        }}>
                          {isSuper ? '👑' : isAdminRole ? '💼' : '👤'}
                        </div>

                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <strong style={{ fontSize: '15px', color: '#fff' }}>
                              {u.nombre_completo}
                            </strong>

                            {/* Badge de Rol */}
                            <span style={{
                              fontSize: '11px', fontWeight: 800, padding: '2px 8px', borderRadius: '6px',
                              background: isSuper ? 'rgba(139, 92, 246, 0.2)' : isAdminRole ? 'rgba(6, 182, 212, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                              color: isSuper ? '#c084fc' : isAdminRole ? '#38bdf8' : '#cbd5e1',
                              border: isSuper ? '1px solid rgba(139, 92, 246, 0.4)' : isAdminRole ? '1px solid rgba(6, 182, 212, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)'
                            }}>
                              {u.rol.toUpperCase()}
                            </span>

                            {/* Badge de Estado */}
                            <span style={{
                              fontSize: '11px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px',
                              background: isSuspended ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                              color: isSuspended ? '#f87171' : '#4ade80'
                            }}>
                              {isSuspended ? 'SUSPENDIDA' : 'ACTIVA'}
                            </span>

                            {u.apartamento_numero && (
                              <span style={{ fontSize: '11px', color: '#94a3b8', background: 'rgba(255, 255, 255, 0.06)', padding: '2px 6px', borderRadius: '4px' }}>
                                Apto {u.apartamento_numero}
                              </span>
                            )}
                          </div>

                          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                            <span>✉️ {u.email}</span>
                            {u.cedula && u.cedula !== 'N/A' && <span>🆔 {u.cedula}</span>}
                            {u.telefono && u.telefono !== 'N/A' && <span>📞 {u.telefono}</span>}
                            {u.ultimo_acceso && <span>🕒 Último acceso: {new Date(u.ultimo_acceso).toLocaleDateString()}</span>}
                          </div>
                        </div>
                      </div>

                      {/* Botones de Acción */}
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => handleOpenRoleModal(u)}
                          style={{
                            background: 'rgba(6, 182, 212, 0.12)', border: '1px solid rgba(6, 182, 212, 0.3)',
                            color: '#38bdf8', padding: '6px 12px', borderRadius: '8px', fontSize: '12px',
                            fontWeight: 700, cursor: 'pointer'
                          }}
                        >
                          ⚙️ Cambiar Rol
                        </button>

                        <button
                          onClick={() => handleToggleStatus(u)}
                          style={{
                            background: isSuspended ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                            border: isSuspended ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                            color: isSuspended ? '#4ade80' : '#f87171',
                            padding: '6px 12px', borderRadius: '8px', fontSize: '12px',
                            fontWeight: 700, cursor: 'pointer'
                          }}
                        >
                          {isSuspended ? '✓ Activar' : '🚫 Suspender'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── TAB 3: AUDITORÍA FORENSE & FINANZAS ── */}
        {activeTab === 'audit' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 4px' }}>
                  🛡️ Auditoría Forense y Arqueo General
                </h2>
                <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>
                  Conciliación de pagos vs recibos y registro cronológico inmutable de actividades.
                </p>
              </div>

              <button
                onClick={refreshAudit}
                style={{
                  background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: '#fff', padding: '8px 14px', borderRadius: '10px', fontSize: '12px',
                  fontWeight: 600, cursor: 'pointer'
                }}
              >
                🔄 Recalcular Arqueo
              </button>
            </div>

            {/* KPIs Arqueo Contable */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '14px', marginBottom: '24px'
            }}>
              <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '14px', padding: '18px' }}>
                <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
                  Recibos Emitidos (Monto Total)
                </div>
                <div style={{ fontSize: '22px', fontWeight: 900, color: '#60a5fa', marginTop: '6px' }}>
                  ${financials?.montoTotalRecibosUsd.toLocaleString() ?? '0.00'}
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                  {financials?.totalRecibosEmitidos ?? 0} emisiones históricas
                </div>
              </div>

              <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: '14px', padding: '18px' }}>
                <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
                  Pagos Aprobados (Monto Total)
                </div>
                <div style={{ fontSize: '22px', fontWeight: 900, color: '#4ade80', marginTop: '6px' }}>
                  ${financials?.montoTotalPagosUsd.toLocaleString() ?? '0.00'}
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                  {financials?.totalPagosAprobados ?? 0} pagos verificados
                </div>
              </div>

              <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '14px', padding: '18px' }}>
                <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
                  Mora Registrada
                </div>
                <div style={{ fontSize: '22px', fontWeight: 900, color: '#f87171', marginTop: '6px' }}>
                  ${financials?.totalMoraRegistradaUsd.toLocaleString() ?? '0.00'}
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                  {financials?.totalApartamentosEnMora ?? 0} apartamentos con mora
                </div>
              </div>

              <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '14px', padding: '18px' }}>
                <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
                  Balance Recaudación vs Emisión
                </div>
                <div style={{ fontSize: '22px', fontWeight: 900, color: '#c084fc', marginTop: '6px' }}>
                  ${financials?.balanceGeneralUsd.toLocaleString() ?? '0.00'}
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                  Diferencia neta recaudada
                </div>
              </div>
            </div>

            {/* Log de Auditoría */}
            <h3 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 14px', color: '#cbd5e1' }}>
              📜 Últimos 80 Registros en Historial de Auditoría
            </h3>

            {loadingAudit ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                Cargando registros forenses...
              </div>
            ) : auditLogs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                No hay registros de auditoría aún.
              </div>
            ) : (
              <div style={{
                background: 'rgba(10, 14, 23, 0.8)', border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '16px', overflow: 'hidden'
              }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: 'rgba(255, 255, 255, 0.03)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: '#94a3b8' }}>
                        <th style={{ padding: '12px 16px' }}>Fecha y Hora</th>
                        <th style={{ padding: '12px 16px' }}>Módulo</th>
                        <th style={{ padding: '12px 16px' }}>Acción</th>
                        <th style={{ padding: '12px 16px' }}>Detalles</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.map((log, idx) => (
                        <tr
                          key={log.id || idx}
                          style={{
                            borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                            background: idx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.01)'
                          }}
                        >
                          <td style={{ padding: '12px 16px', color: '#64748b', whiteSpace: 'nowrap' }}>
                            {log.fecha_hora ? new Date(log.fecha_hora).toLocaleString() : 'N/A'}
                          </td>
                          <td style={{ padding: '12px 16px', color: '#38bdf8', fontWeight: 700 }}>
                            {log.modulo || 'Sistema'}
                          </td>
                          <td style={{ padding: '12px 16px', color: '#fff', fontWeight: 600 }}>
                            {log.accion}
                          </td>
                          <td style={{ padding: '12px 16px', color: '#cbd5e1' }}>
                            {log.detalles || 'Sin detalles adicionales'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 4: CENTRO DE CONTINGENCIAS & MODO EMERGENCIA ── */}
        {activeTab === 'emergency' && (
          <div>
            <div style={{ marginBottom: '20px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 4px' }}>
                🚨 Centro de Contingencias y Alertas Globales
              </h2>
              <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>
                Publicación de avisos comunitarios prioritarios, modo mantenimiento y anulación de tasa BCV.
              </p>
            </div>

            {emergencySuccess && (
              <div style={{
                background: 'rgba(34, 197, 94, 0.15)', border: '1px solid rgba(34, 197, 94, 0.35)',
                borderRadius: '12px', padding: '12px 16px', marginBottom: '20px', color: '#4ade80', fontSize: '13px'
              }}>
                {emergencySuccess}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
              {/* Card 1: Banner Global */}
              <div style={{
                background: 'rgba(10, 14, 23, 0.8)', border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '16px', padding: '24px'
              }}>
                <h3 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>📢</span>
                  <span>Banner de Alerta Comunitaria</span>
                </h3>

                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={bannerActivo}
                    onChange={e => setBannerActivo(e.target.checked)}
                    style={{ width: '18px', height: '18px', accentColor: '#06b6d4' }}
                  />
                  <span style={{ fontWeight: 700, fontSize: '14px', color: bannerActivo ? '#38bdf8' : '#94a3b8' }}>
                    {bannerActivo ? '✓ Banner ACTIVO en todas las pantallas' : 'Banner Desactivado'}
                  </span>
                </label>

                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', marginBottom: '6px' }}>
                    Nivel de Severidad
                  </label>
                  <select
                    value={bannerNivel}
                    onChange={e => setBannerNivel(e.target.value as any)}
                    style={{
                      width: '100%', background: '#070a10', border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px', padding: '10px', color: '#fff', fontSize: '13px'
                    }}
                  >
                    <option value="info">Informativo (Azul)</option>
                    <option value="warning">Precaución / Atención (Amarillo)</option>
                    <option value="critical">Alerta Crítica / Emergencia (Rojo)</option>
                  </select>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', marginBottom: '6px' }}>
                    Texto del Mensaje
                  </label>
                  <textarea
                    rows={3}
                    value={bannerTexto}
                    onChange={e => setBannerTexto(e.target.value)}
                    placeholder="Ej: Falla general de bomba de agua. El personal técnico se encuentra en sitio trabajando."
                    style={{
                      width: '100%', boxSizing: 'border-box', background: '#070a10',
                      border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '10px',
                      color: '#fff', padding: '10px', fontSize: '13px', outline: 'none'
                    }}
                  />
                </div>

                <button
                  onClick={handleSaveEmergencies}
                  disabled={savingEmergency}
                  style={{
                    width: '100%', background: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
                    border: 'none', borderRadius: '10px', color: '#fff', padding: '12px',
                    fontWeight: 700, fontSize: '13px', cursor: 'pointer'
                  }}
                >
                  {savingEmergency ? 'Guardando...' : 'Aplicar Configuración de Alerta'}
                </button>
              </div>

              {/* Card 2: Modo Mantenimiento y Tasa BCV */}
              <div style={{
                background: 'rgba(10, 14, 23, 0.8)', border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px'
              }}>
                {/* Mantenimiento */}
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>🔒</span>
                    <span>Modo Mantenimiento del Sistema</span>
                  </h3>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={modoMantenimiento}
                      onChange={e => setModoMantenimiento(e.target.checked)}
                      style={{ width: '18px', height: '18px', accentColor: '#eab308' }}
                    />
                    <span style={{ fontWeight: 700, fontSize: '14px', color: modoMantenimiento ? '#eab308' : '#94a3b8' }}>
                      {modoMantenimiento ? 'Activado (Solo Lectura / Bloqueo de Pagos)' : 'Modo Normal Operativo'}
                    </span>
                  </label>

                  <input
                    type="text"
                    placeholder="Motivo (ej: Cierre contable mensual en progreso)"
                    value={mantenimientoMotivo}
                    onChange={e => setMantenimientoMotivo(e.target.value)}
                    style={{
                      width: '100%', boxSizing: 'border-box', background: '#070a10',
                      border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px',
                      color: '#fff', padding: '10px', fontSize: '13px', marginBottom: '12px'
                    }}
                  />

                  <button
                    onClick={handleSaveEmergencies}
                    style={{
                      background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.12)',
                      color: '#fff', padding: '8px 14px', borderRadius: '8px', fontSize: '12px',
                      fontWeight: 600, cursor: 'pointer'
                    }}
                  >
                    Guardar Estado de Mantenimiento
                  </button>
                </div>

                <hr style={{ border: 'none', borderTop: '1px solid rgba(255, 255, 255, 0.08)', margin: 0 }} />

                {/* Forzar Tasa BCV */}
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>💵</span>
                    <span>Anulación Manual de Tasa BCV</span>
                  </h3>
                  <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#94a3b8' }}>
                    Permite congelar un valor oficial sin depender del scraper automático.
                  </p>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input
                      type="number"
                      step="0.0001"
                      value={customBcvRate}
                      onChange={e => setCustomBcvRate(e.target.value)}
                      placeholder="Ej: 866.5612"
                      style={{
                        flex: 1, background: '#070a10', border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '8px', padding: '10px', color: '#fff', fontSize: '14px', fontWeight: 700
                      }}
                    />
                    <button
                      onClick={handleForceBcv}
                      style={{
                        background: 'linear-gradient(135deg, #10b981, #059669)',
                        border: 'none', borderRadius: '8px', color: '#fff', padding: '10px 16px',
                        fontSize: '12px', fontWeight: 800, cursor: 'pointer'
                      }}
                    >
                      Fijar Tasa
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 5: RESPALDOS & SNAPSHOT JSON ── */}
        {activeTab === 'backups' && (
          <div>
            <div style={{ marginBottom: '20px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 4px' }}>
                💾 Respaldo y Snapshot Maestro de la Base de Datos
              </h2>
              <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>
                Genera una copia completa estructurada en JSON con todas las tablas y relaciones del condominio.
              </p>
            </div>

            <div style={{
              background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.8) 0%, rgba(10, 14, 23, 0.95) 100%)',
              border: '1px solid rgba(6, 182, 212, 0.3)', borderRadius: '20px', padding: '32px',
              maxWidth: '720px', margin: '0 auto', textAlign: 'center'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '14px' }}>📦</div>
              <h3 style={{ fontSize: '20px', fontWeight: 900, margin: '0 0 8px', color: '#fff' }}>
                Exportar Snapshot Completo (JSON)
              </h3>
              <p style={{ color: '#94a3b8', fontSize: '13px', lineHeight: 1.6, margin: '0 auto 24px', maxWidth: '520px' }}>
                Incluye la totalidad de registros de apartamentos, perfiles, recibos generados, pagos reportados, gastos comunes, organigrama de la junta, casos, moras y auditoría.
              </p>

              <button
                onClick={handleDownloadSnapshot}
                disabled={exportingBackup}
                style={{
                  background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 50%, #8b5cf6 100%)',
                  border: 'none', borderRadius: '14px', color: '#fff', padding: '16px 32px',
                  fontSize: '15px', fontWeight: 800, cursor: exportingBackup ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 25px rgba(6, 182, 212, 0.4)', transition: 'all 0.2s',
                  display: 'inline-flex', alignItems: 'center', gap: '10px'
                }}
              >
                <span>💾</span>
                <span>{exportingBackup ? 'Extrayendo tablas y empaquetando...' : 'Descargar Snapshot Ahora (.JSON)'}</span>
              </button>

              <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'center', gap: '20px', fontSize: '12px', color: '#64748b' }}>
                <span>✓ Cifrado en tránsito</span>
                <span>✓ 11 Tablas integradas</span>
                <span>✓ Formato portable</span>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── MODAL CAMBIAR ROL DE USUARIO ── */}
      {roleModalUser && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10000,
          background: 'rgba(0, 0, 0, 0.8)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }}>
          <div style={{
            background: '#0d111a', border: '1px solid rgba(6, 182, 212, 0.3)',
            borderRadius: '20px', padding: '28px', maxWidth: '440px', width: '100%',
            boxShadow: '0 25px 50px rgba(0,0,0,0.8)'
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 8px' }}>
              Asignar Rol a Usuario
            </h3>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 20px' }}>
              Modificando permisos de <strong>{roleModalUser.nombre_completo}</strong> ({roleModalUser.email}).
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
              {[
                { key: 'residente', label: 'Residente', desc: 'Acceso a sus recibos, pagos, avisos y moras.' },
                { key: 'administrador', label: 'Administrador', desc: 'Gestión operativa del condominio y emisión.' },
                { key: 'conserje', label: 'Conserje / Operativo', desc: 'Vigilancia, llaves y reporte de áreas.' },
                { key: 'superadmin', label: 'Super Admin', desc: 'Mando absoluto, auditoría y gobernanza de cuentas.' },
              ].map(r => {
                const selected = newSelectedRole === r.key
                return (
                  <label
                    key={r.key}
                    onClick={() => setNewSelectedRole(r.key as any)}
                    style={{
                      background: selected ? 'rgba(6, 182, 212, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                      border: selected ? '1px solid #06b6d4' : '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '12px', padding: '12px 14px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: '12px'
                    }}
                  >
                    <input
                      type="radio"
                      name="selectedRole"
                      checked={selected}
                      onChange={() => setNewSelectedRole(r.key as any)}
                      style={{ accentColor: '#06b6d4' }}
                    />
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '14px', color: selected ? '#38bdf8' : '#fff' }}>
                        {r.label}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>
                        {r.desc}
                      </div>
                    </div>
                  </label>
                )
              })}
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setRoleModalUser(null)}
                style={{
                  flex: 1, background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.12)', color: '#fff',
                  borderRadius: '10px', padding: '10px', fontWeight: 600, cursor: 'pointer'
                }}
              >
                Cancelar
              </button>

              <button
                onClick={handleSaveRole}
                disabled={savingRole}
                style={{
                  flex: 1, background: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
                  border: 'none', color: '#fff', borderRadius: '10px',
                  padding: '10px', fontWeight: 800, cursor: 'pointer'
                }}
              >
                {savingRole ? 'Guardando...' : 'Confirmar Rol'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
