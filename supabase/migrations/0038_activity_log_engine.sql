-- Consolidates every activity_log write behind one function, and locks
-- the table's event_type down to the canonical vocabulary in
-- src/lib/activity.ts (kept in sync by hand — no generator ties the two
-- together, so a mismatch here would silently break the renderer's
-- fallback path rather than fail loudly, which is exactly what the CHECK
-- constraint below prevents on the write side).
create or replace function public.log_activity(
  p_organization_id uuid,
  p_event_type text,
  p_actor_type public.activity_actor_type,
  p_request_id uuid default null,
  p_client_id uuid default null,
  p_actor_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language sql
set search_path = public, pg_temp
as $$
  insert into public.activity_log (organization_id, request_id, client_id, actor_type, actor_id, event_type, payload)
  values (p_organization_id, p_request_id, p_client_id, p_actor_type, p_actor_id, p_event_type, p_payload)
  returning id;
$$;

comment on function public.log_activity is
  'The only place that inserts into activity_log — every trigger and Edge Function writes through this. Runs security invoker: an authenticated caller is still bound by activity_log''s own RLS (organization_id = auth_org_id()), so this grants no privilege beyond what the caller already has; service-role callers bypass RLS as usual for system-actor events.';

revoke all on function public.log_activity(uuid, text, public.activity_actor_type, uuid, uuid, uuid, jsonb) from public;
grant execute on function public.log_activity(uuid, text, public.activity_actor_type, uuid, uuid, uuid, jsonb) to authenticated;

-- Locks event_type to exactly the union in src/lib/activity.ts. There is
-- no existing data to migrate (this project has never shipped): a
-- production deploy of an app with real history would need a backfill
-- migration before adding this constraint, not just the constraint itself.
alter table public.activity_log drop constraint if exists activity_log_event_type_check;
alter table public.activity_log
  add constraint activity_log_event_type_check
  check (event_type in (
    'request_created', 'request_sent', 'link_opened', 'document_uploaded',
    'document_classified', 'document_reassigned', 'document_rejected', 'document_removed',
    'item_waived', 'reminder_sent', 'reminder_skipped', 'reminder_failed',
    'deadline_extended', 'request_submitted', 'request_completed', 'request_cancelled',
    'link_resent', 'link_expired'
  ));

-- record_token_access now reports whether this was the token's first-ever
-- access, so portal-resolve can log 'link_opened' exactly once per link
-- rather than on every page refresh/revisit. Return type changed
-- (void -> boolean), which CREATE OR REPLACE cannot do — drop first.
drop function if exists public.record_token_access(uuid);

create function public.record_token_access(p_token_id uuid)
returns boolean
language sql
set search_path = public, pg_temp
as $$
  update public.request_tokens
  set access_count = access_count + 1,
      last_accessed_at = now()
  where id = p_token_id
  returning access_count = 1;
$$;

revoke all on function public.record_token_access(uuid) from public;
grant execute on function public.record_token_access(uuid) to service_role;

-- ============================================================
-- create_request(): 'request_drafted' -> always 'request_created', plus
-- 'request_sent' when sent immediately (same signature, CREATE OR REPLACE
-- applies directly).
-- ============================================================
create or replace function public.create_request(
  p_client_id uuid,
  p_period_start date,
  p_period_label text,
  p_deadline date,
  p_status public.request_status,
  p_checklist jsonb,
  p_token_hash text default null
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

  perform public.log_activity(
    v_org_id, 'request_created', 'accountant',
    v_request_id, p_client_id, auth.uid(),
    jsonb_build_object('period_label', p_period_label)
  );

  if p_status = 'sent' then
    insert into public.request_tokens (organization_id, request_id, token_hash, expires_at, created_by)
    values (v_org_id, v_request_id, p_token_hash, (p_deadline + 30)::timestamptz, auth.uid());

    perform public.log_activity(
      v_org_id, 'request_sent', 'accountant',
      v_request_id, p_client_id, auth.uid(),
      jsonb_build_object('period_label', p_period_label)
    );

    perform public.materialize_reminder_ladder(v_request_id);
  end if;

  return jsonb_build_object(
    'request_id', v_request_id,
    'organization_id', v_org_id,
    'client_name', v_client.name,
    'client_email', v_client.email,
    'organization_name', v_org_name
  );
end;
$$;

-- ============================================================
-- recompute_request_status(): the generic 'request_status_changed' event
-- (any transition) is replaced with a specific 'request_completed' event,
-- logged only when the request transitions INTO 'complete'. Every other
-- transition (draft->sent, sent->partial/overdue, or regressing away from
-- complete) has no matching canonical event and is no longer logged —
-- those are transient, already visible as the status badge itself, not
-- discrete moments worth a feed entry.
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
  v_new_status public.request_status;
  v_percent smallint;
begin
  select deadline, sent_at, status, organization_id, client_id
    into v_deadline, v_sent_at, v_current_status, v_organization_id, v_client_id
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
end;
$$;

-- ============================================================
-- cancel_request(): 'request_status_changed' -> 'request_cancelled'.
-- ============================================================
create or replace function public.cancel_request(p_request_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_org_id uuid := public.auth_org_id();
  v_client_id uuid;
  v_old_status public.request_status;
begin
  select client_id, status into v_client_id, v_old_status
  from public.requests where id = p_request_id and organization_id = v_org_id
  for update;
  if not found then
    raise exception 'REQUEST_NOT_FOUND';
  end if;

  update public.requests set status = 'cancelled' where id = p_request_id;

  if v_old_status <> 'cancelled' then
    perform public.log_activity(
      v_org_id, 'request_cancelled', 'accountant',
      p_request_id, v_client_id, auth.uid(),
      jsonb_build_object('old_status', v_old_status)
    );
  end if;
end;
$$;

-- ============================================================
-- accept_document(): 'document_accepted' -> 'document_classified' with
-- outcome 'confirmed_by_accountant' (there is no standalone "accepted"
-- event in the canonical list — accepting is a human reaching the same
-- kind of classification decision the AI reaches automatically).
-- ============================================================
create or replace function public.accept_document(p_document_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_org_id uuid := public.auth_org_id();
  v_document public.documents%rowtype;
  v_client_id uuid;
begin
  select * into v_document from public.documents
  where id = p_document_id and organization_id = v_org_id and deleted_at is null;

  if not found then
    raise exception 'DOCUMENT_NOT_FOUND';
  end if;

  if v_document.required_document_id is null then
    raise exception 'DOCUMENT_UNASSIGNED';
  end if;

  update public.documents
  set review_status = 'confirmed', review_reason = null
  where id = p_document_id;

  update public.required_documents
  set status = 'accepted'
  where id = v_document.required_document_id;

  select client_id into v_client_id from public.requests where id = v_document.request_id;

  perform public.log_activity(
    v_org_id, 'document_classified', 'accountant',
    v_document.request_id, v_client_id, auth.uid(),
    jsonb_build_object(
      'document_id', p_document_id, 'original_filename', v_document.original_filename,
      'outcome', 'confirmed_by_accountant'
    )
  );
end;
$$;

-- ============================================================
-- reassign_document(): unchanged event name, now via log_activity().
-- ============================================================
create or replace function public.reassign_document(p_document_id uuid, p_target_required_document_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_org_id uuid := public.auth_org_id();
  v_document public.documents%rowtype;
  v_original_required_document_id uuid;
  v_client_id uuid;
begin
  select * into v_document from public.documents
  where id = p_document_id and organization_id = v_org_id and deleted_at is null;
  if not found then
    raise exception 'DOCUMENT_NOT_FOUND';
  end if;

  if not exists (
    select 1 from public.required_documents
    where id = p_target_required_document_id and organization_id = v_org_id and request_id = v_document.request_id
  ) then
    raise exception 'TARGET_NOT_FOUND';
  end if;

  v_original_required_document_id := v_document.required_document_id;

  update public.documents
  set required_document_id = p_target_required_document_id, review_status = 'reassigned', review_reason = null
  where id = p_document_id;

  update public.required_documents
  set status = 'accepted'
  where id = p_target_required_document_id;

  if v_original_required_document_id is not null and v_original_required_document_id <> p_target_required_document_id then
    update public.required_documents
    set status = 'pending'
    where id = v_original_required_document_id and status not in ('accepted', 'waived');
  end if;

  select client_id into v_client_id from public.requests where id = v_document.request_id;

  perform public.log_activity(
    v_org_id, 'document_reassigned', 'accountant',
    v_document.request_id, v_client_id, auth.uid(),
    jsonb_build_object(
      'document_id', p_document_id, 'original_filename', v_document.original_filename,
      'from_required_document_id', v_original_required_document_id,
      'to_required_document_id', p_target_required_document_id
    )
  );
end;
$$;

-- ============================================================
-- reject_document(): unchanged event name, now via log_activity().
-- ============================================================
create or replace function public.reject_document(p_document_id uuid, p_reason text default null)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_org_id uuid := public.auth_org_id();
  v_document public.documents%rowtype;
  v_client_id uuid;
begin
  select * into v_document from public.documents
  where id = p_document_id and organization_id = v_org_id and deleted_at is null;
  if not found then
    raise exception 'DOCUMENT_NOT_FOUND';
  end if;

  update public.documents
  set review_status = 'rejected', review_reason = coalesce(p_reason, 'rejected_by_accountant')
  where id = p_document_id;

  if v_document.required_document_id is not null then
    update public.required_documents
    set status = 'rejected'
    where id = v_document.required_document_id
      and status not in ('accepted', 'waived');
  end if;

  select client_id into v_client_id from public.requests where id = v_document.request_id;

  perform public.log_activity(
    v_org_id, 'document_rejected', 'accountant',
    v_document.request_id, v_client_id, auth.uid(),
    jsonb_build_object('document_id', p_document_id, 'original_filename', v_document.original_filename)
  );
end;
$$;

-- ============================================================
-- waive_required_document(): 'required_document_waived' -> 'item_waived'.
-- ============================================================
create or replace function public.waive_required_document(
  p_required_document_id uuid,
  p_reason text default null,
  p_document_id uuid default null
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_org_id uuid := public.auth_org_id();
  v_required_document public.required_documents%rowtype;
  v_client_id uuid;
begin
  select * into v_required_document from public.required_documents
  where id = p_required_document_id and organization_id = v_org_id;
  if not found then
    raise exception 'REQUIRED_DOCUMENT_NOT_FOUND';
  end if;

  update public.required_documents
  set status = 'waived', waived_reason = p_reason
  where id = p_required_document_id;

  if p_document_id is not null then
    update public.documents
    set review_status = 'rejected', review_reason = 'item_waived'
    where id = p_document_id and organization_id = v_org_id and required_document_id = p_required_document_id;
  end if;

  select client_id into v_client_id from public.requests where id = v_required_document.request_id;

  perform public.log_activity(
    v_org_id, 'item_waived', 'accountant',
    v_required_document.request_id, v_client_id, auth.uid(),
    jsonb_build_object('required_document_id', p_required_document_id, 'reason', p_reason)
  );
end;
$$;

-- ============================================================
-- extend_request_deadline(): unchanged event name, now via log_activity().
-- ============================================================
create or replace function public.extend_request_deadline(p_request_id uuid, p_new_deadline date)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_org_id uuid := public.auth_org_id();
  v_old_deadline date;
  v_client_id uuid;
begin
  select deadline, client_id into v_old_deadline, v_client_id
  from public.requests where id = p_request_id and organization_id = v_org_id
  for update;
  if not found then
    raise exception 'REQUEST_NOT_FOUND';
  end if;

  update public.requests set deadline = p_new_deadline where id = p_request_id;

  perform public.log_activity(
    v_org_id, 'deadline_extended', 'accountant',
    p_request_id, v_client_id, auth.uid(),
    jsonb_build_object('old_deadline', v_old_deadline, 'new_deadline', p_new_deadline)
  );

  perform public.recompute_request_status(p_request_id);
end;
$$;

-- ============================================================
-- mark_request_complete(): now logs one 'item_waived' event per item it
-- auto-waives, via the same loop pattern as an individual waive — so the
-- feed shows exactly what happened regardless of which code path did the
-- waiving. 'request_completed' still arrives separately, cascaded from
-- the recompute_request_status() call below once everything is resolved.
-- ============================================================
create or replace function public.mark_request_complete(p_request_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_org_id uuid := public.auth_org_id();
  v_client_id uuid;
  v_required_document_id uuid;
begin
  select client_id into v_client_id from public.requests where id = p_request_id and organization_id = v_org_id;
  if not found then
    raise exception 'REQUEST_NOT_FOUND';
  end if;

  for v_required_document_id in
    update public.required_documents
    set status = 'waived', waived_reason = 'Marked complete by accountant override'
    where request_id = p_request_id
      and organization_id = v_org_id
      and is_optional = false
      and status not in ('accepted', 'received', 'waived')
    returning id
  loop
    perform public.log_activity(
      v_org_id, 'item_waived', 'accountant',
      p_request_id, v_client_id, auth.uid(),
      jsonb_build_object('required_document_id', v_required_document_id, 'reason', 'Marked complete by accountant override')
    );
  end loop;

  perform public.recompute_request_status(p_request_id);
end;
$$;
