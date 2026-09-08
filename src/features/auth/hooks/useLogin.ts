import { useMutation } from '@tanstack/react-query';
import { signInWithPassword } from '../api/authApi';

export function useLogin() {
  return useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const { error } = await signInWithPassword(email, password);
      if (error) throw error;
    },
  });
}
