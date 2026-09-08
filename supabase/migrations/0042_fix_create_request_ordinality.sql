-- Fixes a real bug introduced in 0038: `jsonb_array_elements(p_checklist)
-- with ordinality as item` (no explicit column list) makes `item` a
-- composite record bundling the jsonb value AND the ordinality counter
-- together, not the jsonb value itself — so `item->>'document_type_id'`
-- failed with "operator does not exist: record ->> unknown" on every
-- single request creation with status 'sent' (any checklist item at all
-- hits this insert). Confirmed by reproducing the exact call directly
-- against the database. The fix is the explicit column-list form of
-- WITH ORDINALITY, `... as t(item, ordinality)`, which correctly types
-- `item` as jsonb.
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
  from jsonb_array_elements(p_checklist) with ordinality as t(item, ordinality);

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
