create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  request_id uuid not null references public.requests (id) on delete cascade,
  -- A plain check constraint (rather than a new enum type) since email is
  -- the only channel today; extending the list of allowed values later is a
  -- one-line ALTER TABLE instead of an enum migration.
  channel text not null default 'email' check (channel in ('email')),
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists reminders_organization_id_idx on public.reminders (organization_id);
create index if not exists reminders_request_id_idx on public.reminders (request_id);
create index if not exists reminders_created_by_idx on public.reminders (created_by);
