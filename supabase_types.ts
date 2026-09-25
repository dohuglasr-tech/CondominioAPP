export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      apartamentos: {
        Row: {
          alicuota: number
          created_at: string | null
          estado: Database["public"]["Enums"]["estado_apartamento"] | null
          id: string
          metros_cuadrados: number | null
          numero: string
          piso: number | null
          propietario_cedula: string | null
          propietario_nombre: string | null
          telefono_contacto: string | null
          updated_at: string | null
        }
        Insert: {
          alicuota: number
          created_at?: string | null
          estado?: Database["public"]["Enums"]["estado_apartamento"] | null
          id?: string
          metros_cuadrados?: number | null
          numero: string
          piso?: number | null
          propietario_cedula?: string | null
          propietario_nombre?: string | null
          telefono_contacto?: string | null
          updated_at?: string | null
        }
        Update: {
          alicuota?: number
          created_at?: string | null
          estado?: Database["public"]["Enums"]["estado_apartamento"] | null
          id?: string
          metros_cuadrados?: number | null
          numero?: string
          piso?: number | null
          propietario_cedula?: string | null
          propietario_nombre?: string | null
          telefono_contacto?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      boveda_legal: {
        Row: {
          apartamento_id: string
          archivo_url: string
          created_at: string | null
          id: string
          nombre_archivo: string
          propietario_id: string
          tamano_bytes: number | null
          tipo_documento: Database["public"]["Enums"]["tipo_documento"]
          verified: boolean | null
        }
        Insert: {
          apartamento_id: string
          archivo_url: string
          created_at?: string | null
          id?: string
          nombre_archivo: string
          propietario_id: string
          tamano_bytes?: number | null
          tipo_documento: Database["public"]["Enums"]["tipo_documento"]
          verified?: boolean | null
        }
        Update: {
          apartamento_id?: string
          archivo_url?: string
          created_at?: string | null
          id?: string
          nombre_archivo?: string
          propietario_id?: string
          tamano_bytes?: number | null
          tipo_documento?: Database["public"]["Enums"]["tipo_documento"]
          verified?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "boveda_legal_apartamento_id_fkey"
            columns: ["apartamento_id"]
            isOneToOne: false
            referencedRelation: "apartamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boveda_legal_propietario_id_fkey"
            columns: ["propietario_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cartas_solvencia: {
        Row: {
          apartamento_id: string
          created_at: string | null
          deuda_usd_al_emitir: number | null
          id: string
          pdf_url: string | null
          solicitado_por: string
          valida_hasta: string | null
        }
        Insert: {
          apartamento_id: string
          created_at?: string | null
          deuda_usd_al_emitir?: number | null
          id?: string
          pdf_url?: string | null
          solicitado_por: string
          valida_hasta?: string | null
        }
        Update: {
          apartamento_id?: string
          created_at?: string | null
          deuda_usd_al_emitir?: number | null
          id?: string
          pdf_url?: string | null
          solicitado_por?: string
          valida_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cartas_solvencia_apartamento_id_fkey"
            columns: ["apartamento_id"]
            isOneToOne: false
            referencedRelation: "apartamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cartas_solvencia_solicitado_por_fkey"
            columns: ["solicitado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_mensajes: {
        Row: {
          adjunto_tipo: string | null
          adjunto_url: string | null
          autor_id: string
          contenido: string
          created_at: string | null
          editado: boolean | null
          id: string
        }
        Insert: {
          adjunto_tipo?: string | null
          adjunto_url?: string | null
          autor_id: string
          contenido: string
          created_at?: string | null
          editado?: boolean | null
          id?: string
        }
        Update: {
          adjunto_tipo?: string | null
          adjunto_url?: string | null
          autor_id?: string
          contenido?: string
          created_at?: string | null
          editado?: boolean | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_mensajes_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comunicados: {
        Row: {
          adjunto_url: string | null
          contenido: string
          created_at: string | null
          enviado_por: string | null
          id: string
          roles_destino: Database["public"]["Enums"]["rol_usuario"][] | null
          titulo: string
        }
        Insert: {
          adjunto_url?: string | null
          contenido: string
          created_at?: string | null
          enviado_por?: string | null
          id?: string
          roles_destino?: Database["public"]["Enums"]["rol_usuario"][] | null
          titulo: string
        }
        Update: {
          adjunto_url?: string | null
          contenido?: string
          created_at?: string | null
          enviado_por?: string | null
          id?: string
          roles_destino?: Database["public"]["Enums"]["rol_usuario"][] | null
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "comunicados_enviado_por_fkey"
            columns: ["enviado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comunicados_leidos: {
        Row: {
          comunicado_id: string
          id: string
          leido_at: string | null
          usuario_id: string
        }
        Insert: {
          comunicado_id: string
          id?: string
          leido_at?: string | null
          usuario_id: string
        }
        Update: {
          comunicado_id?: string
          id?: string
          leido_at?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comunicados_leidos_comunicado_id_fkey"
            columns: ["comunicado_id"]
            isOneToOne: false
            referencedRelation: "comunicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comunicados_leidos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracion_edificio: {
        Row: {
          banco: string | null
          ciudad: string | null
          created_at: string | null
          cuenta_bancaria: string | null
          direccion: string | null
          dominio_email: string
          email_admin: string | null
          email_contacto: string | null
          id: string
          logo_url: string | null
          nombre_edificio: string
          rif: string | null
          rif_edificio: string | null
          tasa_bcv_actual: number | null
          tasa_bcv_actualizada: string | null
          telefono: string | null
          titular_cuenta: string | null
          total_apartamentos: number
          updated_at: string | null
        }
        Insert: {
          banco?: string | null
          ciudad?: string | null
          created_at?: string | null
          cuenta_bancaria?: string | null
          direccion?: string | null
          dominio_email?: string
          email_admin?: string | null
          email_contacto?: string | null
          id?: string
          logo_url?: string | null
          nombre_edificio?: string
          rif?: string | null
          rif_edificio?: string | null
          tasa_bcv_actual?: number | null
          tasa_bcv_actualizada?: string | null
          telefono?: string | null
          titular_cuenta?: string | null
          total_apartamentos?: number
          updated_at?: string | null
        }
        Update: {
          banco?: string | null
          ciudad?: string | null
          created_at?: string | null
          cuenta_bancaria?: string | null
          direccion?: string | null
          dominio_email?: string
          email_admin?: string | null
          email_contacto?: string | null
          id?: string
          logo_url?: string | null
          nombre_edificio?: string
          rif?: string | null
          rif_edificio?: string | null
          tasa_bcv_actual?: number | null
          tasa_bcv_actualizada?: string | null
          telefono?: string | null
          titular_cuenta?: string | null
          total_apartamentos?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      cuotas_apartamento: {
        Row: {
          apartamento_id: string
          created_at: string | null
          id: string
          mes: string
          monto_bs: number
          monto_usd: number
          pagado_completo: boolean | null
          saldo_bs: number
          saldo_usd: number
          tasa_bcv_usada: number | null
          updated_at: string | null
        }
        Insert: {
          apartamento_id: string
          created_at?: string | null
          id?: string
          mes: string
          monto_bs?: number
          monto_usd?: number
          pagado_completo?: boolean | null
          saldo_bs?: number
          saldo_usd?: number
          tasa_bcv_usada?: number | null
          updated_at?: string | null
        }
        Update: {
          apartamento_id?: string
          created_at?: string | null
          id?: string
          mes?: string
          monto_bs?: number
          monto_usd?: number
          pagado_completo?: boolean | null
          saldo_bs?: number
          saldo_usd?: number
          tasa_bcv_usada?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cuotas_apartamento_apartamento_id_fkey"
            columns: ["apartamento_id"]
            isOneToOne: false
            referencedRelation: "apartamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos_admin: {
        Row: {
          archivo_url: string
          created_at: string | null
          descripcion: string | null
          es_publico: boolean | null
          id: string
          subido_por: string | null
          tipo: Database["public"]["Enums"]["tipo_acta"]
          titulo: string
        }
        Insert: {
          archivo_url: string
          created_at?: string | null
          descripcion?: string | null
          es_publico?: boolean | null
          id?: string
          subido_por?: string | null
          tipo: Database["public"]["Enums"]["tipo_acta"]
          titulo: string
        }
        Update: {
          archivo_url?: string
          created_at?: string | null
          descripcion?: string | null
          es_publico?: boolean | null
          id?: string
          subido_por?: string | null
          tipo?: Database["public"]["Enums"]["tipo_acta"]
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "documentos_admin_subido_por_fkey"
            columns: ["subido_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      falencias: {
        Row: {
          creado_por: string | null
          created_at: string | null
          descripcion: string
          estado: Database["public"]["Enums"]["estado_falencia"] | null
          foto_url: string | null
          id: string
          prioridad: Database["public"]["Enums"]["prioridad_falencia"] | null
          titulo: string
          total_votos: number | null
          ubicacion: string | null
          updated_at: string | null
        }
        Insert: {
          creado_por?: string | null
          created_at?: string | null
          descripcion: string
          estado?: Database["public"]["Enums"]["estado_falencia"] | null
          foto_url?: string | null
          id?: string
          prioridad?: Database["public"]["Enums"]["prioridad_falencia"] | null
          titulo: string
          total_votos?: number | null
          ubicacion?: string | null
          updated_at?: string | null
        }
        Update: {
          creado_por?: string | null
          created_at?: string | null
          descripcion?: string
          estado?: Database["public"]["Enums"]["estado_falencia"] | null
          foto_url?: string | null
          id?: string
          prioridad?: Database["public"]["Enums"]["prioridad_falencia"] | null
          titulo?: string
          total_votos?: number | null
          ubicacion?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "falencias_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gastos_comunes: {
        Row: {
          creado_por: string | null
          created_at: string | null
          descripcion: string
          factura_url: string | null
          id: string
          mes_aplicacion: string
          monto_usd: number
          notas: string | null
          tipo: Database["public"]["Enums"]["tipo_gasto"]
          updated_at: string | null
        }
        Insert: {
          creado_por?: string | null
          created_at?: string | null
          descripcion: string
          factura_url?: string | null
          id?: string
          mes_aplicacion: string
          monto_usd: number
          notas?: string | null
          tipo?: Database["public"]["Enums"]["tipo_gasto"]
          updated_at?: string | null
        }
        Update: {
          creado_por?: string | null
          created_at?: string | null
          descripcion?: string
          factura_url?: string | null
          id?: string
          mes_aplicacion?: string
          monto_usd?: number
          notas?: string | null
          tipo?: Database["public"]["Enums"]["tipo_gasto"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gastos_comunes_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notificaciones: {
        Row: {
          created_at: string | null
          id: string
          leida: boolean | null
          link: string | null
          mensaje: string
          tipo: string | null
          titulo: string
          usuario_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          leida?: boolean | null
          link?: string | null
          mensaje: string
          tipo?: string | null
          titulo: string
          usuario_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          leida?: boolean | null
          link?: string | null
          mensaje?: string
          tipo?: string | null
          titulo?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificaciones_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pagos_reportados: {
        Row: {
          apartamento_id: string
          comprobante_url: string | null
          created_at: string | null
          cuota_id: string | null
          estado: Database["public"]["Enums"]["estado_pago"] | null
          fecha_pago: string
          fecha_revision: string | null
          id: string
          metodo: Database["public"]["Enums"]["metodo_pago"]
          monto_bs: number | null
          monto_usd: number | null
          motivo_rechazo: string | null
          notas_admin: string | null
          referencia: string | null
          reportado_por: string
          revisado_por: string | null
          updated_at: string | null
        }
        Insert: {
          apartamento_id: string
          comprobante_url?: string | null
          created_at?: string | null
          cuota_id?: string | null
          estado?: Database["public"]["Enums"]["estado_pago"] | null
          fecha_pago?: string
          fecha_revision?: string | null
          id?: string
          metodo: Database["public"]["Enums"]["metodo_pago"]
          monto_bs?: number | null
          monto_usd?: number | null
          motivo_rechazo?: string | null
          notas_admin?: string | null
          referencia?: string | null
          reportado_por: string
          revisado_por?: string | null
          updated_at?: string | null
        }
        Update: {
          apartamento_id?: string
          comprobante_url?: string | null
          created_at?: string | null
          cuota_id?: string | null
          estado?: Database["public"]["Enums"]["estado_pago"] | null
          fecha_pago?: string
          fecha_revision?: string | null
          id?: string
          metodo?: Database["public"]["Enums"]["metodo_pago"]
          monto_bs?: number | null
          monto_usd?: number | null
          motivo_rechazo?: string | null
          notas_admin?: string | null
          referencia?: string | null
          reportado_por?: string
          revisado_por?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pagos_reportados_apartamento_id_fkey"
            columns: ["apartamento_id"]
            isOneToOne: false
            referencedRelation: "apartamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_reportados_cuota_id_fkey"
            columns: ["cuota_id"]
            isOneToOne: false
            referencedRelation: "cuotas_apartamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_reportados_reportado_por_fkey"
            columns: ["reportado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_reportados_revisado_por_fkey"
            columns: ["revisado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      perfiles: {
        Row: {
          apartamento_id: string | null
          avatar_url: string | null
          carga_familiar: number | null
          cedula: string | null
          clave_cambiada: boolean
          condicion_habitacional: string | null
          created_at: string | null
          estado_cuenta: Database["public"]["Enums"]["estado_cuenta"]
          id: string
          nombre_completo: string | null
          perfil_completo: boolean | null
          propietario_cedula: string | null
          propietario_email: string | null
          propietario_nombre: string | null
          propietario_telefono: string | null
          rol: Database["public"]["Enums"]["rol_usuario"]
          telefono: string | null
          ultimo_acceso: string | null
          updated_at: string | null
        }
        Insert: {
          apartamento_id?: string | null
          avatar_url?: string | null
          carga_familiar?: number | null
          cedula?: string | null
          clave_cambiada?: boolean
          condicion_habitacional?: string | null
          created_at?: string | null
          estado_cuenta?: Database["public"]["Enums"]["estado_cuenta"]
          id: string
          nombre_completo?: string | null
          perfil_completo?: boolean | null
          propietario_cedula?: string | null
          propietario_email?: string | null
          propietario_nombre?: string | null
          propietario_telefono?: string | null
          rol?: Database["public"]["Enums"]["rol_usuario"]
          telefono?: string | null
          ultimo_acceso?: string | null
          updated_at?: string | null
        }
        Update: {
          apartamento_id?: string | null
          avatar_url?: string | null
          carga_familiar?: number | null
          cedula?: string | null
          clave_cambiada?: boolean
          condicion_habitacional?: string | null
          created_at?: string | null
          estado_cuenta?: Database["public"]["Enums"]["estado_cuenta"]
          id?: string
          nombre_completo?: string | null
          perfil_completo?: boolean | null
          propietario_cedula?: string | null
          propietario_email?: string | null
          propietario_nombre?: string | null
          propietario_telefono?: string | null
          rol?: Database["public"]["Enums"]["rol_usuario"]
          telefono?: string | null
          ultimo_acceso?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "perfiles_apartamento_id_fkey"
            columns: ["apartamento_id"]
            isOneToOne: false
            referencedRelation: "apartamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      propuestas: {
        Row: {
          autor_id: string
          created_at: string | null
          descripcion: string
          estado: Database["public"]["Enums"]["estado_propuesta"] | null
          id: string
          titulo: string
          total_apoyos: number | null
          updated_at: string | null
        }
        Insert: {
          autor_id: string
          created_at?: string | null
          descripcion: string
          estado?: Database["public"]["Enums"]["estado_propuesta"] | null
          id?: string
          titulo: string
          total_apoyos?: number | null
          updated_at?: string | null
        }
        Update: {
          autor_id?: string
          created_at?: string | null
          descripcion?: string
          estado?: Database["public"]["Enums"]["estado_propuesta"] | null
          id?: string
          titulo?: string
          total_apoyos?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "propuestas_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      propuestas_apoyos: {
        Row: {
          created_at: string | null
          id: string
          propuesta_id: string
          usuario_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          propuesta_id: string
          usuario_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          propuesta_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "propuestas_apoyos_propuesta_id_fkey"
            columns: ["propuesta_id"]
            isOneToOne: false
            referencedRelation: "propuestas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propuestas_apoyos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      propuestas_comentarios: {
        Row: {
          autor_id: string
          contenido: string
          created_at: string | null
          id: string
          propuesta_id: string
        }
        Insert: {
          autor_id: string
          contenido: string
          created_at?: string | null
          id?: string
          propuesta_id: string
        }
        Update: {
          autor_id?: string
          contenido?: string
          created_at?: string | null
          id?: string
          propuesta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "propuestas_comentarios_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propuestas_comentarios_propuesta_id_fkey"
            columns: ["propuesta_id"]
            isOneToOne: false
            referencedRelation: "propuestas"
            referencedColumns: ["id"]
          },
        ]
      }
      recibos_laborales: {
        Row: {
          archivo_url: string
          conserje_id: string
          created_at: string | null
          emitido_por: string | null
          fecha_confirmacion: string | null
          firma_digital_hash: string | null
          id: string
          monto_bs: number | null
          monto_usd: number | null
          notas: string | null
          periodo: string | null
          recibido_conforme: boolean | null
          tipo: Database["public"]["Enums"]["tipo_recibo_laboral"]
        }
        Insert: {
          archivo_url: string
          conserje_id: string
          created_at?: string | null
          emitido_por?: string | null
          fecha_confirmacion?: string | null
          firma_digital_hash?: string | null
          id?: string
          monto_bs?: number | null
          monto_usd?: number | null
          notas?: string | null
          periodo?: string | null
          recibido_conforme?: boolean | null
          tipo: Database["public"]["Enums"]["tipo_recibo_laboral"]
        }
        Update: {
          archivo_url?: string
          conserje_id?: string
          created_at?: string | null
          emitido_por?: string | null
          fecha_confirmacion?: string | null
          firma_digital_hash?: string | null
          id?: string
          monto_bs?: number | null
          monto_usd?: number | null
          notas?: string | null
          periodo?: string | null
          recibido_conforme?: boolean | null
          tipo?: Database["public"]["Enums"]["tipo_recibo_laboral"]
        }
        Relationships: [
          {
            foreignKeyName: "recibos_laborales_conserje_id_fkey"
            columns: ["conserje_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recibos_laborales_emitido_por_fkey"
            columns: ["emitido_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      registro_conserje: {
        Row: {
          area: string | null
          conserje_id: string
          coordenadas: string | null
          created_at: string | null
          descripcion: string | null
          foto_url: string
          id: string
        }
        Insert: {
          area?: string | null
          conserje_id: string
          coordenadas?: string | null
          created_at?: string | null
          descripcion?: string | null
          foto_url: string
          id?: string
        }
        Update: {
          area?: string | null
          conserje_id?: string
          coordenadas?: string | null
          created_at?: string | null
          descripcion?: string | null
          foto_url?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registro_conserje_conserje_id_fkey"
            columns: ["conserje_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tasa_bcv: {
        Row: {
          created_at: string | null
          fecha: string
          fuente: string | null
          id: string
          tasa: number
        }
        Insert: {
          created_at?: string | null
          fecha?: string
          fuente?: string | null
          id?: string
          tasa: number
        }
        Update: {
          created_at?: string | null
          fecha?: string
          fuente?: string | null
          id?: string
          tasa?: number
        }
        Relationships: []
      }
      tickets_anonimos: {
        Row: {
          categoria: string
          created_at: string | null
          descripcion: string
          estado: Database["public"]["Enums"]["estado_ticket"] | null
          id: string
          prioridad: Database["public"]["Enums"]["prioridad_falencia"] | null
          respuesta_admin: string | null
          uid_hash: string | null
          updated_at: string | null
        }
        Insert: {
          categoria: string
          created_at?: string | null
          descripcion: string
          estado?: Database["public"]["Enums"]["estado_ticket"] | null
          id?: string
          prioridad?: Database["public"]["Enums"]["prioridad_falencia"] | null
          respuesta_admin?: string | null
          uid_hash?: string | null
          updated_at?: string | null
        }
        Update: {
          categoria?: string
          created_at?: string | null
          descripcion?: string
          estado?: Database["public"]["Enums"]["estado_ticket"] | null
          id?: string
          prioridad?: Database["public"]["Enums"]["prioridad_falencia"] | null
          respuesta_admin?: string | null
          uid_hash?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      votos_falencias: {
        Row: {
          apartamento_id: string
          created_at: string | null
          falencia_id: string
          id: string
          votado_por: string
        }
        Insert: {
          apartamento_id: string
          created_at?: string | null
          falencia_id: string
          id?: string
          votado_por: string
        }
        Update: {
          apartamento_id?: string
          created_at?: string | null
          falencia_id?: string
          id?: string
          votado_por?: string
        }
        Relationships: [
          {
            foreignKeyName: "votos_falencias_apartamento_id_fkey"
            columns: ["apartamento_id"]
            isOneToOne: false
            referencedRelation: "apartamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votos_falencias_falencia_id_fkey"
            columns: ["falencia_id"]
            isOneToOne: false
            referencedRelation: "falencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votos_falencias_votado_por_fkey"
            columns: ["votado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calcular_deuda_apartamento: {
        Args: { p_apartamento_id: string }
        Returns: {
          deuda_total_bs: number
          deuda_total_usd: number
          meses_pendientes: number
        }[]
      }
      get_my_apartamento_id: { Args: never; Returns: string }
      get_my_rol: {
        Args: never
        Returns: Database["public"]["Enums"]["rol_usuario"]
      }
      hash_anonimo_uid: { Args: never; Returns: string }
      incrementar_voto_falencia: {
        Args: { p_falencia_id: string }
        Returns: undefined
      }
    }
    Enums: {
      estado_apartamento: "habitado" | "desocupado" | "en_venta" | "en_alquiler"
      estado_cuenta: "activa" | "suspendida" | "pendiente_cambio_clave"
      estado_falencia:
        | "reportada"
        | "en_votacion"
        | "aprobada"
        | "en_progreso"
        | "resuelta"
      estado_pago: "pendiente" | "aprobado" | "rechazado"
      estado_propuesta: "activa" | "archivada" | "implementada"
      estado_ticket: "abierto" | "en_revision" | "resuelto" | "cerrado"
      metodo_pago:
        | "zelle"
        | "pago_movil"
        | "transferencia_bs"
        | "transferencia_usd"
        | "efectivo_usd"
        | "efectivo_bs"
        | "zinli"
        | "otro"
      prioridad_falencia: "baja" | "media" | "alta" | "critica"
      rol_usuario: "administrador" | "residente" | "conserje"
      tipo_acta:
        | "acta_asamblea"
        | "reglamento"
        | "presupuesto_aprobado"
        | "circular"
        | "factura"
        | "contrato"
        | "otro"
      tipo_documento:
        | "titulo_propiedad"
        | "cedula_identidad"
        | "rif"
        | "poder_notarial"
        | "otro"
      tipo_gasto: "ordinario" | "fondo_reserva" | "extraordinario"
      tipo_recibo_laboral:
        | "nomina_quincenal"
        | "nomina_mensual"
        | "utilidades"
        | "bono_vacacional"
        | "liquidacion"
        | "adelanto"
        | "otro"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      estado_apartamento: ["habitado", "desocupado", "en_venta", "en_alquiler"],
      estado_cuenta: ["activa", "suspendida", "pendiente_cambio_clave"],
      estado_falencia: [
        "reportada",
        "en_votacion",
        "aprobada",
        "en_progreso",
        "resuelta",
      ],
      estado_pago: ["pendiente", "aprobado", "rechazado"],
      estado_propuesta: ["activa", "archivada", "implementada"],
      estado_ticket: ["abierto", "en_revision", "resuelto", "cerrado"],
      metodo_pago: [
        "zelle",
        "pago_movil",
        "transferencia_bs",
        "transferencia_usd",
        "efectivo_usd",
        "efectivo_bs",
        "zinli",
        "otro",
      ],
      prioridad_falencia: ["baja", "media", "alta", "critica"],
      rol_usuario: ["administrador", "residente", "conserje"],
      tipo_acta: [
        "acta_asamblea",
        "reglamento",
        "presupuesto_aprobado",
        "circular",
        "factura",
        "contrato",
        "otro",
      ],
      tipo_documento: [
        "titulo_propiedad",
        "cedula_identidad",
        "rif",
        "poder_notarial",
        "otro",
      ],
      tipo_gasto: ["ordinario", "fondo_reserva", "extraordinario"],
      tipo_recibo_laboral: [
        "nomina_quincenal",
        "nomina_mensual",
        "utilidades",
        "bono_vacacional",
        "liquidacion",
        "adelanto",
        "otro",
      ],
    },
  },
} as const
