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
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          id: string
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      department_plan_comments: {
        Row: {
          author_id: string | null
          author_name: string | null
          content: string
          created_at: string
          id: string
          kind: string
          plan_id: string
        }
        Insert: {
          author_id?: string | null
          author_name?: string | null
          content: string
          created_at?: string
          id?: string
          kind?: string
          plan_id: string
        }
        Update: {
          author_id?: string | null
          author_name?: string | null
          content?: string
          created_at?: string
          id?: string
          kind?: string
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_plan_comments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "department_plan_stats"
            referencedColumns: ["plan_id"]
          },
          {
            foreignKeyName: "department_plan_comments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "department_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      department_plans: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          description: string | null
          direction_id: string
          id: string
          quarter_id: string
          status: Database["public"]["Enums"]["plan_status"]
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          direction_id: string
          id?: string
          quarter_id: string
          status?: Database["public"]["Enums"]["plan_status"]
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          direction_id?: string
          id?: string
          quarter_id?: string
          status?: Database["public"]["Enums"]["plan_status"]
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_plans_direction_id_fkey"
            columns: ["direction_id"]
            isOneToOne: false
            referencedRelation: "directions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_plans_quarter_id_fkey"
            columns: ["quarter_id"]
            isOneToOne: false
            referencedRelation: "quarters"
            referencedColumns: ["id"]
          },
        ]
      }
      directions: {
        Row: {
          color: string
          created_at: string
          created_by: string | null
          description: string | null
          head_user_id: string | null
          id: string
          name: string
          owner: string | null
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          head_user_id?: string | null
          id?: string
          name: string
          owner?: string | null
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          head_user_id?: string | null
          id?: string
          name?: string
          owner?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      kpi_comments: {
        Row: {
          author_id: string | null
          author_name: string | null
          content: string
          created_at: string
          id: string
          kpi_id: string
          mentioned_user_ids: string[]
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          author_name?: string | null
          content: string
          created_at?: string
          id?: string
          kpi_id: string
          mentioned_user_ids?: string[]
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          author_name?: string | null
          content?: string
          created_at?: string
          id?: string
          kpi_id?: string
          mentioned_user_ids?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpi_comments_kpi_id_fkey"
            columns: ["kpi_id"]
            isOneToOne: false
            referencedRelation: "kpis"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_progress_log: {
        Row: {
          author_id: string | null
          author_name: string | null
          created_at: string
          delta: number
          id: string
          kpi_id: string
          log_date: string
          note: string | null
        }
        Insert: {
          author_id?: string | null
          author_name?: string | null
          created_at?: string
          delta: number
          id?: string
          kpi_id: string
          log_date?: string
          note?: string | null
        }
        Update: {
          author_id?: string | null
          author_name?: string | null
          created_at?: string
          delta?: number
          id?: string
          kpi_id?: string
          log_date?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kpi_progress_log_kpi_id_fkey"
            columns: ["kpi_id"]
            isOneToOne: false
            referencedRelation: "kpis"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_tags: {
        Row: {
          created_at: string
          kpi_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          kpi_id: string
          tag_id: string
        }
        Update: {
          created_at?: string
          kpi_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpi_tags_kpi_id_fkey"
            columns: ["kpi_id"]
            isOneToOne: false
            referencedRelation: "kpis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_tasks: {
        Row: {
          contribution: number
          created_at: string
          id: string
          kpi_id: string
          task_id: string
        }
        Insert: {
          contribution?: number
          created_at?: string
          id?: string
          kpi_id: string
          task_id: string
        }
        Update: {
          contribution?: number
          created_at?: string
          id?: string
          kpi_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpi_tasks_kpi_id_fkey"
            columns: ["kpi_id"]
            isOneToOne: false
            referencedRelation: "kpis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_tasks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_units: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          symbol: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          symbol: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          symbol?: string
        }
        Relationships: []
      }
      kpis: {
        Row: {
          created_at: string
          created_by: string | null
          current_value: number
          deadline: string | null
          description: string | null
          direction_id: string | null
          id: string
          name: string
          owner: string | null
          owner_id: string | null
          quarter: string | null
          target_value: number
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_value?: number
          deadline?: string | null
          description?: string | null
          direction_id?: string | null
          id?: string
          name: string
          owner?: string | null
          owner_id?: string | null
          quarter?: string | null
          target_value?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_value?: number
          deadline?: string | null
          description?: string | null
          direction_id?: string | null
          id?: string
          name?: string
          owner?: string | null
          owner_id?: string | null
          quarter?: string | null
          target_value?: number
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpis_direction_id_fkey"
            columns: ["direction_id"]
            isOneToOne: false
            referencedRelation: "directions"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          body: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          actor_id?: string | null
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          created_by_user_id: string | null
          display_name: string | null
          email: string | null
          id: string
          is_active: boolean
          last_active_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by_user_id?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          last_active_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          last_active_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      quarters: {
        Row: {
          created_at: string
          created_by: string | null
          end_date: string | null
          id: string
          is_visible: boolean
          label: string
          quarter_no: number | null
          sort_key: string
          start_date: string | null
          status: Database["public"]["Enums"]["quarter_status"]
          year: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          is_visible?: boolean
          label: string
          quarter_no?: number | null
          sort_key?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["quarter_status"]
          year?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          is_visible?: boolean
          label?: string
          quarter_no?: number | null
          sort_key?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["quarter_status"]
          year?: number | null
        }
        Relationships: []
      }
      tags: {
        Row: {
          color: string
          created_at: string
          created_by: string | null
          id: string
          name: string
        }
        Insert: {
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
        }
        Update: {
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      task_history: {
        Row: {
          actor_id: string | null
          created_at: string
          description: string
          event_type: string
          id: string
          task_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          description: string
          event_type: string
          id?: string
          task_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          description?: string
          event_type?: string
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_history_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_tags: {
        Row: {
          created_at: string
          tag_id: string
          task_id: string
        }
        Insert: {
          created_at?: string
          tag_id: string
          task_id: string
        }
        Update: {
          created_at?: string
          tag_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_tags_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          archived: boolean
          asana_url: string | null
          assignee: string | null
          assignee_id: string | null
          created_at: string
          created_by: string | null
          customer: string | null
          deadline: string | null
          description: string | null
          direction_id: string | null
          id: string
          notes: string | null
          plan_id: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          quarter: string
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          archived?: boolean
          asana_url?: string | null
          assignee?: string | null
          assignee_id?: string | null
          created_at?: string
          created_by?: string | null
          customer?: string | null
          deadline?: string | null
          description?: string | null
          direction_id?: string | null
          id?: string
          notes?: string | null
          plan_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          quarter: string
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          archived?: boolean
          asana_url?: string | null
          assignee?: string | null
          assignee_id?: string | null
          created_at?: string
          created_by?: string | null
          customer?: string | null
          deadline?: string | null
          description?: string | null
          direction_id?: string | null
          id?: string
          notes?: string | null
          plan_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          quarter?: string
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_direction_id_fkey"
            columns: ["direction_id"]
            isOneToOne: false
            referencedRelation: "directions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "department_plan_stats"
            referencedColumns: ["plan_id"]
          },
          {
            foreignKeyName: "tasks_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "department_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      user_department_access: {
        Row: {
          access_level: Database["public"]["Enums"]["access_level"]
          direction_id: string
          granted_at: string
          granted_by: string | null
          user_id: string
        }
        Insert: {
          access_level?: Database["public"]["Enums"]["access_level"]
          direction_id: string
          granted_at?: string
          granted_by?: string | null
          user_id: string
        }
        Update: {
          access_level?: Database["public"]["Enums"]["access_level"]
          direction_id?: string
          granted_at?: string
          granted_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_department_access_direction_id_fkey"
            columns: ["direction_id"]
            isOneToOne: false
            referencedRelation: "directions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      department_plan_stats: {
        Row: {
          at_risk_tasks: number | null
          blocked_tasks: number | null
          completed_tasks: number | null
          direction_id: string | null
          in_progress_tasks: number | null
          last_task_update: string | null
          overdue_tasks: number | null
          plan_id: string | null
          progress_pct: number | null
          quarter_id: string | null
          total_tasks: number | null
        }
        Relationships: [
          {
            foreignKeyName: "department_plans_direction_id_fkey"
            columns: ["direction_id"]
            isOneToOne: false
            referencedRelation: "directions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_plans_quarter_id_fkey"
            columns: ["quarter_id"]
            isOneToOne: false
            referencedRelation: "quarters"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      has_dept_access: {
        Args: {
          _direction: string
          _min_level: Database["public"]["Enums"]["access_level"]
          _user: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      recompute_kpi_value: { Args: { _kpi_id: string }; Returns: undefined }
      user_dept_access_level: {
        Args: { _direction: string; _user: string }
        Returns: Database["public"]["Enums"]["access_level"]
      }
    }
    Enums: {
      access_level: "view" | "edit" | "full"
      app_role:
        | "superadmin"
        | "admin"
        | "user"
        | "department_head"
        | "manager"
        | "viewer"
      plan_status:
        | "draft"
        | "on_review"
        | "changes_requested"
        | "approved"
        | "in_progress"
        | "at_risk"
        | "blocked"
        | "completed"
        | "archived"
      quarter_status: "planned" | "active" | "closed" | "archived"
      task_priority: "low" | "medium" | "high" | "critical"
      task_status:
        | "planned"
        | "in_progress"
        | "at_risk"
        | "blocked"
        | "completed"
        | "backlog"
        | "in_review"
        | "cancelled"
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
      access_level: ["view", "edit", "full"],
      app_role: [
        "superadmin",
        "admin",
        "user",
        "department_head",
        "manager",
        "viewer",
      ],
      plan_status: [
        "draft",
        "on_review",
        "changes_requested",
        "approved",
        "in_progress",
        "at_risk",
        "blocked",
        "completed",
        "archived",
      ],
      quarter_status: ["planned", "active", "closed", "archived"],
      task_priority: ["low", "medium", "high", "critical"],
      task_status: [
        "planned",
        "in_progress",
        "at_risk",
        "blocked",
        "completed",
        "backlog",
        "in_review",
        "cancelled",
      ],
    },
  },
} as const
