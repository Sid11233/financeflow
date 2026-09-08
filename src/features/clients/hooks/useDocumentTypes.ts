import { useQuery } from '@tanstack/react-query';
import { listDocumentTypes } from '../api/clientsApi';

export function useDocumentTypes(organizationId: string | undefined) {
  return useQuery({
    queryKey: ['document-types', organizationId],
    queryFn: () => listDocumentTypes(organizationId!),
    enabled: Boolean(organizationId),
  });
}
