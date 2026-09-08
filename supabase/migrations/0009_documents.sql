create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  request_id uuid not null references public.requests (id) on delete cascade,
  -- Nullable: a file can be uploaded before it's classified against a
  -- specific required_documents line item ("unclassified" inbox state).
  required_document_id uuid references public.required_documents (id) on delete set null,
  storage_path text not null,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  uploaded_at timestamptz not null default now(),
  -- Populated for uploads coming through the anonymous client portal; null
  -- for documents attached by an authenticated staff member.
  uploader_ip inet,
  ai_classification jsonb,
  ai_confidence numeric(5, 4) check (ai_confidence is null or ai_confidence between 0 and 1),
  review_status public.document_review_status not null default 'unreviewed',
  deleted_at timestamptz
);

create index if not exists documents_organization_id_idx on public.documents (organization_id);
create index if not exists documents_request_id_idx on public.documents (request_id);
create index if not exists documents_required_document_id_idx on public.documents (required_document_id);
