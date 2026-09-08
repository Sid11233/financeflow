import { useQuery } from '@tanstack/react-query';
import { listClientIdsWithRequestForPeriod } from '../api/requestsApi';

export function useClientsWithExistingRequest(organizationId: string | undefined, periodStart: string) {
  return useQuery({
    queryKey: ['clients-with-request', organizationId, periodStart],
    queryFn: () => listClientIdsWithRequestForPeriod(organizationId!, periodStart),
    enabled: Boolean(organizationId && periodStart),
  });
}
