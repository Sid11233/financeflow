import { useQuery } from '@tanstack/react-query';
import { getClientWithDefaults } from '../api/clientsApi';

export function useClient(id: string | undefined) {
  return useQuery({
    queryKey: ['client', id],
    queryFn: () => getClientWithDefaults(id!),
    enabled: Boolean(id),
  });
}
