-- Tests for the automated reminder engine (0034-0036). Fully
-- self-contained (builds its own org/user/client) and wrapped in
-- begin/rollback, so it never leaves data behind — same convention as
-- request_status_engine.test.sql.
--
-- On "no double sends under concurrent execution": a genuine two-session
-- test (open a real second Postgres connection, hold a lock, verify a
-- concurrent claim gets skipped) was attempted via dblink and abandoned —
-- self-connections require a database password this project has no
-- access to (only an HTTP API key and project URL are available; see
-- 0037's comment for what was actually tried). What scenario 4 below
-- verifies instead is the state-transition precondition that makes FOR
-- UPDATE SKIP LOCKED meaningful in the first place: claiming a reminder
-- atomically moves it out of the 'pending' pool, so a second claim call —
-- concurrent or not — structurally cannot return the same row. SKIP
-- LOCKED itself is foundational, independently-proven Postgres behavior;
-- what could actually contain a bug is whether claim_due_reminders uses
-- it correctly, which this does exercise.
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'f5000000-0000-0000-0000-000000000001',
  'authenticated', 'authenticated', 'reminder-engine-test@financeflow.test',
  crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
);

insert into public.organizations (id, name, owner_id, created_at)
values ('e5000000-0000-0000-0000-000000000001', 'Reminder Engine Test Org', 'f5000000-0000-0000-0000-000000000001', now());
-- fires handle_new_organization() -> seeds reminder_schedules with the
-- default ladder, send_hour 9, timezone Indian/Mauritius.

insert into public.clients (id, organization_id, name, email, created_by)
values ('d5000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001', 'Reminder Test Client', 'reminderclient@example.com', 'f5000000-0000-0000-0000-000000000001');

-- Deliberately NOT switching to `authenticated` role for the whole file:
-- claim_due_reminders and client_has_reminder_today are service_role-only
-- by design (see 0035/0036 — an ordinary org member has no business
-- claiming/processing due reminders across the platform), so they're
-- called below under this session's own (superuser-equivalent, RLS-
-- bypassing) role, matching how process-reminders itself calls them.
-- Only push_back_pending_reminders is authenticated-gated and needs
-- auth_org_id() to resolve — it switches role locally, right before use.
create temporary table reminder_test_output (id serial primary key, line text);
grant insert, select on reminder_test_output to authenticated;
grant usage on sequence reminder_test_output_id_seq to authenticated;

insert into reminder_test_output (line) select plan(17);

-- ============================================================
-- Scenario 1: materializing the default ladder produces 5 rows with the
-- right types/audiences, and the day-0 "initial" rung is pre-marked sent.
-- ============================================================
insert into public.requests (id, organization_id, client_id, period_start, period_label, deadline, created_by, sent_at)
values ('a5000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001', '2026-01-01', 'January 2026', current_date + 30, 'f5000000-0000-0000-0000-000000000001', '2026-01-30 20:00:00+00');

select public.materialize_reminder_ladder('a5000000-0000-0000-0000-000000000001');

insert into reminder_test_output (line) select is(
  (select count(*)::int from public.reminders where request_id = 'a5000000-0000-0000-0000-000000000001'),
  5,
  'materializing the default ladder creates exactly 5 reminders rows'
);
insert into reminder_test_output (line) select is(
  (select status from public.reminders where request_id = 'a5000000-0000-0000-0000-000000000001' and type = 'initial'),
  'sent'::text,
  'the day-0 initial rung is pre-marked sent (send-request already sends it synchronously)'
);
insert into reminder_test_output (line) select is(
  (select audience from public.reminders where request_id = 'a5000000-0000-0000-0000-000000000001' and type = 'overdue'),
  'accountant'::text,
  'the overdue rung defaults to accountant audience'
);
insert into reminder_test_output (line) select is(
  (select audience from public.reminders where request_id = 'a5000000-0000-0000-0000-000000000001' and type = 'escalation'),
  'both'::text,
  'the escalation rung defaults to both audiences'
);

-- ============================================================
-- Scenario 2: timezone handling around a month boundary (Indian/Mauritius,
-- UTC+4, no DST). Sent Jan 30 20:00 UTC = Jan 31 00:00 local, so day_offset
-- 2 must land on Feb 2nd local time, not stay in January.
-- ============================================================
insert into reminder_test_output (line) select is(
  (select (scheduled_for at time zone 'Indian/Mauritius')::date
   from public.reminders where request_id = 'a5000000-0000-0000-0000-000000000001' and type = 'nudge'),
  '2026-02-02'::date,
  'day_offset 2 from a Jan-31-local send correctly rolls into February'
);
insert into reminder_test_output (line) select is(
  (select extract(hour from scheduled_for at time zone 'Indian/Mauritius')::int
   from public.reminders where request_id = 'a5000000-0000-0000-0000-000000000001' and type = 'nudge'),
  9,
  'the nudge rung fires at the organization''s configured local send hour (9am)'
);
insert into reminder_test_output (line) select is(
  (select scheduled_for from public.reminders where request_id = 'a5000000-0000-0000-0000-000000000001' and type = 'nudge'),
  '2026-02-02 05:00:00+00'::timestamptz,
  'Mauritius (UTC+4, no DST) 9am local on Feb 2 is correctly stored as 05:00 UTC'
);

-- ============================================================
-- Scenario 3: timezone handling across a DST transition (America/New_York
-- observes DST; 2026 US DST starts Sunday March 8th). A ladder spanning
-- the transition must resolve each rung's UTC offset independently rather
-- than reusing whatever offset applied when the request was sent.
-- ============================================================
update public.reminder_schedules set timezone = 'America/New_York' where organization_id = 'e5000000-0000-0000-0000-000000000001';

insert into public.requests (id, organization_id, client_id, period_start, period_label, deadline, created_by, sent_at)
values ('a5000000-0000-0000-0000-000000000002', 'e5000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001', '2026-02-01', 'February 2026', current_date + 30, 'f5000000-0000-0000-0000-000000000001', '2026-03-05 15:00:00+00');

select public.materialize_reminder_ladder('a5000000-0000-0000-0000-000000000002');

insert into reminder_test_output (line) select is(
  (select scheduled_for from public.reminders where request_id = 'a5000000-0000-0000-0000-000000000002' and type = 'nudge'),
  '2026-03-07 14:00:00+00'::timestamptz,
  'before DST starts, 9am America/New_York is correctly stored as 14:00 UTC (EST, UTC-5)'
);
insert into reminder_test_output (line) select is(
  (select scheduled_for from public.reminders where request_id = 'a5000000-0000-0000-0000-000000000002' and type = 'firm'),
  '2026-03-10 13:00:00+00'::timestamptz,
  'after DST starts (Mar 8), the same 9am local time is correctly stored as 13:00 UTC (EDT, UTC-4) — the offset was re-resolved per rung, not carried over from send time'
);

-- reset for the remaining scenarios, which don't care about timezone specifics
update public.reminder_schedules set timezone = 'Indian/Mauritius' where organization_id = 'e5000000-0000-0000-0000-000000000001';

-- ============================================================
-- Scenario 4: claim_due_reminders — only due, pending reminders are
-- claimed, and a claimed row moves to 'processing' so a second claim call
-- never returns it again (the property that makes SKIP LOCKED meaningful
-- — see reminder_engine_concurrency.test.sql for the genuine cross-session
-- version of this same guarantee).
-- ============================================================
update public.reminders
set scheduled_for = now() - interval '1 minute'
where request_id = 'a5000000-0000-0000-0000-000000000001' and type = 'nudge';

insert into reminder_test_output (line) select ok(
  (select count(*)::int from public.claim_due_reminders(100)
   where request_id = 'a5000000-0000-0000-0000-000000000001' and type = 'nudge') = 1,
  'a due, pending reminder is claimed'
);
insert into reminder_test_output (line) select is(
  (select status from public.reminders where request_id = 'a5000000-0000-0000-0000-000000000001' and type = 'nudge'),
  'processing'::text,
  'claiming a reminder moves it to status processing'
);
insert into reminder_test_output (line) select is(
  (select count(*)::int from public.claim_due_reminders(100)
   where request_id = 'a5000000-0000-0000-0000-000000000001' and type = 'nudge'),
  0,
  'a second claim call does not re-claim the same (now processing) reminder'
);

-- ============================================================
-- Scenario 5: client_has_reminder_today respects the organization's own
-- local calendar day, not UTC. Mauritius is UTC+4, so 21:00 UTC is already
-- the next calendar day locally.
-- ============================================================
update public.reminders set status = 'pending' where id = (
  select id from public.reminders where request_id = 'a5000000-0000-0000-0000-000000000001' and type = 'nudge'
);

insert into reminder_test_output (line) select ok(
  not public.client_has_reminder_today('d5000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001'),
  'no client-facing reminder sent yet today -> daily cap not reached'
);

update public.reminders
set status = 'sent', sent_at = now()
where request_id = 'a5000000-0000-0000-0000-000000000001' and type = 'nudge';

insert into reminder_test_output (line) select ok(
  public.client_has_reminder_today('d5000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001'),
  'after a client-facing reminder is sent, the daily cap is reached for the rest of today'
);

update public.reminders
set sent_at = (date_trunc('day', now() at time zone 'Indian/Mauritius') at time zone 'Indian/Mauritius') - interval '1 hour'
where request_id = 'a5000000-0000-0000-0000-000000000001' and type = 'nudge';

insert into reminder_test_output (line) select ok(
  not public.client_has_reminder_today('d5000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001'),
  'a reminder sent before local midnight (yesterday, in the organization''s own timezone) does not count toward today''s cap'
);

-- ============================================================
-- Scenario 6: push_back_pending_reminders (manual "Send Reminder" support)
-- shifts every remaining pending reminder later by enough to keep the next
-- one at least a day away, preserving relative spacing between the rest.
--
-- Uses a brand-new request sent "now", rather than reusing request 1/2
-- above: those were deliberately backdated for the timezone scenarios,
-- which makes their ladder rungs already due — and scenario 4's
-- claim_due_reminders(100) call has no request_id filter, so it would
-- have already swept them into 'processing' by this point.
-- ============================================================
insert into public.requests (id, organization_id, client_id, period_start, period_label, deadline, created_by, sent_at)
values ('a5000000-0000-0000-0000-000000000003', 'e5000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001', '2026-09-01', 'September 2026', current_date + 30, 'f5000000-0000-0000-0000-000000000001', now());

select public.materialize_reminder_ladder('a5000000-0000-0000-0000-000000000003');

update public.reminders
set scheduled_for = now() + interval '10 minutes'
where request_id = 'a5000000-0000-0000-0000-000000000003' and type = 'nudge' and status = 'pending';
update public.reminders
set scheduled_for = now() + interval '3 days'
where request_id = 'a5000000-0000-0000-0000-000000000003' and type = 'firm' and status = 'pending';

set local role authenticated;
set local request.jwt.claims = '{"sub":"f5000000-0000-0000-0000-000000000001","role":"authenticated"}';

select public.push_back_pending_reminders('a5000000-0000-0000-0000-000000000003', interval '1 day');

insert into reminder_test_output (line) select ok(
  (select scheduled_for from public.reminders where request_id = 'a5000000-0000-0000-0000-000000000003' and type = 'nudge')
    >= now() + interval '23 hours',
  'push_back_pending_reminders delays the next pending reminder to at least the requested gap from now'
);
insert into reminder_test_output (line) select ok(
  (select scheduled_for from public.reminders where request_id = 'a5000000-0000-0000-0000-000000000003' and type = 'firm')
    > (select scheduled_for from public.reminders where request_id = 'a5000000-0000-0000-0000-000000000003' and type = 'nudge'),
  'later rungs stay after the pushed-back one — relative ladder ordering is preserved'
);

insert into reminder_test_output (line) select * from finish();

select line from reminder_test_output order by id;

reset role;
rollback;
