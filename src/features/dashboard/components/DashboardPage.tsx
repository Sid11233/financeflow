import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Select } from '@/components/ui';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useRequestOverview } from '../hooks/useRequestOverview';
import { usePeriods } from '../hooks/usePeriods';
import { useActiveClientCount } from '../hooks/useActiveClientCount';
import { KpiCard } from './KpiCard';
import { NeedsAttentionSection } from './NeedsAttentionSection';
import { RequestsTable, RequestsTableSkeleton } from './RequestsTable';
import { NewRequestDialog } from '@/features/requests/components/NewRequestDialog';
import { getFirstName, getTimeOfDayGreeting } from '../utils';
import { getStatusBucket } from '@/lib/requestStatus';
import type { StatusBucket } from '@/lib/requestStatus';

const ALL_PERIODS = 'all';
type AttentionFilter = 'needs_review';

export function DashboardPage() {
  const { profile, organization } = useAuth();
  const organizationId = organization?.id;

  const [searchParams, setSearchParams] = useSearchParams();

  const { periods, currentPeriod } = usePeriods(organizationId);
  const [periodStart, setPeriodStart] = useState(currentPeriod.periodStart);
  const isAllPeriods = periodStart === ALL_PERIODS;
  const selectedPeriodLabel =
    periods.find((period) => period.periodStart === periodStart)?.periodLabel ?? '';

  const requestsQuery = useRequestOverview(organizationId, periodStart);
  const activeClientsQuery = useActiveClientCount(organizationId);

  const [statusFilter, setStatusFilter] = useState<StatusBucket | AttentionFilter | null>(null);
  const [isNewRequestOpen, setIsNewRequestOpen] = useState(false);

  // The query string is only how this page's own links (Needs attention,
  // and anywhere else that wants to land here pre-filtered) hand off an
  // initial state — once applied, the filters live in local state so
  // toggling them doesn't fight the URL. Depends on searchParams (not
  // mount-only) because the Needs attention section lives on this same
  // page: clicking one of its links while already on /dashboard changes
  // the query string without remounting the component.
  useEffect(() => {
    const periodParam = searchParams.get('period');
    const filterParam = searchParams.get('filter');
    if (!periodParam && !filterParam) return;

    if (periodParam) setPeriodStart(periodParam);
    if (filterParam === 'needs_review') setStatusFilter('needs_review');
    else if (filterParam) setStatusFilter(filterParam as StatusBucket);

    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const requests = useMemo(() => requestsQuery.data ?? [], [requestsQuery.data]);

  const counts = useMemo(() => {
    const totals: Record<StatusBucket, number> = {
      complete: 0,
      waiting: 0,
      overdue: 0,
      draft: 0,
      cancelled: 0,
    };
    for (const request of requests) {
      totals[getStatusBucket(request.status)] += 1;
    }
    return totals;
  }, [requests]);

  const filteredRequests =
    statusFilter === 'needs_review'
      ? requests.filter((request) => (request.needs_review_count ?? 0) > 0)
      : statusFilter
        ? requests.filter((request) => getStatusBucket(request.status) === statusFilter)
        : requests;

  function toggleFilter(bucket: StatusBucket) {
    setStatusFilter((prev) => (prev === bucket ? null : bucket));
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-neutral-900">
          {getTimeOfDayGreeting()}, {getFirstName(profile?.full_name)}
        </h1>
        <div className="flex items-center gap-3">
          <Select
            value={periodStart}
            onChange={(event) => {
              setPeriodStart(event.target.value);
              setStatusFilter(null);
            }}
            className="w-48"
          >
            {periods.map((period) => (
              <option key={period.periodStart} value={period.periodStart}>
                {period.periodLabel}
              </option>
            ))}
            <option value={ALL_PERIODS}>All periods</option>
          </Select>
          <Button onClick={() => setIsNewRequestOpen(true)}>+ New Request</Button>
        </div>
      </div>

      <NeedsAttentionSection organizationId={organizationId} />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard
          label="Clients"
          value={activeClientsQuery.data ?? 0}
          isActive={statusFilter === null}
          onClick={() => setStatusFilter(null)}
        />
        <KpiCard
          label="Complete"
          value={counts.complete}
          isActive={statusFilter === 'complete'}
          onClick={() => toggleFilter('complete')}
        />
        <KpiCard
          label="Waiting for Client"
          value={counts.waiting}
          isActive={statusFilter === 'waiting'}
          onClick={() => toggleFilter('waiting')}
        />
        <KpiCard
          label="Overdue"
          value={counts.overdue}
          isActive={statusFilter === 'overdue'}
          onClick={() => toggleFilter('overdue')}
        />
      </div>

      {requestsQuery.isPending ? (
        <RequestsTableSkeleton />
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-neutral-200 py-16 text-center">
          <p className="text-sm text-neutral-500">
            {isAllPeriods ? 'No requests.' : `No requests for ${selectedPeriodLabel}.`}
          </p>
          <Button onClick={() => setIsNewRequestOpen(true)}>+ New Request</Button>
        </div>
      ) : (
        <RequestsTable requests={filteredRequests} />
      )}

      <NewRequestDialog open={isNewRequestOpen} onClose={() => setIsNewRequestOpen(false)} />
    </div>
  );
}
