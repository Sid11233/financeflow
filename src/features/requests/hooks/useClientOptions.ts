import { useQuery } from '@tanstack/react-query';
import { listActiveClientOptions } from '../api/requestsApi';

export function useClientOptions(organizationId: string | undefined) {
  return useQuery({
    queryKey: ['client-options', organizationId],
    queryFn: () => listActiveClientOptions(organizationId!),
    enabled: Boolean(organizationId),
  });
}
