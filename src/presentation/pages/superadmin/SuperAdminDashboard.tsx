import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../application/contexts/AuthContext'
import { supabase } from '../../../data/supabase'
import {
  getSystemHealth,
  purgeGlobalCache,
  getAllBuildings,
  createBuilding,
  updateBuilding,
  getMasterUsers,
  getApartmentsList,
  superAdminUpdateUserProfile,
  superAdminChangePassword,
  updateUserRole,
  toggleUserStatus,
  getMasterAuditLogs,
  getFinancialSanityCheck,
  updateEmergencySettings,
  forceBcvRate,
  generateFullDatabaseSnapshot,
  runComprehensiveDiagnostic,
  SystemHealthData,
  MasterUserData,
  BuildingData,
  FinancialSanityCheck,
  SystemDiagnosticReport,
  DiagnosticFinding
} from '../../../data/superAdminService'
import { slugifyBuildingName } from '../../../data/tenantService'

export const SuperAdminDashboard: React.FC = () => {
  const navigate = useNavigate()
  const { user, perfil, isSuperAdmin, loading, signIn, signOut } = useAuth()

  // Estado de Login para cuando no se ha iniciado sesión como superadmin
  const [loginEmail, setLoginEmail] = useState('condominioapp.v@gmail.com')
  const [loginPass, setLoginPass] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)

  // Pestaña activa del Command Center
  const [activeTab, setActiveTab] = useState<'buildings' | 'health' | 'users' | 'audit' | 'emergency' | 'backups'>('buildings')

  // ── MULTIEDIFICIO & FILTRO GLOBAL ──
  const [buildings, setBuildings] = useState<BuildingData[]>([])
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>('todos')
  const [loadingBuildings, setLoadingBuildings] = useState(false)

  // Modal Edificio (Crear / Editar)
  const [buildingModalOpen, setBuildingModalOpen] = useState(false)
  const [editingBuilding, setEditingBuilding] = useState<BuildingData | null>(null)
  const [buildingForm, setBuildingForm] = useState<Partial<BuildingData>>({
    nombre_edificio: '',
    slug: '',
    rif_edificio: '',
    direccion: '',
    ciudad: '',
    telefono: '',
    email_admin: '',
    total_apartamentos: 60,
    total_pisos: 15,
    apartamentos_por_piso: 4,
    tiene_ph: false,
    total_ph: 0,
    color_primario: '#f97316',
    banco: '',
    cuenta_bancaria: '',
    titular_cuenta: '',
    pago_movil_banco: '',
    pago_movil_cedula: '',
    pago_movil_telefono: '',
    zelle_email: ''
  })
  const [autoGenerateApartments, setAutoGenerateApartments] = useState(true)
  const [savingBuilding, setSavingBuilding] = useState(false)

  // Datos en vivo
  const [healthData, setHealthData] = useState<SystemHealthData | null>(null)
  const [loadingHealth, setLoadingHealth] = useState(true)
  const [users, setUsers] = useState<MasterUserData[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [userRoleFilter, setUserRoleFilter] = useState<string>('todos')
  const [userStatusFilter, setUserStatusFilter] = useState<string>('todos')

  // Modal Editar Perfil de Usuario Completo
  const [editUserModal, setEditUserModal] = useState<MasterUserData | null>(null)
  const [userForm, setUserForm] = useState<{
    nombre_completo: string
    cedula: string
    telefono: string
    email: string
    rol: 'superadmin' | 'administrador' | 'residente' | 'conserje'
    estado_cuenta: 'activa' | 'suspendida' | 'pendiente_cambio_clave'
    apartamento_id: string
    edificio_id: string
    condicion_habitacional: string
  }>({
    nombre_completo: '',
    cedula: '',
    telefono: '',
    email: '',
    rol: 'residente',
    estado_cuenta: 'activa',
    apartamento_id: '',
    edificio_id: '',
    condicion_habitacional: 'propietario'
  })
  const [availableApartments, setAvailableApartments] = useState<{ id: string; numero: string; piso: number; edificio_id?: string }[]>([])
  const [savingUser, setSavingUser] = useState(false)

  // Modal Cambio Directo de Contraseña
  const [passwordModalUser, setPasswordModalUser] = useState<MasterUserData | null>(null)
  const [newPasswordInput, setNewPasswordInput] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)

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

  // Modal Cambio de Rol Rápido
  const [roleModalUser, setRoleModalUser] = useState<MasterUserData | null>(null)
  const [newSelectedRole, setNewSelectedRole] = useState<'residente' | 'administrador' | 'conserje' | 'superadmin'>('residente')
  const [savingRole, setSavingRole] = useState(false)

  // Snapshot
  const [exportingBackup, setExportingBackup] = useState(false)
  const [notification, setNotification] = useState<string | null>(null)

  // ── ESCÁNER 360° & DIAGNÓSTICO EN TIEMPO REAL ──
  const [diagnosticReport, setDiagnosticReport] = useState<SystemDiagnosticReport | null>(null)
  const [runningDiagnostic, setRunningDiagnostic] = useState(false)
  const [diagnosticStepText, setDiagnosticStepText] = useState('')
  const [diagnosticFilter, setDiagnosticFilter] = useState<'all' | 'critical' | 'warning' | 'passed'>('all')
  const [diagnosticCategory, setDiagnosticCategory] = useState<'all' | 'security' | 'sessions' | 'data_integrity' | 'logs' | 'performance'>('all')
  const [realtimeAutoRefresh, setRealtimeAutoRefresh] = useState(true)
  const [realtimeCountdown, setRealtimeCountdown] = useState(15)

  const showNotification = (msg: string) => {
    setNotification(msg)
    setTimeout(() => setNotification(null), 4000)
  }

  // ── 0. Cargar Edificios ──
  const refreshBuildings = useCallback(async () => {
    setLoadingBuildings(true)
    try {
      const data = await getAllBuildings()
      setBuildings(data)
    } finally {
      setLoadingBuildings(false)
    }
  }, [])

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

  // ── 2. Cargar Usuarios (con filtro de edificio opcional) ──
  const refreshUsers = useCallback(async (bldgId?: string) => {
    setLoadingUsers(true)
    try {
      const targetBldg = bldgId !== undefined ? bldgId : selectedBuildingId
      const data = await getMasterUsers(targetBldg)
      setUsers(data)
    } finally {
      setLoadingUsers(false)
    }
  }, [selectedBuildingId])

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
      refreshBuildings()
      refreshHealth()
      refreshUsers(selectedBuildingId)
      refreshAudit()
      loadEmergencySettings()
    }
  }, [isSuperAdmin, refreshBuildings, refreshHealth, refreshUsers, selectedBuildingId, refreshAudit, loadEmergencySettings])

  // Temporizador de telemetría en tiempo real
  useEffect(() => {
    if (!isSuperAdmin || !realtimeAutoRefresh) return

    const interval = setInterval(() => {
      setRealtimeCountdown(prev => {
        if (prev <= 1) {
          refreshHealth()
          return 15
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [isSuperAdmin, realtimeAutoRefresh, refreshHealth])

  // Suscripción Realtime por WebSocket a cambios de base de datos
  useEffect(() => {
    if (!isSuperAdmin) return

    const channel = supabase.channel('superadmin-live-pulse')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'historial_auditoria' }, () => {
        refreshHealth()
        refreshAudit()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pagos_reportados' }, () => {
        refreshHealth()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [isSuperAdmin, refreshHealth, refreshAudit])

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

  // Ejecución del Escáner Integral 360°
  const handleRunDiagnostic = async () => {
    if (runningDiagnostic) return
    setRunningDiagnostic(true)
    setDiagnosticStepText('Iniciando escáner forense de infraestructura...')

    try {
      setDiagnosticStepText('Midiendo latencia PostgREST y conectividad Supabase...')
      await new Promise(r => setTimeout(r, 350))

      setDiagnosticStepText('Auditando privilegios y aislamiento de cuentas maestras...')
      await new Promise(r => setTimeout(r, 400))

      setDiagnosticStepText('Inspeccionando tokens de sesión y estados de bloqueo...')
      await new Promise(r => setTimeout(r, 350))

      setDiagnosticStepText('Examinando integridad monetaria de pagos y recibos...')
      await new Promise(r => setTimeout(r, 450))

      setDiagnosticStepText('Buscando ráfagas sospechosas y patrones en registros de auditoría...')
      await new Promise(r => setTimeout(r, 400))

      setDiagnosticStepText('Comprobando alícuotas de inmuebles y cuotas de almacenamiento...')
      const report = await runComprehensiveDiagnostic()

      setDiagnosticReport(report)
      showNotification(`🛡️ Escáner 360° completado: Salud del Sistema ${report.securityScore}/100`)
    } catch (e: any) {
      console.error('[Diagnostic] Error al ejecutar escáner:', e)
      showNotification('❌ Error al ejecutar el escáner del sistema.')
    } finally {
      setRunningDiagnostic(false)
      setDiagnosticStepText('')
    }
  }

  // Manejador de remediación / auto-corrección
  const handleDiagnosticAction = async (finding: DiagnosticFinding) => {
    if (!finding.fixActionType) return

    if (finding.fixActionType === 'purge_cache') {
      handlePurgeCache()
      showNotification('⚡ Caché purgada. Re-ejecutando diagnóstico...')
      setTimeout(() => handleRunDiagnostic(), 800)
    } else if (finding.fixActionType === 'goto_users') {
      setActiveTab('users')
      showNotification('👤 Redirigido al Directorio Maestro de Usuarios.')
    } else if (finding.fixActionType === 'goto_emergency' || finding.fixActionType === 'force_bcv') {
      setActiveTab('emergency')
      showNotification('⚠️ Redirigido al Centro de Contingencias y Tasa Oficial.')
    } else if (finding.fixActionType === 'goto_audit') {
      setActiveTab('audit')
      showNotification('📋 Redirigido al Registro de Auditoría Forense.')
    }
  }

  // Exportar reporte forense en JSON
  const handleExportDiagnosticReport = () => {
    if (!diagnosticReport) return
    const jsonStr = JSON.stringify(diagnosticReport, null, 2)
    const blob = new Blob([jsonStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `informe_diagnostico_domus_${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showNotification('📥 Informe de diagnóstico descargado con éxito.')
  }

  // ── MANEJADORES DE EDIFICIOS ──
  const handleOpenCreateBuilding = () => {
    setEditingBuilding(null)
    setBuildingForm({
      nombre_edificio: '',
      slug: '',
      rif_edificio: '',
      direccion: '',
      ciudad: '',
      telefono: '',
      email_admin: '',
      total_apartamentos: 60,
      total_pisos: 15,
      apartamentos_por_piso: 4,
      tiene_ph: false,
      total_ph: 0,
      color_primario: '#f97316',
      banco: '',
      cuenta_bancaria: '',
      titular_cuenta: '',
      pago_movil_banco: '',
      pago_movil_cedula: '',
      pago_movil_telefono: '',
      zelle_email: ''
    })
    setAutoGenerateApartments(true)
    setBuildingModalOpen(true)
  }

  const handleOpenEditBuilding = (b: BuildingData) => {
    setEditingBuilding(b)
    setBuildingForm({
      ...b,
      slug: b.slug || slugifyBuildingName(b.nombre_edificio)
    })
    setAutoGenerateApartments(false)
    setBuildingModalOpen(true)
  }

  const handleSaveBuilding = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!buildingForm.nombre_edificio?.trim()) {
      alert('Ingresa el nombre del edificio')
      return
    }

    setSavingBuilding(true)
    const adminEmail = user?.email || 'superadmin'
    const finalForm = {
      ...buildingForm,
      slug: buildingForm.slug?.trim() || slugifyBuildingName(buildingForm.nombre_edificio || '')
    }

    if (editingBuilding) {
      const res = await updateBuilding(editingBuilding.id, finalForm, adminEmail)
      if (res.success) {
        showNotification(`✓ Edificio ${buildingForm.nombre_edificio} actualizado.`)
        setBuildingModalOpen(false)
        refreshBuildings()
      } else {
        alert(res.error || 'Error actualizando edificio')
      }
    } else {
      const res = await createBuilding(finalForm, autoGenerateApartments, adminEmail)
      if (res.success) {
        showNotification(`✓ Edificio ${buildingForm.nombre_edificio} registrado con éxito.`)
        setBuildingModalOpen(false)
        refreshBuildings()
        refreshHealth()
      } else {
        alert(res.error || 'Error registrando edificio')
      }
    }
    setSavingBuilding(false)
  }

  // ── MANEJADORES DE USUARIO (EDICIÓN Y CONTRASEÑA) ──
  const handleOpenEditUser = async (u: MasterUserData) => {
    setEditUserModal(u)
    const bldgToUse = u.edificio_id || (selectedBuildingId !== 'todos' ? selectedBuildingId : (buildings[0]?.id || ''))
    setUserForm({
      nombre_completo: u.nombre_completo || '',
      cedula: u.cedula === 'N/A' ? '' : (u.cedula || ''),
      telefono: u.telefono === 'N/A' ? '' : (u.telefono || ''),
      email: u.email === 'Sin correo' ? '' : (u.email || ''),
      rol: u.rol,
      estado_cuenta: u.estado_cuenta,
      apartamento_id: u.apartamento_id || '',
      edificio_id: bldgToUse,
      condicion_habitacional: u.condicion_habitacional || 'propietario'
    })

    const aptos = await getApartmentsList(bldgToUse)
    setAvailableApartments(aptos)
  }

  const handleBuildingChangeInUserForm = async (newBldgId: string) => {
    setUserForm(prev => ({ ...prev, edificio_id: newBldgId, apartamento_id: '' }))
    const aptos = await getApartmentsList(newBldgId)
    setAvailableApartments(aptos)
  }

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editUserModal) return

    setSavingUser(true)
    const adminEmail = user?.email || 'superadmin'
    const res = await superAdminUpdateUserProfile(editUserModal.id, userForm, adminEmail)

    if (res.success) {
      showNotification(`✓ Perfil de ${userForm.nombre_completo || editUserModal.email} guardado.`)
      setEditUserModal(null)
      refreshUsers()
    } else {
      alert(res.error || 'Error actualizando usuario')
    }
    setSavingUser(false)
  }

  const handleOpenPasswordModal = (u: MasterUserData) => {
    setPasswordModalUser(u)
    setNewPasswordInput('')
  }

  const handleGenerateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$'
    let generated = ''
    for (let i = 0; i < 10; i++) {
      generated += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    setNewPasswordInput(generated)
  }

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!passwordModalUser) return
    if (newPasswordInput.length < 6) {
      alert('La contraseña debe tener al menos 6 caracteres.')
      return
    }

    setSavingPassword(true)
    const res = await superAdminChangePassword(passwordModalUser.id, newPasswordInput)

    if (res.success) {
      showNotification(`✓ Contraseña de ${passwordModalUser.nombre_completo || passwordModalUser.email} actualizada con éxito.`)
      setPasswordModalUser(null)
      setNewPasswordInput('')
    } else {
      alert(res.error || 'Error cambiando contraseña')
    }
    setSavingPassword(false)
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

          {/* Quick Stats, Building Selector & User Profile HUD */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {/* Selector Global de Edificio */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              background: 'rgba(15, 23, 42, 0.85)', border: '1px solid rgba(6, 182, 212, 0.35)',
              padding: '5px 12px', borderRadius: '10px'
            }}>
              <span style={{ fontSize: '13px' }}>🏢</span>
              <select
                value={selectedBuildingId}
                onChange={(e) => {
                  const val = e.target.value
                  setSelectedBuildingId(val)
                  refreshUsers(val)
                  showNotification(val === 'todos' ? '🌐 Mostrando todos los edificios' : `🏢 Filtro aplicado: ${buildings.find(b => b.id === val)?.nombre_edificio || 'Edificio'}`)
                }}
                style={{
                  background: 'transparent', border: 'none', color: '#38bdf8',
                  fontSize: '12px', fontWeight: 800, outline: 'none', cursor: 'pointer'
                }}
              >
                <option value="todos" style={{ background: '#0a0d14', color: '#fff' }}>
                  🌐 Todos los Edificios
                </option>
                {buildings.map(b => (
                  <option key={b.id} value={b.id} style={{ background: '#0a0d14', color: '#fff' }}>
                    🏢 {b.nombre_edificio}
                  </option>
                ))}
              </select>
            </div>

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
              { id: 'buildings', label: 'Edificios & Sedes', icon: '🏢' },
              { id: 'health',    label: 'Telemetría & Salud', icon: '⚡' },
              { id: 'users',     label: 'Directorio & Gobernanza', icon: '👥' },
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

        {/* ── TAB 0: GESTIÓN MULTIEDIFICIO & SEDES ── */}
        {activeTab === 'buildings' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>🏢</span>
                  <span>Gestión Multiedificio & Complejos Residenciales</span>
                </h2>
                <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>
                  Crea, supervisa y configura sedes, torres y urbanismos independientes con su propia contabilidad y residentes.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={refreshBuildings}
                  style={{
                    background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.12)',
                    color: '#fff', padding: '8px 14px', borderRadius: '10px', fontSize: '12px',
                    fontWeight: 600, cursor: 'pointer'
                  }}
                >
                  🔄 Actualizar
                </button>
                <button
                  onClick={handleOpenCreateBuilding}
                  style={{
                    background: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
                    border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '10px',
                    fontSize: '12px', fontWeight: 800, cursor: 'pointer',
                    boxShadow: '0 4px 15px rgba(6, 182, 212, 0.35)', display: 'flex', alignItems: 'center', gap: '6px'
                  }}
                >
                  <span>+</span>
                  <span>Registrar Nuevo Edificio</span>
                </button>
              </div>
            </div>

            {loadingBuildings ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                Cargando edificios y sedes registradas...
              </div>
            ) : buildings.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                No hay edificios registrados en el sistema.
              </div>
            ) : (
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: '16px', marginBottom: '24px'
              }}>
                {buildings.map(b => {
                  const isSelected = selectedBuildingId === b.id

                  return (
                    <div
                      key={b.id}
                      style={{
                        background: isSelected ? 'rgba(6, 182, 212, 0.06)' : 'rgba(10, 14, 23, 0.8)',
                        border: isSelected ? '2px solid #06b6d4' : '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column',
                        justifyContent: 'space-between', position: 'relative',
                        boxShadow: isSelected ? '0 0 25px rgba(6, 182, 212, 0.2)' : 'none'
                      }}
                    >
                      <div>
                        {/* Header de tarjeta */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                              width: '40px', height: '40px', borderRadius: '10px',
                              background: 'rgba(6, 182, 212, 0.15)', border: '1px solid rgba(6, 182, 212, 0.3)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px'
                            }}>
                              🏢
                            </div>
                            <div>
                              <h3 style={{ fontSize: '16px', fontWeight: 800, margin: 0, color: '#fff' }}>
                                {b.nombre_edificio}
                              </h3>
                              <span style={{ fontSize: '11px', color: '#64748b' }}>
                                {b.rif_edificio ? `RIF: ${b.rif_edificio}` : (b.ciudad || 'Sede principal')}
                              </span>
                            </div>
                          </div>

                          {b.banner_emergencia_activo && (
                            <span style={{
                              background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.4)',
                              color: '#f87171', padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 800
                            }}>
                              🚨 ALERTA
                            </span>
                          )}
                        </div>

                        {/* Subdominio y Link de Acceso */}
                        <div style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.25)',
                          borderRadius: '8px', padding: '6px 10px', marginBottom: '12px', fontSize: '11px'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#38bdf8', fontWeight: 700 }}>
                            <span>🌐</span>
                            <span style={{ fontFamily: 'monospace' }}>/e/{b.slug || slugifyBuildingName(b.nombre_edificio)}</span>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              const slug = b.slug || slugifyBuildingName(b.nombre_edificio)
                              const url = `${window.location.origin}/e/${slug}`
                              navigator.clipboard.writeText(url)
                              showNotification(`📋 Link de acceso copiado: ${url}`)
                            }}
                            style={{
                              background: 'rgba(56, 189, 248, 0.2)', border: '1px solid rgba(56, 189, 248, 0.4)',
                              color: '#fff', borderRadius: '4px', padding: '2px 8px', fontSize: '10px',
                              cursor: 'pointer', fontWeight: 800
                            }}
                          >
                            Copiar Link
                          </button>
                        </div>

                        {/* Detalles */}
                        <div style={{ fontSize: '12px', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>📍</span>
                            <span style={{ color: '#cbd5e1' }}>{b.direccion || 'Sin dirección registrada'}</span>
                          </div>
                          {b.telefono && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>📞</span>
                              <span>{b.telefono}</span>
                            </div>
                          )}
                          {b.email_admin && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>✉️</span>
                              <span>{b.email_admin}</span>
                            </div>
                          )}
                        </div>

                        {/* Métricas rápidas */}
                        <div style={{
                          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px',
                          background: 'rgba(0, 0, 0, 0.3)', padding: '10px', borderRadius: '10px', marginBottom: '16px'
                        }}>
                          <div>
                            <div style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                              Apartamentos
                            </div>
                            <div style={{ fontSize: '15px', fontWeight: 800, color: '#38bdf8' }}>
                              {b.total_apartamentos_registrados ?? 0}
                              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 400 }}> / {b.total_apartamentos || '?'}</span>
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                              Usuarios
                            </div>
                            <div style={{ fontSize: '15px', fontWeight: 800, color: '#4ade80' }}>
                              {b.total_usuarios_registrados ?? 0}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Botones de acción */}
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => handleOpenEditBuilding(b)}
                          style={{
                            flex: 1, background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid rgba(255, 255, 255, 0.1)', color: '#fff',
                            padding: '8px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer'
                          }}
                        >
                          ✏️ Editar
                        </button>
                        <button
                          onClick={() => {
                            setSelectedBuildingId(b.id)
                            refreshUsers(b.id)
                            setActiveTab('users')
                            showNotification(`✓ Filtrando consola por: ${b.nombre_edificio}`)
                          }}
                          style={{
                            flex: 1.2, background: isSelected ? 'rgba(6, 182, 212, 0.2)' : 'linear-gradient(135deg, rgba(6, 182, 212, 0.2), rgba(139, 92, 246, 0.2))',
                            border: '1px solid #06b6d4', color: '#38bdf8',
                            padding: '8px', borderRadius: '8px', fontSize: '12px', fontWeight: 800, cursor: 'pointer'
                          }}
                        >
                          {isSelected ? '✓ Seleccionado' : '🎯 Gestionar'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── TAB 1: TELEMETRÍA EN TIEMPO REAL & DIAGNÓSTICO 360° ── */}
        {activeTab === 'health' && (
          <div>
            {/* Cabecera de Telemetría */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '22px', flexWrap: 'wrap', gap: '14px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                  <h2 style={{ fontSize: '22px', fontWeight: 800, margin: 0, color: '#fff' }}>
                    ⚡ Telemetría y Salud en Tiempo Real
                  </h2>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    background: 'rgba(34, 197, 94, 0.12)', border: '1px solid rgba(34, 197, 94, 0.3)',
                    padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, color: '#4ade80'
                  }}>
                    <span style={{
                      width: '7px', height: '7px', borderRadius: '50%', background: '#22c55e',
                      boxShadow: '0 0 8px #22c55e', display: 'inline-block'
                    }} />
                    <span>WebSocket Realtime Activo</span>
                  </div>
                </div>
                <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>
                  Monitoreo continuo de Supabase PostgREST, salud de base de datos, pulso de eventos y escáner 360° de anomalías.
                </p>
              </div>

              {/* Botones de Acción en Cabecera */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {/* Indicador de Auto-refresco */}
                <button
                  onClick={() => setRealtimeAutoRefresh(!realtimeAutoRefresh)}
                  title={realtimeAutoRefresh ? 'Pausar auto-actualización' : 'Activar auto-actualización'}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    background: realtimeAutoRefresh ? 'rgba(56, 189, 248, 0.12)' : 'rgba(255, 255, 255, 0.05)',
                    border: `1px solid ${realtimeAutoRefresh ? 'rgba(56, 189, 248, 0.3)' : 'rgba(255, 255, 255, 0.1)'}`,
                    color: realtimeAutoRefresh ? '#38bdf8' : '#94a3b8',
                    padding: '8px 12px', borderRadius: '10px', fontSize: '12px', fontWeight: 600, cursor: 'pointer'
                  }}
                >
                  <span>{realtimeAutoRefresh ? '⏱️' : '⏸️'}</span>
                  <span>{realtimeAutoRefresh ? `En vivo (${realtimeCountdown}s)` : 'Pausado'}</span>
                </button>

                <button
                  onClick={refreshHealth}
                  style={{
                    background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.12)',
                    color: '#fff', padding: '8px 14px', borderRadius: '10px', fontSize: '12px',
                    fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                  }}
                >
                  <span>🔄</span> Probar Latencia
                </button>

                <button
                  onClick={handlePurgeCache}
                  style={{
                    background: 'rgba(234, 179, 8, 0.12)', border: '1px solid rgba(234, 179, 8, 0.35)',
                    color: '#fde047', padding: '8px 14px', borderRadius: '10px', fontSize: '12px',
                    fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                  }}
                >
                  <span>⚡</span> Purgar Caché
                </button>

                <button
                  onClick={handleRunDiagnostic}
                  disabled={runningDiagnostic}
                  style={{
                    background: 'linear-gradient(135deg, #7c3aed, #2563eb)',
                    border: '1px solid #a78bfa', color: '#fff',
                    padding: '8px 18px', borderRadius: '10px', fontSize: '12px',
                    fontWeight: 800, cursor: runningDiagnostic ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 18px rgba(124, 58, 237, 0.4)',
                    display: 'flex', alignItems: 'center', gap: '7px',
                    opacity: runningDiagnostic ? 0.7 : 1
                  }}
                >
                  <span style={{ fontSize: '14px' }}>🛡️</span>
                  <span>{runningDiagnostic ? 'Escaneando...' : 'Escanear Sistema 360°'}</span>
                </button>
              </div>
            </div>

            {/* Banner de Ejecución del Escáner (Scanning in progress) */}
            {runningDiagnostic && (
              <div style={{
                background: 'linear-gradient(135deg, rgba(30, 27, 75, 0.85), rgba(15, 23, 42, 0.95))',
                border: '1px solid #8b5cf6', borderRadius: '16px', padding: '24px',
                marginBottom: '24px', position: 'relative', overflow: 'hidden',
                boxShadow: '0 8px 32px rgba(139, 92, 246, 0.25)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{
                    width: '42px', height: '42px', borderRadius: '12px',
                    background: 'rgba(139, 92, 246, 0.2)', border: '1px solid #a78bfa',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '22px', animation: 'spin 2s linear infinite'
                  }}>
                    🛡️
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: '#fff', marginBottom: '4px' }}>
                      Auditoría Forense 360° en Progreso...
                    </div>
                    <div style={{ fontSize: '13px', color: '#c4b5fd', fontFamily: 'monospace' }}>
                      {diagnosticStepText || 'Inspeccionando subsistemas, tablas e integridad de accesos...'}
                    </div>
                  </div>
                </div>

                <div style={{
                  marginTop: '16px', height: '6px', width: '100%',
                  background: 'rgba(255, 255, 255, 0.1)', borderRadius: '3px', overflow: 'hidden'
                }}>
                  <div style={{
                    height: '100%', width: '100%',
                    background: 'linear-gradient(90deg, #7c3aed, #06b6d4, #22c55e)',
                    animation: 'pulse 1.2s ease-in-out infinite'
                  }} />
                </div>
              </div>
            )}

            {/* SECCIÓN RESULTADOS DEL ESCÁNER 360° */}
            {diagnosticReport && !runningDiagnostic && (
              <div style={{
                background: 'rgba(15, 23, 42, 0.85)',
                border: `1px solid ${
                  diagnosticReport.status === 'optimal'
                    ? 'rgba(34, 197, 94, 0.4)'
                    : diagnosticReport.status === 'attention'
                    ? 'rgba(245, 158, 11, 0.4)'
                    : 'rgba(239, 68, 68, 0.5)'
                }`,
                borderRadius: '18px', padding: '24px', marginBottom: '26px',
                boxShadow: `0 8px 30px ${
                  diagnosticReport.status === 'optimal'
                    ? 'rgba(34, 197, 94, 0.12)'
                    : diagnosticReport.status === 'attention'
                    ? 'rgba(245, 158, 11, 0.12)'
                    : 'rgba(239, 68, 68, 0.18)'
                }`
              }}>
                {/* Cabecera del Reporte con Scorecard */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  flexWrap: 'wrap', gap: '20px', paddingBottom: '20px',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
                }}>
                  {/* Gauge de Puntuación */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
                    <div style={{
                      width: '76px', height: '76px', borderRadius: '50%',
                      background: `radial-gradient(circle, ${
                        diagnosticReport.status === 'optimal'
                          ? 'rgba(34, 197, 94, 0.25)'
                          : diagnosticReport.status === 'attention'
                          ? 'rgba(245, 158, 11, 0.25)'
                          : 'rgba(239, 68, 68, 0.25)'
                      } 0%, rgba(15, 23, 42, 0.8) 70%)`,
                      border: `3px solid ${
                        diagnosticReport.status === 'optimal'
                          ? '#22c55e'
                          : diagnosticReport.status === 'attention'
                          ? '#f59e0b'
                          : '#ef4444'
                      }`,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      boxShadow: `0 0 20px ${
                        diagnosticReport.status === 'optimal' ? 'rgba(34, 197, 94, 0.4)' : '#ef4444'
                      }`
                    }}>
                      <div style={{
                        fontSize: '24px', fontWeight: 900,
                        color: diagnosticReport.status === 'optimal' ? '#4ade80' : diagnosticReport.status === 'attention' ? '#fbbf24' : '#f87171'
                      }}>
                        {diagnosticReport.securityScore}
                      </div>
                      <div style={{ fontSize: '9px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                        de 100
                      </div>
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{
                          padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 800,
                          background: diagnosticReport.status === 'optimal' ? 'rgba(34, 197, 94, 0.15)' : diagnosticReport.status === 'attention' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                          color: diagnosticReport.status === 'optimal' ? '#4ade80' : diagnosticReport.status === 'attention' ? '#fbbf24' : '#f87171',
                          border: `1px solid ${diagnosticReport.status === 'optimal' ? 'rgba(34, 197, 94, 0.3)' : diagnosticReport.status === 'attention' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                        }}>
                          {diagnosticReport.status === 'optimal' && '🛡️ ESTADO ÓPTIMO & PROTEGIDO'}
                          {diagnosticReport.status === 'attention' && '⚠️ ATENCIÓN REQUERIDA'}
                          {diagnosticReport.status === 'vulnerable' && '🚨 VULNERABILIDAD CRÍTICA DETECTADA'}
                        </span>
                        <span style={{ fontSize: '12px', color: '#64748b' }}>
                          Analizado: {diagnosticReport.scannedAt}
                        </span>
                      </div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#fff', marginTop: '4px' }}>
                        Diagnóstico Integral 360° Completado
                      </div>
                      <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                        Se ejecutaron {diagnosticReport.totalChecks} inspecciones sobre gobernanza, sesiones, integridad contable y logs forenses.
                      </div>
                    </div>
                  </div>

                  {/* Resumen de Hallazgos en Chips */}
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <div style={{
                      background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.25)',
                      padding: '8px 14px', borderRadius: '10px', textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '18px', fontWeight: 900, color: '#4ade80' }}>
                        {diagnosticReport.passedChecks}
                      </div>
                      <div style={{ fontSize: '10px', color: '#86efac', fontWeight: 700 }}>Aprobadas</div>
                    </div>

                    <div style={{
                      background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.25)',
                      padding: '8px 14px', borderRadius: '10px', textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '18px', fontWeight: 900, color: '#fbbf24' }}>
                        {diagnosticReport.warningChecks}
                      </div>
                      <div style={{ fontSize: '10px', color: '#fde047', fontWeight: 700 }}>Advertencias</div>
                    </div>

                    <div style={{
                      background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)',
                      padding: '8px 14px', borderRadius: '10px', textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '18px', fontWeight: 900, color: '#f87171' }}>
                        {diagnosticReport.criticalChecks}
                      </div>
                      <div style={{ fontSize: '10px', color: '#fca5a5', fontWeight: 700 }}>Críticos</div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <button
                        onClick={handleRunDiagnostic}
                        style={{
                          background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.15)',
                          color: '#fff', padding: '6px 12px', borderRadius: '8px', fontSize: '11px',
                          fontWeight: 700, cursor: 'pointer'
                        }}
                      >
                        🔄 Re-escanear
                      </button>
                      <button
                        onClick={handleExportDiagnosticReport}
                        style={{
                          background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.3)',
                          color: '#38bdf8', padding: '6px 12px', borderRadius: '8px', fontSize: '11px',
                          fontWeight: 700, cursor: 'pointer'
                        }}
                      >
                        📥 Exportar JSON
                      </button>
                    </div>
                  </div>
                </div>

                {/* Barra de Filtros de Severidad y Categoría */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  marginTop: '16px', marginBottom: '16px', flexWrap: 'wrap', gap: '12px'
                }}>
                  {/* Filtro por Severidad */}
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {(['all', 'critical', 'warning', 'passed'] as const).map(sev => {
                      const count = sev === 'all'
                        ? diagnosticReport.totalChecks
                        : sev === 'critical'
                        ? diagnosticReport.criticalChecks
                        : sev === 'warning'
                        ? diagnosticReport.warningChecks
                        : diagnosticReport.passedChecks

                      const isAct = diagnosticFilter === sev
                      return (
                        <button
                          key={sev}
                          onClick={() => setDiagnosticFilter(sev)}
                          style={{
                            padding: '5px 11px', borderRadius: '8px', fontSize: '11px', fontWeight: 700,
                            cursor: 'pointer',
                            background: isAct
                              ? (sev === 'critical' ? '#ef4444' : sev === 'warning' ? '#f59e0b' : sev === 'passed' ? '#22c55e' : '#3b82f6')
                              : 'rgba(255, 255, 255, 0.05)',
                            color: isAct ? '#fff' : '#94a3b8',
                            border: `1px solid ${isAct ? 'transparent' : 'rgba(255, 255, 255, 0.1)'}`
                          }}
                        >
                          {sev === 'all' && `Todos (${count})`}
                          {sev === 'critical' && `🚨 Críticos (${count})`}
                          {sev === 'warning' && `⚠️ Advertencias (${count})`}
                          {sev === 'passed' && `✅ Aprobados (${count})`}
                        </button>
                      )
                    })}
                  </div>

                  {/* Filtro por Categoría */}
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {[
                      { id: 'all', label: 'Todas las áreas' },
                      { id: 'security', label: '🔐 Seguridad' },
                      { id: 'sessions', label: '👤 Sesiones' },
                      { id: 'data_integrity', label: '💰 Datos & Bugs' },
                      { id: 'logs', label: '📋 Logs Forenses' },
                      { id: 'performance', label: '⚡ Rendimiento' }
                    ].map(cat => {
                      const isAct = diagnosticCategory === cat.id
                      return (
                        <button
                          key={cat.id}
                          onClick={() => setDiagnosticCategory(cat.id as any)}
                          style={{
                            padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                            cursor: 'pointer',
                            background: isAct ? 'rgba(139, 92, 246, 0.25)' : 'transparent',
                            color: isAct ? '#c4b5fd' : '#64748b',
                            border: `1px solid ${isAct ? '#8b5cf6' : 'rgba(255, 255, 255, 0.08)'}`
                          }}
                        >
                          {cat.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Grid de Tarjetas de Hallazgos */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {diagnosticReport.findings
                    .filter(f => {
                      if (diagnosticFilter !== 'all' && f.severity !== diagnosticFilter) return false
                      if (diagnosticCategory !== 'all' && f.category !== diagnosticCategory) return false
                      return true
                    })
                    .map(f => {
                      const isCritical = f.severity === 'critical'
                      const isWarning = f.severity === 'warning'
                      const isPassed = f.severity === 'passed'

                      const borderColor = isCritical
                        ? 'rgba(239, 68, 68, 0.4)'
                        : isWarning
                        ? 'rgba(245, 158, 11, 0.35)'
                        : 'rgba(34, 197, 94, 0.25)'

                      const bgBadge = isCritical
                        ? 'rgba(239, 68, 68, 0.2)'
                        : isWarning
                        ? 'rgba(245, 158, 11, 0.2)'
                        : 'rgba(34, 197, 94, 0.15)'

                      const textBadge = isCritical ? '#f87171' : isWarning ? '#fbbf24' : '#4ade80'

                      return (
                        <div
                          key={f.id}
                          style={{
                            background: 'rgba(10, 15, 29, 0.75)',
                            border: `1px solid ${borderColor}`,
                            borderRadius: '14px', padding: '16px 18px',
                            display: 'flex', flexDirection: 'column', gap: '10px'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={{
                                padding: '2px 8px', borderRadius: '5px', fontSize: '10px',
                                fontWeight: 800, textTransform: 'uppercase',
                                background: bgBadge, color: textBadge, border: `1px solid ${borderColor}`
                              }}>
                                {isCritical ? '🚨 Crítico' : isWarning ? '⚠️ Advertencia' : '✅ Aprobado'}
                              </span>

                              <span style={{
                                fontSize: '11px', color: '#94a3b8', background: 'rgba(255, 255, 255, 0.05)',
                                padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 700
                              }}>
                                {f.category === 'security' && '🔐 Seguridad & Privilegios'}
                                {f.category === 'sessions' && '👤 Sesiones & Cuentas'}
                                {f.category === 'data_integrity' && '💰 Integridad de Datos & Bugs'}
                                {f.category === 'logs' && '📋 Auditoría Forense'}
                                {f.category === 'performance' && '⚡ Rendimiento & Infraestructura'}
                              </span>
                            </div>

                            {/* Botón de Auto-Corrección si aplica */}
                            {f.autoFixAvailable && (
                              <button
                                onClick={() => handleDiagnosticAction(f)}
                                style={{
                                  background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(139, 92, 246, 0.2))',
                                  border: '1px solid #38bdf8', color: '#7dd3fc',
                                  padding: '4px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 800,
                                  cursor: 'pointer'
                                }}
                              >
                                {f.fixActionType === 'purge_cache' && '⚡ Purgar Caché Ahora'}
                                {f.fixActionType === 'goto_users' && '👥 Ver Cuentas en Conflicto'}
                                {f.fixActionType === 'force_bcv' && '💵 Sincronizar Tasa Oficial'}
                                {f.fixActionType === 'goto_emergency' && '⚠️ Ir a Contingencias'}
                                {f.fixActionType === 'goto_audit' && '📋 Inspeccionar Auditoría'}
                              </button>
                            )}
                          </div>

                          <div>
                            <div style={{ fontSize: '15px', fontWeight: 800, color: '#fff', marginBottom: '3px' }}>
                              {f.title}
                            </div>
                            <div style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: '1.4' }}>
                              {f.description}
                            </div>
                          </div>

                          {/* Evidencia Monospace */}
                          {f.evidence && (
                            <div style={{
                              background: 'rgba(0, 0, 0, 0.45)', border: '1px solid rgba(255, 255, 255, 0.07)',
                              borderRadius: '8px', padding: '8px 12px', fontSize: '11px',
                              fontFamily: 'monospace', color: '#e2e8f0', wordBreak: 'break-all'
                            }}>
                              <span style={{ color: '#38bdf8', fontWeight: 700 }}>🔍 Evidencia detectada: </span>
                              {f.evidence}
                            </div>
                          )}

                          {/* Impacto & Recomendación */}
                          <div style={{
                            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                            gap: '10px', fontSize: '12px', paddingTop: '4px',
                            borderTop: '1px solid rgba(255, 255, 255, 0.05)'
                          }}>
                            <div style={{ color: '#94a3b8' }}>
                              <span style={{ color: '#f87171', fontWeight: 700 }}>⚠️ Impacto: </span>
                              {f.impact}
                            </div>
                            <div style={{ color: '#94a3b8' }}>
                              <span style={{ color: '#4ade80', fontWeight: 700 }}>💡 Recomendación: </span>
                              {f.recommendation}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                </div>
              </div>
            )}

            {/* HERO CARD DE INVITACIÓN AL ESCÁNER (si aún no se ha ejecutado) */}
            {!diagnosticReport && !runningDiagnostic && (
              <div style={{
                background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(30, 27, 75, 0.6))',
                border: '1px solid rgba(139, 92, 246, 0.35)', borderRadius: '18px',
                padding: '28px', marginBottom: '24px', display: 'flex',
                alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '20px',
                boxShadow: '0 8px 30px rgba(0, 0, 0, 0.3)'
              }}>
                <div style={{ maxWidth: '650px' }}>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    background: 'rgba(139, 92, 246, 0.2)', border: '1px solid #8b5cf6',
                    padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 800,
                    color: '#c4b5fd', marginBottom: '10px'
                  }}>
                    🛡️ AUDITORÍA DE SEGURIDAD & SALUD 360°
                  </div>
                  <h3 style={{ fontSize: '20px', fontWeight: 900, color: '#fff', margin: '0 0 8px' }}>
                    Análisis Completo de Vulnerabilidades, Sesiones, Bugs y Anomalías
                  </h3>
                  <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0, lineHeight: '1.5' }}>
                    Ejecuta un barrido preventivo en toda la base de datos: comprueba el aislamiento de roles, sesiones activas, inconsistencias en pagos o recibos, ráfagas de eliminación forense y el estado de la tasa oficial en segundos.
                  </p>
                </div>

                <button
                  onClick={handleRunDiagnostic}
                  style={{
                    background: 'linear-gradient(135deg, #7c3aed, #0284c7)',
                    border: '1px solid #a78bfa', color: '#fff',
                    padding: '12px 26px', borderRadius: '12px', fontSize: '14px', fontWeight: 800,
                    cursor: 'pointer', boxShadow: '0 4px 20px rgba(124, 58, 237, 0.4)',
                    display: 'flex', alignItems: 'center', gap: '8px'
                  }}
                >
                  <span style={{ fontSize: '18px' }}>🛡️</span>
                  <span>Ejecutar Escáner 360° Ahora</span>
                </button>
              </div>
            )}

            {/* Bento Grid KPIs de Infraestructura en Tiempo Real */}
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
                  <span>Motor Supabase PostgREST</span>
                  <span style={{
                    width: '8px', height: '8px', borderRadius: '50%',
                    background: healthData?.status === 'healthy' ? '#22c55e' : healthData?.status === 'degraded' ? '#fbbf24' : '#ef4444',
                    boxShadow: `0 0 10px ${healthData?.status === 'healthy' ? '#22c55e' : '#fbbf24'}`
                  }} />
                </div>
                <div style={{
                  fontSize: '20px', fontWeight: 900, marginTop: '8px',
                  color: healthData?.status === 'healthy' ? '#22c55e' : healthData?.status === 'degraded' ? '#fbbf24' : '#ef4444'
                }}>
                  {healthData?.status === 'healthy' && '✓ Operativa y Saludable'}
                  {healthData?.status === 'degraded' && '⚡ Conectada (Red Moderada)'}
                  {healthData?.status === 'error' && '⚠️ Incidencia en Tablas'}
                  {healthData?.status === 'offline' && '🔴 Desconectada'}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>
                  {healthData?.statusMessage || 'Conexión SSL segura a cluster PostgreSQL'}
                </div>
              </div>

              {/* Card 2: Latencia HTTP */}
              <div style={{
                background: 'rgba(15, 23, 42, 0.65)', border: '1px solid rgba(139, 92, 246, 0.25)',
                borderRadius: '16px', padding: '20px'
              }}>
                <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Latencia de Red (Ping)
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginTop: '8px' }}>
                  <span style={{ fontSize: '26px', fontWeight: 900, color: '#c084fc' }}>
                    {healthData?.latencyMs ?? 0} ms
                  </span>
                  {(healthData?.latencyMs ?? 0) < 600 ? (
                    <span style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>
                      🟢 Excelente
                    </span>
                  ) : (healthData?.latencyMs ?? 0) <= 2000 ? (
                    <span style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>
                      🌐 Normal (Red Móvil)
                    </span>
                  ) : (
                    <span style={{ background: 'rgba(251, 191, 36, 0.15)', color: '#fbbf24', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700 }}>
                      🟡 Moderada
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>
                  Tiempo de ida y vuelta a endpoints de API
                </div>
              </div>

              {/* Card 3: Registros Totales */}
              <div style={{
                background: 'rgba(15, 23, 42, 0.65)', border: '1px solid rgba(34, 197, 94, 0.25)',
                borderRadius: '16px', padding: '20px'
              }}>
                <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Volumen Total de Registros</span>
                  <span style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700 }}>
                    11 Tablas
                  </span>
                </div>
                <div style={{ fontSize: '26px', fontWeight: 900, color: '#4ade80', marginTop: '8px' }}>
                  {healthData?.totalRecords?.toLocaleString() ?? 0}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>
                  Filas activas sincronizadas en esquema público
                </div>
              </div>
            </div>

            {/* Distribución y Conteos Reales por Tabla */}
            <h3 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 14px', color: '#cbd5e1' }}>
              📊 Registro de Entidades y Distribución de Carga
            </h3>

            {loadingHealth ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                Consultando tablas maestras en tiempo real...
              </div>
            ) : (
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '14px'
              }}>
                {healthData?.tables.map(t => {
                  const total = healthData?.totalRecords || 1
                  const pct = Math.round((t.count / total) * 100)

                  return (
                    <div
                      key={t.name}
                      style={{
                        background: 'rgba(10, 14, 23, 0.7)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '14px', padding: '16px', display: 'flex',
                        flexDirection: 'column', gap: '10px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
                          <div style={{ fontSize: '10px', color: '#64748b' }}>filas ({pct}%)</div>
                        </div>
                      </div>

                      {/* Barra de progreso de carga */}
                      <div style={{
                        height: '4px', width: '100%', background: 'rgba(255, 255, 255, 0.06)',
                        borderRadius: '2px', overflow: 'hidden'
                      }}>
                        <div style={{
                          height: '100%', width: `${pct}%`,
                          background: t.status === 'ok' ? '#38bdf8' : '#64748b'
                        }} />
                      </div>
                    </div>
                  )
                })}
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

                            {u.edificio_nombre && (
                              <span style={{ fontSize: '11px', color: '#38bdf8', background: 'rgba(6, 182, 212, 0.1)', border: '1px solid rgba(6, 182, 212, 0.25)', padding: '2px 6px', borderRadius: '4px' }}>
                                🏢 {u.edificio_nombre}
                              </span>
                            )}

                            {u.condicion_habitacional && (
                              <span style={{ fontSize: '10px', color: '#a78bfa', textTransform: 'capitalize' }}>
                                ({u.condicion_habitacional})
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
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button
                          onClick={() => handleOpenEditUser(u)}
                          title="Editar información completa del usuario"
                          style={{
                            background: 'rgba(59, 130, 246, 0.12)', border: '1px solid rgba(59, 130, 246, 0.3)',
                            color: '#60a5fa', padding: '6px 10px', borderRadius: '8px', fontSize: '12px',
                            fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                          }}
                        >
                          <span>✏️</span>
                          <span>Editar</span>
                        </button>

                        <button
                          onClick={() => handleOpenPasswordModal(u)}
                          title="Asignar o restablecer contraseña directamente"
                          style={{
                            background: 'rgba(234, 179, 8, 0.12)', border: '1px solid rgba(234, 179, 8, 0.3)',
                            color: '#facc15', padding: '6px 10px', borderRadius: '8px', fontSize: '12px',
                            fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                          }}
                        >
                          <span>🔑</span>
                          <span>Clave</span>
                        </button>

                        <button
                          onClick={() => handleOpenRoleModal(u)}
                          title="Cambiar nivel de acceso"
                          style={{
                            background: 'rgba(6, 182, 212, 0.12)', border: '1px solid rgba(6, 182, 212, 0.3)',
                            color: '#38bdf8', padding: '6px 10px', borderRadius: '8px', fontSize: '12px',
                            fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                          }}
                        >
                          <span>⚙️</span>
                          <span>Rol</span>
                        </button>

                        <button
                          onClick={() => handleToggleStatus(u)}
                          title={isSuspended ? 'Reactivar acceso' : 'Suspender acceso a la plataforma'}
                          style={{
                            background: isSuspended ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                            border: isSuspended ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                            color: isSuspended ? '#4ade80' : '#f87171',
                            padding: '6px 10px', borderRadius: '8px', fontSize: '12px',
                            fontWeight: 700, cursor: 'pointer'
                          }}
                        >
                          {isSuspended ? '✓ Activar' : '🚫 Bloquear'}
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
      {/* ── MODAL 1: REGISTRAR / EDITAR EDIFICIO ── */}
      {buildingModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10000,
          background: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
        }}>
          <div style={{
            background: '#0d111a', border: '1px solid rgba(6, 182, 212, 0.35)',
            borderRadius: '20px', padding: '28px', maxWidth: '680px', width: '100%',
            maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 60px rgba(0,0,0,0.9)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 900, margin: 0, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>🏢</span>
                <span>{editingBuilding ? 'Editar Edificio / Sede' : 'Registrar Nuevo Edificio'}</span>
              </h3>
              <button
                onClick={() => setBuildingModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '18px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveBuilding}>
              {/* Sección 1: Datos Generales */}
              <div style={{ marginBottom: '18px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'block', marginBottom: '10px' }}>
                  1. Identificación y Localización
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 700, marginBottom: '4px' }}>
                      Nombre del Edificio / Conjunto *
                    </label>
                    <input
                      type="text"
                      required
                      value={buildingForm.nombre_edificio || ''}
                      onChange={e => {
                        const newName = e.target.value
                        const autoSlug = !editingBuilding && (!buildingForm.slug || buildingForm.slug === slugifyBuildingName(buildingForm.nombre_edificio || ''))
                          ? slugifyBuildingName(newName)
                          : buildingForm.slug
                        setBuildingForm({
                          ...buildingForm,
                          nombre_edificio: newName,
                          slug: autoSlug
                        })
                      }}
                      placeholder="Ej: Condominio Ocutuy 6"
                      style={{
                        width: '100%', boxSizing: 'border-box', background: '#070a10',
                        border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px',
                        color: '#fff', padding: '10px', fontSize: '13px'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 700, marginBottom: '4px' }}>
                      Subdominio Asignado * (ej: ocutuy5)
                    </label>
                    <div style={{
                      display: 'flex', alignItems: 'center', background: '#070a10',
                      border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', overflow: 'hidden'
                    }}>
                      <input
                        type="text"
                        required
                        value={buildingForm.slug || ''}
                        onChange={e => setBuildingForm({
                          ...buildingForm,
                          slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')
                        })}
                        placeholder="ocutuy5"
                        style={{
                          flex: 1, background: 'transparent', border: 'none',
                          color: '#38bdf8', padding: '10px', fontSize: '13px', fontFamily: 'monospace', fontWeight: 700
                        }}
                      />
                      <span style={{ padding: '0 10px', color: '#64748b', fontSize: '11px', fontWeight: 600 }}>
                        /e/portal
                      </span>
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 700, marginBottom: '4px' }}>
                      RIF Fiscal
                    </label>
                    <input
                      type="text"
                      value={buildingForm.rif_edificio || ''}
                      onChange={e => setBuildingForm({ ...buildingForm, rif_edificio: e.target.value })}
                      placeholder="Ej: J-12345678-9"
                      style={{
                        width: '100%', boxSizing: 'border-box', background: '#070a10',
                        border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px',
                        color: '#fff', padding: '10px', fontSize: '13px'
                      }}
                    />
                  </div>

                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 700, marginBottom: '4px' }}>
                      Dirección Completa
                    </label>
                    <input
                      type="text"
                      value={buildingForm.direccion || ''}
                      onChange={e => setBuildingForm({ ...buildingForm, direccion: e.target.value })}
                      placeholder="Calle, Sector, Municipio, Estado"
                      style={{
                        width: '100%', boxSizing: 'border-box', background: '#070a10',
                        border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px',
                        color: '#fff', padding: '10px', fontSize: '13px'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 700, marginBottom: '4px' }}>
                      Ciudad / Localidad
                    </label>
                    <input
                      type="text"
                      value={buildingForm.ciudad || ''}
                      onChange={e => setBuildingForm({ ...buildingForm, ciudad: e.target.value })}
                      placeholder="Ej: Caracas / Ocumare del Tuy"
                      style={{
                        width: '100%', boxSizing: 'border-box', background: '#070a10',
                        border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px',
                        color: '#fff', padding: '10px', fontSize: '13px'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 700, marginBottom: '4px' }}>
                      Teléfono Administrativo
                    </label>
                    <input
                      type="text"
                      value={buildingForm.telefono || ''}
                      onChange={e => setBuildingForm({ ...buildingForm, telefono: e.target.value })}
                      placeholder="Ej: 0412-1234567"
                      style={{
                        width: '100%', boxSizing: 'border-box', background: '#070a10',
                        border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px',
                        color: '#fff', padding: '10px', fontSize: '13px'
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Sección 2: Estructura Arquitectónica */}
              <div style={{ marginBottom: '18px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'block', marginBottom: '10px' }}>
                  2. Estructura y Capacidad
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 700, marginBottom: '4px' }}>
                      Total Pisos
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={buildingForm.total_pisos || 1}
                      onChange={e => {
                        const pisos = Number(e.target.value)
                        const porPiso = buildingForm.apartamentos_por_piso || 1
                        setBuildingForm({
                          ...buildingForm,
                          total_pisos: pisos,
                          total_apartamentos: pisos * porPiso + (buildingForm.tiene_ph ? (buildingForm.total_ph || 0) : 0)
                        })
                      }}
                      style={{
                        width: '100%', boxSizing: 'border-box', background: '#070a10',
                        border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px',
                        color: '#fff', padding: '8px', fontSize: '13px'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 700, marginBottom: '4px' }}>
                      Aptos por Piso
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={buildingForm.apartamentos_por_piso || 1}
                      onChange={e => {
                        const porPiso = Number(e.target.value)
                        const pisos = buildingForm.total_pisos || 1
                        setBuildingForm({
                          ...buildingForm,
                          apartamentos_por_piso: porPiso,
                          total_apartamentos: pisos * porPiso + (buildingForm.tiene_ph ? (buildingForm.total_ph || 0) : 0)
                        })
                      }}
                      style={{
                        width: '100%', boxSizing: 'border-box', background: '#070a10',
                        border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px',
                        color: '#fff', padding: '8px', fontSize: '13px'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 700, marginBottom: '4px' }}>
                      Total Apartamentos
                    </label>
                    <input
                      type="number"
                      value={buildingForm.total_apartamentos || 0}
                      onChange={e => setBuildingForm({ ...buildingForm, total_apartamentos: Number(e.target.value) })}
                      style={{
                        width: '100%', boxSizing: 'border-box', background: '#070a10',
                        border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px',
                        color: '#fff', padding: '8px', fontSize: '13px', fontWeight: 800
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 700, marginBottom: '4px' }}>
                      ¿Tiene PH?
                    </label>
                    <select
                      value={buildingForm.tiene_ph ? 'si' : 'no'}
                      onChange={e => setBuildingForm({ ...buildingForm, tiene_ph: e.target.value === 'si' })}
                      style={{
                        width: '100%', boxSizing: 'border-box', background: '#070a10',
                        border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px',
                        color: '#fff', padding: '8px', fontSize: '13px'
                      }}
                    >
                      <option value="no">No</option>
                      <option value="si">Sí</option>
                    </select>
                  </div>
                </div>

                {!editingBuilding && (
                  <div style={{ marginTop: '12px', background: 'rgba(6, 182, 212, 0.1)', border: '1px solid rgba(6, 182, 212, 0.25)', padding: '10px 14px', borderRadius: '10px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={autoGenerateApartments}
                        onChange={e => setAutoGenerateApartments(e.target.checked)}
                        style={{ accentColor: '#06b6d4', width: '16px', height: '16px' }}
                      />
                      <span style={{ fontSize: '12px', color: '#38bdf8', fontWeight: 700 }}>
                        Generar automáticamente la cuadrícula de apartamentos (1-1, 1-2... {buildingForm.total_pisos}-{buildingForm.apartamentos_por_piso})
                      </span>
                    </label>
                  </div>
                )}
              </div>

              {/* Sección 3: Datos de Cobranza */}
              <div style={{ marginBottom: '22px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'block', marginBottom: '10px' }}>
                  3. Datos Bancarios del Condominio
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 700, marginBottom: '4px' }}>
                      Banco Principal
                    </label>
                    <input
                      type="text"
                      value={buildingForm.banco || ''}
                      onChange={e => setBuildingForm({ ...buildingForm, banco: e.target.value })}
                      placeholder="Ej: Banesco / Mercantil"
                      style={{
                        width: '100%', boxSizing: 'border-box', background: '#070a10',
                        border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px',
                        color: '#fff', padding: '8px', fontSize: '12px'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 700, marginBottom: '4px' }}>
                      Número de Cuenta
                    </label>
                    <input
                      type="text"
                      value={buildingForm.cuenta_bancaria || ''}
                      onChange={e => setBuildingForm({ ...buildingForm, cuenta_bancaria: e.target.value })}
                      placeholder="20 dígitos"
                      style={{
                        width: '100%', boxSizing: 'border-box', background: '#070a10',
                        border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px',
                        color: '#fff', padding: '8px', fontSize: '12px'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 700, marginBottom: '4px' }}>
                      Pago Móvil: Teléfono
                    </label>
                    <input
                      type="text"
                      value={buildingForm.pago_movil_telefono || ''}
                      onChange={e => setBuildingForm({ ...buildingForm, pago_movil_telefono: e.target.value })}
                      placeholder="0414-XXXXXXX"
                      style={{
                        width: '100%', boxSizing: 'border-box', background: '#070a10',
                        border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px',
                        color: '#fff', padding: '8px', fontSize: '12px'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 700, marginBottom: '4px' }}>
                      Zelle Email
                    </label>
                    <input
                      type="text"
                      value={buildingForm.zelle_email || ''}
                      onChange={e => setBuildingForm({ ...buildingForm, zelle_email: e.target.value })}
                      placeholder="pagos@condominio.com"
                      style={{
                        width: '100%', boxSizing: 'border-box', background: '#070a10',
                        border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px',
                        color: '#fff', padding: '8px', fontSize: '12px'
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Botones de acción */}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setBuildingModalOpen(false)}
                  style={{
                    flex: 1, background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.12)', color: '#fff',
                    borderRadius: '10px', padding: '12px', fontWeight: 700, cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingBuilding}
                  style={{
                    flex: 1.5, background: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
                    border: 'none', color: '#fff', borderRadius: '10px',
                    padding: '12px', fontWeight: 800, cursor: savingBuilding ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 20px rgba(6, 182, 212, 0.35)'
                  }}
                >
                  {savingBuilding ? 'Guardando en Base de Datos...' : (editingBuilding ? 'Actualizar Edificio' : 'Crear Edificio')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 2: EDITAR PERFIL DE USUARIO INTEGRAL ── */}
      {editUserModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10000,
          background: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
        }}>
          <div style={{
            background: '#0d111a', border: '1px solid rgba(59, 130, 246, 0.35)',
            borderRadius: '20px', padding: '28px', maxWidth: '580px', width: '100%',
            maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 60px rgba(0,0,0,0.9)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 900, margin: 0, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>✏️</span>
                <span>Editar Información de Usuario</span>
              </h3>
              <button
                onClick={() => setEditUserModal(null)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '18px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveUser}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', marginBottom: '18px' }}>
                <div>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 700, marginBottom: '4px' }}>
                    Nombre Completo
                  </label>
                  <input
                    type="text"
                    required
                    value={userForm.nombre_completo}
                    onChange={e => setUserForm({ ...userForm, nombre_completo: e.target.value })}
                    style={{
                      width: '100%', boxSizing: 'border-box', background: '#070a10',
                      border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px',
                      color: '#fff', padding: '10px', fontSize: '13px'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 700, marginBottom: '4px' }}>
                    Cédula de Identidad
                  </label>
                  <input
                    type="text"
                    value={userForm.cedula}
                    onChange={e => setUserForm({ ...userForm, cedula: e.target.value })}
                    placeholder="V-12345678"
                    style={{
                      width: '100%', boxSizing: 'border-box', background: '#070a10',
                      border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px',
                      color: '#fff', padding: '10px', fontSize: '13px'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 700, marginBottom: '4px' }}>
                    Teléfono
                  </label>
                  <input
                    type="text"
                    value={userForm.telefono}
                    onChange={e => setUserForm({ ...userForm, telefono: e.target.value })}
                    placeholder="0412-1234567"
                    style={{
                      width: '100%', boxSizing: 'border-box', background: '#070a10',
                      border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px',
                      color: '#fff', padding: '10px', fontSize: '13px'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 700, marginBottom: '4px' }}>
                    Correo Electrónico
                  </label>
                  <input
                    type="email"
                    required
                    value={userForm.email}
                    onChange={e => setUserForm({ ...userForm, email: e.target.value })}
                    style={{
                      width: '100%', boxSizing: 'border-box', background: '#070a10',
                      border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px',
                      color: '#fff', padding: '10px', fontSize: '13px'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 700, marginBottom: '4px' }}>
                    Edificio Asignado
                  </label>
                  <select
                    value={userForm.edificio_id}
                    onChange={e => handleBuildingChangeInUserForm(e.target.value)}
                    style={{
                      width: '100%', boxSizing: 'border-box', background: '#070a10',
                      border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px',
                      color: '#38bdf8', padding: '10px', fontSize: '13px', fontWeight: 700
                    }}
                  >
                    <option value="">Sin edificio asignado</option>
                    {buildings.map(b => (
                      <option key={b.id} value={b.id}>🏢 {b.nombre_edificio}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 700, marginBottom: '4px' }}>
                    Apartamento
                  </label>
                  <select
                    value={userForm.apartamento_id}
                    onChange={e => setUserForm({ ...userForm, apartamento_id: e.target.value })}
                    style={{
                      width: '100%', boxSizing: 'border-box', background: '#070a10',
                      border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px',
                      color: '#fff', padding: '10px', fontSize: '13px'
                    }}
                  >
                    <option value="">Sin apartamento asignado</option>
                    {availableApartments.map(a => (
                      <option key={a.id} value={a.id}>Apto {a.numero} (Piso {a.piso})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 700, marginBottom: '4px' }}>
                    Condición Habitacional
                  </label>
                  <select
                    value={userForm.condicion_habitacional}
                    onChange={e => setUserForm({ ...userForm, condicion_habitacional: e.target.value })}
                    style={{
                      width: '100%', boxSizing: 'border-box', background: '#070a10',
                      border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px',
                      color: '#fff', padding: '10px', fontSize: '13px'
                    }}
                  >
                    <option value="propietario">Propietario</option>
                    <option value="inquilino">Inquilino / Arrendatario</option>
                    <option value="familiar">Familiar Residente</option>
                    <option value="apoderado">Apoderado Legal</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 700, marginBottom: '4px' }}>
                    Rol en la Plataforma
                  </label>
                  <select
                    value={userForm.rol}
                    onChange={e => setUserForm({ ...userForm, rol: e.target.value as any })}
                    style={{
                      width: '100%', boxSizing: 'border-box', background: '#070a10',
                      border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px',
                      color: '#c084fc', padding: '10px', fontSize: '13px', fontWeight: 800
                    }}
                  >
                    <option value="residente">Residente</option>
                    <option value="administrador">Administrador</option>
                    <option value="conserje">Conserje</option>
                    <option value="superadmin">Super Admin</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', fontWeight: 700, marginBottom: '4px' }}>
                    Estado de Cuenta
                  </label>
                  <select
                    value={userForm.estado_cuenta}
                    onChange={e => setUserForm({ ...userForm, estado_cuenta: e.target.value as any })}
                    style={{
                      width: '100%', boxSizing: 'border-box', background: '#070a10',
                      border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px',
                      color: userForm.estado_cuenta === 'activa' ? '#4ade80' : '#f87171', padding: '10px', fontSize: '13px', fontWeight: 800
                    }}
                  >
                    <option value="activa">Activa (Acceso Permitido)</option>
                    <option value="suspendida">Suspendida (Bloqueo de Acceso)</option>
                    <option value="pendiente_cambio_clave">Pendiente Cambio Clave</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setEditUserModal(null)}
                  style={{
                    flex: 1, background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.12)', color: '#fff',
                    borderRadius: '10px', padding: '12px', fontWeight: 700, cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingUser}
                  style={{
                    flex: 1.5, background: 'linear-gradient(135deg, #3b82f6, #06b6d4)',
                    border: 'none', color: '#fff', borderRadius: '10px',
                    padding: '12px', fontWeight: 800, cursor: savingUser ? 'not-allowed' : 'pointer'
                  }}
                >
                  {savingUser ? 'Guardando...' : 'Guardar Cambios de Perfil'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 3: CAMBIAR CONTRASEÑA DIRECTA ── */}
      {passwordModalUser && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10000,
          background: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
        }}>
          <div style={{
            background: '#0d111a', border: '1px solid rgba(234, 179, 8, 0.4)',
            borderRadius: '20px', padding: '28px', maxWidth: '440px', width: '100%',
            boxShadow: '0 25px 60px rgba(0,0,0,0.9)'
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: 900, margin: '0 0 6px', color: '#fef08a', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🔑</span>
              <span>Cambiar Contraseña de Acceso</span>
            </h3>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 18px', lineHeight: 1.5 }}>
              Definiendo nueva contraseña para <strong>{passwordModalUser.nombre_completo}</strong> ({passwordModalUser.email}).
            </p>

            <form onSubmit={handleSavePassword}>
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ color: '#cbd5e1', fontSize: '12px', fontWeight: 700 }}>
                    Nueva Contraseña
                  </label>
                  <button
                    type="button"
                    onClick={handleGenerateRandomPassword}
                    style={{
                      background: 'transparent', border: 'none', color: '#38bdf8',
                      fontSize: '11px', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline'
                    }}
                  >
                    🎲 Generar Segura
                  </button>
                </div>

                <input
                  type="text"
                  required
                  value={newPasswordInput}
                  onChange={e => setNewPasswordInput(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  style={{
                    width: '100%', boxSizing: 'border-box', background: '#070a10',
                    border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: '10px',
                    color: '#fff', padding: '12px 14px', fontSize: '15px', fontWeight: 700, outline: 'none'
                  }}
                />
              </div>

              <div style={{
                background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.25)',
                borderRadius: '10px', padding: '10px 12px', marginBottom: '20px', fontSize: '11px', color: '#fef08a', lineHeight: 1.4
              }}>
                ⚡ <strong>Acción Inmediata</strong>: La contraseña se actualizará directamente en la base de datos de autenticación sin requerir correo ni confirmación previa del residente.
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setPasswordModalUser(null)}
                  style={{
                    flex: 1, background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.12)', color: '#fff',
                    borderRadius: '10px', padding: '10px', fontWeight: 700, cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingPassword}
                  style={{
                    flex: 1.5, background: 'linear-gradient(135deg, #eab308, #f97316)',
                    border: 'none', color: '#000', borderRadius: '10px',
                    padding: '10px', fontWeight: 900, cursor: savingPassword ? 'not-allowed' : 'pointer'
                  }}
                >
                  {savingPassword ? 'Actualizando...' : 'Confirmar Nueva Clave'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
