alter table public.clients add column if not exists notes text;

-- Postgres has no ADD CONSTRAINT IF NOT EXISTS, so this is wrapped the same
-- way 0002's enums are. A plain (non-partial) UNIQUE constraint already
-- allows unlimited NULL emails under standard SQL NULL semantics (NULL is
-- never equal to NULL), so this doesn't need a `where email is not null`
-- qualifier. It is intentionally case-sensitive at the database level —
-- the application always lowercases email before writing it (both the
-- client form and CSV import), so in practice this behaves as
-- case-insensitive uniqueness without needing an expression index, which
-- would complicate the ON CONFLICT target used by CSV import's bulk upsert.
do $$ begin
  alter table public.clients
    add constraint clients_organization_id_email_key unique (organization_id, email);
exception
  when duplicate_object then null;
end $$;

-- A client's default document checklist: which document_types get
-- pre-populated onto a new request for this client. A join table (rather
-- than a document_type_id[] column on clients) keeps this consistent with
-- every other relationship in this schema — real foreign keys, indexed,
-- RLS-scoped — instead of an unenforced array of IDs.
create table if not exists public.client_document_defaults (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  document_type_id uuid not null references public.document_types (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (client_id, document_type_id)
);

create index if not exists client_document_defaults_organization_id_idx
  on public.client_document_defaults (organization_id);
create index if not exists client_document_defaults_document_type_id_idx
  on public.client_document_defaults (document_type_id);

alter table public.client_document_defaults enable row level security;

drop policy if exists "org isolation" on public.client_document_defaults;
create policy "org isolation" on public.client_document_defaults
  for all
  to authenticated
  using (organization_id = public.auth_org_id())
  with check (organization_id = public.auth_org_id());

-- List-view read model over clients: adds active_request_count and the
-- most recent request's status/period, the same way request_overview
-- (0019) does for requests. security_invoker = true is required for the
-- identical reason documented there — without it this view, owned by the
-- migration role which also owns clients/requests, would bypass RLS on
-- both tables for every caller.
create or replace view public.client_overview
with (security_invoker = true)
as
select
  c.id,
  c.organization_id,
  c.name,
  c.email,
  c.phone,
  c.notes,
  c.is_archived,
  c.created_at,
  coalesce(active_stats.active_request_count, 0) as active_request_count,
  latest_request.status as last_request_status,
  latest_request.period_label as last_request_period_label
from public.clients c
left join lateral (
  select count(*) as active_request_count
  from public.requests r
  where r.client_id = c.id and r.status in ('draft', 'sent', 'partial', 'overdue')
) active_stats on true
left join lateral (
  select r.status, r.period_label
  from public.requests r
  where r.client_id = c.id
  order by r.period_start desc, r.created_at desc
  limit 1
) latest_request on true;

revoke all on public.client_overview from anon;
grant select on public.client_overview to authenticated;

comment on view public.client_overview is
  'List-view read model over clients: adds active_request_count and the most recent request''s status/period. security_invoker = true is required — see the comment on request_overview (0019) for why.';
