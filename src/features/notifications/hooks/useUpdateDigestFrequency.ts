import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateDigestFrequency } from '../api/digestApi';
import type { DigestFrequency } from '../api/digestApi';

export function useUpdateDigestFrequency(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (frequency: DigestFrequency) => updateDigestFrequency(userId!, frequency),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', userId] });
    },
  });
}
