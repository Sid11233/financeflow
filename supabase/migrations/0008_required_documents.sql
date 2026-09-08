create table if not exists public.required_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  request_id uuid not null references public.requests (id) on delete cascade,
  document_type_id uuid not null references public.document_types (id) on delete restrict,
  status public.required_document_status not null default 'pending',
  sort_order smallint not null default 0,
  is_optional boolean not null default false,
  created_at timestamptz not null default now(),
  -- One line item per document type per request.
  unique (request_id, document_type_id)
);

create index if not exists required_documents_organization_id_idx on public.required_documents (organization_id);
create index if not exists required_documents_request_id_idx on public.required_documents (request_id);
create index if not exists required_documents_document_type_id_idx on public.required_documents (document_type_id);
