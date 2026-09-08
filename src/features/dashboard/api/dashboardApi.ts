import { supabase } from '@/lib/supabase';

export interface RequestOverviewFilters {
  organizationId: string;
  // 'all' skips the period filter entirely — used by the "Needs attention"
  // dashboard links, since an overdue or needs-review request can be from
  // any period, not just the one currently selected.
  periodStart: string;
}

export async function listRequestOverview({ organizationId, periodStart }: RequestOverviewFilters) {
  let query = supabase
    .from('request_overview')
    .select('*')
    .eq('organization_id', organizationId)
    .neq('status', 'cancelled');

  if (periodStart !== 'all') {
    query = query.eq('period_start', periodStart);
  }

  const { data, error } = await query
    .order('status_rank', { ascending: true })
    .order('deadline', { ascending: true, nullsFirst: false });

  if (error) throw error;
  return data;
}

export interface AttentionCounts {
  needsReviewCount: number;
  overdueCount: number;
  bouncedClientCount: number;
}

// Org-wide, independent of the dashboard's period selector — an overdue
// request or a document needing review doesn't stop mattering just
// because it's not in the currently selected month.
export async function getAttentionCounts(organizationId: string): Promise<AttentionCounts> {
  const [{ data: openRequests, error: openRequestsError }, { count: bouncedClientCount, error: bouncedError }] =
    await Promise.all([
      supabase
        .from('request_overview')
        .select('status, needs_review_count')
        .eq('organization_id', organizationId)
        .neq('status', 'cancelled'),
      supabase
        .from('client_overview')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .not('email_bounced_at', 'is', null),
    ]);

  if (openRequestsError) throw openRequestsError;
  if (bouncedError) throw bouncedError;

  let needsReviewCount = 0;
  let overdueCount = 0;
  for (const request of openRequests ?? []) {
    needsReviewCount += request.needs_review_count ?? 0;
    if (request.status === 'overdue') overdueCount += 1;
  }

  return { needsReviewCount, overdueCount, bouncedClientCount: bouncedClientCount ?? 0 };
}

export interface Period {
  periodStart: string;
  periodLabel: string;
}

export async function listDistinctPeriods(organizationId: string): Promise<Period[]> {
  const { data, error } = await supabase
    .from('requests')
    .select('period_start, period_label')
    .eq('organization_id', organizationId)
    .order('period_start', { ascending: false });

  if (error) throw error;

  const seen = new Set<string>();
  const periods: Period[] = [];
  for (const row of data ?? []) {
    if (seen.has(row.period_start)) continue;
    seen.add(row.period_start);
    periods.push({ periodStart: row.period_start, periodLabel: row.period_label });
  }
  return periods;
}

export async function countActiveClients(organizationId: string): Promise<number> {
  const { count, error } = await supabase
    .from('clients')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('is_archived', false);

  if (error) throw error;
  return count ?? 0;
}
