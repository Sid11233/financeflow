import { useMutation } from '@tanstack/react-query';
import { createOrganization } from '../api/authApi';
import type { CreateOrganizationInput } from '../api/authApi';

// Deliberately does not sign in after creating the account — the account
// is created unconfirmed (see create-organization's own comment on why),
// and signInWithPassword would just fail with "Email not confirmed" right
// after a successful signup. The caller shows a "check your email"
// screen instead; the confirmation link itself establishes the session
// once clicked (Supabase redirects back with tokens in the URL, which
// supabase-js picks up automatically).
export function useSignup() {
  return useMutation({
    mutationFn: (input: CreateOrganizationInput) => createOrganization(input),
  });
}
