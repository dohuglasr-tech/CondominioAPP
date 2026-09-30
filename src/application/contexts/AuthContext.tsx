import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { Session, User } from '@supabase/supabase-js'
import { supabase, Perfil, ConfigEdificio, Rol } from '../../data/supabase'
import { appCache } from '../../data/cacheService'
import { applyTheme } from '../../utils/themeManager'

// ── Tipos del contexto ────────────────────────────────────────────
interface AuthContextType {
  // Estado
  session: Session | null
  user: User | null
  perfil: Perfil | null
  config: ConfigEdificio | null
  loading: boolean
  // Acciones
  signIn: (apartamento: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  updatePassword: (newPassword: string, email?: string) => Promise<{ error: string | null }>
  refreshPerfil: () => Promise<void>
  refreshConfig: () => Promise<void>
  // Helpers de rol
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
  }

  // ── Cargar configuración del edificio con caché (30 min TTL) ──
  const cargarConfig = useCallback(async (forceRefresh = false) => {
    try {
      const data = await appCache.fetch<ConfigEdificio | null>(
        'configuracion_edificio',
        async () => {
          const { data } = await supabase
            .from('configuracion_edificio')
            .select('*')
            .single()
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
      } else {
        applyTheme()
      }
    } catch (e) {
      console.warn('[Auth] Error cargando config con caché:', e)
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
        }
        return
      }
      if (data) {
        setPerfil(data)
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
  }, [])

  const refreshPerfil = useCallback(async () => {
    if (user) await cargarPerfil(user.id, user.email)
  }, [user, cargarPerfil])

  const refreshConfig = useCallback(async () => {
    await cargarConfig(true)
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
        if (event === 'PASSWORD_RECOVERY' || (typeof window !== 'undefined' && window.location.hash.includes('type=recovery'))) {
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

    return () => subscription.unsubscribe()
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
  const isAdmin = rol === 'administrador'
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
        signIn,
        signOut,
        updatePassword,
        refreshPerfil,
        refreshConfig,
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
