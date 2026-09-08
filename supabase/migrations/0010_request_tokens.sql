create table if not exists public.request_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  request_id uuid not null references public.requests (id) on delete cascade,
  -- sha256 hex digest of the plaintext token. The plaintext is shown to the
  -- client exactly once, in the emailed/shared link, and is never stored.
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_accessed_at timestamptz,
  access_count integer not null default 0 check (access_count >= 0),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists request_tokens_organization_id_idx on public.request_tokens (organization_id);
create index if not exists request_tokens_request_id_idx on public.request_tokens (request_id);
create index if not exists request_tokens_created_by_idx on public.request_tokens (created_by);

comment on column public.request_tokens.token_hash is
  'sha256(plaintext token), hex-encoded. Only a service-role Edge Function ever sees the plaintext, to hash it and look it up here — see the RLS comments in 0014.';
