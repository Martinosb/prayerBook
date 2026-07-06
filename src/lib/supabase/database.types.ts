// Hand-written to mirror supabase/migrations/2026070*_*.sql in
// Connexional-Prayer-Board (see docs/PORTAL_SPEC.md §2). Keep in sync with
// that schema — regenerate by hand if a new migration touches portal_* tables.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      portal_profiles: {
        Row: {
          id: string;
          username: string;
          email: string;
          phone: string | null;
          sms_opt_in: boolean;
          timezone: string;
          last_ai_request_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username: string;
          email: string;
          phone?: string | null;
          sms_opt_in?: boolean;
          timezone?: string;
          last_ai_request_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["portal_profiles"]["Insert"]>;
        Relationships: [];
      };
      portal_categories: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          color: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          description?: string | null;
          color?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["portal_categories"]["Insert"]>;
        Relationships: [];
      };
      portal_prayer_requests: {
        Row: {
          id: string;
          user_id: string;
          category_id: string;
          title: string;
          details: string | null;
          status: "active" | "answered" | "archived";
          answered_at: string | null;
          voice_note_path: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          category_id: string;
          title: string;
          details?: string | null;
          status?: "active" | "answered" | "archived";
          answered_at?: string | null;
          voice_note_path?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["portal_prayer_requests"]["Insert"]>;
        Relationships: [];
      };
      portal_scriptures: {
        Row: {
          id: string;
          user_id: string;
          request_id: string;
          content: string;
          reference: string | null;
          source: "manual" | "ai";
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          request_id: string;
          content: string;
          reference?: string | null;
          source?: "manual" | "ai";
          position?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["portal_scriptures"]["Insert"]>;
        Relationships: [];
      };
      portal_prayer_logs: {
        Row: {
          id: string;
          user_id: string;
          request_id: string;
          prayed_on: string;
          prayed_at: string | null;
          duration_minutes: number | null;
          note: string | null;
          voice_note_path: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          request_id: string;
          prayed_on?: string;
          prayed_at?: string | null;
          duration_minutes?: number | null;
          note?: string | null;
          voice_note_path?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["portal_prayer_logs"]["Insert"]>;
        Relationships: [];
      };
      portal_prayer_plans: {
        Row: {
          id: string;
          user_id: string;
          request_id: string | null;
          category_id: string | null;
          title: string;
          frequency: "daily" | "weekly";
          days_of_week: number[] | null;
          times_per_period: number;
          window_start: string | null;
          window_end: string | null;
          start_date: string;
          end_date: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          request_id?: string | null;
          category_id?: string | null;
          title: string;
          frequency: "daily" | "weekly";
          days_of_week?: number[] | null;
          times_per_period?: number;
          window_start?: string | null;
          window_end?: string | null;
          start_date?: string;
          end_date?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["portal_prayer_plans"]["Insert"]>;
        Relationships: [];
      };
      portal_reminders: {
        Row: {
          id: string;
          user_id: string;
          request_id: string | null;
          label: string;
          remind_time: string;
          days_of_week: number[];
          lead_minutes: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          request_id?: string | null;
          label: string;
          remind_time: string;
          days_of_week?: number[];
          lead_minutes?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["portal_reminders"]["Insert"]>;
        Relationships: [];
      };
      portal_reminder_sends: {
        Row: {
          id: string;
          reminder_id: string;
          user_id: string;
          send_type: "approaching" | "due";
          occurrence_at: string;
          status: "sent" | "failed";
          provider_message_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          reminder_id: string;
          user_id: string;
          send_type: "approaching" | "due";
          occurrence_at: string;
          status?: "sent" | "failed";
          provider_message_id?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["portal_reminder_sends"]["Insert"]>;
        Relationships: [];
      };
      portal_push_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent: string | null;
          created_at: string;
          last_used_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent?: string | null;
          created_at?: string;
          last_used_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["portal_push_subscriptions"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
