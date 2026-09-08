import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createInvite } from '../api/teamApi';
import type { CreateInviteInput } from '../api/teamApi';

export function useInviteMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateInviteInput) => createInvite(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invites'] });
    },
  });
}
