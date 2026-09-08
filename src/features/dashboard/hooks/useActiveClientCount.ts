import { useQuery } from '@tanstack/react-query';
import { countActiveClients } from '../api/dashboardApi';

export function useActiveClientCount(organizationId: string | undefined) {
  return useQuery({
    queryKey: ['active-client-count', organizationId],
    queryFn: () => countActiveClients(organizationId!),
    enabled: Boolean(organizationId),
  });
}
