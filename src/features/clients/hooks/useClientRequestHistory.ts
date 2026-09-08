import { useQuery } from '@tanstack/react-query';
import { listClientRequestHistory } from '../api/clientsApi';

export function useClientRequestHistory(clientId: string | undefined) {
  return useQuery({
    queryKey: ['client-request-history', clientId],
    queryFn: () => listClientRequestHistory(clientId!),
    enabled: Boolean(clientId),
  });
}
