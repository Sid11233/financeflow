-- Scheduled hourly: send-digests itself decides, per organization, whether
-- "now" falls in that organization's configured send hour (reminder_schedules
-- timezone/send_hour), so an hourly tick is fine granularity — see the
-- function's own comment for why this doesn't need FOR UPDATE SKIP LOCKED
-- claiming the way process-reminders does.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'send-digests') then
    perform cron.unschedule('send-digests');
  end if;
end $$;

select cron.schedule(
  'send-digests',
  '0 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
      || '/functions/v1/send-digests',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
