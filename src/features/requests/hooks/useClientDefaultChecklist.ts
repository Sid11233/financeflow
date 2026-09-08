import { useQuery } from '@tanstack/react-query';
import { getClientDefaultDocumentTypeIds } from '../api/requestsApi';

export function useClientDefaultChecklist(clientId: string | undefined) {
  return useQuery({
    queryKey: ['client-default-checklist', clientId],
    queryFn: () => getClientDefaultDocumentTypeIds(clientId!),
    enabled: Boolean(clientId),
  });
}
