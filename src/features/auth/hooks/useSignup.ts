import { useMutation } from '@tanstack/react-query';
import { createOrganization, signInWithPassword } from '../api/authApi';
import type { CreateOrganizationInput } from '../api/authApi';

export function useSignup() {
  return useMutation({
    mutationFn: async (input: CreateOrganizationInput) => {
      await createOrganization(input);
      // create-organization only creates the account server-side; it can't
      // hand back a browser session, so sign in normally right after with
      // the same credentials the form already collected.
      const { error } = await signInWithPassword(input.email, input.password);
      if (error) throw error;
    },
  });
}
