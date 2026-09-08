-- Notification system: an in-app notifications table generated for six
-- system events, plus a per-user digest preference on profiles that feeds
-- the existing accountant_digest email template (send-digests Edge
-- Function, added in 0040, does the actual sending).
--
-- Every row is system-generated — there is no "compose a notification"
-- feature — so the table has no INSERT policy for authenticated at all.
-- The only way in is create_notification(), which is SECURITY DEFINER
-- specifically so it can be called from security-invoker functions like
-- recompute_request_status() (which may run as whatever authenticated
-- user's action triggered it, not necessarily the notification's
-- recipient) and from Edge Functions acting as service_role.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- null = organization-wide (visible to every member; read state is
  -- shared across all of them, since there's nowhere per-user to store
  -- it for a single shared row). Every generator this app currently has
  -- targets a specific user (the request's created_by), so this is
  -- schema support for a case nothing produces yet.
  user_id uuid references public.profiles (id) on delete cascade,
  type text not null check (type in (
    'request_submitted',
    'documents_need_review',
    'request_overdue',
    'email_bounced',
    'classification_failed',
    'link_expired'
  )),
  title text not null,
  body text,
  link_path text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_org_user_created_idx
  on public.notifications (organization_id, user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "read own and org-wide notifications" on public.notifications;
create policy "read own and org-wide notifications" on public.notifications
  for select
  to authenticated
  using (organization_id = public.auth_org_id() and (user_id is null or user_id = auth.uid()));

-- Only read_at is ever meant to change from the client (marking read /
-- mark-all-as-read); there's no column-level enforcement of that here,
-- same trust-boundary as the rest of this app's client-writable tables.
drop policy if exists "mark own and org-wide notifications read" on public.notifications;
create policy "mark own and org-wide notifications read" on public.notifications
  for update
  to authenticated
  using (organization_id = public.auth_org_id() and (user_id is null or user_id = auth.uid()))
  with check (organization_id = public.auth_org_id() and (user_id is null or user_id = auth.uid()));

comment on table public.notifications is
  'System-generated in-app notifications. Append-only from the client''s perspective (no insert policy) — rows are created only via create_notification(), and the client may only ever flip read_at.';

create or replace function public.create_notification(
  p_organization_id uuid,
  p_type text,
  p_title text,
  p_body text default null,
  p_link_path text default null,
  p_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  insert into public.notifications (organization_id, user_id, type, title, body, link_path)
  values (p_organization_id, p_user_id, p_type, p_title, p_body, p_link_path)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.create_notification(uuid, text, text, text, text, uuid) from public;
grant execute on function public.create_notification(uuid, text, text, text, text, uuid) to authenticated, service_role;

comment on function public.create_notification is
  'The only way to insert a notification. SECURITY DEFINER so it works regardless of caller role — security-invoker functions like recompute_request_status() may run as the authenticated user whose action triggered them, not the notification''s recipient.';

alter publication supabase_realtime add table public.notifications;

-- ============================================================
-- Digest preference: per-user, defaults to daily. "off" is what an
-- unsubscribe link sets — it silences the digest specifically, not all
-- mail (escalation/failure alerts and the reminder ladder are unaffected).
-- last_digest_sent_at tracks same-day/same-week idempotency for the
-- send-digests sweep (0040), which runs hourly.
-- ============================================================
alter table public.profiles
  add column if not exists digest_frequency text not null default 'daily'
    check (digest_frequency in ('off', 'daily', 'weekly')),
  add column if not exists last_digest_sent_at timestamptz;

comment on column public.profiles.digest_frequency is
  'off/daily/weekly preference for the accountant_digest email. Set to off by the digest''s unsubscribe link — never blocks escalation/failure alerts or the reminder ladder.';

-- ============================================================
-- client_overview: add the bounce columns already on clients (0032) so
-- the clients list can filter to "email issues" without a second query.
-- Appending columns at the end is safe for CREATE OR REPLACE VIEW; only
-- reordering/removing existing ones would require DROP VIEW first.
-- ============================================================
create or replace view public.client_overview
with (security_invoker = true)
as
select
  c.id,
  c.organization_id,
  c.name,
  c.email,
  c.phone,
  c.notes,
  c.is_archived,
  c.created_at,
  coalesce(active_stats.active_request_count, 0) as active_request_count,
  latest_request.status as last_request_status,
  latest_request.period_label as last_request_period_label,
  c.email_bounced_at,
  c.email_bounce_type
from public.clients c
left join lateral (
  select count(*) as active_request_count
  from public.requests r
  where r.client_id = c.id and r.status in ('draft', 'sent', 'partial', 'overdue')
) active_stats on true
left join lateral (
  select r.status, r.period_label
  from public.requests r
  where r.client_id = c.id
  order by r.period_start desc, r.created_at desc
  limit 1
) latest_request on true;

-- ============================================================
-- recompute_request_status(): now also raises a request_overdue
-- notification (to the request's owner) the moment a request transitions
-- INTO 'overdue'. Deliberately no email here — the reminder ladder's own
-- 'overdue'/'escalation' rungs already handle the immediate-email side of
-- an overdue request on their own schedule; this is purely the in-app
-- signal, same "notify, don't duplicate the ladder's alert" split used
-- for every other non-escalation trigger in this system.
-- ============================================================
create or replace function public.recompute_request_status(p_request_id uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_total int;
  v_resolved int;
  v_deadline date;
  v_sent_at timestamptz;
  v_current_status public.request_status;
  v_organization_id uuid;
  v_client_id uuid;
  v_created_by uuid;
  v_client_name text;
  v_period_label text;
  v_new_status public.request_status;
  v_percent smallint;
begin
  select deadline, sent_at, status, organization_id, client_id, created_by, period_label
    into v_deadline, v_sent_at, v_current_status, v_organization_id, v_client_id, v_created_by, v_period_label
    from public.requests
    where id = p_request_id
    for update;

  if not found then
    return;
  end if;

  select
    count(*) filter (where not is_optional),
    count(*) filter (where not is_optional and status in ('accepted', 'received', 'waived'))
  into v_total, v_resolved
  from public.required_documents
  where required_documents.request_id = p_request_id;

  v_percent := case
    when v_total = 0 then 100
    else round(v_resolved * 100.0 / v_total)::smallint
  end;

  v_new_status := case
    when v_current_status = 'cancelled' then 'cancelled'
    when v_sent_at is null then 'draft'
    when v_resolved = v_total then 'complete'
    when v_deadline is not null and v_deadline < current_date then 'overdue'
    when v_resolved > 0 then 'partial'
    else 'sent'
  end;

  update public.requests
  set
    completion_percent = v_percent,
    status = v_new_status,
    completed_at = case
      when v_new_status = 'complete' and completed_at is null then now()
      when v_new_status <> 'complete' then null
      else completed_at
    end
  where id = p_request_id;

  if v_new_status = 'complete' and v_current_status <> 'complete' then
    perform public.log_activity(v_organization_id, 'request_completed', 'system', p_request_id, v_client_id);
  end if;

  if v_new_status = 'overdue' and v_current_status <> 'overdue' then
    select name into v_client_name from public.clients where id = v_client_id;
    perform public.create_notification(
      v_organization_id,
      'request_overdue',
      coalesce(v_client_name, 'A request') || ' is overdue',
      coalesce(v_period_label, 'This request') || ' has passed its deadline.',
      '/requests/' || p_request_id,
      v_created_by
    );
  end if;
end;
$$;
