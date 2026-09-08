import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export function signInWithPassword(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export function signOut() {
  return supabase.auth.signOut();
}

export function requestPasswordReset(email: string) {
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
}

export function updatePassword(password: string) {
  return supabase.auth.updateUser({ password });
}

// Edge Functions return { error: string } as their JSON body on failure.
// supabase-js surfaces a non-2xx response as a FunctionsHttpError whose
// `.context` is the raw Response — this unwraps our own error shape from
// it, falling back to a generic message for anything else (network
// failure, a non-JSON body, etc).
async function extractFunctionErrorMessage(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      if (typeof body?.error === 'string') return body.error;
    } catch {
      // fall through to the generic message below
    }
  }
  return 'Something went wrong. Please try again.';
}

export interface CreateOrganizationInput {
  email: string;
  password: string;
  fullName: string;
  firmName: string;
}

export async function createOrganization(input: CreateOrganizationInput) {
  const { data, error } = await supabase.functions.invoke<{ userId: string; organizationId: string }>(
    'create-organization',
    { body: input },
  );

  if (error) throw new Error(await extractFunctionErrorMessage(error));
  return data!;
}

export interface InviteDetails {
  email: string;
  organizationName: string;
}

export async function getInviteDetails(token: string) {
  const { data, error } = await supabase.functions.invoke<InviteDetails>('accept-invite', {
    body: { action: 'lookup', token },
  });

  if (error) throw new Error(await extractFunctionErrorMessage(error));
  return data!;
}

export interface AcceptInviteInput {
  token: string;
  password: string;
  fullName: string;
}

export async function acceptInvite(input: AcceptInviteInput) {
  const { data, error } = await supabase.functions.invoke<{ email: string }>('accept-invite', {
    body: { action: 'accept', ...input },
  });

  if (error) throw new Error(await extractFunctionErrorMessage(error));
  return data!;
}
