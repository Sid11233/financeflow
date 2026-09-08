-- Postgres has no `create type if not exists`, so each type is wrapped in
-- its own DO block that swallows only the "already exists" error. This
-- makes the file safe to paste more than once (e.g. into the Supabase SQL
-- Editor by accident) without failing on a type created by an earlier run.

do $$ begin
  create type public.user_role as enum (
    'owner',
    'member'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.request_status as enum (
    'draft',
    'sent',
    'partial',
    'complete',
    'overdue',
    'cancelled'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.required_document_status as enum (
    'pending',
    'received',
    'needs_review',
    'accepted',
    'rejected'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.document_review_status as enum (
    'unreviewed',
    'auto_accepted',
    'confirmed',
    'reassigned',
    'rejected'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.activity_actor_type as enum (
    'accountant',
    'client',
    'system'
  );
exception
  when duplicate_object then null;
end $$;
