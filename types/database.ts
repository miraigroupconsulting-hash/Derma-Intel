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
      actualizaciones_medicas: {
        Row: {
          created_at: string
          fecha: string
          fuente: string
          guardada: boolean
          id: string
          leida: boolean
          medico_id: string
          resumen: string
          titulo: string
          topics: string[] | null
          url_original: string
        }
        Insert: {
          created_at?: string
          fecha: string
          fuente: string
          guardada?: boolean
          id?: string
          leida?: boolean
          medico_id: string
          resumen: string
          titulo: string
          topics?: string[] | null
          url_original: string
        }
        Update: {
          created_at?: string
          fecha?: string
          fuente?: string
          guardada?: boolean
          id?: string
          leida?: boolean
          medico_id?: string
          resumen?: string
          titulo?: string
          topics?: string[] | null
          url_original?: string
        }
        Relationships: [
          {
            foreignKeyName: "actualizaciones_medicas_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      base_conocimiento: {
        Row: {
          created_at: string
          fecha_subida: string
          id: string
          indexed_at: string | null
          medico_id: string
          num_paginas: number | null
          resumen: string | null
          storage_path: string
          tipo: Database["public"]["Enums"]["doc_tipo"]
          titulo: string
        }
        Insert: {
          created_at?: string
          fecha_subida?: string
          id?: string
          indexed_at?: string | null
          medico_id: string
          num_paginas?: number | null
          resumen?: string | null
          storage_path: string
          tipo: Database["public"]["Enums"]["doc_tipo"]
          titulo: string
        }
        Update: {
          created_at?: string
          fecha_subida?: string
          id?: string
          indexed_at?: string | null
          medico_id?: string
          num_paginas?: number | null
          resumen?: string | null
          storage_path?: string
          tipo?: Database["public"]["Enums"]["doc_tipo"]
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "base_conocimiento_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      base_conocimiento_chunks: {
        Row: {
          chunk_index: number
          contenido: string
          created_at: string
          documento_id: string
          embedding: string | null
          id: string
          medico_id: string
          pagina: number | null
        }
        Insert: {
          chunk_index: number
          contenido: string
          created_at?: string
          documento_id: string
          embedding?: string | null
          id?: string
          medico_id: string
          pagina?: number | null
        }
        Update: {
          chunk_index?: number
          contenido?: string
          created_at?: string
          documento_id?: string
          embedding?: string | null
          id?: string
          medico_id?: string
          pagina?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "base_conocimiento_chunks_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "base_conocimiento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "base_conocimiento_chunks_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      consultas: {
        Row: {
          anamnesis: string | null
          audio_path: string | null
          created_at: string
          diagnostico_diferencial: string | null
          estado: Database["public"]["Enums"]["consulta_estado"]
          examen_fisico: string | null
          fecha: string
          id: string
          medico_id: string
          motivo: string | null
          notas_ia: Json | null
          paciente_id: string
          plan_terapeutico: string | null
          updated_at: string
        }
        Insert: {
          anamnesis?: string | null
          audio_path?: string | null
          created_at?: string
          diagnostico_diferencial?: string | null
          estado?: Database["public"]["Enums"]["consulta_estado"]
          examen_fisico?: string | null
          fecha?: string
          id?: string
          medico_id: string
          motivo?: string | null
          notas_ia?: Json | null
          paciente_id: string
          plan_terapeutico?: string | null
          updated_at?: string
        }
        Update: {
          anamnesis?: string | null
          audio_path?: string | null
          created_at?: string
          diagnostico_diferencial?: string | null
          estado?: Database["public"]["Enums"]["consulta_estado"]
          examen_fisico?: string | null
          fecha?: string
          id?: string
          medico_id?: string
          motivo?: string | null
          notas_ia?: Json | null
          paciente_id?: string
          plan_terapeutico?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "consultas_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultas_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      fotos: {
        Row: {
          anonimizada_storage_path: string | null
          consulta_id: string | null
          created_at: string
          fecha: string
          id: string
          medico_id: string
          notas: string | null
          paciente_id: string
          storage_path: string
          tipo: Database["public"]["Enums"]["foto_tipo"]
          zona_anatomica: string | null
        }
        Insert: {
          anonimizada_storage_path?: string | null
          consulta_id?: string | null
          created_at?: string
          fecha?: string
          id?: string
          medico_id: string
          notas?: string | null
          paciente_id: string
          storage_path: string
          tipo: Database["public"]["Enums"]["foto_tipo"]
          zona_anatomica?: string | null
        }
        Update: {
          anonimizada_storage_path?: string | null
          consulta_id?: string | null
          created_at?: string
          fecha?: string
          id?: string
          medico_id?: string
          notas?: string | null
          paciente_id?: string
          storage_path?: string
          tipo?: Database["public"]["Enums"]["foto_tipo"]
          zona_anatomica?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fotos_consulta_id_fkey"
            columns: ["consulta_id"]
            isOneToOne: false
            referencedRelation: "consultas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fotos_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fotos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      medicos: {
        Row: {
          apellido: string | null
          cedula_profesional: string | null
          created_at: string
          direccion: string | null
          email: string
          especialidad: string | null
          firma_digital_path: string | null
          id: string
          logo_storage_path: string | null
          nombre: string | null
          onboarding_completed: boolean
          pais_cedula: string | null
          plantilla_recipe: Json | null
          telefono: string | null
          tier_suscripcion: string
          updated_at: string
        }
        Insert: {
          apellido?: string | null
          cedula_profesional?: string | null
          created_at?: string
          direccion?: string | null
          email: string
          especialidad?: string | null
          firma_digital_path?: string | null
          id: string
          logo_storage_path?: string | null
          nombre?: string | null
          onboarding_completed?: boolean
          pais_cedula?: string | null
          plantilla_recipe?: Json | null
          telefono?: string | null
          tier_suscripcion?: string
          updated_at?: string
        }
        Update: {
          apellido?: string | null
          cedula_profesional?: string | null
          created_at?: string
          direccion?: string | null
          email?: string
          especialidad?: string | null
          firma_digital_path?: string | null
          id?: string
          logo_storage_path?: string | null
          nombre?: string | null
          onboarding_completed?: boolean
          pais_cedula?: string | null
          plantilla_recipe?: Json | null
          telefono?: string | null
          tier_suscripcion?: string
          updated_at?: string
        }
        Relationships: []
      }
      pacientes: {
        Row: {
          alergias: string | null
          antecedentes: string | null
          apellido: string
          archivado: boolean
          cedula: string | null
          created_at: string
          email: string | null
          fecha_nacimiento: string | null
          id: string
          medicacion_actual: string | null
          medico_id: string
          nombre: string
          notas: string | null
          sexo: string | null
          telefono: string | null
          tipo_piel_fitzpatrick: number | null
          updated_at: string
        }
        Insert: {
          alergias?: string | null
          antecedentes?: string | null
          apellido: string
          archivado?: boolean
          cedula?: string | null
          created_at?: string
          email?: string | null
          fecha_nacimiento?: string | null
          id?: string
          medicacion_actual?: string | null
          medico_id: string
          nombre: string
          notas?: string | null
          sexo?: string | null
          telefono?: string | null
          tipo_piel_fitzpatrick?: number | null
          updated_at?: string
        }
        Update: {
          alergias?: string | null
          antecedentes?: string | null
          apellido?: string
          archivado?: boolean
          cedula?: string | null
          created_at?: string
          email?: string | null
          fecha_nacimiento?: string | null
          id?: string
          medicacion_actual?: string | null
          medico_id?: string
          nombre?: string
          notas?: string | null
          sexo?: string | null
          telefono?: string | null
          tipo_piel_fitzpatrick?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pacientes_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          consulta_id: string
          created_at: string
          fecha: string
          firmado: boolean
          firmado_at: string | null
          id: string
          indicaciones_paciente: string | null
          medicamentos: Json
          medico_id: string
          paciente_id: string
          pdf_storage_path: string | null
          revisiones: Json
          updated_at: string
        }
        Insert: {
          consulta_id: string
          created_at?: string
          fecha?: string
          firmado?: boolean
          firmado_at?: string | null
          id?: string
          indicaciones_paciente?: string | null
          medicamentos: Json
          medico_id: string
          paciente_id: string
          pdf_storage_path?: string | null
          revisiones?: Json
          updated_at?: string
        }
        Update: {
          consulta_id?: string
          created_at?: string
          fecha?: string
          firmado?: boolean
          firmado_at?: string | null
          id?: string
          indicaciones_paciente?: string | null
          medicamentos?: Json
          medico_id?: string
          paciente_id?: string
          pdf_storage_path?: string | null
          revisiones?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipes_consulta_id_fkey"
            columns: ["consulta_id"]
            isOneToOne: false
            referencedRelation: "consultas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      recordatorios: {
        Row: {
          completado_at: string | null
          consulta_id: string | null
          created_at: string
          estado: Database["public"]["Enums"]["recordatorio_estado"]
          fecha_objetivo: string
          id: string
          medico_id: string
          mensaje: string | null
          paciente_id: string
          tipo: Database["public"]["Enums"]["recordatorio_tipo"]
        }
        Insert: {
          completado_at?: string | null
          consulta_id?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["recordatorio_estado"]
          fecha_objetivo: string
          id?: string
          medico_id: string
          mensaje?: string | null
          paciente_id: string
          tipo: Database["public"]["Enums"]["recordatorio_tipo"]
        }
        Update: {
          completado_at?: string | null
          consulta_id?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["recordatorio_estado"]
          fecha_objetivo?: string
          id?: string
          medico_id?: string
          mensaje?: string | null
          paciente_id?: string
          tipo?: Database["public"]["Enums"]["recordatorio_tipo"]
        }
        Relationships: [
          {
            foreignKeyName: "recordatorios_consulta_id_fkey"
            columns: ["consulta_id"]
            isOneToOne: false
            referencedRelation: "consultas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recordatorios_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recordatorios_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      uso_ia: {
        Row: {
          consulta_id: string | null
          costo_usd: number
          estado: string
          fecha: string
          id: string
          latency_ms: number | null
          medico_id: string
          modelo: string
          modo: Database["public"]["Enums"]["ia_modo"]
          tokens_input: number
          tokens_output: number
        }
        Insert: {
          consulta_id?: string | null
          costo_usd: number
          estado?: string
          fecha?: string
          id?: string
          latency_ms?: number | null
          medico_id: string
          modelo: string
          modo: Database["public"]["Enums"]["ia_modo"]
          tokens_input: number
          tokens_output: number
        }
        Update: {
          consulta_id?: string | null
          costo_usd?: number
          estado?: string
          fecha?: string
          id?: string
          latency_ms?: number | null
          medico_id?: string
          modelo?: string
          modo?: Database["public"]["Enums"]["ia_modo"]
          tokens_input?: number
          tokens_output?: number
        }
        Relationships: [
          {
            foreignKeyName: "uso_ia_consulta_id_fkey"
            columns: ["consulta_id"]
            isOneToOne: false
            referencedRelation: "consultas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uso_ia_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      consulta_estado: "borrador" | "completada" | "archivada"
      doc_tipo: "paper" | "libro" | "guia" | "presentacion" | "nota"
      foto_tipo: "clinica" | "dermatoscopia"
      ia_modo:
        | "caso_clinico"
        | "express"
        | "bibliografia"
        | "histopatologia"
        | "terapeutica"
        | "docente"
      recordatorio_estado: "pendiente" | "completado" | "cancelado"
      recordatorio_tipo:
        | "control"
        | "seguimiento"
        | "biopsia_pendiente"
        | "tratamiento_finaliza"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      consulta_estado: ["borrador", "completada", "archivada"],
      doc_tipo: ["paper", "libro", "guia", "presentacion", "nota"],
      foto_tipo: ["clinica", "dermatoscopia"],
      ia_modo: [
        "caso_clinico",
        "express",
        "bibliografia",
        "histopatologia",
        "terapeutica",
        "docente",
      ],
      recordatorio_estado: ["pendiente", "completado", "cancelado"],
      recordatorio_tipo: [
        "control",
        "seguimiento",
        "biopsia_pendiente",
        "tratamiento_finaliza",
        "otro",
      ],
    },
  },
} as const
