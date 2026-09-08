create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- set null (not cascade): the log is a historical record and should
  -- survive deletion of the request or client it originally referenced.
  request_id uuid references public.requests (id) on delete set null,
  client_id uuid references public.clients (id) on delete set null,
  actor_type public.activity_actor_type not null,
  -- Polymorphic and intentionally not a foreign key: this is a profiles.id
  -- when actor_type = 'accountant', an opaque client-side identifier when
  -- actor_type = 'client', and null when actor_type = 'system'. A single FK
  -- can't span two different possible referenced tables.
  actor_id uuid,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_log_organization_id_idx on public.activity_log (organization_id);
create index if not exists activity_log_request_id_idx on public.activity_log (request_id);
create index if not exists activity_log_client_id_idx on public.activity_log (client_id);

comment on table public.activity_log is
  'Append-only audit trail. RLS (0014) grants authenticated select+insert only; there is deliberately no update/delete policy, reinforced by the explicit revoke below.';

-- Belt-and-suspenders: even a future policy mistake can't make this table
-- mutable for ordinary users. service_role bypasses RLS and grants alike,
-- so trusted server-side code can still correct entries if ever required.
revoke update, delete on public.activity_log from authenticated;
