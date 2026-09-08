create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  period_start date not null,
  period_label text not null,
  status public.request_status not null default 'draft',
  deadline date,
  -- Maintained by recompute_request_status(), never set directly by the app.
  -- See 0016.
  completion_percent smallint not null default 0
    check (completion_percent between 0 and 100),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  completed_at timestamptz
);

create index if not exists requests_organization_id_idx on public.requests (organization_id);
create index if not exists requests_client_id_idx on public.requests (client_id);
create index if not exists requests_created_by_idx on public.requests (created_by);
