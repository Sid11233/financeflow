-- Row-Level Security for every FinanceFlow table.
--
-- Blanket rule: authenticated users may select/insert/update/delete only
-- rows whose organization_id equals auth_org_id() (their own org, resolved
-- via profiles). There is no policy for the `anon` role anywhere in this
-- file — with RLS enabled and no matching policy, Postgres denies the
-- operation outright, so anon has zero access to every one of these tables
-- by construction, not by omission we have to remember to keep omitted.
--
-- WHY THE PUBLIC UPLOAD FLOW HAS NO ANON POLICIES
-- The public portal (POST /upload/:token) lets an unauthenticated client
-- submit documents against a request. It would be tempting to add narrow
-- anon policies here (e.g. "anon can insert into documents if a valid,
-- unexpired token for that request exists"), but that requires re-deriving
-- token validity — hashing the incoming plaintext token and checking
-- expires_at/revoked_at — inside a SQL policy expression that runs on every
-- row check, using row-level security to enforce what is really an
-- authentication decision. Getting that wrong is a direct path to a
-- cross-tenant data leak, and it can't be unit-tested the way a normal
-- function can. Instead, the plaintext token is only ever handled by a
-- service-role Edge Function: it verifies the token (hash + expiry +
-- revocation) in application code, then performs the insert using the
-- service-role key, which bypasses RLS entirely. RLS here still protects
-- every table from anon and from other tenants; it just isn't the layer
-- that authenticates the client portal.
--
-- profiles: SECURITY DEFINER (bypasses RLS) is what lets auth_org_id()
-- work at all; see 0013.
--
-- Postgres has no `create policy if not exists`, so every policy below is
-- preceded by a matching `drop policy if exists`, making this file safe to
-- paste more than once.

alter table public.organizations enable row level security;

-- organizations has no organization_id column (it IS the tenant root), so
-- its policies compare id instead. INSERT is deliberately looser than the
-- rest: a brand-new authenticated user has no profile yet (auth_org_id()
-- is null), so they couldn't pass an organization_id = auth_org_id() check
-- even for their own first organization. Self-serve sign-up instead checks
-- that the caller is creating an org they will own; profile creation and
-- document_types seeding for that first user then happen exclusively
-- through the SECURITY DEFINER trigger in 0015, not through this policy.
drop policy if exists "org members can view their organization" on public.organizations;
create policy "org members can view their organization" on public.organizations
  for select
  to authenticated
  using (id = public.auth_org_id());

drop policy if exists "authenticated users can create their own organization" on public.organizations;
create policy "authenticated users can create their own organization" on public.organizations
  for insert
  to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "org members can update their organization" on public.organizations;
create policy "org members can update their organization" on public.organizations
  for update
  to authenticated
  using (id = public.auth_org_id())
  with check (id = public.auth_org_id());

drop policy if exists "org members can delete their organization" on public.organizations;
create policy "org members can delete their organization" on public.organizations
  for delete
  to authenticated
  using (id = public.auth_org_id());

alter table public.profiles enable row level security;

drop policy if exists "org isolation" on public.profiles;
create policy "org isolation" on public.profiles
  for all
  to authenticated
  using (organization_id = public.auth_org_id())
  with check (organization_id = public.auth_org_id());

alter table public.clients enable row level security;

drop policy if exists "org isolation" on public.clients;
create policy "org isolation" on public.clients
  for all
  to authenticated
  using (organization_id = public.auth_org_id())
  with check (organization_id = public.auth_org_id());

alter table public.document_types enable row level security;

drop policy if exists "org isolation" on public.document_types;
create policy "org isolation" on public.document_types
  for all
  to authenticated
  using (organization_id = public.auth_org_id())
  with check (organization_id = public.auth_org_id());

alter table public.requests enable row level security;

drop policy if exists "org isolation" on public.requests;
create policy "org isolation" on public.requests
  for all
  to authenticated
  using (organization_id = public.auth_org_id())
  with check (organization_id = public.auth_org_id());

alter table public.required_documents enable row level security;

drop policy if exists "org isolation" on public.required_documents;
create policy "org isolation" on public.required_documents
  for all
  to authenticated
  using (organization_id = public.auth_org_id())
  with check (organization_id = public.auth_org_id());

alter table public.documents enable row level security;

drop policy if exists "org isolation" on public.documents;
create policy "org isolation" on public.documents
  for all
  to authenticated
  using (organization_id = public.auth_org_id())
  with check (organization_id = public.auth_org_id());

alter table public.request_tokens enable row level security;

drop policy if exists "org isolation" on public.request_tokens;
create policy "org isolation" on public.request_tokens
  for all
  to authenticated
  using (organization_id = public.auth_org_id())
  with check (organization_id = public.auth_org_id());

alter table public.reminders enable row level security;

drop policy if exists "org isolation" on public.reminders;
create policy "org isolation" on public.reminders
  for all
  to authenticated
  using (organization_id = public.auth_org_id())
  with check (organization_id = public.auth_org_id());

-- activity_log: select + insert only, scoped to the caller's org. There is
-- no update/delete policy — combined with the REVOKE in 0012, this keeps
-- the log append-only for the authenticated role. service_role bypasses
-- RLS (as it does for every table here) and can still write system-actor
-- events or, if ever necessary, correct entries.
alter table public.activity_log enable row level security;

drop policy if exists "org members can view their organization's activity" on public.activity_log;
create policy "org members can view their organization's activity" on public.activity_log
  for select
  to authenticated
  using (organization_id = public.auth_org_id());

drop policy if exists "org members can record activity" on public.activity_log;
create policy "org members can record activity" on public.activity_log
  for insert
  to authenticated
  with check (organization_id = public.auth_org_id());
