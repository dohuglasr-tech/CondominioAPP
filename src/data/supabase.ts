import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string || 'https://mock-dummy-url.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string || 'mock-anon-key'

if (!import.meta.env.VITE_SUPABASE_URL) {
  console.warn('⚠️ Advertencia: VITE_SUPABASE_URL no detectado. La DB no está conectada, se usará la data de prueba (Mock) de la UI.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
})

// Tipos que coinciden con la BD
export type Rol = 'administrador' | 'residente' | 'conserje'
export type EstadoCuenta = 'activa' | 'suspendida' | 'pendiente_cambio_clave'

export interface Perfil {
  id: string
  apartamento_id: string | null
  rol: Rol
  estado_cuenta: EstadoCuenta
  nombre_completo: string | null
  cedula: string | null
  telefono: string | null
  avatar_url: string | null
  clave_cambiada: boolean
  ultimo_acceso: string | null
  created_at: string
  updated_at: string
}

export interface Apartamento {
  id: string
  numero: string
  piso: number | null
  metros_cuadrados: number | null
  alicuota: number
  estado: string
  propietario_nombre: string | null
}

export interface ConfigEdificio {
  id: string
  nombre_edificio: string
  dominio_email: string
  total_apartamentos: number
  tasa_bcv_actual: number
  tasa_bcv_actualizada: string | null
  logo_url: string | null
  rif: string | null
  direccion: string | null
  telefono: string | null
  email_contacto: string | null
  banco: string | null
  cuenta_bancaria: string | null
  titular_cuenta: string | null
  ciudad: string | null
  updated_at: string | null
}

