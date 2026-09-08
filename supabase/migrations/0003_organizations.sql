-- IF NOT EXISTS / DROP ... IF EXISTS guards run throughout these migrations
-- so a file can be pasted into the SQL Editor more than once (e.g. by
-- accident, or when resuming after an earlier statement in the same paste
-- failed) without erroring on objects an earlier run already created.
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- The user whose sign-up created this organization. The
  -- organizations_after_insert trigger (see 0015) uses this to know whose
  -- profile to create. One org has exactly one owner_id at creation time;
  -- ownership can move to another member later via profiles.role without
  -- touching this column.
  owner_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists organizations_owner_id_idx on public.organizations (owner_id);

comment on table public.organizations is
  'Tenant root. Every other table is scoped to one organization via organization_id.';
