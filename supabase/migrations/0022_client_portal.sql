-- Displayed on the client portal (portal-resolve); no upload UI for it yet,
-- just the column so the portal can show it once one exists.
alter table public.organizations add column if not exists logo_url text;

-- Set by portal-submit when the client says they're done uploading —
-- distinct from requests.completion_percent (accountant-tracked, driven by
-- required_documents status) because a client can believe they're finished
-- while documents are still missing or under review. Surfacing that gap is
-- the point of tracking it separately.
alter table public.requests add column if not exists client_submitted_at timestamptz;

-- Rate limiting for the public portal functions. One row per allowed
-- request; bucket_key is prefixed ("token:<hash>" or "ip:<address>") so
-- both limit types share one table. No RLS policies are added below on
-- purpose: nothing here is organization-scoped (a bucket_key spans every
-- org), and no authenticated user — regardless of role — has any business
-- reading or writing it. RLS is still enabled so that stays true even if a
-- policy is mistakenly added to some *other* table by copy-paste; only
-- service_role (which bypasses RLS) ever touches this table.
create table if not exists public.portal_rate_limit_events (
  id bigint generated always as identity primary key,
  bucket_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists portal_rate_limit_events_bucket_created_idx
  on public.portal_rate_limit_events (bucket_key, created_at);

alter table public.portal_rate_limit_events enable row level security;

-- Atomically checks and records one rate-limited event: counting existing
-- events and inserting a new one must happen in the same statement/
-- transaction, or two concurrent requests could both pass the count check
-- before either insert becomes visible to the other.
create or replace function public.check_and_record_rate_limit(
  p_bucket_key text,
  p_limit int,
  p_window_seconds int
)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_count int;
begin
  select count(*) into v_count
  from public.portal_rate_limit_events
  where bucket_key = p_bucket_key
    and created_at > now() - make_interval(secs => p_window_seconds);

  if v_count >= p_limit then
    return false;
  end if;

  insert into public.portal_rate_limit_events (bucket_key) values (p_bucket_key);
  return true;
end;
$$;

revoke all on function public.check_and_record_rate_limit(text, int, int) from public;
grant execute on function public.check_and_record_rate_limit(text, int, int) to service_role;

-- Atomic increment for portal-resolve's access tracking — a read-modify-
-- write done as separate SELECT+UPDATE calls from the Edge Function would
-- lose updates under concurrent hits on the same link.
create or replace function public.record_token_access(p_token_id uuid)
returns void
language sql
set search_path = public, pg_temp
as $$
  update public.request_tokens
  set access_count = access_count + 1,
      last_accessed_at = now()
  where id = p_token_id;
$$;

revoke all on function public.record_token_access(uuid) from public;
grant execute on function public.record_token_access(uuid) to service_role;

-- Tracks documents awaiting (future) automated classification. No worker
-- consumes this yet — portal-confirm-upload only enqueues a row; a
-- classifier can poll `where status = 'pending'` later.
create table if not exists public.classification_queue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed')),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists classification_queue_organization_id_idx on public.classification_queue (organization_id);
create index if not exists classification_queue_document_id_idx on public.classification_queue (document_id);
create index if not exists classification_queue_pending_idx on public.classification_queue (status) where status = 'pending';

alter table public.classification_queue enable row level security;

drop policy if exists "org isolation" on public.classification_queue;
create policy "org isolation" on public.classification_queue
  for all
  to authenticated
  using (organization_id = public.auth_org_id())
  with check (organization_id = public.auth_org_id());

-- create_request() no longer generates the token itself: Postgres has no
-- base58 encoder, and the token design calls for base58 (via
-- crypto.getRandomValues, generated in the send-request Edge Function).
-- The RPC now takes the already-hashed token as p_token_hash instead —
-- this changes the parameter list, so the old signature is dropped first
-- (CREATE OR REPLACE cannot change a function's argument list).
drop function if exists public.create_request(uuid, date, text, date, public.request_status, jsonb, int[]);

create or replace function public.create_request(
  p_client_id uuid,
  p_period_start date,
  p_period_label text,
  p_deadline date,
  p_status public.request_status,
  p_checklist jsonb,
  p_token_hash text default null,
  p_reminder_offsets_days int[] default array[7, 3, 0]
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_org_id uuid := public.auth_org_id();
  v_org_name text;
  v_client public.clients%rowtype;
  v_request_id uuid;
  v_offset int;
  v_reminder_at timestamptz;
begin
  if v_org_id is null then
    raise exception 'NO_ORGANIZATION';
  end if;

  select * into v_client from public.clients where id = p_client_id and organization_id = v_org_id;
  if not found then
    raise exception 'CLIENT_NOT_FOUND';
  end if;

  if p_status = 'sent' and p_token_hash is null then
    raise exception 'TOKEN_HASH_REQUIRED';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_checklist) as item
    where item->>'document_type_id' is not null
      and not exists (
        select 1 from public.document_types dt
        where dt.id = (item->>'document_type_id')::uuid and dt.organization_id = v_org_id
      )
  ) then
    raise exception 'INVALID_DOCUMENT_TYPE';
  end if;

  select name into v_org_name from public.organizations where id = v_org_id;

  begin
    insert into public.requests (organization_id, client_id, period_start, period_label, deadline, status, created_by, sent_at)
    values (
      v_org_id, p_client_id, p_period_start, p_period_label, p_deadline, p_status, auth.uid(),
      case when p_status = 'sent' then now() else null end
    )
    returning id into v_request_id;
  exception
    when unique_violation then
      raise exception 'DUPLICATE_REQUEST_PERIOD';
  end;

  insert into public.required_documents (
    organization_id, request_id, document_type_id, custom_name, is_optional, sort_order
  )
  select
    v_org_id,
    v_request_id,
    nullif(item->>'document_type_id', '')::uuid,
    nullif(item->>'custom_name', ''),
    coalesce((item->>'is_optional')::boolean, false),
    (ordinality - 1)::smallint
  from jsonb_array_elements(p_checklist) with ordinality as item;

  if p_status = 'sent' then
    -- expires_at = deadline + 30 days, not a fixed "90 days from now": the
    -- portal link should keep working for late submissions for a while
    -- after the deadline, but its lifetime is tied to *this request's*
    -- timeline rather than an arbitrary constant.
    insert into public.request_tokens (organization_id, request_id, token_hash, expires_at, created_by)
    values (v_org_id, v_request_id, p_token_hash, (p_deadline + 30)::timestamptz, auth.uid());

    insert into public.activity_log (organization_id, request_id, client_id, actor_type, actor_id, event_type, payload)
    values (v_org_id, v_request_id, p_client_id, 'accountant', auth.uid(), 'request_sent', jsonb_build_object('period_label', p_period_label));

    foreach v_offset in array p_reminder_offsets_days loop
      v_reminder_at := p_deadline - v_offset;
      if v_reminder_at > now() then
        insert into public.reminders (organization_id, request_id, channel, scheduled_for, created_by)
        values (v_org_id, v_request_id, 'email', v_reminder_at, auth.uid());
      end if;
    end loop;
  else
    insert into public.activity_log (organization_id, request_id, client_id, actor_type, actor_id, event_type, payload)
    values (v_org_id, v_request_id, p_client_id, 'accountant', auth.uid(), 'request_drafted', '{}'::jsonb);
  end if;

  return jsonb_build_object(
    'request_id', v_request_id,
    'client_name', v_client.name,
    'client_email', v_client.email,
    'organization_name', v_org_name
  );
end;
$$;

revoke all on function public.create_request(uuid, date, text, date, public.request_status, jsonb, text, int[]) from public;
grant execute on function public.create_request(uuid, date, text, date, public.request_status, jsonb, text, int[]) to authenticated;

comment on function public.create_request is
  'Atomically creates a request and its required_documents/request_tokens/activity_log/reminders. Takes a pre-hashed token (generated + base58-encoded by the caller) rather than generating one itself — Postgres has no base58 encoder. Raises NO_ORGANIZATION, CLIENT_NOT_FOUND, INVALID_DOCUMENT_TYPE, TOKEN_HASH_REQUIRED, or DUPLICATE_REQUEST_PERIOD as distinguishable exceptions.';

-- Revokes portal access as soon as a request no longer needs it. Run on a
-- schedule (below) rather than triggered by the status change itself,
-- since 'overdue' can also transition to 'complete'/'cancelled' without any
-- write to required_documents (the trigger that drives most status
-- recomputation) — e.g. an accountant cancelling a request directly.
create or replace function public.revoke_tokens_for_finished_requests()
returns void
language sql
set search_path = public, pg_temp
as $$
  update public.request_tokens
  set revoked_at = now()
  where revoked_at is null
    and request_id in (
      select id from public.requests where status in ('complete', 'cancelled')
    );
$$;

revoke all on function public.revoke_tokens_for_finished_requests() from public;
grant execute on function public.revoke_tokens_for_finished_requests() to service_role;

-- Scheduled jobs. If this fails because pg_cron isn't enabled on your
-- project, enable it once via the Supabase dashboard (Database >
-- Extensions > pg_cron) and re-run just this section.
create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'portal-rate-limit-cleanup') then
    perform cron.unschedule('portal-rate-limit-cleanup');
  end if;
end $$;

select cron.schedule(
  'portal-rate-limit-cleanup',
  '0 * * * *',
  $$delete from public.portal_rate_limit_events where created_at < now() - interval '2 hours';$$
);

do $$
begin
  if exists (select 1 from cron.job where jobname = 'revoke-finished-request-tokens') then
    perform cron.unschedule('revoke-finished-request-tokens');
  end if;
end $$;

select cron.schedule(
  'revoke-finished-request-tokens',
  '15 * * * *',
  $$select public.revoke_tokens_for_finished_requests();$$
);
