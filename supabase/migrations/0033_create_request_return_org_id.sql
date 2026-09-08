-- Adds organization_id to create_request()'s returned jsonb — send-request
-- (the Edge Function) needs it to call the new templated send-email
-- (organizationId is now a required field on every send-email call, used
-- to look up the firm name/logo server-side; see 0032/send-email).
-- Same signature, so CREATE OR REPLACE applies directly with no drop.
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
    'organization_id', v_org_id,
    'client_name', v_client.name,
    'client_email', v_client.email,
    'organization_name', v_org_name
  );
end;
$$;
