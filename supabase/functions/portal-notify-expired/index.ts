// Public, unauthenticated. Lets a client whose link has died (expired,
// revoked, or never existed) ask their accountant for a fresh one, without
// this function itself being able to mint a new token — auto-issuing a
// valid link for any hash a caller supplies would let someone holding an
// old, dead token's plaintext (e.g. dug out of a stale email years later)
// effectively resurrect it. A human resending it is the safer design.
//
// Always returns a generic success response regardless of whether the
// token hash matched anything, for the same anti-enumeration reason
// portal-resolve never distinguishes "not found" from "expired": a
// different response for a real-but-dead token vs. a nonexistent one would
// let someone probe for which tokens ever existed.
import { createClient } from 'npm:@supabase/supabase-js@2';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, jsonError, jsonResponse } from '../_shared/cors.ts';
import { sha256Hex } from '../_shared/token.ts';
import type { Logger } from '../_shared/log.ts';
import { checkRateLimit, rateLimitedResponse } from '../_shared/rateLimit.ts';
import { getClientIp } from '../_shared/ip.ts';
import { withObservability } from '../_shared/sentry.ts';

const IP_LIMIT = 200;

Deno.serve(withObservability('portal-notify-expired', async (req, { log, correlationId: requestId }) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonError('Method not allowed.', 405, requestId);

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const ip = getClientIp(req);
  const ipLimit = await checkRateLimit(supabaseAdmin, `ip:${ip}`, IP_LIMIT, log);
  if (!ipLimit.allowed) {
    log.warn('rate_limited', { scope: 'ip' });
    return rateLimitedResponse(ipLimit.retryAfterSeconds, requestId);
  }

  const body = await req.json().catch(() => null);
  const token = typeof body?.token === 'string' ? body.token : '';

  if (token) {
    try {
      await notifyIfMatched(supabaseAdmin, token, log);
    } catch (error) {
      log.error('notify_failed', { message: error instanceof Error ? error.message : 'unknown' });
    }
  }

  return jsonResponse({ notified: true }, 200, { 'X-Request-Id': requestId });
}));

async function notifyIfMatched(
  supabaseAdmin: SupabaseClient,
  token: string,
  log: Logger,
) {
  const tokenHash = await sha256Hex(token);

  // Deliberately not using the shared resolveToken() helper — that one
  // rejects expired/revoked tokens by design (it grants access). Here we
  // *want* to find those too, purely to know who to notify; this lookup
  // never authorizes anything.
  const { data: row } = await supabaseAdmin
    .from('request_tokens')
    .select('organization_id, request_id')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (!row) {
    log.info('no_matching_token');
    return;
  }

  const { data: request } = await supabaseAdmin
    .from('requests')
    .select('created_by, period_label, client_id')
    .eq('id', row.request_id)
    .single();

  if (!request) return;

  const { data: client } = await supabaseAdmin.from('clients').select('name').eq('id', request.client_id).single();
  const clientName = client?.name ?? 'A client';

  // In-app notification only, no immediate email — asking for a fresh
  // link isn't an escalation or a failure, so per this app's email policy
  // it goes through the digest rather than an immediate send.
  await supabaseAdmin.rpc('create_notification', {
    p_organization_id: row.organization_id,
    p_type: 'link_expired',
    p_title: `${clientName} needs a new upload link`,
    p_body: request.period_label,
    p_link_path: `/requests/${row.request_id}`,
    p_user_id: request.created_by,
  });

  await supabaseAdmin.rpc('log_activity', {
    p_organization_id: row.organization_id,
    p_event_type: 'link_expired',
    p_actor_type: 'client',
    p_request_id: row.request_id,
    p_client_id: request.client_id,
  });

  log.info('accountant_notified');
}
