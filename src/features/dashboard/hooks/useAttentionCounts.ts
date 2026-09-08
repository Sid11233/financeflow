import { useQuery } from '@tanstack/react-query';
import { getAttentionCounts } from '../api/dashboardApi';

export function useAttentionCounts(organizationId: string | undefined) {
  return useQuery({
    queryKey: ['attention-counts', organizationId],
    queryFn: () => getAttentionCounts(organizationId!),
    enabled: Boolean(organizationId),
  });
}
