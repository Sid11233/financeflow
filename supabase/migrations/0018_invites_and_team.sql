-- Adds team management: an invites table, an "is this caller an owner"
-- helper, a team-roster RPC that can see auth.users.email, and tighter
-- profiles policies (only an owner may edit someone else's profile or
-- remove them — the previous blanket "org isolation" policy let any member
-- do either).

create or replace function public.auth_is_owner()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'owner'
  )
$$;

revoke all on function public.auth_is_owner() from public;
grant execute on function public.auth_is_owner() to authenticated;

comment on function public.auth_is_owner() is
  'True if the current auth.uid() has role = owner in profiles. SECURITY DEFINER for the same non-recursion reason as auth_org_id().';

-- auth.users.email is not exposed to PostgREST directly (the auth schema
-- isn't in the exposed schema list), so the team roster needs a function
-- that can join it in from inside the database. SECURITY DEFINER, but the
-- org scoping is done internally via auth_org_id() rather than trusting a
-- caller-supplied filter, so it can't be used to read another org's roster.
create or replace function public.list_org_members()
returns table (
  id uuid,
  email text,
  full_name text,
  role public.user_role,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, u.email, p.full_name, p.role, p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.organization_id = public.auth_org_id()
  order by p.created_at asc
$$;

revoke all on function public.list_org_members() from public;
grant execute on function public.list_org_members() to authenticated;

comment on function public.list_org_members() is
  'Team roster for the caller''s organization, including each member''s email.';

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null,
  role public.user_role not null default 'member',
  -- sha256 hex digest of the plaintext invite token, same convention as
  -- request_tokens.token_hash: the plaintext only ever appears in the
  -- emailed link and is never stored.
  token_hash text not null unique,
  invited_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists invites_organization_id_idx on public.invites (organization_id);
create index if not exists invites_invited_by_idx on public.invites (invited_by);

alter table public.invites enable row level security;

-- Any org member can see who's been invited; only an owner can create or
-- revoke one. There is no delete policy — revoking sets revoked_at instead
-- of removing the row, keeping a record of who invited whom. accept-invite
-- writes through service_role (see supabase/functions/accept-invite), so it
-- doesn't depend on any policy here to mark an invite accepted.
drop policy if exists "org members can view invites" on public.invites;
create policy "org members can view invites" on public.invites
  for select
  to authenticated
  using (organization_id = public.auth_org_id());

drop policy if exists "owners can create invites" on public.invites;
create policy "owners can create invites" on public.invites
  for insert
  to authenticated
  with check (organization_id = public.auth_org_id() and public.auth_is_owner());

drop policy if exists "owners can revoke invites" on public.invites;
create policy "owners can revoke invites" on public.invites
  for update
  to authenticated
  using (organization_id = public.auth_org_id() and public.auth_is_owner())
  with check (organization_id = public.auth_org_id() and public.auth_is_owner());

-- Replace profiles' original blanket "org isolation" policy (0014), which
-- let any member update or delete any other member's row, with granular
-- ones: everyone can still view the whole roster and edit their own row,
-- but only an owner can edit someone else's (e.g. change their role) or
-- remove them. There is intentionally no INSERT policy for authenticated —
-- the org-bootstrap trigger (0015) and accept-invite both write profiles
-- through SECURITY DEFINER / service_role, so no client-side insert path
-- is needed, and none should exist.
drop policy if exists "org isolation" on public.profiles;

drop policy if exists "org members can view team" on public.profiles;
create policy "org members can view team" on public.profiles
  for select
  to authenticated
  using (organization_id = public.auth_org_id());

drop policy if exists "members can update own profile, owners can update any" on public.profiles;
create policy "members can update own profile, owners can update any" on public.profiles
  for update
  to authenticated
  using (organization_id = public.auth_org_id() and (id = auth.uid() or public.auth_is_owner()))
  with check (organization_id = public.auth_org_id() and (id = auth.uid() or public.auth_is_owner()));

drop policy if exists "owners can remove members" on public.profiles;
create policy "owners can remove members" on public.profiles
  for delete
  to authenticated
  using (organization_id = public.auth_org_id() and public.auth_is_owner());
