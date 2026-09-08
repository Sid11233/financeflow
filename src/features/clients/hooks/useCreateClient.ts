import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '../api/clientsApi';
import type { SaveClientInput } from '../api/clientsApi';
import { toast } from '@/lib/toast';

export function useCreateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SaveClientInput) => createClient(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success('Client created');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not create client.');
    },
  });
}
