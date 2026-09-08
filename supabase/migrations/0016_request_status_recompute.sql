-- Recalculates a request's status and completion_percent from the current
-- state of its required_documents. Only mandatory (is_optional = false)
-- line items count toward completion; optional ones can be received or
-- skipped without affecting either number.
--
-- Rules (evaluated in this order):
--   * no mandatory required_documents yet -> completion 0, status untouched
--     (nothing to derive; don't fight a request that's still being drafted)
--   * every mandatory item accepted -> 'complete' (completed_at set once)
--   * at least one mandatory item received/needs_review/accepted, but not
--     all accepted -> 'partial'
--   * otherwise the status is left as whatever it already was (document
--     changes never move a request out of 'draft' or 'cancelled' on their
--     own — sending and cancelling are explicit user actions)
--   * if the deadline has passed and the status computed above isn't
--     'complete' or 'cancelled', it's forced to 'overdue'
--
-- This only re-evaluates overdue status when a required_documents row
-- changes. A request whose deadline quietly passes with no document
-- activity won't flip to 'overdue' until something touches its documents
-- again; catching that would need a separate scheduled job (e.g. pg_cron),
-- which is out of scope here.
create or replace function public.recompute_request_status(request_id uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_total int;
  v_accepted int;
  v_in_progress int;
  v_deadline date;
  v_current_status public.request_status;
  v_new_status public.request_status;
  v_percent smallint;
begin
  select deadline, status
    into v_deadline, v_current_status
    from public.requests
    where id = recompute_request_status.request_id
    for update;

  if not found then
    return;
  end if;

  select
    count(*) filter (where not is_optional),
    count(*) filter (where not is_optional and status = 'accepted'),
    count(*) filter (where not is_optional and status in ('received', 'needs_review', 'accepted'))
  into v_total, v_accepted, v_in_progress
  from public.required_documents
  where required_documents.request_id = recompute_request_status.request_id;

  if v_total = 0 then
    v_percent := 0;
    v_new_status := v_current_status;
  else
    v_percent := round(v_accepted * 100.0 / v_total);

    if v_accepted = v_total then
      v_new_status := 'complete';
    elsif v_in_progress > 0 then
      v_new_status := 'partial';
    else
      v_new_status := v_current_status;
    end if;

    if v_deadline is not null
      and v_deadline < current_date
      and v_new_status not in ('complete', 'cancelled')
    then
      v_new_status := 'overdue';
    end if;
  end if;

  update public.requests
  set
    completion_percent = v_percent,
    status = v_new_status,
    completed_at = case
      when v_new_status = 'complete' and completed_at is null then now()
      when v_new_status <> 'complete' then null
      else completed_at
    end
  where id = recompute_request_status.request_id;
end;
$$;

comment on function public.recompute_request_status(uuid) is
  'Recalculates requests.status and requests.completion_percent for one request from its required_documents. Runs with the caller''s own privileges (not SECURITY DEFINER): whoever can change required_documents for a request already has org-scoped access to update that same request.';

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

-- Postgres has no `create trigger if not exists`, so drop first.
drop trigger if exists required_documents_recompute_status on public.required_documents;
create trigger required_documents_recompute_status
  after insert or update or delete on public.required_documents
  for each row
  execute function public.trigger_recompute_request_status();
