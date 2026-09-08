import { useQuery } from '@tanstack/react-query';
import { listDistinctPeriods } from '../api/dashboardApi';
import { getCurrentPeriod } from '../utils';

export function usePeriods(organizationId: string | undefined) {
  const currentPeriod = getCurrentPeriod();

  const query = useQuery({
    queryKey: ['request-periods', organizationId],
    queryFn: () => listDistinctPeriods(organizationId!),
    enabled: Boolean(organizationId),
  });

  // The current month is always selectable, even before any request exists
  // for it yet — that's what lets a brand-new org land on the empty state
  // for "this month" by default instead of an arbitrary past period.
  const periods = [
    currentPeriod,
    ...(query.data ?? []).filter((period) => period.periodStart !== currentPeriod.periodStart),
  ];

  return { periods, currentPeriod, isLoading: query.isPending };
}
