import { useMutation } from '@tanstack/react-query';
import { acceptInvite, signInWithPassword } from '../api/authApi';
import type { AcceptInviteInput } from '../api/authApi';

export function useAcceptInvite() {
  return useMutation({
    mutationFn: async (input: AcceptInviteInput) => {
      const result = await acceptInvite(input);
      const { error } = await signInWithPassword(result.email, input.password);
      if (error) throw error;
      return result;
    },
  });
}
