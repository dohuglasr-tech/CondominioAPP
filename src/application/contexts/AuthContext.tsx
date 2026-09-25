import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { Session, User } from '@supabase/supabase-js'
import { supabase, Perfil, ConfigEdificio, Rol } from '../../data/supabase'

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
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [config, setConfig] = useState<ConfigEdificio | null>(null)
  const [loading, setLoading] = useState(true)

  // ── Cargar configuración del edificio ────────────────────────
  const cargarConfig = useCallback(async () => {
    const { data } = await supabase
      .from('configuracion_edificio')
      .select('*')
      .single()
    if (data) setConfig(data)
  }, [])

  // ── Cargar perfil del usuario ─────────────────────────────────
  const cargarPerfil = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('perfiles')
      .select('*, apartamento:apartamento_id(numero)')
      .eq('id', userId)
      .single()

    if (error) {
      console.error('[Auth] Error cargando perfil:', error.message)
      return
    }
    if (data) {
      setPerfil(data)
      // Registrar último acceso
      await supabase
        .from('perfiles')
        .update({ ultimo_acceso: new Date().toISOString() })
        .eq('id', userId)
    }
  }, [])

  const refreshPerfil = useCallback(async () => {
    if (user) await cargarPerfil(user.id)
  }, [user, cargarPerfil])

  const refreshConfig = useCallback(async () => {
    await cargarConfig()
  }, [cargarConfig])

  // ── Inicializar sesión al montar ──────────────────────────────
  useEffect(() => {
    cargarConfig()

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        cargarPerfil(session.user.id).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        setSession(newSession)
        setUser(newSession?.user ?? null)
        if (newSession?.user) {
          await cargarPerfil(newSession.user.id)
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
      const { error } = await supabase.auth.signInWithPassword({ email, password })

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          return { error: 'Correo electrónico o contraseña incorrectos.' }
        }
        return { error: error.message }
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
          alert('Error actualizando perfil: ' + updateError.message)
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
