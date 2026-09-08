import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { constantTimeEqual } from './token.ts';
import type { Logger } from './log.ts';

export interface ResolvedToken {
  id: string;
  requestId: string;
  organizationId: string;
}

// Shared by all four portal functions. Takes an already-computed tokenHash
// (callers need it anyway for the per-token rate-limit bucket, so it's
// hashed once, not once per helper). Returns null for every failure mode —
// not found, revoked, expired — so callers can return one identical,
// generic error response regardless of which it was; the *reason* is only
// ever visible in the structured log here.
export async function resolveToken(
  supabaseAdmin: SupabaseClient,
  tokenHash: string,
  log: Logger,
): Promise<ResolvedToken | null> {
  const { data: row, error } = await supabaseAdmin
    .from('request_tokens')
    .select('id, request_id, organization_id, token_hash, expires_at, revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (error) {
    log.error('token_lookup_error', { message: error.message });
    return null;
  }

  if (!row || !constantTimeEqual(row.token_hash, tokenHash)) {
    log.warn('token_not_found');
    return null;
  }

  if (row.revoked_at) {
    log.warn('token_revoked', { tokenId: row.id });
    return null;
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    log.warn('token_expired', { tokenId: row.id });
    return null;
  }

  return { id: row.id, requestId: row.request_id, organizationId: row.organization_id };
}
