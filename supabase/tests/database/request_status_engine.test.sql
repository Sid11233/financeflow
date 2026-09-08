-- Tests for the request status engine (0028/0029). Run via
-- `supabase test db`, or directly against any migrated database (e.g.
-- `supabase db query --linked -f` this file) — it is fully self-contained
-- and wrapped in begin/rollback, so it never leaves data behind.
--
-- Builds its own fixture rather than depending on supabase/seed.sql (which
-- is only ever applied locally by `db reset`, not to a linked project):
-- one auth user, one organization (whose insert fires
-- handle_new_organization(), auto-creating the owner profile and the six
-- default document_types — Bank Statement, Sales Invoices, Purchase
-- Invoices, Payroll Report, Expense Receipts, Credit Card Statement), and
-- one client. Each scenario below creates its own request so scenarios
-- can't interfere with each other.
begin;
create temporary table pgtap_output (id serial primary key, line text);
insert into pgtap_output (line) select plan(18);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  'f0000000-0000-0000-0000-000000000001',
  'authenticated', 'authenticated', 'status-engine-test@financeflow.test',
  crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}',
  now(), now(), '', '', '', ''
);

insert into public.organizations (id, name, owner_id, created_at)
values (
  '22222222-2222-2222-2222-222222222222',
  'Status Engine Test Org',
  'f0000000-0000-0000-0000-000000000001',
  now()
);

insert into public.clients (id, organization_id, name, email, created_by)
values (
  '33333333-3333-3333-3333-333333333331',
  '22222222-2222-2222-2222-222222222222',
  'Test Client',
  'client@status-engine-test.example',
  'f0000000-0000-0000-0000-000000000001'
);

-- ============================================================
-- Scenario 1: a fresh request (5 mandatory items, all pending) is 0%.
-- ============================================================
insert into public.requests (id, organization_id, client_id, period_start, period_label, deadline, created_by, sent_at)
values (
  'a0000000-0000-0000-0000-000000000001',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333331',
  '2026-01-01', 'January 2026', current_date + 30,
  'f0000000-0000-0000-0000-000000000001', now()
);

insert into public.required_documents (organization_id, request_id, document_type_id, is_optional, sort_order)
select '22222222-2222-2222-2222-222222222222', 'a0000000-0000-0000-0000-000000000001', dt.id, false, dt.sort_order
from public.document_types dt
where dt.organization_id = '22222222-2222-2222-2222-222222222222'
  and dt.name in ('Bank Statement', 'Sales Invoices', 'Purchase Invoices', 'Payroll Report', 'Expense Receipts');

insert into pgtap_output (line) select is(
  (select completion_percent from public.requests where id = 'a0000000-0000-0000-0000-000000000001'),
  0::smallint,
  'fresh request with 5 pending mandatory items is 0% complete'
);
insert into pgtap_output (line) select is(
  (select status from public.requests where id = 'a0000000-0000-0000-0000-000000000001'),
  'sent'::public.request_status,
  'fresh sent request with nothing resolved is status ''sent'''
);

-- ============================================================
-- Scenario 2: resolving one of five mandatory items is 20%.
-- ============================================================
update public.required_documents
set status = 'accepted'
where request_id = 'a0000000-0000-0000-0000-000000000001'
  and document_type_id = (
    select id from public.document_types
    where organization_id = '22222222-2222-2222-2222-222222222222' and name = 'Bank Statement'
  );

insert into pgtap_output (line) select is(
  (select completion_percent from public.requests where id = 'a0000000-0000-0000-0000-000000000001'),
  20::smallint,
  'accepting 1 of 5 mandatory items brings completion to 20%'
);
insert into pgtap_output (line) select is(
  (select status from public.requests where id = 'a0000000-0000-0000-0000-000000000001'),
  'partial'::public.request_status,
  'a request with 1 of 5 resolved (and not overdue) is status ''partial'''
);
insert into pgtap_output (line) select ok(
  exists(
    select 1 from public.activity_log
    where request_id = 'a0000000-0000-0000-0000-000000000001'
      and event_type = 'request_status_changed'
      and payload @> '{"old_status": "sent", "new_status": "partial"}'::jsonb
  ),
  'the sent -> partial transition is recorded in activity_log with old and new status'
);

-- ============================================================
-- Scenario 3: optional items do not affect the percentage.
-- ============================================================
insert into public.requests (id, organization_id, client_id, period_start, period_label, deadline, created_by, sent_at)
values (
  'a0000000-0000-0000-0000-000000000003',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333331',
  '2026-03-01', 'March 2026', current_date + 30,
  'f0000000-0000-0000-0000-000000000001', now()
);

insert into public.required_documents (organization_id, request_id, document_type_id, status, is_optional, sort_order)
select
  '22222222-2222-2222-2222-222222222222', 'a0000000-0000-0000-0000-000000000003', dt.id,
  case when dt.name = 'Bank Statement' then 'accepted' else 'pending' end::public.required_document_status,
  false, dt.sort_order
from public.document_types dt
where dt.organization_id = '22222222-2222-2222-2222-222222222222'
  and dt.name in ('Bank Statement', 'Sales Invoices', 'Purchase Invoices', 'Payroll Report', 'Expense Receipts');

-- A 6th, optional item, also resolved — should add nothing on top of the
-- 20% the one mandatory acceptance above already produced.
insert into public.required_documents (organization_id, request_id, document_type_id, status, is_optional, sort_order)
select '22222222-2222-2222-2222-222222222222', 'a0000000-0000-0000-0000-000000000003', dt.id, 'accepted', true, dt.sort_order
from public.document_types dt
where dt.organization_id = '22222222-2222-2222-2222-222222222222' and dt.name = 'Credit Card Statement';

insert into pgtap_output (line) select is(
  (select completion_percent from public.requests where id = 'a0000000-0000-0000-0000-000000000003'),
  20::smallint,
  'an accepted optional item on top of 1 of 5 mandatory items still reads as 20%, not 33%'
);
insert into pgtap_output (line) select is(
  (select status from public.requests where id = 'a0000000-0000-0000-0000-000000000003'),
  'partial'::public.request_status,
  'status is driven by mandatory items only, ignoring the resolved optional one'
);

-- ============================================================
-- Scenario 4: waiving a mandatory item counts as resolved.
-- ============================================================
insert into public.requests (id, organization_id, client_id, period_start, period_label, deadline, created_by, sent_at)
values (
  'a0000000-0000-0000-0000-000000000004',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333331',
  '2026-04-01', 'April 2026', current_date + 30,
  'f0000000-0000-0000-0000-000000000001', now()
);

insert into public.required_documents (organization_id, request_id, document_type_id, is_optional, sort_order)
select '22222222-2222-2222-2222-222222222222', 'a0000000-0000-0000-0000-000000000004', dt.id, false, dt.sort_order
from public.document_types dt
where dt.organization_id = '22222222-2222-2222-2222-222222222222'
  and dt.name in ('Bank Statement', 'Sales Invoices', 'Purchase Invoices', 'Payroll Report', 'Expense Receipts');

update public.required_documents
set status = 'waived', waived_reason = 'No payroll run in September 2026'
where request_id = 'a0000000-0000-0000-0000-000000000004'
  and document_type_id = (
    select id from public.document_types
    where organization_id = '22222222-2222-2222-2222-222222222222' and name = 'Payroll Report'
  );

insert into pgtap_output (line) select is(
  (select completion_percent from public.requests where id = 'a0000000-0000-0000-0000-000000000004'),
  20::smallint,
  'waiving 1 of 5 mandatory items counts it as resolved, bringing completion to 20%'
);
insert into pgtap_output (line) select is(
  (select status from public.requests where id = 'a0000000-0000-0000-0000-000000000004'),
  'partial'::public.request_status,
  'a request with a waived item and nothing else resolved is ''partial'', same as if it had been accepted'
);
insert into pgtap_output (line) select isnt(
  (
    select waived_at from public.required_documents
    where request_id = 'a0000000-0000-0000-0000-000000000004'
      and document_type_id = (
        select id from public.document_types
        where organization_id = '22222222-2222-2222-2222-222222222222' and name = 'Payroll Report'
      )
  ),
  null,
  'waived_at is set automatically when status is set to ''waived'''
);

-- ============================================================
-- Scenario 5: deleting a document regresses the status.
-- ============================================================
insert into public.requests (id, organization_id, client_id, period_start, period_label, deadline, created_by, sent_at)
values (
  'a0000000-0000-0000-0000-000000000005',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333331',
  '2026-05-01', 'May 2026', current_date + 30,
  'f0000000-0000-0000-0000-000000000001', now()
);

insert into public.required_documents (id, organization_id, request_id, document_type_id, is_optional, sort_order)
select
  case dt.name when 'Bank Statement' then 'b0000000-0000-0000-0000-000000000005' else gen_random_uuid() end,
  '22222222-2222-2222-2222-222222222222', 'a0000000-0000-0000-0000-000000000005', dt.id, false, dt.sort_order
from public.document_types dt
where dt.organization_id = '22222222-2222-2222-2222-222222222222'
  and dt.name in ('Bank Statement', 'Sales Invoices', 'Purchase Invoices', 'Payroll Report', 'Expense Receipts');

-- Simulates the required_documents row having been marked 'received'
-- because a client uploaded a file against it.
update public.required_documents set status = 'received' where id = 'b0000000-0000-0000-0000-000000000005';

insert into public.documents (
  id, organization_id, request_id, required_document_id,
  storage_path, original_filename, mime_type, size_bytes
) values (
  'c0000000-0000-0000-0000-000000000005',
  '22222222-2222-2222-2222-222222222222',
  'a0000000-0000-0000-0000-000000000005',
  'b0000000-0000-0000-0000-000000000005',
  '22222222-2222-2222-2222-222222222222/a0000000-0000-0000-0000-000000000005/bank-statement.pdf',
  'bank-statement.pdf', 'application/pdf', 100000
);

insert into pgtap_output (line) select is(
  (select completion_percent from public.requests where id = 'a0000000-0000-0000-0000-000000000005'),
  20::smallint,
  'baseline before delete: 1 of 5 mandatory items received is 20%'
);

-- The client removes their upload by mistake.
update public.documents set deleted_at = now() where id = 'c0000000-0000-0000-0000-000000000005';

insert into pgtap_output (line) select is(
  (select status from public.required_documents where id = 'b0000000-0000-0000-0000-000000000005'),
  'pending'::public.required_document_status,
  'soft-deleting the only live document backing a ''received'' item reverts it to ''pending'''
);
insert into pgtap_output (line) select is(
  (select completion_percent from public.requests where id = 'a0000000-0000-0000-0000-000000000005'),
  0::smallint,
  'deleting the document regresses completion back to 0%'
);
insert into pgtap_output (line) select is(
  (select status from public.requests where id = 'a0000000-0000-0000-0000-000000000005'),
  'sent'::public.request_status,
  'deleting the document regresses status back from ''partial'' to ''sent'''
);

-- ============================================================
-- Scenario 6: the daily job flips a past-deadline incomplete request to
-- overdue, without any required_documents/documents activity to trigger it.
-- ============================================================
insert into public.requests (id, organization_id, client_id, period_start, period_label, deadline, created_by, sent_at)
values (
  'a0000000-0000-0000-0000-000000000006',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333331',
  '2026-08-01', 'August 2026', current_date + 30,
  'f0000000-0000-0000-0000-000000000001', now()
);

insert into public.required_documents (organization_id, request_id, document_type_id, is_optional, sort_order)
select '22222222-2222-2222-2222-222222222222', 'a0000000-0000-0000-0000-000000000006', dt.id, false, dt.sort_order
from public.document_types dt
where dt.organization_id = '22222222-2222-2222-2222-222222222222'
  and dt.name in ('Bank Statement', 'Sales Invoices', 'Purchase Invoices', 'Payroll Report', 'Expense Receipts');

-- The deadline quietly passes. Nothing touches required_documents or
-- documents, so no trigger fires — updating requests directly proves that.
update public.requests set deadline = current_date - 5 where id = 'a0000000-0000-0000-0000-000000000006';

insert into pgtap_output (line) select is(
  (select status from public.requests where id = 'a0000000-0000-0000-0000-000000000006'),
  'sent'::public.request_status,
  'a stale status does not recompute on its own when only the request row changes'
);

select public.recompute_all_open_requests();

insert into pgtap_output (line) select is(
  (select status from public.requests where id = 'a0000000-0000-0000-0000-000000000006'),
  'overdue'::public.request_status,
  'the daily sweep flips a past-deadline, unresolved request to ''overdue'''
);
insert into pgtap_output (line) select is(
  (select completion_percent from public.requests where id = 'a0000000-0000-0000-0000-000000000006'),
  0::smallint,
  'the daily sweep does not change completion_percent, only status'
);
insert into pgtap_output (line) select ok(
  exists(
    select 1 from public.activity_log
    where request_id = 'a0000000-0000-0000-0000-000000000006'
      and event_type = 'request_status_changed'
      and payload @> '{"old_status": "sent", "new_status": "overdue"}'::jsonb
  ),
  'the sent -> overdue transition triggered by the daily sweep is recorded in activity_log'
);

insert into pgtap_output (line) select * from finish();

select line from pgtap_output order by id;
rollback;
