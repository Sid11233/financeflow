/**
 * Hand-authored to mirror supabase/migrations/ exactly. If the schema
 * changes, update this file (or regenerate it with the Supabase CLI once a
 * live project exists):
 *   npx supabase gen types typescript --project-id <id> > src/lib/database.types.ts
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          owner_id: string;
          default_deadline_day: number;
          logo_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          owner_id: string;
          default_deadline_day?: number;
          logo_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          owner_id?: string;
          default_deadline_day?: number;
          logo_url?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          organization_id: string;
          full_name: string | null;
          role: Database['public']['Enums']['user_role'];
          created_at: string;
          digest_frequency: 'off' | 'daily' | 'weekly';
          last_digest_sent_at: string | null;
          is_staff: boolean;
        };
        Insert: {
          id: string;
          organization_id: string;
          full_name?: string | null;
          role?: Database['public']['Enums']['user_role'];
          created_at?: string;
          digest_frequency?: 'off' | 'daily' | 'weekly';
          last_digest_sent_at?: string | null;
          is_staff?: boolean;
        };
        Update: {
          id?: string;
          organization_id?: string;
          full_name?: string | null;
          role?: Database['public']['Enums']['user_role'];
          created_at?: string;
          digest_frequency?: 'off' | 'daily' | 'weekly';
          last_digest_sent_at?: string | null;
          is_staff?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'profiles_organization_id_fkey';
            columns: ['organization_id'];
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      clients: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          email: string | null;
          phone: string | null;
          notes: string | null;
          is_archived: boolean;
          created_by: string | null;
          created_at: string;
          email_bounced_at: string | null;
          email_bounce_type: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          email?: string | null;
          phone?: string | null;
          notes?: string | null;
          is_archived?: boolean;
          created_by?: string | null;
          created_at?: string;
          email_bounced_at?: string | null;
          email_bounce_type?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          email?: string | null;
          phone?: string | null;
          notes?: string | null;
          is_archived?: boolean;
          created_by?: string | null;
          created_at?: string;
          email_bounced_at?: string | null;
          email_bounce_type?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'clients_organization_id_fkey';
            columns: ['organization_id'];
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'clients_created_by_fkey';
            columns: ['created_by'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      document_types: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          sort_order: number;
          is_archived: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          sort_order?: number;
          is_archived?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          sort_order?: number;
          is_archived?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'document_types_organization_id_fkey';
            columns: ['organization_id'];
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      requests: {
        Row: {
          id: string;
          organization_id: string;
          client_id: string;
          period_start: string;
          period_label: string;
          status: Database['public']['Enums']['request_status'];
          deadline: string | null;
          completion_percent: number;
          created_by: string;
          created_at: string;
          sent_at: string | null;
          completed_at: string | null;
          client_submitted_at: string | null;
          reminders_paused_at: string | null;
          reminder_ladder_override: Json | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          client_id: string;
          period_start: string;
          period_label: string;
          status?: Database['public']['Enums']['request_status'];
          deadline?: string | null;
          completion_percent?: number;
          created_by: string;
          created_at?: string;
          sent_at?: string | null;
          completed_at?: string | null;
          client_submitted_at?: string | null;
          reminders_paused_at?: string | null;
          reminder_ladder_override?: Json | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          client_id?: string;
          period_start?: string;
          period_label?: string;
          status?: Database['public']['Enums']['request_status'];
          deadline?: string | null;
          completion_percent?: number;
          created_by?: string;
          created_at?: string;
          sent_at?: string | null;
          completed_at?: string | null;
          client_submitted_at?: string | null;
          reminders_paused_at?: string | null;
          reminder_ladder_override?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: 'requests_organization_id_fkey';
            columns: ['organization_id'];
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'requests_client_id_fkey';
            columns: ['client_id'];
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'requests_created_by_fkey';
            columns: ['created_by'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      required_documents: {
        Row: {
          id: string;
          organization_id: string;
          request_id: string;
          document_type_id: string | null;
          custom_name: string | null;
          status: Database['public']['Enums']['required_document_status'];
          sort_order: number;
          is_optional: boolean;
          created_at: string;
          waived_reason: string | null;
          waived_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          request_id: string;
          document_type_id?: string | null;
          custom_name?: string | null;
          status?: Database['public']['Enums']['required_document_status'];
          sort_order?: number;
          is_optional?: boolean;
          created_at?: string;
          waived_reason?: string | null;
          waived_at?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          request_id?: string;
          document_type_id?: string | null;
          custom_name?: string | null;
          status?: Database['public']['Enums']['required_document_status'];
          sort_order?: number;
          is_optional?: boolean;
          created_at?: string;
          waived_reason?: string | null;
          waived_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'required_documents_organization_id_fkey';
            columns: ['organization_id'];
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'required_documents_request_id_fkey';
            columns: ['request_id'];
            referencedRelation: 'requests';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'required_documents_document_type_id_fkey';
            columns: ['document_type_id'];
            referencedRelation: 'document_types';
            referencedColumns: ['id'];
          },
        ];
      };
      documents: {
        Row: {
          id: string;
          organization_id: string;
          request_id: string;
          required_document_id: string | null;
          storage_path: string;
          original_filename: string;
          mime_type: string;
          size_bytes: number;
          uploaded_at: string;
          uploader_ip: string | null;
          ai_classification: Json | null;
          ai_confidence: number | null;
          review_status: Database['public']['Enums']['document_review_status'];
          review_reason: string | null;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          request_id: string;
          required_document_id?: string | null;
          storage_path: string;
          original_filename: string;
          mime_type: string;
          size_bytes: number;
          uploaded_at?: string;
          uploader_ip?: string | null;
          ai_classification?: Json | null;
          ai_confidence?: number | null;
          review_status?: Database['public']['Enums']['document_review_status'];
          review_reason?: string | null;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          request_id?: string;
          required_document_id?: string | null;
          storage_path?: string;
          original_filename?: string;
          mime_type?: string;
          size_bytes?: number;
          uploaded_at?: string;
          uploader_ip?: string | null;
          ai_classification?: Json | null;
          ai_confidence?: number | null;
          review_status?: Database['public']['Enums']['document_review_status'];
          review_reason?: string | null;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'documents_organization_id_fkey';
            columns: ['organization_id'];
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'documents_request_id_fkey';
            columns: ['request_id'];
            referencedRelation: 'requests';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'documents_required_document_id_fkey';
            columns: ['required_document_id'];
            referencedRelation: 'required_documents';
            referencedColumns: ['id'];
          },
        ];
      };
      request_tokens: {
        Row: {
          id: string;
          organization_id: string;
          request_id: string;
          token_hash: string;
          expires_at: string;
          revoked_at: string | null;
          last_accessed_at: string | null;
          access_count: number;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          request_id: string;
          token_hash: string;
          expires_at: string;
          revoked_at?: string | null;
          last_accessed_at?: string | null;
          access_count?: number;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          request_id?: string;
          token_hash?: string;
          expires_at?: string;
          revoked_at?: string | null;
          last_accessed_at?: string | null;
          access_count?: number;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'request_tokens_organization_id_fkey';
            columns: ['organization_id'];
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'request_tokens_request_id_fkey';
            columns: ['request_id'];
            referencedRelation: 'requests';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'request_tokens_created_by_fkey';
            columns: ['created_by'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      reminders: {
        Row: {
          id: string;
          organization_id: string;
          request_id: string;
          channel: string;
          type: string;
          scheduled_for: string;
          sent_at: string | null;
          skipped_at: string | null;
          created_by: string | null;
          created_at: string;
          status: string;
          audience: string;
          reason: string | null;
          attempts: number;
          last_error: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          request_id: string;
          channel?: string;
          type?: string;
          scheduled_for: string;
          sent_at?: string | null;
          skipped_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          status?: string;
          audience?: string;
          reason?: string | null;
          attempts?: number;
          last_error?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          request_id?: string;
          channel?: string;
          type?: string;
          scheduled_for?: string;
          sent_at?: string | null;
          skipped_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          status?: string;
          audience?: string;
          reason?: string | null;
          attempts?: number;
          last_error?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'reminders_organization_id_fkey';
            columns: ['organization_id'];
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reminders_request_id_fkey';
            columns: ['request_id'];
            referencedRelation: 'requests';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reminders_created_by_fkey';
            columns: ['created_by'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      activity_log: {
        Row: {
          id: string;
          organization_id: string;
          request_id: string | null;
          client_id: string | null;
          actor_type: Database['public']['Enums']['activity_actor_type'];
          actor_id: string | null;
          event_type: string;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          request_id?: string | null;
          client_id?: string | null;
          actor_type: Database['public']['Enums']['activity_actor_type'];
          actor_id?: string | null;
          event_type: string;
          payload?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          request_id?: string | null;
          client_id?: string | null;
          actor_type?: Database['public']['Enums']['activity_actor_type'];
          actor_id?: string | null;
          event_type?: string;
          payload?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'activity_log_organization_id_fkey';
            columns: ['organization_id'];
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activity_log_request_id_fkey';
            columns: ['request_id'];
            referencedRelation: 'requests';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activity_log_client_id_fkey';
            columns: ['client_id'];
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
        ];
      };
      notifications: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string | null;
          type: string;
          title: string;
          body: string | null;
          link_path: string | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id?: string | null;
          type: string;
          title: string;
          body?: string | null;
          link_path?: string | null;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string | null;
          type?: string;
          title?: string;
          body?: string | null;
          link_path?: string | null;
          read_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notifications_organization_id_fkey';
            columns: ['organization_id'];
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      product_events: {
        Row: {
          id: string;
          organization_id: string;
          actor_id: string | null;
          event_type: string;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          actor_id?: string | null;
          event_type: string;
          payload?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          actor_id?: string | null;
          event_type?: string;
          payload?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'product_events_organization_id_fkey';
            columns: ['organization_id'];
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'product_events_actor_id_fkey';
            columns: ['actor_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      messages: {
        Row: {
          id: string;
          organization_id: string;
          request_id: string | null;
          reminder_id: string | null;
          template: string;
          recipient: string;
          subject: string;
          resend_message_id: string | null;
          status: string;
          error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          request_id?: string | null;
          reminder_id?: string | null;
          template: string;
          recipient: string;
          subject: string;
          resend_message_id?: string | null;
          status?: string;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          request_id?: string | null;
          reminder_id?: string | null;
          template?: string;
          recipient?: string;
          subject?: string;
          resend_message_id?: string | null;
          status?: string;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'messages_organization_id_fkey';
            columns: ['organization_id'];
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_request_id_fkey';
            columns: ['request_id'];
            referencedRelation: 'requests';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_reminder_id_fkey';
            columns: ['reminder_id'];
            referencedRelation: 'reminders';
            referencedColumns: ['id'];
          },
        ];
      };
      client_document_defaults: {
        Row: {
          organization_id: string;
          client_id: string;
          document_type_id: string;
          created_at: string;
        };
        Insert: {
          organization_id: string;
          client_id: string;
          document_type_id: string;
          created_at?: string;
        };
        Update: {
          organization_id?: string;
          client_id?: string;
          document_type_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'client_document_defaults_organization_id_fkey';
            columns: ['organization_id'];
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'client_document_defaults_client_id_fkey';
            columns: ['client_id'];
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'client_document_defaults_document_type_id_fkey';
            columns: ['document_type_id'];
            referencedRelation: 'document_types';
            referencedColumns: ['id'];
          },
        ];
      };
      classification_jobs: {
        Row: {
          id: string;
          organization_id: string;
          document_id: string;
          status: 'pending' | 'processing' | 'done' | 'dead_letter';
          attempts: number;
          next_attempt_at: string;
          last_error: string | null;
          created_at: string;
          processed_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          document_id: string;
          status?: 'pending' | 'processing' | 'done' | 'dead_letter';
          attempts?: number;
          next_attempt_at?: string;
          last_error?: string | null;
          created_at?: string;
          processed_at?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          document_id?: string;
          status?: 'pending' | 'processing' | 'done' | 'dead_letter';
          attempts?: number;
          next_attempt_at?: string;
          last_error?: string | null;
          created_at?: string;
          processed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'classification_queue_organization_id_fkey';
            columns: ['organization_id'];
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'classification_queue_document_id_fkey';
            columns: ['document_id'];
            referencedRelation: 'documents';
            referencedColumns: ['id'];
          },
        ];
      };
      classification_settings: {
        Row: {
          organization_id: string;
          auto_accept_confidence: number;
          reassign_confidence: number;
          pdf_page_limit: number;
          model_name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          auto_accept_confidence?: number;
          reassign_confidence?: number;
          pdf_page_limit?: number;
          model_name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          auto_accept_confidence?: number;
          reassign_confidence?: number;
          pdf_page_limit?: number;
          model_name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'classification_settings_organization_id_fkey';
            columns: ['organization_id'];
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      reminder_schedules: {
        Row: {
          organization_id: string;
          ladder: Json;
          send_hour: number;
          timezone: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          ladder?: Json;
          send_hour?: number;
          timezone?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organization_id?: string;
          ladder?: Json;
          send_hour?: number;
          timezone?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'reminder_schedules_organization_id_fkey';
            columns: ['organization_id'];
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      classification_type_mappings: {
        Row: {
          organization_id: string;
          ai_document_type: string;
          document_type_id: string;
          created_at: string;
        };
        Insert: {
          organization_id: string;
          ai_document_type: string;
          document_type_id: string;
          created_at?: string;
        };
        Update: {
          organization_id?: string;
          ai_document_type?: string;
          document_type_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'classification_type_mappings_organization_id_fkey';
            columns: ['organization_id'];
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'classification_type_mappings_document_type_id_fkey';
            columns: ['document_type_id'];
            referencedRelation: 'document_types';
            referencedColumns: ['id'];
          },
        ];
      };
      // Internal to the portal Edge Functions (service_role only, no RLS
      // policies grant any access) — not queried from the app, listed here
      // only so this file stays an accurate mirror of the schema.
      portal_rate_limit_events: {
        Row: {
          id: number;
          bucket_key: string;
          created_at: string;
        };
        Insert: {
          id?: number;
          bucket_key: string;
          created_at?: string;
        };
        Update: {
          id?: number;
          bucket_key?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      invites: {
        Row: {
          id: string;
          organization_id: string;
          email: string;
          role: Database['public']['Enums']['user_role'];
          token_hash: string;
          invited_by: string | null;
          expires_at: string;
          revoked_at: string | null;
          accepted_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          email: string;
          role?: Database['public']['Enums']['user_role'];
          token_hash: string;
          invited_by?: string | null;
          expires_at: string;
          revoked_at?: string | null;
          accepted_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          email?: string;
          role?: Database['public']['Enums']['user_role'];
          token_hash?: string;
          invited_by?: string | null;
          expires_at?: string;
          revoked_at?: string | null;
          accepted_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'invites_organization_id_fkey';
            columns: ['organization_id'];
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invites_invited_by_fkey';
            columns: ['invited_by'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      client_overview: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          email: string | null;
          phone: string | null;
          notes: string | null;
          is_archived: boolean;
          created_at: string;
          active_request_count: number;
          last_request_status: Database['public']['Enums']['request_status'] | null;
          last_request_period_label: string | null;
          email_bounced_at: string | null;
          email_bounce_type: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'clients_organization_id_fkey';
            columns: ['organization_id'];
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      request_overview: {
        Row: {
          id: string;
          organization_id: string;
          client_id: string;
          client_name: string;
          period_start: string;
          period_label: string;
          status: Database['public']['Enums']['request_status'];
          deadline: string | null;
          created_by: string;
          created_at: string;
          sent_at: string | null;
          completed_at: string | null;
          required_count: number;
          resolved_count: number;
          missing_document_count: number;
          missing_document_labels: string[];
          waived_count: number;
          needs_review_count: number;
          completion_percentage: number;
          status_rank: number;
          days_until_deadline: number | null;
          last_reminder_sent_at: string | null;
          next_reminder_scheduled_for: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'requests_organization_id_fkey';
            columns: ['organization_id'];
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'requests_client_id_fkey';
            columns: ['client_id'];
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
        ];
      };
      analytics_requests: {
        Row: {
          organization_id: string;
          organization_name: string;
          request_id: string;
          client_id: string;
          client_name: string;
          status: Database['public']['Enums']['request_status'];
          sent_at: string | null;
          completed_at: string | null;
          deadline: string | null;
          client_submitted_at: string | null;
          sent_month: string | null;
          days_to_complete: number | null;
          completed_before_deadline: boolean | null;
          reminders_sent_count: number;
          last_reminder_type_before_final_upload: string | null;
          first_opened_at: string | null;
          first_upload_at: string | null;
        };
        Relationships: [];
      };
      analytics_classification_outcomes: {
        Row: {
          organization_id: string;
          organization_name: string;
          document_id: string;
          review_status: Database['public']['Enums']['document_review_status'];
          review_reason: string | null;
          ai_confidence: number | null;
          uploaded_at: string;
        };
        Relationships: [];
      };
      analytics_reassignments: {
        Row: {
          organization_id: string;
          organization_name: string;
          created_at: string;
          from_label: string;
          to_label: string;
          confidence: number | null;
        };
        Relationships: [];
      };
      analytics_review_actions: {
        Row: {
          organization_id: string;
          organization_name: string;
          actor_id: string | null;
          actor_name: string | null;
          created_at: string;
        };
        Relationships: [];
      };
    };
    Functions: {
      auth_org_id: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      auth_is_owner: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      list_org_members: {
        Args: Record<PropertyKey, never>;
        Returns: {
          id: string;
          email: string;
          full_name: string | null;
          role: Database['public']['Enums']['user_role'];
          created_at: string;
        }[];
      };
      recompute_request_status: {
        Args: { p_request_id: string };
        Returns: undefined;
      };
      recompute_all_open_requests: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      create_request: {
        Args: {
          p_client_id: string;
          p_period_start: string;
          p_period_label: string;
          p_deadline: string;
          p_status: Database['public']['Enums']['request_status'];
          p_checklist: Json;
          p_token_hash?: string | null;
        };
        Returns: Json;
      };
      materialize_reminder_ladder: {
        Args: { p_request_id: string };
        Returns: undefined;
      };
      claim_due_reminders: {
        Args: { p_limit?: number };
        Returns: Database['public']['Tables']['reminders']['Row'][];
      };
      client_has_reminder_today: {
        Args: { p_client_id: string; p_organization_id: string };
        Returns: boolean;
      };
      push_back_pending_reminders: {
        Args: { p_request_id: string; p_min_gap?: string };
        Returns: undefined;
      };
      check_and_record_rate_limit: {
        Args: { p_bucket_key: string; p_limit: number; p_window_seconds: number };
        Returns: boolean;
      };
      record_token_access: {
        Args: { p_token_id: string };
        Returns: undefined;
      };
      revoke_tokens_for_finished_requests: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      claim_classification_job: {
        Args: { p_job_id: string };
        Returns: Database['public']['Tables']['classification_jobs']['Row'];
      };
      find_due_classification_jobs: {
        Args: { p_limit?: number };
        Returns: string[];
      };
      accept_document: {
        Args: { p_document_id: string };
        Returns: undefined;
      };
      reassign_document: {
        Args: { p_document_id: string; p_target_required_document_id: string };
        Returns: undefined;
      };
      reject_document: {
        Args: { p_document_id: string; p_reason?: string | null };
        Returns: undefined;
      };
      waive_required_document: {
        Args: { p_required_document_id: string; p_reason?: string | null; p_document_id?: string | null };
        Returns: undefined;
      };
      extend_request_deadline: {
        Args: { p_request_id: string; p_new_deadline: string };
        Returns: undefined;
      };
      mark_request_complete: {
        Args: { p_request_id: string };
        Returns: undefined;
      };
      cancel_request: {
        Args: { p_request_id: string };
        Returns: undefined;
      };
      set_reminder_skipped: {
        Args: { p_reminder_id: string; p_skipped: boolean };
        Returns: undefined;
      };
      set_reminders_paused: {
        Args: { p_request_id: string; p_paused: boolean };
        Returns: undefined;
      };
    };
    Enums: {
      user_role: 'owner' | 'member';
      request_status: 'draft' | 'sent' | 'partial' | 'complete' | 'overdue' | 'cancelled';
      required_document_status: 'pending' | 'received' | 'needs_review' | 'accepted' | 'rejected' | 'waived';
      document_review_status:
        | 'unreviewed'
        | 'auto_accepted'
        | 'confirmed'
        | 'reassigned'
        | 'rejected';
      activity_actor_type: 'accountant' | 'client' | 'system';
    };
    CompositeTypes: Record<string, never>;
  };
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];

export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];

export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T];

export type Views<T extends keyof Database['public']['Views']> = Database['public']['Views'][T]['Row'];
