-- Local development seed data. Run via `supabase db reset`, which applies
-- every migration in supabase/migrations/ against a fresh database and then
-- runs this file. Not meant for staging or production.
--
-- Login for local dev: accountant@financeflow.test / password123

-- One accountant, seeded directly into auth.users/auth.identities the way
-- the Supabase CLI's own local seeding examples do, since there is no
-- running app yet to drive a normal sign-up through GoTrue.
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  recovery_sent_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated',
  'authenticated',
  'accountant@financeflow.test',
  crypt('password123', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Alex Rivera"}',
  now(),
  now(),
  '',
  '',
  '',
  ''
);

insert into auth.identities (
  id,
  user_id,
  provider_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
) values (
  gen_random_uuid(),
  '11111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  format(
    '{"sub":"%s","email":"%s"}',
    '11111111-1111-1111-1111-111111111111',
    'accountant@financeflow.test'
  )::jsonb,
  'email',
  now(),
  now(),
  now()
);

-- Inserting the organization fires organizations_after_insert (0015), which
-- creates Alex's 'owner' profile row and seeds the six default
-- document_types for this org. Neither needs to be inserted here.
insert into public.organizations (id, name, owner_id, created_at)
values (
  '22222222-2222-2222-2222-222222222222',
  'Riverside Bookkeeping Co.',
  '11111111-1111-1111-1111-111111111111',
  now()
);

insert into public.clients (id, organization_id, name, email, created_by) values
  (
    '33333333-3333-3333-3333-333333333331',
    '22222222-2222-2222-2222-222222222222',
    'Harbor Yoga Studio',
    'billing@harboryoga.test',
    '11111111-1111-1111-1111-111111111111'
  ),
  (
    '33333333-3333-3333-3333-333333333332',
    '22222222-2222-2222-2222-222222222222',
    'Maple & Co. Bakery',
    'accounts@mapleandco.test',
    '11111111-1111-1111-1111-111111111111'
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    '22222222-2222-2222-2222-222222222222',
    'Ironwood Contracting LLC',
    'finance@ironwoodcontracting.test',
    '11111111-1111-1111-1111-111111111111'
  );

-- Request 1: Harbor Yoga Studio, 'sent' — every required document is still
-- pending, so the recompute trigger (fired by each required_documents
-- insert below) leaves the manually-set 'sent' status untouched.
insert into public.requests (
  id, organization_id, client_id, period_start, period_label,
  status, deadline, created_by, sent_at
) values (
  '44444444-4444-4444-4444-444444444441',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333331',
  '2026-08-01',
  'August 2026',
  'sent',
  '2026-09-25',
  '11111111-1111-1111-1111-111111111111',
  now()
);

insert into public.required_documents (organization_id, request_id, document_type_id, sort_order)
select
  '22222222-2222-2222-2222-222222222222',
  '44444444-4444-4444-4444-444444444441',
  dt.id,
  dt.sort_order
from public.document_types dt
where dt.organization_id = '22222222-2222-2222-2222-222222222222'
  and dt.name in ('Bank Statement', 'Sales Invoices', 'Purchase Invoices', 'Expense Receipts');

-- An upload link the accountant sent to Harbor Yoga for request 1.
-- token_hash is sha256('demo-token-harbor-yoga'), hex-encoded, computed the
-- same way the upload Edge Function would hash an incoming plaintext token.
insert into public.request_tokens (
  id, organization_id, request_id, token_hash, expires_at, created_by
) values (
  '55555555-5555-5555-5555-555555555551',
  '22222222-2222-2222-2222-222222222222',
  '44444444-4444-4444-4444-444444444441',
  encode(digest('demo-token-harbor-yoga', 'sha256'), 'hex'),
  now() + interval '30 days',
  '11111111-1111-1111-1111-111111111111'
);

insert into public.activity_log (organization_id, request_id, client_id, actor_type, actor_id, event_type, payload)
values (
  '22222222-2222-2222-2222-222222222222',
  '44444444-4444-4444-4444-444444444441',
  '33333333-3333-3333-3333-333333333331',
  'accountant',
  '11111111-1111-1111-1111-111111111111',
  'request_sent',
  '{"channel": "email"}'
);

-- Request 2: Maple & Co. Bakery, 'partial' — one mandatory document
-- accepted, one received but not yet reviewed, one still pending. Both
-- 'accepted' and 'received' count as resolved (0028), so the recompute
-- trigger derives 'partial' and a 67% completion_percent from this mix
-- automatically; status is not set explicitly below.
insert into public.requests (
  id, organization_id, client_id, period_start, period_label,
  status, deadline, created_by, sent_at
) values (
  '44444444-4444-4444-4444-444444444442',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333332',
  '2026-08-01',
  'August 2026',
  'sent',
  '2026-09-20',
  '11111111-1111-1111-1111-111111111111',
  now()
);

insert into public.required_documents (organization_id, request_id, document_type_id, status, sort_order)
select
  '22222222-2222-2222-2222-222222222222',
  '44444444-4444-4444-4444-444444444442',
  dt.id,
  case dt.name
    when 'Bank Statement' then 'accepted'
    when 'Sales Invoices' then 'received'
    else 'pending'
  end::required_document_status,
  dt.sort_order
from public.document_types dt
where dt.organization_id = '22222222-2222-2222-2222-222222222222'
  and dt.name in ('Bank Statement', 'Sales Invoices', 'Purchase Invoices');

-- One classified, accepted upload matching the Bank Statement line item...
insert into public.documents (
  id, organization_id, request_id, required_document_id,
  storage_path, original_filename, mime_type, size_bytes,
  uploader_ip, review_status
)
select
  '66666666-6666-6666-6666-666666666661',
  '22222222-2222-2222-2222-222222222222',
  '44444444-4444-4444-4444-444444444442',
  rd.id,
  '22222222-2222-2222-2222-222222222222/44444444-4444-4444-4444-444444444442/bank-statement-august.pdf',
  'bank-statement-august.pdf',
  'application/pdf',
  482913,
  '203.0.113.42',
  'confirmed'
from public.required_documents rd
where rd.request_id = '44444444-4444-4444-4444-444444444442'
  and rd.document_type_id = (
    select id from public.document_types
    where organization_id = '22222222-2222-2222-2222-222222222222'
      and name = 'Bank Statement'
  );

-- ...and one unclassified upload still waiting to be matched to a line item.
insert into public.documents (
  id, organization_id, request_id, required_document_id,
  storage_path, original_filename, mime_type, size_bytes,
  uploader_ip, review_status
) values (
  '66666666-6666-6666-6666-666666666662',
  '22222222-2222-2222-2222-222222222222',
  '44444444-4444-4444-4444-444444444442',
  null,
  '22222222-2222-2222-2222-222222222222/44444444-4444-4444-4444-444444444442/scan0007.pdf',
  'scan0007.pdf',
  'application/pdf',
  118204,
  '203.0.113.42',
  'unreviewed'
);

insert into public.activity_log (organization_id, request_id, client_id, actor_type, actor_id, event_type, payload)
values
  (
    '22222222-2222-2222-2222-222222222222',
    '44444444-4444-4444-4444-444444444442',
    '33333333-3333-3333-3333-333333333332',
    'client',
    null,
    'document_uploaded',
    '{"original_filename": "bank-statement-august.pdf"}'
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    '44444444-4444-4444-4444-444444444442',
    '33333333-3333-3333-3333-333333333332',
    'accountant',
    '11111111-1111-1111-1111-111111111111',
    'document_accepted',
    '{"original_filename": "bank-statement-august.pdf"}'
  );

-- Ironwood Contracting LLC intentionally has no request yet, to leave a
-- client-with-no-active-requests case in the seed data too.
