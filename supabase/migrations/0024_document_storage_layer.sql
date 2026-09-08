-- Set alongside review_status = 'rejected' when portal-confirm-upload's
-- magic-byte check finds a file's actual content doesn't match its claimed
-- type (e.g. 'file_type_mismatch'). Generic enough to reuse for other
-- future review outcomes, not just this one check.
alter table public.documents add column if not exists review_reason text;

-- Needed to call the cleanup-deleted-documents Edge Function on a schedule
-- (below) — pg_cron alone can only run SQL, and hard-deleting a Storage
-- object requires an HTTP call to the Storage API, which only pg_net can
-- make from inside Postgres.
create extension if not exists pg_net;

-- The cron job below needs the project URL and a service-role credential
-- to call the Edge Function. Neither is safe to hardcode into a migration
-- file (this one might end up in a public repo), so they're read from
-- Supabase Vault instead. Run this ONCE yourself in the SQL Editor before
-- (or after) applying this migration — it is NOT part of the migration
-- itself:
--
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<your service_role key>', 'service_role_key');
--
-- If you ever rotate the service role key, update the secret with:
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'service_role_key'),
--     '<new service_role key>'
--   );
do $$
begin
  if exists (select 1 from cron.job where jobname = 'cleanup-deleted-documents') then
    perform cron.unschedule('cleanup-deleted-documents');
  end if;
end $$;

select cron.schedule(
  'cleanup-deleted-documents',
  '0 3 * * *', -- daily at 03:00 UTC
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
      || '/functions/v1/cleanup-deleted-documents',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

comment on column public.documents.review_reason is
  'Machine-readable reason paired with review_status, e.g. file_type_mismatch when the magic-byte check in portal-confirm-upload rejects a file.';
