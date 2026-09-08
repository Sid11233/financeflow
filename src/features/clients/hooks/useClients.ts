import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { listClients } from '../api/clientsApi';

export function useClients(
  organizationId: string | undefined,
  params: { search: string; showArchived: boolean; page: number; bouncedOnly?: boolean },
) {
  return useQuery({
    queryKey: ['clients', organizationId, params],
    queryFn: () => listClients({ organizationId: organizationId!, ...params }),
    enabled: Boolean(organizationId),
    placeholderData: keepPreviousData,
  });
}
