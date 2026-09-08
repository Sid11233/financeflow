// Public, unauthenticated. Logs that a client says they don't have a given
// document, with an optional short reason — a lightweight signal for the
// accountant rather than a schema-level status change (there's no
// required_document_status value for "client says N/A"; this is recorded
// purely via activity_log, which the accountant can review).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, jsonError, jsonResponse } from '../_shared/cors.ts';
import { sha256Hex } from '../_shared/token.ts';
import { checkRateLimit, rateLimitedResponse } from '../_shared/rateLimit.ts';
import { getClientIp } from '../_shared/ip.ts';
import { resolveToken } from '../_shared/portalAuth.ts';
import { withObservability } from '../_shared/sentry.ts';

const IP_LIMIT = 200;
const TOKEN_LIMIT = 60;

Deno.serve(withObservability('portal-mark-unavailable', async (req, { log, correlationId: requestId }) => {
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
  const requiredDocumentId = typeof body?.requiredDocumentId === 'string' ? body.requiredDocumentId : '';
  const reason = typeof body?.reason === 'string' ? body.reason.slice(0, 500) : '';

  if (!token || !requiredDocumentId) return jsonError('Invalid request.', 400, requestId);

  const tokenHash = await sha256Hex(token);
  const tokenLimit = await checkRateLimit(supabaseAdmin, `token:${tokenHash}`, TOKEN_LIMIT, log);
  if (!tokenLimit.allowed) {
    log.warn('rate_limited', { scope: 'token' });
    return rateLimitedResponse(tokenLimit.retryAfterSeconds, requestId);
  }

  const resolved = await resolveToken(supabaseAdmin, tokenHash, log);
  if (!resolved) return invalidLink(requestId);

  const { data: requiredDocument, error: requiredDocumentError } = await supabaseAdmin
    .from('required_documents')
    .select('id')
    .eq('id', requiredDocumentId)
    .eq('request_id', resolved.requestId)
    .maybeSingle();

  if (requiredDocumentError || !requiredDocument) {
    return jsonError('This document could not be found on your request.', 404, requestId);
  }

  const { data: requestRow } = await supabaseAdmin
    .from('requests')
    .select('client_id')
    .eq('id', resolved.requestId)
    .maybeSingle();

  // Logged as 'item_waived' (the canonical event for "this checklist item
  // doesn't apply") even though this is purely a note for the accountant —
  // required_documents.status is untouched here, there's no schema-level
  // "client says N/A" state distinct from an accountant's actual waive.
  await supabaseAdmin.rpc('log_activity', {
    p_organization_id: resolved.organizationId,
    p_event_type: 'item_waived',
    p_actor_type: 'client',
    p_request_id: resolved.requestId,
    p_client_id: requestRow?.client_id ?? null,
    p_payload: { required_document_id: requiredDocumentId, reason },
  });

  log.info('marked_unavailable', { tokenId: resolved.id });

  return jsonResponse({ acknowledged: true }, 200, { 'X-Request-Id': requestId });
}));

function invalidLink(requestId: string) {
  return jsonError('This link is invalid or has expired.', 404, requestId);
}
