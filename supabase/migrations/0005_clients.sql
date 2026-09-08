create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  email text,
  phone text,
  is_archived boolean not null default false,
  created_by uuid references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists clients_organization_id_idx on public.clients (organization_id);
create index if not exists clients_created_by_idx on public.clients (created_by);
