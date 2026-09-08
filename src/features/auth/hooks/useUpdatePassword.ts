import { useMutation } from '@tanstack/react-query';
import { updatePassword } from '../api/authApi';

export function useUpdatePassword() {
  return useMutation({
    mutationFn: async (password: string) => {
      const { error } = await updatePassword(password);
      if (error) throw error;
    },
  });
}
