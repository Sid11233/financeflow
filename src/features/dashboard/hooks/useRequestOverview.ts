import { useQuery } from '@tanstack/react-query';
import { listRequestOverview } from '../api/dashboardApi';

export function useRequestOverview(organizationId: string | undefined, periodStart: string) {
  return useQuery({
    queryKey: ['request-overview', organizationId, periodStart],
    queryFn: () => listRequestOverview({ organizationId: organizationId!, periodStart }),
    enabled: Boolean(organizationId),
  });
}
