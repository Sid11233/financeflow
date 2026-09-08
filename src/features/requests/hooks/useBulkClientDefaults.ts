import { useQuery } from '@tanstack/react-query';
import { listBulkClientDefaults } from '../api/requestsApi';

export function useBulkClientDefaults(organizationId: string | undefined) {
  return useQuery({
    queryKey: ['bulk-client-defaults', organizationId],
    queryFn: () => listBulkClientDefaults(organizationId!),
    enabled: Boolean(organizationId),
  });
}
