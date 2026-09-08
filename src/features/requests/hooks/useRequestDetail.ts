import { useQuery } from '@tanstack/react-query';
import { getRequestDetail } from '../api/requestDetailApi';

export function useRequestDetail(requestId: string | undefined) {
  return useQuery({
    queryKey: ['request-detail', requestId],
    queryFn: () => getRequestDetail(requestId!),
    enabled: Boolean(requestId),
  });
}
