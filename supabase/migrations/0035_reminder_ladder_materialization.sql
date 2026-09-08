-- Materializes a request's full reminder ladder (from reminder_schedules,
-- or the request's own override) into concrete reminders rows the moment
-- a request is sent. Each rung's scheduled_for is computed by resolving
-- "sent_at's local calendar date + day_offset days, at the organization's
-- preferred send hour" as wall-clock time IN THE ORGANIZATION'S TIMEZONE,
-- then letting Postgres's tz database convert that to the correct UTC
-- instant — this is what makes day_offset arithmetic land correctly
-- across DST transitions and month/year boundaries (e.g. day_offset
-- pushing January 30th into February) without any manual offset math.
create or replace function public.materialize_reminder_ladder(p_request_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_request public.requests%rowtype;
  v_ladder jsonb;
  v_send_hour smallint;
  v_timezone text;
  v_rung jsonb;
  v_scheduled_for timestamptz;
  v_reminder_id uuid;
begin
  select * into v_request from public.requests where id = p_request_id;
  if not found or v_request.sent_at is null then
    return;
  end if;

  select send_hour, timezone into v_send_hour, v_timezone
  from public.reminder_schedules where organization_id = v_request.organization_id;

  v_ladder := coalesce(
    v_request.reminder_ladder_override,
    (select ladder from public.reminder_schedules where organization_id = v_request.organization_id),
    '[]'::jsonb
  );
  v_send_hour := coalesce(v_send_hour, 9);
  v_timezone := coalesce(v_timezone, 'Indian/Mauritius');

  for v_rung in select * from jsonb_array_elements(v_ladder)
  loop
    v_scheduled_for := (
      ((v_request.sent_at at time zone v_timezone)::date + (v_rung->>'day_offset')::int)::text
      || ' ' || v_send_hour::text || ':00:00'
    )::timestamp at time zone v_timezone;

    insert into public.reminders (
      organization_id, request_id, channel, type, audience, scheduled_for, created_by
    )
    values (
      v_request.organization_id, p_request_id, 'email',
      v_rung->>'type', v_rung->>'audience', v_scheduled_for, v_request.created_by
    )
    returning id into v_reminder_id;

    -- The day-0 "initial" rung documents the same email send-request
    -- already fires synchronously at request-creation time (so the client
    -- gets their invite immediately, not on the next 15-minute cron tick)
    -- — recorded here as already sent rather than left pending, which
    -- would otherwise fire a duplicate initial email minutes later.
    if (v_rung->>'day_offset')::int = 0 and v_rung->>'type' = 'initial' then
      update public.reminders
      set status = 'sent', sent_at = v_request.sent_at
      where id = v_reminder_id;
    end if;
  end loop;
end;
$$;

comment on function public.materialize_reminder_ladder(uuid) is
  'Inserts one reminders row per ladder rung for a just-sent request. Called by create_request(); re-runnable in principle (e.g. after changing reminder_ladder_override) but nothing currently calls it a second time for the same request, so no duplicate-guard exists yet.';

revoke all on function public.materialize_reminder_ladder(uuid) from public;
grant execute on function public.materialize_reminder_ladder(uuid) to authenticated;

-- Atomic claim for process-reminders: SKIP LOCKED means two concurrent
-- runs (e.g. a slow run still processing when the next 15-minute tick
-- fires) never claim the same row — one gets it, the other's SELECT
-- simply skips past the locked row and moves on to the next. Restricted
-- to service_role only: it claims due reminders across every
-- organization, which is only ever appropriate for the trusted scheduled
-- job, never an ordinary authenticated session.
create or replace function public.claim_due_reminders(p_limit int default 100)
returns setof public.reminders
language sql
set search_path = public, pg_temp
as $$
  update public.reminders
  set status = 'processing'
  where id in (
    select id from public.reminders
    where status = 'pending'
      and sent_at is null
      and scheduled_for <= now()
    order by scheduled_for
    limit p_limit
    for update skip locked
  )
  returning *;
$$;

comment on function public.claim_due_reminders(int) is
  'Atomically claims up to p_limit due reminders (status pending -> processing) using FOR UPDATE SKIP LOCKED, so concurrent process-reminders runs cannot double-claim the same row. service_role only — see revoke below.';

revoke all on function public.claim_due_reminders(int) from public, authenticated;
grant execute on function public.claim_due_reminders(int) to service_role;

-- create_request() no longer takes a flat list of day offsets — the
-- reminder schedule is now the organization's (or request's own) full
-- ladder, materialized by materialize_reminder_ladder() right after the
-- request/token/activity_log rows are written. Same reason as the last
-- signature change (0022): CREATE OR REPLACE cannot drop a parameter.
drop function if exists public.create_request(uuid, date, text, date, public.request_status, jsonb, text, int[]);

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

  if p_status = 'sent' then
    insert into public.request_tokens (organization_id, request_id, token_hash, expires_at, created_by)
    values (v_org_id, v_request_id, p_token_hash, (p_deadline + 30)::timestamptz, auth.uid());

    insert into public.activity_log (organization_id, request_id, client_id, actor_type, actor_id, event_type, payload)
    values (v_org_id, v_request_id, p_client_id, 'accountant', auth.uid(), 'request_sent', jsonb_build_object('period_label', p_period_label));

    perform public.materialize_reminder_ladder(v_request_id);
  else
    insert into public.activity_log (organization_id, request_id, client_id, actor_type, actor_id, event_type, payload)
    values (v_org_id, v_request_id, p_client_id, 'accountant', auth.uid(), 'request_drafted', '{}'::jsonb);
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

revoke all on function public.create_request(uuid, date, text, date, public.request_status, jsonb, text) from public;
grant execute on function public.create_request(uuid, date, text, date, public.request_status, jsonb, text) to authenticated;

comment on function public.create_request is
  'Atomically creates a request and its required_documents/request_tokens/activity_log, then materializes its reminder ladder (0034/0035) for a sent request. Raises NO_ORGANIZATION, CLIENT_NOT_FOUND, INVALID_DOCUMENT_TYPE, TOKEN_HASH_REQUIRED, or DUPLICATE_REQUEST_PERIOD as distinguishable exceptions.';
