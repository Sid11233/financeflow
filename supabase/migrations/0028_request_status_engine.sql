-- Replaces the request status engine introduced in 0016 with the fuller
-- spec: 'waived' counts as resolved alongside 'accepted' and 'received',
-- completion_percent is 100 when there are no required items (an empty
-- checklist has nothing left to do, not 0% of nothing), status transitions
-- follow a strict, fully-ordered decision tree, and every actual status
-- change is recorded in activity_log with the old and new value.
--
-- Parameter renamed from `request_id` to `p_request_id` (breaking change
-- for any caller using named-argument RPC calls) — classify-document is
-- the only such caller in this codebase and is updated in the same body of
-- work; see supabase/functions/classify-document/index.ts.
--
-- CREATE OR REPLACE cannot rename an input parameter (confirmed against
-- this project's linked database: "cannot change name of input parameter
-- ... (SQLSTATE 42P13)"), so the old signature is dropped first. Nothing
-- else in the schema binds to this function by OID (only plpgsql `perform`
-- calls by name, resolved fresh at each call), so the drop is safe.
drop function if exists public.recompute_request_status(uuid);

create function public.recompute_request_status(p_request_id uuid)
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
    -- Cancelling is an explicit, terminal accountant action. Document
    -- activity after the fact (a late upload, a classification landing)
    -- must never silently resurrect a cancelled request.
    when v_current_status = 'cancelled' then 'cancelled'
    when v_sent_at is null then 'draft'
    -- Vacuously true (and intentional) when v_total = 0: a request with no
    -- mandatory checklist items has nothing left to resolve.
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

  if v_new_status <> v_current_status then
    insert into public.activity_log (organization_id, request_id, client_id, actor_type, event_type, payload)
    values (
      v_organization_id,
      p_request_id,
      v_client_id,
      'system',
      'request_status_changed',
      jsonb_build_object('old_status', v_current_status, 'new_status', v_new_status)
    );
  end if;
end;
$$;

comment on function public.recompute_request_status(uuid) is
  'Recalculates requests.status/completion_percent/completed_at from required_documents, and logs an activity_log row whenever the status value actually changes. Runs with the caller''s own privileges (not SECURITY DEFINER): whoever can change required_documents/documents for a request already has org-scoped access to update that same request.';

-- Generic trigger for tables that carry a request_id column directly
-- (required_documents) and whose every row-level event should simply
-- trigger a recompute of that row's request.
create or replace function public.trigger_recompute_request_status()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recompute_request_status(old.request_id);
    return old;
  else
    perform public.recompute_request_status(new.request_id);
    return new;
  end if;
end;
$$;

drop trigger if exists required_documents_recompute_status on public.required_documents;
create trigger required_documents_recompute_status
  after insert or update of status or delete on public.required_documents
  for each row
  execute function public.trigger_recompute_request_status();

-- documents doesn't just need a recompute — a soft-deleted document that
-- was the only live upload backing its required_documents line item must
-- also revert that item's status, or resolved counts would stay stuck at
-- a state nothing live actually supports. Skips the revert for 'accepted'
-- and 'waived': both are explicit accountant decisions that a client
-- removing a file shouldn't be able to silently undo.
create or replace function public.trigger_documents_status_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE'
    and old.deleted_at is null
    and new.deleted_at is not null
    and new.required_document_id is not null
  then
    if not exists (
      select 1 from public.documents
      where required_document_id = new.required_document_id
        and deleted_at is null
        and id <> new.id
    ) then
      update public.required_documents
      set status = 'pending'
      where id = new.required_document_id
        and status not in ('accepted', 'waived');
    end if;
  end if;

  perform public.recompute_request_status(new.request_id);
  return new;
end;
$$;

drop trigger if exists documents_recompute_status on public.documents;
create trigger documents_recompute_status
  after insert or update of review_status, deleted_at on public.documents
  for each row
  execute function public.trigger_documents_status_change();

-- Daily safety net: 'overdue' is otherwise only detected when something
-- touches a request's required_documents or documents rows, so a deadline
-- that quietly passes with no document activity would never flip a
-- request to 'overdue' on its own. Runs once at 01:00 server time and
-- walks every request that isn't already in a terminal state.
create or replace function public.recompute_all_open_requests()
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_request_id uuid;
begin
  for v_request_id in
    select id from public.requests where status not in ('complete', 'cancelled')
  loop
    perform public.recompute_request_status(v_request_id);
  end loop;
end;
$$;

comment on function public.recompute_all_open_requests() is
  'Scheduled daily at 01:00 (see cron.schedule below) so overdue requests flip over at date boundaries without needing any document activity to trigger it.';

do $$
begin
  if exists (select 1 from cron.job where jobname = 'daily-request-status-recompute') then
    perform cron.unschedule('daily-request-status-recompute');
  end if;
end $$;

select cron.schedule(
  'daily-request-status-recompute',
  '0 1 * * *',
  $$select public.recompute_all_open_requests();$$
);
