create table if not exists public.document_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  sort_order smallint not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create index if not exists document_types_organization_id_idx on public.document_types (organization_id);

comment on column public.document_types.is_archived is
  'Archiving (not deleting) hides a type from new requests without breaking required_documents rows that already reference it — document_type_id is ON DELETE RESTRICT for the same reason.';
