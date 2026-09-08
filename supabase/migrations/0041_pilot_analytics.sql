-- Pilot analytics layer: a FinanceFlow-internal (not customer-facing)
-- dashboard at /admin/metrics for understanding how pilot organizations
-- are actually using the product. Two pieces:
--   1. product_events — a lightweight first-party event log for frontend
--      actions that have no other durable trace (activity_log is
--      request/client-scoped audit history for firms; this is our own
--      product-usage telemetry, deliberately kept in this database rather
--      than sent to a third-party analytics tool, given what this app
--      stores).
--   2. Four views over existing + new data, each self-gated to is_staff
--      (see auth_is_staff() below) so they can safely read ACROSS every
--      organization — the one deliberate exception to this app's
--      otherwise-universal per-organization RLS isolation.

-- ============================================================
-- is_staff: a FinanceFlow-internal flag, unrelated to profiles.role
-- (owner/member is a per-organization concept; is_staff is "this person
-- operates FinanceFlow itself"). No self-serve UI ever sets this — grant
-- it manually via SQL for trusted internal accounts only.
-- ============================================================
alter table public.profiles
  add column if not exists is_staff boolean not null default false;

comment on column public.profiles.is_staff is
  'FinanceFlow-internal flag gating the pilot analytics dashboard at /admin/metrics. Not a customer-facing feature and not settable from the product — grant manually via SQL.';

create or replace function public.auth_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select is_staff from public.profiles where id = auth.uid()), false)
$$;

revoke all on function public.auth_is_staff() from public;
grant execute on function public.auth_is_staff() to authenticated;

comment on function public.auth_is_staff() is
  'Mirrors auth_org_id()/auth_is_owner() (0013/0018) — SECURITY DEFINER so it can read profiles.is_staff regardless of the caller''s own RLS visibility. Used to self-gate the analytics_* views below.';

-- ============================================================
-- product_events: write-only from the app's own perspective. Any
-- authenticated user can log an event for their own organization; only
-- staff can read them back (via analytics_review_actions below, or
-- directly with a service-role connection) — there is no SELECT policy
-- for `authenticated` here at all.
-- ============================================================
create table public.product_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  -- Closed vocabulary, same enforced-in-two-places pattern as
  -- activity_log.event_type (src/lib/activity.ts + this CHECK) — see
  -- src/features/analytics/types.ts for the TypeScript union.
  event_type text not null check (event_type in (
    'request_created',
    'bulk_request_created',
    'manual_reminder_sent',
    'review_action',
    'deadline_extended'
  )),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index product_events_org_type_created_idx
  on public.product_events (organization_id, event_type, created_at);

alter table public.product_events enable row level security;

create policy "insert own org events" on public.product_events
  for insert
  to authenticated
  with check (organization_id = public.auth_org_id() and (actor_id is null or actor_id = auth.uid()));

comment on table public.product_events is
  'First-party product-usage telemetry (not audit history — see activity_log for that). Written by the frontend for a handful of actions (see the event_type CHECK); read only by staff, via the analytics_* views, never by ordinary organization members.';

-- ============================================================
-- analytics_requests: one row per request, joined with everything the
-- dashboard's cycle-time, on-time, reminder-effectiveness, link-open, and
-- upload-funnel sections need. Deliberately request-grained rather than
-- pre-aggregated — percentiles, funnel drop-off, and the reminder-ladder
-- distribution are computed client-side in the dashboard, which is simpler
-- to get right than several bespoke percentile/window-function queries and
-- is entirely fast enough at pilot scale.
--
-- No `with (security_invoker = true)` — this deliberately runs as the
-- view's (RLS-bypassing) owner, the mirror image of why request_overview
-- (0019) and client_overview (0020) explicitly opted INTO security_invoker
-- to avoid the same bypass. The `where public.auth_is_staff()` clause is
-- what makes this safe: a non-staff caller's query still runs as the
-- bypassing owner, but every row is filtered out before it comes back.
-- ============================================================
create view public.analytics_requests as
select
  r.organization_id,
  o.name as organization_name,
  r.id as request_id,
  r.client_id,
  c.name as client_name,
  r.status,
  r.sent_at,
  r.completed_at,
  r.deadline,
  r.client_submitted_at,
  date_trunc('month', r.sent_at)::date as sent_month,
  case when r.completed_at is not null and r.sent_at is not null
    then extract(epoch from (r.completed_at - r.sent_at)) / 86400.0
  end as days_to_complete,
  case when r.completed_at is not null and r.deadline is not null
    then (r.completed_at::date <= r.deadline)
  end as completed_before_deadline,
  (
    select count(*) from public.reminders rm
    where rm.request_id = r.id and rm.status = 'sent'
  ) as reminders_sent_count,
  (
    select rm.type
    from public.reminders rm
    where rm.request_id = r.id
      and rm.status = 'sent'
      and rm.sent_at <= (
        select max(d.uploaded_at) from public.documents d
        where d.request_id = r.id and d.deleted_at is null
      )
    order by rm.sent_at desc
    limit 1
  ) as last_reminder_type_before_final_upload,
  (
    select min(al.created_at) from public.activity_log al
    where al.request_id = r.id and al.event_type = 'link_opened'
  ) as first_opened_at,
  (
    select min(d.uploaded_at) from public.documents d
    where d.request_id = r.id and d.deleted_at is null
  ) as first_upload_at
from public.requests r
join public.organizations o on o.id = r.organization_id
join public.clients c on c.id = r.client_id
where public.auth_is_staff();

grant select on public.analytics_requests to authenticated;

comment on view public.analytics_requests is
  'Staff-only (self-gated via auth_is_staff() — see comment above), request-grained source for the /admin/metrics dashboard''s cycle-time, on-time, reminder-effectiveness, link-open, and upload-funnel sections.';

-- ============================================================
-- analytics_classification_outcomes: one row per document the AI actually
-- produced a real classification for — excludes documents rejected by the
-- magic-byte content check (never reached the AI at all: ai_classification
-- is null for those) and unparseable AI responses (ai_classification is
-- set but flagged parse_failed, since there's no real outcome to score).
-- ============================================================
create view public.analytics_classification_outcomes as
select
  d.organization_id,
  o.name as organization_name,
  d.id as document_id,
  d.review_status,
  d.review_reason,
  d.ai_confidence,
  d.uploaded_at
from public.documents d
join public.organizations o on o.id = d.organization_id
where d.ai_classification is not null
  and coalesce((d.ai_classification ->> 'parse_failed')::boolean, false) = false
  and public.auth_is_staff();

grant select on public.analytics_classification_outcomes to authenticated;

comment on view public.analytics_classification_outcomes is
  'Staff-only. Denominator for "AI classification accuracy": every document the AI actually returned a parseable classification for, with its current review_status (auto_accepted/confirmed/reassigned/rejected/unreviewed).';

-- ============================================================
-- analytics_reassignments: one row per document_reassigned activity_log
-- event, with both sides' labels resolved — the confusion-matrix source.
-- from/to required_document_id are per-request rows, not shared type rows,
-- so this resolves each back to its document_type (or custom_name) to make
-- the matrix meaningful across different requests/clients.
-- ============================================================
create view public.analytics_reassignments as
select
  al.organization_id,
  o.name as organization_name,
  al.created_at,
  coalesce(from_type.name, from_rd.custom_name, 'Unknown') as from_label,
  coalesce(to_type.name, to_rd.custom_name, 'Unknown') as to_label,
  (al.payload ->> 'confidence')::numeric as confidence
from public.activity_log al
join public.organizations o on o.id = al.organization_id
left join public.required_documents from_rd on from_rd.id = (al.payload ->> 'from_required_document_id')::uuid
left join public.document_types from_type on from_type.id = from_rd.document_type_id
left join public.required_documents to_rd on to_rd.id = (al.payload ->> 'to_required_document_id')::uuid
left join public.document_types to_type on to_type.id = to_rd.document_type_id
where al.event_type = 'document_reassigned'
  and public.auth_is_staff();

grant select on public.analytics_reassignments to authenticated;

comment on view public.analytics_reassignments is
  'Staff-only. One row per reassignment, from/to resolved to document type labels — the dashboard pivots this into a confusion matrix client-side.';

-- ============================================================
-- analytics_review_actions: review_action product_events, resolved to the
-- acting staff member's name — the session-duration section groups these
-- by (actor, gap > 30min) client-side to find session boundaries.
-- ============================================================
create view public.analytics_review_actions as
select
  pe.organization_id,
  o.name as organization_name,
  pe.actor_id,
  p.full_name as actor_name,
  pe.created_at
from public.product_events pe
join public.organizations o on o.id = pe.organization_id
left join public.profiles p on p.id = pe.actor_id
where pe.event_type = 'review_action'
  and public.auth_is_staff();

grant select on public.analytics_review_actions to authenticated;

comment on view public.analytics_review_actions is
  'Staff-only. Raw review_action events for the review-queue session-duration metric — see product_events.';
