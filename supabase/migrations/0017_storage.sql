-- Private bucket for uploaded client documents. Objects are stored under
-- <organization_id>/<request_id>/<filename>, which keeps the bucket
-- tenant-partitioned and lets the read policy below check organization_id
-- straight from the path, with no table join needed.
insert into storage.buckets (id, name, public)
values ('client-documents', 'client-documents', false)
on conflict (id) do nothing;

-- Not "alter table storage.objects enable row level security" here: Supabase
-- ships every project with RLS already enabled on storage.objects, and the
-- table is owned by an internal role (supabase_storage_admin), not by the
-- postgres role the SQL Editor runs as — toggling RLS on it directly fails
-- with "must be owner of table objects". Managing policies on it (below) is
-- explicitly granted and is the supported way to control storage access.

-- Authenticated staff can read objects filed under their own organization's
-- folder. There is deliberately no authenticated INSERT/UPDATE policy here:
-- every upload today comes from the anonymous client portal via a
-- service-role Edge Function (see the RLS comment block in 0014 for why
-- that flow never goes through anon policies), and service_role bypasses
-- storage RLS the same way it bypasses table RLS. Add an authenticated
-- write policy here if in-app staff uploads are built later.
drop policy if exists "org members can read their organization's documents" on storage.objects;
create policy "org members can read their organization's documents"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'client-documents'
    and (storage.foldername(name))[1] = public.auth_org_id()::text
  );
