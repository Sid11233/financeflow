import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateClient } from '../api/clientsApi';
import type { UpdateClientInput } from '../api/clientsApi';
import { toast } from '@/lib/toast';

export function useUpdateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateClientInput) => updateClient(input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['client', variables.id] });
      toast.success('Client updated');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not update client.');
    },
  });
}
