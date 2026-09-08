import { useMutation, useQueryClient } from '@tanstack/react-query';
import { unarchiveClient } from '../api/clientsApi';
import { toast } from '@/lib/toast';
import type { ClientsPage } from '../types';

export function useUnarchiveClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => unarchiveClient(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['clients'] });
      const previousQueries = queryClient.getQueriesData<ClientsPage>({ queryKey: ['clients'] });

      queryClient.setQueriesData<ClientsPage>({ queryKey: ['clients'] }, (old) =>
        old
          ? {
              ...old,
              rows: old.rows.map((row) => (row.id === id ? { ...row, is_archived: false } : row)),
            }
          : old,
      );

      return { previousQueries };
    },
    onError: (_error, _id, context) => {
      context?.previousQueries?.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data);
      });
      toast.error('Could not restore client.');
    },
    onSuccess: () => {
      toast.success('Client restored');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}
