-- Daily cap check for process-reminders: has this client already received
-- a client-facing reminder today, in the organization's own local
-- calendar day (not UTC) — otherwise a send just after local midnight UTC
-- could be miscounted against the wrong day for organizations far from
-- UTC. Only checks status = 'sent': a 'skipped' or 'failed' row never
-- reached the client, so it shouldn't count against the cap.
create or replace function public.client_has_reminder_today(p_client_id uuid, p_organization_id uuid)
returns boolean
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_timezone text;
  v_day_start timestamptz;
begin
  select timezone into v_timezone
  from public.reminder_schedules where organization_id = p_organization_id;
  v_timezone := coalesce(v_timezone, 'Indian/Mauritius');

  v_day_start := date_trunc('day', now() at time zone v_timezone) at time zone v_timezone;

  return exists (
    select 1
    from public.reminders r
    join public.requests req on req.id = r.request_id
    where req.client_id = p_client_id
      and r.organization_id = p_organization_id
      and r.audience in ('client', 'both')
      and r.status = 'sent'
      and r.sent_at >= v_day_start
      and r.sent_at < v_day_start + interval '1 day'
  );
end;
$$;

comment on function public.client_has_reminder_today(uuid, uuid) is
  'True if this client already has a sent client-facing reminder today, in the organization''s own local calendar day. Used by process-reminders to enforce "at most one client-facing reminder per client per day" before sending.';

revoke all on function public.client_has_reminder_today(uuid, uuid) from public;
grant execute on function public.client_has_reminder_today(uuid, uuid) to service_role;

-- Backs the "Send Reminder" manual action: after sending immediately, push
-- every still-pending reminder for this request later so an automated one
-- doesn't follow an hour behind. Rather than a fixed shift, this computes
-- exactly enough delay to put the *next* pending reminder at least
-- p_min_gap after now, then applies that same shift to every pending
-- reminder for the request — preserving the ladder's relative spacing,
-- just anchored to "now" instead of wherever it happened to be.
-- No-ops if the next pending reminder is already comfortably in the
-- future (shift would be negative).
create or replace function public.push_back_pending_reminders(p_request_id uuid, p_min_gap interval default interval '1 day')
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_org_id uuid := public.auth_org_id();
  v_next_scheduled timestamptz;
  v_shift interval;
begin
  select min(scheduled_for) into v_next_scheduled
  from public.reminders
  where request_id = p_request_id and organization_id = v_org_id and status = 'pending';

  if v_next_scheduled is null then
    return;
  end if;

  v_shift := (now() + p_min_gap) - v_next_scheduled;
  if v_shift <= interval '0' then
    return;
  end if;

  update public.reminders
  set scheduled_for = scheduled_for + v_shift
  where request_id = p_request_id and organization_id = v_org_id and status = 'pending';
end;
$$;

comment on function public.push_back_pending_reminders(uuid, interval) is
  'Called after a manual "Send Reminder" send: shifts every remaining pending reminder for the request later, by just enough to keep the next one at least p_min_gap away, so an automated reminder never lands minutes/hours after a manual one.';

revoke all on function public.push_back_pending_reminders(uuid, interval) from public;
grant execute on function public.push_back_pending_reminders(uuid, interval) to authenticated;

-- Scheduled every 15 minutes: catches every due reminder regardless of
-- which of the 15-minute windows its scheduled_for instant falls into.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'process-reminders') then
    perform cron.unschedule('process-reminders');
  end if;
end $$;

select cron.schedule(
  'process-reminders',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
      || '/functions/v1/process-reminders',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
