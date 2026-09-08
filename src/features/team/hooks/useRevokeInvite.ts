import { useMutation, useQueryClient } from '@tanstack/react-query';
import { revokeInvite } from '../api/teamApi';
import type { Invite } from '../types';

export function useRevokeInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => revokeInvite(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['invites'] });
      const previous = queryClient.getQueryData<Invite[]>(['invites']);
      queryClient.setQueryData<Invite[]>(['invites'], (old) => old?.filter((invite) => invite.id !== id));
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(['invites'], context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['invites'] });
    },
  });
}
