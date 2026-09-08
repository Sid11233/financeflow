-- Schema for the automated reminder engine: a per-organization ladder
-- (reminder_schedules), a per-request override, and the additional
-- reminders columns needed to drive/track it (status, audience, retry
-- bookkeeping). The actual scheduling/sending logic lives in 0035 and the
-- process-reminders Edge Function.

create table if not exists public.reminder_schedules (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  -- Array of {day_offset, type, audience}, applied relative to a request's
  -- sent_at date. type is one of the reminders.type ladder values below;
  -- audience is 'client', 'accountant', or 'both'. Deliberately just jsonb,
  -- not a normalized table — the whole ladder is always read/written as one
  -- unit, and per-request overrides (requests.reminder_ladder_override)
  -- need the same freeform shape.
  ladder jsonb not null default '[
    {"day_offset": 0,  "type": "initial",    "audience": "client"},
    {"day_offset": 2,  "type": "nudge",      "audience": "client"},
    {"day_offset": 5,  "type": "firm",       "audience": "client"},
    {"day_offset": 7,  "type": "overdue",    "audience": "accountant"},
    {"day_offset": 10, "type": "escalation", "audience": "both"}
  ]'::jsonb,
  send_hour smallint not null default 9 check (send_hour between 0 and 23),
  -- IANA name, not a fixed offset — Postgres's `timestamp AT TIME ZONE tz`
  -- resolves this against the tz database at conversion time, which is
  -- what makes DST and month-length differences resolve correctly (see
  -- materialize_reminder_ladder in 0035).
  timezone text not null default 'Indian/Mauritius',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.reminder_schedules enable row level security;

drop policy if exists "org isolation" on public.reminder_schedules;
create policy "org isolation" on public.reminder_schedules
  for all
  to authenticated
  using (organization_id = public.auth_org_id())
  with check (organization_id = public.auth_org_id());

comment on table public.reminder_schedules is
  'One row per organization defining its reminder ladder. Seeded with defaults by handle_new_organization(); a request can override the whole ladder via requests.reminder_ladder_override.';

-- Per-request override: when set, materialize_reminder_ladder() uses this
-- instead of the organization's reminder_schedules.ladder. Same shape.
alter table public.requests
  add column if not exists reminder_ladder_override jsonb;

comment on column public.requests.reminder_ladder_override is
  'Same shape as reminder_schedules.ladder. When set, overrides the organization default for this request only.';

-- reminders: extends the type/status model built for the request detail
-- page (0031/0032) into the full ladder + retry lifecycle.
--   type: which ladder rung this is ('initial'|'nudge'|'firm'|'overdue'|
--     'escalation'), or 'manual' for an ad-hoc accountant-triggered send —
--     folded into the same column rather than a parallel one, since a
--     manual send has no ladder position of its own and the two concepts
--     (rung identity vs. how it was triggered) never both apply at once.
--   status: 'pending' (not yet due, or due and about to be claimed) ->
--     'processing' (claimed by a process-reminders run, see
--     claim_due_reminders in 0035) -> 'sent' | 'skipped' | 'failed'.
--     'pending' is also the state a claimed-but-paused reminder reverts
--     to, so it's picked up again once unpaused.
--   audience: who this rung is addressed to.
--   reason: why a 'skipped' reminder was skipped (e.g.
--     'request_complete', 'request_cancelled', 'daily_cap_reached').
--   attempts / last_error: retry bookkeeping for transient send failures —
--     see process-reminders' retry-then-fail-after-3 logic.
alter table public.reminders
  add column if not exists status text not null default 'pending',
  add column if not exists audience text not null default 'client',
  add column if not exists reason text,
  add column if not exists attempts smallint not null default 0,
  add column if not exists last_error text;

do $$ begin
  alter table public.reminders
    add constraint reminders_status_check
    check (status in ('pending', 'processing', 'sent', 'skipped', 'failed'));
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter table public.reminders
    add constraint reminders_audience_check
    check (audience in ('client', 'accountant', 'both'));
exception
  when duplicate_object then null;
end $$;

alter table public.reminders drop constraint if exists reminders_type_check;
alter table public.reminders
  add constraint reminders_type_check
  check (type in ('initial', 'nudge', 'firm', 'overdue', 'escalation', 'manual'));

create index if not exists reminders_due_idx on public.reminders (scheduled_for)
  where status = 'pending' and sent_at is null;

-- handle_new_organization() (0015/0025) now also seeds a default
-- reminder_schedules row, same pattern as classification_settings.
create or replace function public.handle_new_organization()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_bank_statement_id uuid := gen_random_uuid();
  v_sales_invoices_id uuid := gen_random_uuid();
  v_purchase_invoices_id uuid := gen_random_uuid();
  v_payroll_report_id uuid := gen_random_uuid();
  v_expense_receipts_id uuid := gen_random_uuid();
  v_credit_card_statement_id uuid := gen_random_uuid();
begin
  insert into public.profiles (id, organization_id, full_name, role)
  values (
    new.owner_id,
    new.id,
    (select raw_user_meta_data ->> 'full_name' from auth.users where id = new.owner_id),
    'owner'
  );

  insert into public.document_types (id, organization_id, name, sort_order)
  values
    (v_bank_statement_id, new.id, 'Bank Statement', 1),
    (v_sales_invoices_id, new.id, 'Sales Invoices', 2),
    (v_purchase_invoices_id, new.id, 'Purchase Invoices', 3),
    (v_payroll_report_id, new.id, 'Payroll Report', 4),
    (v_expense_receipts_id, new.id, 'Expense Receipts', 5),
    (v_credit_card_statement_id, new.id, 'Credit Card Statement', 6);

  insert into public.classification_type_mappings (organization_id, ai_document_type, document_type_id)
  values
    (new.id, 'bank_statement', v_bank_statement_id),
    (new.id, 'sales_invoice', v_sales_invoices_id),
    (new.id, 'purchase_invoice', v_purchase_invoices_id),
    (new.id, 'payroll_report', v_payroll_report_id),
    (new.id, 'expense_receipt', v_expense_receipts_id),
    (new.id, 'credit_card_statement', v_credit_card_statement_id);

  insert into public.classification_settings (organization_id) values (new.id);
  insert into public.reminder_schedules (organization_id) values (new.id);

  return new;
end;
$$;

-- Backfill for organizations created before this migration.
insert into public.reminder_schedules (organization_id)
select id from public.organizations
on conflict (organization_id) do nothing;

-- Used only by the pgTAP test suite (0037) to genuinely exercise
-- claim_due_reminders' FOR UPDATE SKIP LOCKED across two real concurrent
-- sessions, rather than just asserting the single-session state machine.
-- No production code path uses it. Widely available, well-understood
-- extension; not a meaningful attack surface addition on its own.
create extension if not exists dblink;
