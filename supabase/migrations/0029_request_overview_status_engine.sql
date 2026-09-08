-- Updates request_overview for the new status engine (0028): 'resolved'
-- now means accepted/received/waived, not just accepted, so every count
-- derived from it changes meaning too. Adds waived_count, needs_review_count,
-- days_until_deadline and next_reminder_scheduled_for; renames
-- missing_document_names to missing_document_labels (no functional change,
-- just matching the UI's own terminology — nothing in the app reads the
-- old name directly, only the generated Row type). Drops received_count,
-- which was really just "accepted count" under a misleading name and is
-- superseded by resolved_count.
--
-- security_invoker = true carried over unchanged from 0019 — still
-- load-bearing for the same reason documented there.
--
-- CREATE OR REPLACE VIEW cannot rename, reorder, or drop existing output
-- columns (confirmed against this project's linked database: "cannot
-- change name of view column ... (SQLSTATE 42P16)") — only append new
-- trailing ones. This migration does all three, so the view is dropped
-- and recreated instead; nothing else in the schema depends on it.
drop view if exists public.request_overview;

create view public.request_overview
with (security_invoker = true)
as
select
  r.id,
  r.organization_id,
  r.client_id,
  c.name as client_name,
  r.period_start,
  r.period_label,
  r.status,
  r.deadline,
  r.created_by,
  r.created_at,
  r.sent_at,
  r.completed_at,
  coalesce(doc_stats.required_count, 0) as required_count,
  coalesce(doc_stats.resolved_count, 0) as resolved_count,
  coalesce(doc_stats.required_count, 0) - coalesce(doc_stats.resolved_count, 0) as missing_document_count,
  coalesce(doc_stats.missing_document_labels, array[]::text[]) as missing_document_labels,
  coalesce(doc_stats.waived_count, 0) as waived_count,
  coalesce(doc_stats.needs_review_count, 0) as needs_review_count,
  case
    when coalesce(doc_stats.required_count, 0) = 0 then 100
    else round(coalesce(doc_stats.resolved_count, 0) * 100.0 / doc_stats.required_count)::smallint
  end as completion_percentage,
  -- A single sort key for the dashboard's default ordering (overdue, then
  -- waiting-on-client, then complete, then draft); cancelled requests are
  -- excluded by the dashboard's own query, not by this general-purpose view.
  case r.status
    when 'overdue' then 0
    when 'sent' then 1
    when 'partial' then 1
    when 'complete' then 2
    when 'draft' then 3
    else 4
  end as status_rank,
  case
    when r.deadline is null then null
    else (r.deadline - current_date)
  end::int as days_until_deadline,
  reminder_stats.last_reminder_sent_at,
  reminder_stats.next_reminder_scheduled_for
from public.requests r
join public.clients c on c.id = r.client_id
left join lateral (
  select
    count(*) filter (where not rd.is_optional) as required_count,
    count(*) filter (where not rd.is_optional and rd.status in ('accepted', 'received', 'waived')) as resolved_count,
    count(*) filter (where not rd.is_optional and rd.status = 'waived') as waived_count,
    count(*) filter (where not rd.is_optional and rd.status = 'needs_review') as needs_review_count,
    coalesce(
      array_agg(dt.name order by rd.sort_order) filter (
        where not rd.is_optional and rd.status not in ('accepted', 'received', 'waived')
      ),
      array[]::text[]
    ) as missing_document_labels
  from public.required_documents rd
  join public.document_types dt on dt.id = rd.document_type_id
  where rd.request_id = r.id
) doc_stats on true
left join lateral (
  select
    max(rem.sent_at) as last_reminder_sent_at,
    min(rem.scheduled_for) filter (where rem.sent_at is null) as next_reminder_scheduled_for
  from public.reminders rem
  where rem.request_id = r.id
) reminder_stats on true;

revoke all on public.request_overview from anon;
grant select on public.request_overview to authenticated;

comment on view public.request_overview is
  'Dashboard read model over requests: adds client_name, live required_documents aggregates under the resolved = accepted/received/waived definition (0028), and reminder timing. Computed fresh from source data on every query, not from requests.completion_percent. security_invoker = true — see 0019 for why that is not optional.';
