import { useMutation } from '@tanstack/react-query';
import { requestPasswordReset } from '../api/authApi';

export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: (email: string) => requestPasswordReset(email),
  });
}
