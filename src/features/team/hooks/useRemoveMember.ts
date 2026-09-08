import { useMutation, useQueryClient } from '@tanstack/react-query';
import { removeMember } from '../api/teamApi';
import type { TeamMember } from '../types';

export function useRemoveMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (profileId: string) => removeMember(profileId),
    onMutate: async (profileId) => {
      await queryClient.cancelQueries({ queryKey: ['team-members'] });
      const previous = queryClient.getQueryData<TeamMember[]>(['team-members']);
      queryClient.setQueryData<TeamMember[]>(['team-members'], (old) =>
        old?.filter((member) => member.id !== profileId),
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(['team-members'], context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
    },
  });
}
