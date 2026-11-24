import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { Session, User } from '@supabase/supabase-js'
import { supabase, Perfil, ConfigEdificio, Rol } from '../../data/supabase'
import { appCache } from '../../data/cacheService'
import { applyTheme } from '../../utils/themeManager'
import { extractTenantSubdomain, resolveTenantBuilding } from '../../data/tenantService'
import { setActiveEdificioConfig, setActiveEdificioId } from '../../data/tenantContext'
import { esTasaBcvValida, getTasaBcvNumerica, guardarUltimaTasaBcvConocida } from '../../utils/tasaBcvHelper'


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
  const lastLoadedUserIdRef = useRef<string | null>(null)
  const perfilInFlightRef = useRef<{ userId: string; promise: Promise<void> } | null>(null)
  const lastAccessWriteRef = useRef<{ userId: string; ts: number }>({ userId: '', ts: 0 })

  // ── Cargar configuración del edificio con resolución de subdominio & multi-tenant ──
  const cargarConfig = useCallback(async (forceRefresh = false, explicitBuildingId?: string) => {
    try {
      const urlTenant = extractTenantSubdomain()
      setTenantSubdomain(urlTenant)

      // 1. Si hay subdominio o parámetro en URL, resolver ese edificio
      if (urlTenant) {
        const tenantBuilding = await resolveTenantBuilding(urlTenant)
        if (tenantBuilding) {
          if (esTasaBcvValida(tenantBuilding.tasa_bcv_actual)) {
            guardarUltimaTasaBcvConocida(tenantBuilding.tasa_bcv_actual)
          } else {
            tenantBuilding.tasa_bcv_actual = getTasaBcvNumerica(tenantBuilding.tasa_bcv_actual)
          }
          setConfig(tenantBuilding)
          setActiveEdificioConfig(tenantBuilding)
          applyTheme(tenantBuilding.color_primario)
          return
        }
      }

      // 2. Si se especifica un edificio explícito (ej. desde el perfil del usuario autenticado)
      if (explicitBuildingId) {
        setActiveEdificioId(explicitBuildingId)
        const tenantBuilding = await resolveTenantBuilding(explicitBuildingId)
        if (tenantBuilding) {
          if (esTasaBcvValida(tenantBuilding.tasa_bcv_actual)) {
            guardarUltimaTasaBcvConocida(tenantBuilding.tasa_bcv_actual)
          } else {
            tenantBuilding.tasa_bcv_actual = getTasaBcvNumerica(tenantBuilding.tasa_bcv_actual)
          }
          setConfig(tenantBuilding)
          setActiveEdificioConfig(tenantBuilding)
          applyTheme(tenantBuilding.color_primario)
          return
        }
      }

      // 3. Fallback: cargar el primer edificio registrado o configuración existente
      let hasSession = false
      try {
        const { data: sRes } = await supabase.auth.getSession()
        hasSession = Boolean(sRes?.session?.user)
      } catch {}

      const cacheKey = hasSession ? 'configuracion_edificio_default_auth' : 'configuracion_edificio_default_pub'
      const data = await appCache.fetch<ConfigEdificio | null>(
        cacheKey,
        async () => {
          if (!hasSession) {
            const { data: rpcData, error: rpcErr } = await supabase.rpc('public_get_edificio_branding', {
              p_slug: null,
            })
            if (!rpcErr) {
              const cfg = (rpcData || null) as ConfigEdificio | null
              if (cfg) {
                if (esTasaBcvValida(cfg.tasa_bcv_actual)) {
                  guardarUltimaTasaBcvConocida(cfg.tasa_bcv_actual)
                } else {
                  cfg.tasa_bcv_actual = getTasaBcvNumerica(cfg.tasa_bcv_actual)
                }
              }
              return cfg
            }
          }

          const { data } = await supabase
            .from('configuracion_edificio')
            .select('id, nombre_edificio, slug, rif, rif_edificio, direccion, ciudad, telefono, email_contacto, email_admin, dominio_email, logo_url, color_primario, tasa_bcv_actual, tasa_bcv_actualizada, banco, cedula_cuenta, tipo_cuenta, cuenta_bancaria, titular_cuenta, pago_movil_banco, pago_movil_cedula, pago_movil_telefono, zelle_email, total_apartamentos, total_pisos, apartamentos_por_piso, tiene_ph, total_ph, fecha_inicio_gestion, fecha_fin_administracion_anterior, banner_emergencia_activo, banner_emergencia_texto, banner_emergencia_nivel, modo_mantenimiento, modo_mantenimiento_motivo, updated_at')
            .limit(1)
            .maybeSingle()

          if (data) {
            if (esTasaBcvValida(data.tasa_bcv_actual)) {
              guardarUltimaTasaBcvConocida(data.tasa_bcv_actual)
            } else {
              data.tasa_bcv_actual = getTasaBcvNumerica(data.tasa_bcv_actual)
            }
          }
          return data ?? null
        },
        { ttlMs: 30 * 60 * 1000, tags: ['config'], forceRefresh, persistSession: true }
      )
      if (data) {
        setConfig(data)
        setActiveEdificioConfig(data)
        applyTheme(data.color_primario)


      } else {
        applyTheme()
      }
    } catch (e) {
      console.warn('[Auth] Error cargando config multi-tenant:', e)
      applyTheme()
    }
  }, [])

  // ── Cargar perfil del usuario (deduplicado + throttle de ultimo_acceso) ──
  const cargarPerfil = useCallback(async (userId: string, userEmail?: string, force = false): Promise<void> => {
    if (!force && perfilInFlightRef.current?.userId === userId) {
      return perfilInFlightRef.current.promise
    }

    const run = (async () => {
      try {
        const { data, error } = await supabase
          .from('perfiles')
          .select('id, apartamento_id, rol, estado_cuenta, nombre_completo, cedula, telefono, avatar_url, clave_cambiada, ultimo_acceso, condicion_habitacional, carga_familiar, propietario_nombre, propietario_cedula, propietario_telefono, propietario_email, perfil_completo, email, edificio_id, created_at, updated_at, apartamento:apartamento_id(numero)')
          .eq('id', userId)
          .maybeSingle()

        if (error || !data) {
          if (error) console.error('[Auth] Error cargando perfil con join:', error.message)
          // Fallback robusto sin join
          const { data: fallbackData } = await supabase
            .from('perfiles')
            .select('id, apartamento_id, rol, estado_cuenta, nombre_completo, cedula, telefono, avatar_url, clave_cambiada, ultimo_acceso, condicion_habitacional, carga_familiar, propietario_nombre, propietario_cedula, propietario_telefono, propietario_email, perfil_completo, email, edificio_id, created_at, updated_at')
            .eq('id', userId)
            .maybeSingle()
          if (fallbackData) {
            setPerfil(fallbackData)
            lastLoadedUserIdRef.current = userId
            if ((fallbackData as any).edificio_id) {
              cargarConfig(force, (fallbackData as any).edificio_id)
            }
          }
          return
        }

        if (data) {
          setPerfil(data)
          lastLoadedUserIdRef.current = userId
          // Sincronizar tema y configuración del edificio asociado respetando caché salvo force=true
          cargarConfig(force, (data as any).edificio_id || undefined)

          const now = Date.now()
          const storageKey = `domus_last_access_${userId}`
          let lastStoredTs = lastAccessWriteRef.current.userId === userId ? lastAccessWriteRef.current.ts : 0
          if (!lastStoredTs && typeof window !== 'undefined') {
            try {
              lastStoredTs = Number(sessionStorage.getItem(storageKey) || '0')
            } catch {}
          }
          const needsAccessWrite = !lastStoredTs || (now - lastStoredTs) >= 15 * 60 * 1000
          const needsEmailSync = Boolean(
            userEmail &&
            (!data.propietario_email || data.propietario_email !== userEmail) &&
            data.condicion_habitacional !== 'alquilado'
          )

          if (needsAccessWrite || needsEmailSync) {
            const updatePayload: Record<string, any> = {}
            if (needsAccessWrite) {
              updatePayload.ultimo_acceso = new Date(now).toISOString()
              lastAccessWriteRef.current = { userId, ts: now }
              if (typeof window !== 'undefined') {
                try { sessionStorage.setItem(storageKey, String(now)) } catch {}
              }
            }
            if (needsEmailSync) {
              updatePayload.propietario_email = userEmail
              data.propietario_email = userEmail
            }

            supabase
              .from('perfiles')
              .update(updatePayload)
              .eq('id', userId)
              .then(() => {}, () => {})
          }
        }
      } catch (e) {
        console.warn('[Auth] Excepción en cargarPerfil:', e)
      } finally {
        if (perfilInFlightRef.current?.userId === userId) {
          perfilInFlightRef.current = null
        }
      }
    })()

    perfilInFlightRef.current = { userId, promise: run }
    return run
  }, [cargarConfig])

  const refreshPerfil = useCallback(async (explicitUserId?: string) => {
    const targetId = explicitUserId || user?.id || session?.user?.id
    if (targetId) {
      await cargarPerfil(targetId, user?.email || session?.user?.email, true)
    } else {
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      if (currentUser) {
        setUser(currentUser)
        await cargarPerfil(currentUser.id, currentUser.email, true)
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
          if (
            (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') &&
            lastLoadedUserIdRef.current === newSession.user.id
          ) {
            return
          }
          await cargarPerfil(newSession.user.id, newSession.user.email)
        } else {
          lastLoadedUserIdRef.current = null
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
            setConfig(prev => {
              const merged = prev ? { ...prev, ...newConfig } : newConfig
              setActiveEdificioConfig(merged)
              return merged
            })
          }
        }
      )
      .on(
        'broadcast',
        { event: 'force_app_reload' },
        (payload) => {
          const eventTimestamp = (payload?.payload as any)?.timestamp || Date.now()
          const lastProcessed = Number(sessionStorage.getItem('domus_last_handled_reload_timestamp') || '0')
          if (lastProcessed && eventTimestamp <= lastProcessed) {
            return
          }
          sessionStorage.setItem('domus_last_handled_reload_timestamp', String(eventTimestamp))
          console.log('[Sistema] Señal de reinicio forzado recibida en este dispositivo:', payload)
          if ('caches' in window) {
            caches.keys().then(keys => keys.forEach(k => caches.delete(k))).catch(() => {})
          }
          setTimeout(() => {
            window.location.reload()
          }, 500)
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
    lastLoadedUserIdRef.current = null
    setActiveEdificioConfig(null)
    setActiveEdificioId(null)
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
