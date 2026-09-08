create table if not exists public.profiles (
  -- 1:1 with auth.users. This schema gives each user exactly one
  -- organization, so id doubles as both primary key and foreign key.
  id uuid primary key references auth.users (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  full_name text,
  role public.user_role not null default 'member',
  created_at timestamptz not null default now()
);

create index if not exists profiles_organization_id_idx on public.profiles (organization_id);

comment on table public.profiles is
  'Extends auth.users with FinanceFlow profile data and organization membership.';
