import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { Session, User } from '@supabase/supabase-js'
import { supabase, Perfil, ConfigEdificio, Rol } from '../../data/supabase'
import { appCache } from '../../data/cacheService'
import { applyTheme } from '../../utils/themeManager'
import { extractTenantSubdomain, resolveTenantBuilding } from '../../data/tenantService'
import { debeSincronizarTasa, sincronizarTasaBcvConApi } from '../../data/bcvService'

// ── Tipos del contexto ────────────────────────────────────────────
interface AuthContextType {
  // Estado
  session: Session | null
  user: User | null
  perfil: Perfil | null
  config: ConfigEdificio | null
  loading: boolean
  // Subdominio & Multi-tenant
  tenantSubdomain: string | null
  isSubdomainMode: boolean
  // Acciones
  signIn: (apartamento: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  updatePassword: (newPassword: string, email?: string) => Promise<{ error: string | null }>
  refreshPerfil: (explicitUserId?: string) => Promise<void>
  refreshConfig: (forceRefresh?: boolean, explicitBuildingId?: string) => Promise<void>
  // Helpers de rol
  isSuperAdmin: boolean
  isAdmin: boolean
  isResidente: boolean
  isConserje: boolean
  needsPasswordChange: boolean
  needsProfileSetup: boolean
  isPasswordRecovery: boolean
  clearPasswordRecovery: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [config, setConfig] = useState<ConfigEdificio | null>(null)
  const [loading, setLoading] = useState(true)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return (
      window.location.hash.includes('type=recovery') ||
      sessionStorage.getItem('condominio_is_recovery') === 'true'
    )
  })

  const clearPasswordRecovery = () => {
    setIsPasswordRecovery(false)
    sessionStorage.removeItem('condominio_is_recovery')
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      window.history.replaceState(null, '', window.location.pathname)
    }
  }

  const [tenantSubdomain, setTenantSubdomain] = useState<string | null>(() => extractTenantSubdomain())

  // ── Cargar configuración del edificio con resolución de subdominio & multi-tenant ──
  const cargarConfig = useCallback(async (forceRefresh = false, explicitBuildingId?: string) => {
    try {
      const urlTenant = extractTenantSubdomain()
      setTenantSubdomain(urlTenant)

      // 1. Si hay subdominio o parámetro en URL, resolver ese edificio
      if (urlTenant) {
        const tenantBuilding = await resolveTenantBuilding(urlTenant)
        if (tenantBuilding) {
          if (!tenantBuilding.tasa_bcv_actual || tenantBuilding.tasa_bcv_actual <= 1) {
            tenantBuilding.tasa_bcv_actual = 859.06
          }
          setConfig(tenantBuilding)
          applyTheme(tenantBuilding.color_primario)
          return
        }
      }

      // 2. Si se especifica un edificio explícito (ej. desde el perfil del usuario autenticado)
      if (explicitBuildingId) {
        const tenantBuilding = await resolveTenantBuilding(explicitBuildingId)
        if (tenantBuilding) {
          if (!tenantBuilding.tasa_bcv_actual || tenantBuilding.tasa_bcv_actual <= 1) {
            tenantBuilding.tasa_bcv_actual = 859.06
          }
          setConfig(tenantBuilding)
          applyTheme(tenantBuilding.color_primario)
          return
        }
      }

      // 3. Fallback: cargar el primer edificio registrado o configuración existente
      const data = await appCache.fetch<ConfigEdificio | null>(
        'configuracion_edificio_default',
        async () => {
          const { data } = await supabase
            .from('configuracion_edificio')
            .select('*')
            .limit(1)
            .maybeSingle()

          if (data) {
            if (!data.tasa_bcv_actual || data.tasa_bcv_actual <= 1) {
              data.tasa_bcv_actual = 859.06
            }
          }
          return data ?? null
        },
        { ttlMs: 30 * 60 * 1000, tags: ['config'], forceRefresh, persistSession: true }
      )
      if (data) {
        setConfig(data)
        applyTheme(data.color_primario)

        // Sincronización en segundo plano con el BCV si la tasa tiene más de 4 horas o es de fecha previa
        if (debeSincronizarTasa(data.tasa_bcv_actualizada)) {
          sincronizarTasaBcvConApi('Sistema de Inicio')
            .then(res => {
              if (res.ok && res.tasa > 1) {
                setConfig(prev => prev ? {
                  ...prev,
                  tasa_bcv_actual: res.tasa,
                  tasa_bcv_actualizada: res.fecha
                } : prev)
              }
            })
            .catch(() => {})
        }
      } else {
        applyTheme()
      }
    } catch (e) {
      console.warn('[Auth] Error cargando config multi-tenant:', e)
      applyTheme()
    }
  }, [])

  // ── Cargar perfil del usuario ─────────────────────────────────
  const cargarPerfil = useCallback(async (userId: string, userEmail?: string) => {
    try {
      const { data, error } = await supabase
        .from('perfiles')
        .select('*, apartamento:apartamento_id(numero)')
        .eq('id', userId)
        .single()

      if (error) {
        console.error('[Auth] Error cargando perfil con join:', error.message)
        // Fallback robusto sin join
        const { data: fallbackData } = await supabase
          .from('perfiles')
          .select('*')
          .eq('id', userId)
          .single()
        if (fallbackData) {
          setPerfil(fallbackData)
          if ((fallbackData as any).edificio_id) {
            cargarConfig(false, (fallbackData as any).edificio_id)
          }
        }
        return
      }
      if (data) {
        setPerfil(data)
        // Sincronizar tema y configuración del edificio asociado al usuario
        if ((data as any).edificio_id) {
          cargarConfig(false, (data as any).edificio_id)
        }

        // Registrar último acceso y sincronizar email oficial con el que se registró el propietario
        const updatePayload: Record<string, any> = { ultimo_acceso: new Date().toISOString() }
        if (userEmail && (!data.propietario_email || data.propietario_email !== userEmail) && data.condicion_habitacional !== 'alquilado') {
          updatePayload.propietario_email = userEmail
          data.propietario_email = userEmail
        }

        supabase
          .from('perfiles')
          .update(updatePayload)
          .eq('id', userId)
          .then(() => {}, () => {})
      }
    } catch (e) {
      console.warn('[Auth] Excepción en cargarPerfil:', e)
    }
  }, [cargarConfig])

  const refreshPerfil = useCallback(async (explicitUserId?: string) => {
    const targetId = explicitUserId || user?.id || session?.user?.id
    if (targetId) {
      await cargarPerfil(targetId, user?.email || session?.user?.email)
    } else {
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      if (currentUser) {
        setUser(currentUser)
        await cargarPerfil(currentUser.id, currentUser.email)
      }
    }
  }, [user, session, cargarPerfil])

  const refreshConfig = useCallback(async (forceRefresh = true, explicitBuildingId?: string) => {
    await cargarConfig(forceRefresh, explicitBuildingId)
  }, [cargarConfig])

  // ── Inicializar sesión y Realtime Sync al montar ───────────────
  useEffect(() => {
    appCache.initRealtimeSync(supabase)
    cargarConfig()

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        cargarPerfil(session.user.id, session.user.email).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (
          event === 'PASSWORD_RECOVERY' ||
          (typeof window !== 'undefined' && (
            window.location.hash.includes('type=recovery') ||
            window.location.search.includes('type=recovery')
          ))
        ) {
          setIsPasswordRecovery(true)
          sessionStorage.setItem('condominio_is_recovery', 'true')
        }
        setSession(newSession)
        setUser(newSession?.user ?? null)
        if (newSession?.user) {
          await cargarPerfil(newSession.user.id, newSession.user.email)
        } else {
          setPerfil(null)
        }
      }
    )

    // ── Sincronización en tiempo real del tema y configuración del edificio ──
    const configRealtimeChannel = supabase
      .channel('realtime_edificio_theme_sync')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'configuracion_edificio' },
        (payload) => {
          const newConfig = payload.new as any
          if (newConfig) {
            if (newConfig.color_primario) {
              applyTheme(newConfig.color_primario)
            }
            setConfig(prev => (prev ? { ...prev, ...newConfig } : newConfig))
          }
        }
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
      configRealtimeChannel.unsubscribe()
    }
  }, [cargarPerfil, cargarConfig])

  // ── Login: email + contraseña ──────────────────────────
  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    try {
      const cleanEmail = email.trim()
      const { data, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password })

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          return { error: 'Correo electrónico o contraseña incorrectos.' }
        }
        return { error: error.message }
      }

      if (data?.session) {
        setSession(data.session)
        setUser(data.user)
        if (data.user) {
          await cargarPerfil(data.user.id)
        }
      }

      return { error: null }
    } catch (err) {
      return { error: 'Error de conexión. Intenta nuevamente.' }
    }
  }

  // ── Cambiar contraseña (primera vez o normal) ─────────────────
  const updatePassword = async (newPassword: string, email?: string): Promise<{ error: string | null }> => {
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) return { error: error.message }

      clearPasswordRecovery()

      // Si nos pasan correo (en el flujo de primera vez), actualizar metadata
      if (email) {
        await supabase.auth.updateUser({
          data: {
            email_contacto: email,
            needs_password_change: false
          }
        })
      }

      // Marcar clave_cambiada = true y estado = activa
      if (user) {
        const { error: updateError } = await supabase
          .from('perfiles')
          .update({
            clave_cambiada: true,
            estado_cuenta: 'activa',
          })
          .eq('id', user.id)
          
        if (updateError) {
          console.error('[Auth] Error actualizando perfil:', updateError.message)
          return { error: updateError.message }
        }

        await refreshPerfil()
      }

      return { error: null }
    } catch (err) {
      return { error: 'No se pudo actualizar la contraseña.' }
    }
  }

  // ── Cerrar sesión ─────────────────────────────────────────────
  const signOut = async () => {
    clearPasswordRecovery()
    await supabase.auth.signOut()
    setPerfil(null)
    setSession(null)
    setUser(null)
  }

  // ── Helpers de rol ────────────────────────────────────────────
  const rol: Rol | null = perfil?.rol ?? null
  const isSuperAdmin = rol === 'superadmin'
  const isAdmin = rol === 'administrador' || rol === 'superadmin'
  const isResidente = rol === 'residente'
  const isConserje = rol === 'conserje'
  // Solo evaluar si ya tenemos perfil cargado (evita falso positivo durante carga)
  const needsPasswordChange = !!user && !!perfil &&
    (!perfil.clave_cambiada || perfil.estado_cuenta === 'pendiente_cambio_clave')
  // Perfil incompleto: residente que no ha completado sus datos personales
  // Se activa si perfil_completo es false O null (perfiles nuevos sin el campo seteado)
  const needsProfileSetup = !!user && !!perfil && isResidente &&
    !needsPasswordChange && ((perfil as any).perfil_completo !== true)

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        perfil,
        config,
        loading,
        tenantSubdomain,
        isSubdomainMode: !!tenantSubdomain,
        signIn,
        signOut,
        updatePassword,
        refreshPerfil,
        refreshConfig,
        isSuperAdmin,
        isAdmin,
        isResidente,
        isConserje,
        needsPasswordChange,
        needsProfileSetup,
        isPasswordRecovery,
        clearPasswordRecovery,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// Hook tipado
export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
