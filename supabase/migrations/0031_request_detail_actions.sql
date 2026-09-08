-- Backs the request detail page (/requests/:id): the review-queue actions
-- (accept/reassign/reject/waive), header actions (extend deadline, mark
-- complete, cancel), reminder controls (skip next, pause automatic), and
-- realtime updates for the checklist.
--
-- Every action RPC runs security invoker (the default) and re-derives
-- organization_id from auth_org_id() rather than trusting a parameter, so
-- it only ever performs writes the calling user could already do directly
-- under the existing "org isolation" policies (0014) — same rationale as
-- create_request (0021).

-- ============================================================
-- Reminder schema additions
-- ============================================================
-- 'type' distinguishes a reminder auto-scheduled at request-creation time
-- (create_request, 0021) from one an accountant fires on demand from this
-- page ("Send Reminder"). 'skipped_at' lets the next scheduled reminder be
-- toggled off without deleting the row (its scheduling history stays
-- intact either way).
alter table public.reminders
  add column if not exists type text not null default 'scheduled',
  add column if not exists skipped_at timestamptz;

do $$ begin
  alter table public.reminders
    add constraint reminders_type_check check (type in ('scheduled', 'manual'));
exception
  when duplicate_object then null;
end $$;

-- Nullable timestamp, same convention as completed_at/revoked_at
-- elsewhere: null means "not paused", a timestamp records when it was.
alter table public.requests add column if not exists reminders_paused_at timestamptz;

comment on column public.reminders.type is
  '''scheduled'' rows are created by create_request()''s reminder schedule; ''manual'' rows are created by the request detail page''s "Send Reminder" button (see request-notify Edge Function).';
comment on column public.requests.reminders_paused_at is
  'When set, the (not-yet-built) scheduled-reminder sender should skip this request entirely. Toggled by set_reminders_paused() below.';

-- ============================================================
-- Review queue actions
-- ============================================================

-- Accountant confirms an uploaded file is correct as classified/matched.
create or replace function public.accept_document(p_document_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_org_id uuid := public.auth_org_id();
  v_document public.documents%rowtype;
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

  insert into public.activity_log (organization_id, request_id, client_id, actor_type, actor_id, event_type, payload)
  select v_org_id, v_document.request_id, r.client_id, 'accountant', auth.uid(), 'document_accepted',
    jsonb_build_object('document_id', p_document_id, 'original_filename', v_document.original_filename)
  from public.requests r where r.id = v_document.request_id;
end;
$$;

-- Accountant moves an uploaded file onto a different checklist item than
-- the one it landed on (AI reassignment already does this automatically at
-- high confidence — see classify-document; this is the human equivalent
-- for everything else). The target is marked 'accepted' outright, not
-- 'received': a human placing it there has already reviewed it, unlike an
-- AI auto-reassignment which still leaves room for confirmation.
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

  insert into public.activity_log (organization_id, request_id, client_id, actor_type, actor_id, event_type, payload)
  select v_org_id, v_document.request_id, r.client_id, 'accountant', auth.uid(), 'document_reassigned',
    jsonb_build_object(
      'document_id', p_document_id, 'original_filename', v_document.original_filename,
      'from_required_document_id', v_original_required_document_id,
      'to_required_document_id', p_target_required_document_id
    )
  from public.requests r where r.id = v_document.request_id;
end;
$$;

-- Accountant rejects a bad/wrong upload. The checklist item goes to
-- 'rejected' (not 'pending') so the checklist can show it distinctly from
-- "nothing uploaded yet" — 'rejected' still counts as unresolved either
-- way. Pairs with the frontend's "ask for a new copy" email, sent
-- separately (a plain send-email call, not part of this RPC — composing
-- and reviewing that message is a UI concern).
create or replace function public.reject_document(p_document_id uuid, p_reason text default null)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_org_id uuid := public.auth_org_id();
  v_document public.documents%rowtype;
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

  insert into public.activity_log (organization_id, request_id, client_id, actor_type, actor_id, event_type, payload)
  select v_org_id, v_document.request_id, r.client_id, 'accountant', auth.uid(), 'document_rejected',
    jsonb_build_object('document_id', p_document_id, 'original_filename', v_document.original_filename)
  from public.requests r where r.id = v_document.request_id;
end;
$$;

-- Waives a checklist item directly (client says they don't have it).
-- p_document_id is optional and only passed when waiving from a
-- review-queue entry that already has a flagged upload attached — that
-- upload gets moved out of the "needs review" queue (review_status
-- 'rejected', since it isn't going to fill this or any other slot) rather
-- than lingering there forever pointing at a now-waived item.
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

  insert into public.activity_log (organization_id, request_id, client_id, actor_type, actor_id, event_type, payload)
  select v_org_id, v_required_document.request_id, r.client_id, 'accountant', auth.uid(), 'required_document_waived',
    jsonb_build_object('required_document_id', p_required_document_id, 'reason', p_reason)
  from public.requests r where r.id = v_required_document.request_id;
end;
$$;

-- ============================================================
-- Header actions
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

  insert into public.activity_log (organization_id, request_id, client_id, actor_type, actor_id, event_type, payload)
  values (
    v_org_id, p_request_id, v_client_id, 'accountant', auth.uid(), 'deadline_extended',
    jsonb_build_object('old_deadline', v_old_deadline, 'new_deadline', p_new_deadline)
  );

  -- A deadline move can flip 'overdue' back to 'sent'/'partial' immediately
  -- rather than waiting for the daily sweep (0028).
  perform public.recompute_request_status(p_request_id);
end;
$$;

-- "Mark Complete" is an override for cases like "the client confirmed by
-- phone they have nothing else" — implemented by waiving every remaining
-- unresolved mandatory item (with a system-attributed reason) and letting
-- the normal engine (0028) derive 'complete' from that, rather than
-- setting status directly. This is deliberate: a direct status override
-- would just get overwritten the next time anything touched
-- required_documents/documents, since recompute_request_status always
-- re-derives status from source data. Routing through waive keeps the
-- override consistent with everything else and leaves a clear per-item
-- audit trail of what was overridden.
create or replace function public.mark_request_complete(p_request_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_org_id uuid := public.auth_org_id();
begin
  if not exists (select 1 from public.requests where id = p_request_id and organization_id = v_org_id) then
    raise exception 'REQUEST_NOT_FOUND';
  end if;

  update public.required_documents
  set status = 'waived', waived_reason = 'Marked complete by accountant override'
  where request_id = p_request_id
    and organization_id = v_org_id
    and is_optional = false
    and status not in ('accepted', 'received', 'waived');

  perform public.recompute_request_status(p_request_id);
end;
$$;

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
    insert into public.activity_log (organization_id, request_id, client_id, actor_type, actor_id, event_type, payload)
    values (
      v_org_id, p_request_id, v_client_id, 'accountant', auth.uid(), 'request_status_changed',
      jsonb_build_object('old_status', v_old_status, 'new_status', 'cancelled')
    );
  end if;
end;
$$;

-- ============================================================
-- Reminder controls
-- ============================================================

create or replace function public.set_reminder_skipped(p_reminder_id uuid, p_skipped boolean)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_org_id uuid := public.auth_org_id();
  v_updated int;
begin
  update public.reminders
  set skipped_at = case when p_skipped then now() else null end
  where id = p_reminder_id and organization_id = v_org_id and sent_at is null;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'REMINDER_NOT_FOUND';
  end if;
end;
$$;

create or replace function public.set_reminders_paused(p_request_id uuid, p_paused boolean)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_org_id uuid := public.auth_org_id();
  v_updated int;
begin
  update public.requests
  set reminders_paused_at = case when p_paused then now() else null end
  where id = p_request_id and organization_id = v_org_id;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'REQUEST_NOT_FOUND';
  end if;
end;
$$;

-- ============================================================
-- Grants — same revoke-then-grant-to-authenticated pattern as
-- create_request (0021/0022): PUBLIC/anon get nothing; RLS (still fully in
-- effect under security invoker) is the real boundary either way.
-- ============================================================
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.accept_document(uuid)',
    'public.reassign_document(uuid, uuid)',
    'public.reject_document(uuid, text)',
    'public.waive_required_document(uuid, text, uuid)',
    'public.extend_request_deadline(uuid, date)',
    'public.mark_request_complete(uuid)',
    'public.cancel_request(uuid)',
    'public.set_reminder_skipped(uuid, boolean)',
    'public.set_reminders_paused(uuid, boolean)'
  ]
  loop
    execute format('revoke all on function %s from public;', fn);
    execute format('grant execute on function %s to authenticated;', fn);
  end loop;
end $$;

-- ============================================================
-- Realtime: lets the request detail page see a client's upload appear
-- without a refresh. Guarded with an existence check since
-- `alter publication ... add table` errors (rather than no-op) if the
-- table is already a member.
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'documents'
  ) then
    alter publication supabase_realtime add table public.documents;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'required_documents'
  ) then
    alter publication supabase_realtime add table public.required_documents;
  end if;
end $$;
