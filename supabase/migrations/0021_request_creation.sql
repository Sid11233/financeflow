-- Default day-of-month (in the period's following month) that a new
-- request's deadline picker pre-fills to. Editable per-organization later;
-- for now just a sane default with no settings UI yet.
alter table public.organizations add column if not exists default_deadline_day smallint not null default 15;

do $$ begin
  alter table public.organizations
    add constraint organizations_default_deadline_day_check check (default_deadline_day between 1 and 28);
exception
  when duplicate_object then null;
end $$;

-- A required_documents row can now represent either a catalog document_type
-- OR a one-off custom item typed in for a single request (e.g. "Lease
-- Agreement" for one client that isn't part of the org's standard
-- checklist). Making document_type_id nullable and adding custom_name
-- (rather than inserting a real document_types row for every one-off) keeps
-- the org's permanent catalog free of items that were only ever relevant to
-- one request.
alter table public.required_documents alter column document_type_id drop not null;
alter table public.required_documents add column if not exists custom_name text;

do $$ begin
  alter table public.required_documents
    add constraint required_documents_type_or_custom_name_check
    check (
      (document_type_id is not null and custom_name is null)
      or (document_type_id is null and custom_name is not null)
    );
exception
  when duplicate_object then null;
end $$;

-- Idempotency: a client can have at most one non-cancelled request per
-- period. Standard unique constraints can't express "unless cancelled", so
-- this is a partial unique index instead. create_request() below catches
-- the resulting unique_violation and re-raises it as a distinguishable
-- error the Edge Function (and then the UI) can recognize.
create unique index if not exists requests_client_period_active_idx
  on public.requests (client_id, period_start)
  where status <> 'cancelled';

-- Creates a request, its required_documents, a portal access token, an
-- activity_log entry, and (for a sent request) its reminder schedule, all
-- in one transaction — a single RPC call is atomic by default; several
-- separate PostgREST calls from an Edge Function would not be. This runs
-- SECURITY INVOKER (the default): it only performs writes the calling user
-- could already do directly under the "org isolation" policies, so no
-- elevated privilege is needed — organization_id is still always derived
-- from auth_org_id(), never trusted from a parameter, so a caller can't
-- point it at another org regardless.
--
-- p_checklist: jsonb array of {document_type_id?, custom_name?, is_optional}.
-- p_status: 'draft' (no email, no token, no reminders) or 'sent'.
create or replace function public.create_request(
  p_client_id uuid,
  p_period_start date,
  p_period_label text,
  p_deadline date,
  p_status public.request_status,
  p_checklist jsonb,
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
  v_token_plaintext text;
  v_token_hash text;
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
    v_token_plaintext := encode(gen_random_bytes(32), 'hex');
    v_token_hash := encode(digest(v_token_plaintext, 'sha256'), 'hex');

    insert into public.request_tokens (organization_id, request_id, token_hash, expires_at, created_by)
    values (v_org_id, v_request_id, v_token_hash, now() + interval '90 days', auth.uid());

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
    'token', v_token_plaintext,
    'client_name', v_client.name,
    'client_email', v_client.email,
    'organization_name', v_org_name
  );
end;
$$;

revoke all on function public.create_request(uuid, date, text, date, public.request_status, jsonb, int[]) from public;
grant execute on function public.create_request(uuid, date, text, date, public.request_status, jsonb, int[]) to authenticated;

comment on function public.create_request is
  'Atomically creates a request and its required_documents/request_tokens/activity_log/reminders. Raises NO_ORGANIZATION, CLIENT_NOT_FOUND, INVALID_DOCUMENT_TYPE, or DUPLICATE_REQUEST_PERIOD as distinguishable exceptions for the caller to translate into a friendly message.';

-- required_documents.document_type_id is now nullable (custom items), so
-- request_overview's join to it must tolerate that: left join instead of
-- join, and the display name falls back to custom_name.
create or replace view public.request_overview
with (security_invoker = true)
as
select
  r.id,
  r.organization_id,
  r.client_id,
  c.name as client_name,
  r.period_start,
  r.period_label,
  r.status,
  r.deadline,
  r.created_by,
  r.created_at,
  r.sent_at,
  r.completed_at,
  coalesce(doc_stats.required_count, 0) as required_count,
  coalesce(doc_stats.received_count, 0) as received_count,
  coalesce(doc_stats.required_count, 0) - coalesce(doc_stats.received_count, 0) as missing_document_count,
  coalesce(doc_stats.missing_document_names, array[]::text[]) as missing_document_names,
  case
    when coalesce(doc_stats.required_count, 0) = 0 then 0
    else round(coalesce(doc_stats.received_count, 0) * 100.0 / doc_stats.required_count)::smallint
  end as completion_percentage,
  case r.status
    when 'overdue' then 0
    when 'sent' then 1
    when 'partial' then 1
    when 'complete' then 2
    when 'draft' then 3
    else 4
  end as status_rank,
  reminder_stats.last_reminder_sent_at
from public.requests r
join public.clients c on c.id = r.client_id
left join lateral (
  select
    count(*) filter (where not rd.is_optional) as required_count,
    count(*) filter (where not rd.is_optional and rd.status = 'accepted') as received_count,
    coalesce(
      array_agg(coalesce(dt.name, rd.custom_name) order by rd.sort_order)
        filter (where not rd.is_optional and rd.status <> 'accepted'),
      array[]::text[]
    ) as missing_document_names
  from public.required_documents rd
  left join public.document_types dt on dt.id = rd.document_type_id
  where rd.request_id = r.id
) doc_stats on true
left join lateral (
  select max(rem.sent_at) as last_reminder_sent_at
  from public.reminders rem
  where rem.request_id = r.id and rem.sent_at is not null
) reminder_stats on true;

revoke all on public.request_overview from anon;
grant select on public.request_overview to authenticated;
