-- classification_queue (0022) was a stub with no real worker yet. This
-- evolves it in place into the real job table rather than leaving a
-- confusingly-named duplicate around: same table, renamed, with the
-- columns a real retry/backoff pipeline needs.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'classification_queue') then
    alter table public.classification_queue rename to classification_jobs;
  end if;
end $$;

alter table public.classification_jobs add column if not exists attempts smallint not null default 0;
alter table public.classification_jobs add column if not exists next_attempt_at timestamptz not null default now();
alter table public.classification_jobs add column if not exists last_error text;

-- Normalize before tightening the check constraint below — no real job has
-- run yet in practice, but this makes the migration safe regardless.
update public.classification_jobs set status = 'pending' where status not in ('pending', 'processing', 'done');

alter table public.classification_jobs drop constraint if exists classification_queue_status_check;
do $$ begin
  alter table public.classification_jobs
    add constraint classification_jobs_status_check
    check (status in ('pending', 'processing', 'done', 'dead_letter'));
exception
  when duplicate_object then null;
end $$;

drop index if exists classification_queue_pending_idx;
create index if not exists classification_jobs_due_idx
  on public.classification_jobs (next_attempt_at)
  where status = 'pending';

comment on table public.classification_jobs is
  'One row per document awaiting AI classification. Processed by classify-document, triggered both by an insert trigger (near-instant) and a 2-minute sweep (retries + safety net) — see the trigger and cron job below.';
comment on column public.classification_jobs.attempts is
  'Incremented atomically by claim_classification_job() each time a worker picks this job up. At 3, a failure moves it to dead_letter instead of being retried again.';

-- Per-organization tuning knobs for the classification pipeline, so they
-- can be adjusted without a deploy. Deliberately just the four the task
-- calls out — max retry attempts (3) is a pipeline-level constant in the
-- Edge Function itself, not a per-org setting.
create table if not exists public.classification_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  auto_accept_confidence numeric(3, 2) not null default 0.80 check (auto_accept_confidence between 0 and 1),
  reassign_confidence numeric(3, 2) not null default 0.80 check (reassign_confidence between 0 and 1),
  pdf_page_limit smallint not null default 5 check (pdf_page_limit > 0),
  model_name text not null default 'claude-sonnet-4-6',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.classification_settings enable row level security;

drop policy if exists "org isolation" on public.classification_settings;
create policy "org isolation" on public.classification_settings
  for all
  to authenticated
  using (organization_id = public.auth_org_id())
  with check (organization_id = public.auth_org_id());

-- Maps the AI's fixed classification vocabulary (bank_statement,
-- sales_invoice, ...) to a specific organization's document_types row —
-- the org's own catalog is freeform text, seeded with default names but
-- renameable, so this indirection is what lets classify-document reconcile
-- "the model said bank_statement" against "which of THIS org's
-- document_types is that".
create table if not exists public.classification_type_mappings (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  ai_document_type text not null check (
    ai_document_type in (
      'bank_statement', 'sales_invoice', 'purchase_invoice', 'payroll_report',
      'expense_receipt', 'credit_card_statement', 'tax_return', 'other', 'unreadable'
    )
  ),
  document_type_id uuid not null references public.document_types (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (organization_id, ai_document_type)
);

create index if not exists classification_type_mappings_document_type_id_idx
  on public.classification_type_mappings (document_type_id);

alter table public.classification_type_mappings enable row level security;

drop policy if exists "org isolation" on public.classification_type_mappings;
create policy "org isolation" on public.classification_type_mappings
  for all
  to authenticated
  using (organization_id = public.auth_org_id())
  with check (organization_id = public.auth_org_id());

comment on table public.classification_type_mappings is
  'Which of this org''s document_types corresponds to each AI classification label. Seeded by handle_new_organization() for the 6 default document_types; a firm that renames or adds types would need this table updated to match (no settings UI for that yet).';

-- handle_new_organization() (0015) now also seeds classification_settings
-- (defaults) and classification_type_mappings (for the 6 default
-- document_types) alongside the profile it already created. Needs the new
-- document_types' ids up front (generated here rather than left to
-- gen_random_uuid() defaults) so they can be reused in both inserts below
-- without a round trip.
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

  return new;
end;
$$;

-- Backfill for organizations created before this migration.
insert into public.classification_settings (organization_id)
select id from public.organizations
on conflict (organization_id) do nothing;

insert into public.classification_type_mappings (organization_id, ai_document_type, document_type_id)
select dt.organization_id, mapping.ai_type, dt.id
from public.document_types dt
join (
  values
    ('bank statement', 'bank_statement'),
    ('sales invoices', 'sales_invoice'),
    ('purchase invoices', 'purchase_invoice'),
    ('payroll report', 'payroll_report'),
    ('expense receipts', 'expense_receipt'),
    ('credit card statement', 'credit_card_statement')
) as mapping(dt_name, ai_type) on lower(dt.name) = mapping.dt_name
on conflict (organization_id, ai_document_type) do nothing;

-- Atomic claim: transitions a job from pending to processing and
-- increments attempts in one statement. Two workers (the insert trigger's
-- near-instant call and the 2-minute sweep) can legitimately race to pick
-- up the same job — whichever UPDATE lands first wins (returns the row);
-- the other gets zero rows back and skips it.
create or replace function public.claim_classification_job(p_job_id uuid)
returns public.classification_jobs
language sql
set search_path = public, pg_temp
as $$
  update public.classification_jobs
  set status = 'processing', attempts = attempts + 1
  where id = p_job_id and status = 'pending'
  returning *;
$$;

revoke all on function public.claim_classification_job(uuid) from public;
grant execute on function public.claim_classification_job(uuid) to service_role;

-- Read-only: the sweep uses this to find candidates, then claims each one
-- individually via claim_classification_job() right before processing it
-- (not here) — claiming and listing are kept separate so listing never
-- itself creates a race.
create or replace function public.find_due_classification_jobs(p_limit int default 20)
returns setof uuid
language sql
stable
set search_path = public, pg_temp
as $$
  select id from public.classification_jobs
  where status = 'pending' and next_attempt_at <= now()
  order by next_attempt_at asc
  limit p_limit;
$$;

revoke all on function public.find_due_classification_jobs(int) from public;
grant execute on function public.find_due_classification_jobs(int) to service_role;

-- "Database webhook on insert": implemented directly as a trigger + pg_net
-- call rather than the dashboard-configured Database Webhooks feature, so
-- the whole thing stays in version-controlled SQL — this is in fact the
-- same mechanism that feature uses internally. Reuses the project_url /
-- service_role_key Vault secrets already set up for cleanup-deleted-
-- documents (0024); no new secrets needed.
create or replace function public.trigger_classify_document()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
      || '/functions/v1/classify-document',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('jobId', new.id)
  );
  return new;
end;
$$;

drop trigger if exists classification_jobs_after_insert on public.classification_jobs;
create trigger classification_jobs_after_insert
  after insert on public.classification_jobs
  for each row
  execute function public.trigger_classify_document();

-- Scheduled sweep, every 2 minutes: catches jobs the insert trigger missed
-- (e.g. a transient net.http_post failure) and jobs backing off after a
-- prior failure. Calling classify-document with no jobId in the body puts
-- it in sweep mode (see the function itself).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'classification-sweep') then
    perform cron.unschedule('classification-sweep');
  end if;
end $$;

select cron.schedule(
  'classification-sweep',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
      || '/functions/v1/classify-document',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
