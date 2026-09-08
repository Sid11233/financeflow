-- Backs the email layer: a log row for every send-email call (0033's
-- rewritten function is the only code that touches Resend), updated by
-- the Resend webhook as delivery events arrive, plus a bounce flag on
-- clients so a bad address surfaces in the UI instead of silently
-- swallowing every future send.
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- Both nullable and independent: a message can belong to neither (e.g.
  -- team_invite), either, or in principle both (a reminder email is tied
  -- to a request and, once sent, to the reminders row it came from).
  request_id uuid references public.requests (id) on delete set null,
  reminder_id uuid references public.reminders (id) on delete set null,
  template text not null,
  recipient text not null,
  subject text not null,
  resend_message_id text,
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'delivered', 'bounced', 'complained', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists messages_organization_id_idx on public.messages (organization_id);
create index if not exists messages_request_id_idx on public.messages (request_id);
create index if not exists messages_reminder_id_idx on public.messages (reminder_id);
-- The Resend webhook looks up a message by resend_message_id on every
-- delivery event; this is the only lookup path it has.
create unique index if not exists messages_resend_message_id_idx on public.messages (resend_message_id) where resend_message_id is not null;

comment on table public.messages is
  'One row per send-email call (see supabase/functions/send-email). status starts ''queued''/''sent'' and is advanced to ''delivered''/''bounced''/''complained'' by the Resend webhook (supabase/functions/resend-webhook) matching on resend_message_id. Written only by send-email using its own service-role client, regardless of which auth mode the caller used to reach it — see the RLS below.';

alter table public.messages enable row level security;

-- Read-only for staff: lets a future "sent emails" view exist without any
-- new capability, but nothing here is meant to be written by an ordinary
-- authenticated session — see the revoke below.
drop policy if exists "org isolation select" on public.messages;
create policy "org isolation select" on public.messages
  for select
  to authenticated
  using (organization_id = public.auth_org_id());

revoke insert, update, delete on public.messages from authenticated;

-- Bounce/complaint tracking, set and cleared by the Resend webhook. A
-- nullable timestamp (same convention as completed_at/revoked_at
-- elsewhere): null means no known delivery problem right now. A
-- subsequent *delivered* event to the same address clears it, so a
-- transient issue (full mailbox, greylisting) doesn't leave a permanent
-- warning once mail is flowing again.
alter table public.clients
  add column if not exists email_bounced_at timestamptz,
  add column if not exists email_bounce_type text;

do $$ begin
  alter table public.clients
    add constraint clients_email_bounce_type_check
    check (email_bounce_type is null or email_bounce_type in ('bounced', 'complained'));
exception
  when duplicate_object then null;
end $$;

comment on column public.clients.email_bounced_at is
  'Set by the Resend webhook on a bounce/complaint event for this client''s email address; cleared on the next successful delivery to it. Surfaced as a warning on the client detail page.';
