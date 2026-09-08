-- Dashboard read model: one row per request, joined with its client and
-- aggregated required_documents/reminders, so the dashboard never has to
-- recompute completion percentages or document counts on the client.
--
-- security_invoker = true is load-bearing, not stylistic. Postgres's
-- classic (pre-16-default) view behavior runs a view's queries against its
-- underlying tables using the VIEW OWNER's privileges — including which RLS
-- policies apply. This view is created by the migration-running role, which
-- also owns requests/clients, and table owners bypass their own tables' RLS
-- by default. Without security_invoker, every authenticated caller would
-- see every organization's requests through this view, regardless of the
-- "org isolation" policies on the base tables. With it, the view runs as
-- the querying user instead, so those policies apply exactly as if the
-- caller had written the joins themselves.
create or replace view public.request_overview
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
  coalesce(doc_stats.received_count, 0) as received_count,
  coalesce(doc_stats.required_count, 0) - coalesce(doc_stats.received_count, 0) as missing_document_count,
  coalesce(doc_stats.missing_document_names, array[]::text[]) as missing_document_names,
  case
    when coalesce(doc_stats.required_count, 0) = 0 then 0
    else round(coalesce(doc_stats.received_count, 0) * 100.0 / doc_stats.required_count)::smallint
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
  reminder_stats.last_reminder_sent_at
from public.requests r
join public.clients c on c.id = r.client_id
left join lateral (
  select
    count(*) filter (where not rd.is_optional) as required_count,
    count(*) filter (where not rd.is_optional and rd.status = 'accepted') as received_count,
    coalesce(
      array_agg(dt.name order by rd.sort_order) filter (where not rd.is_optional and rd.status <> 'accepted'),
      array[]::text[]
    ) as missing_document_names
  from public.required_documents rd
  join public.document_types dt on dt.id = rd.document_type_id
  where rd.request_id = r.id
) doc_stats on true
left join lateral (
  select max(rem.sent_at) as last_reminder_sent_at
  from public.reminders rem
  where rem.request_id = r.id and rem.sent_at is not null
) reminder_stats on true;

revoke all on public.request_overview from anon;
grant select on public.request_overview to authenticated;

comment on view public.request_overview is
  'Dashboard read model over requests: adds client_name, live required_documents aggregates (no reliance on requests.completion_percent, computed fresh from source data on every query), and last reminder sent. security_invoker = true — see comment above the view definition for why that is not optional.';
