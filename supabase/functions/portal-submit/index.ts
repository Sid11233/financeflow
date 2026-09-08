// Public, unauthenticated. Records that the client considers their upload
// complete. Deliberately does not require required_documents to actually
// be complete first — an accountant seeing "client says they're done, but
// 2 items are still missing" is a more useful signal than silently
// refusing the submission, and requests.client_submitted_at (0022) is
// tracked separately from the accountant-driven completion percentage for
// exactly this reason.
import { createClient } from 'npm:@supabase/supabase-js@2';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, jsonError, jsonResponse } from '../_shared/cors.ts';
import { sha256Hex } from '../_shared/token.ts';
import { checkRateLimit, rateLimitedResponse } from '../_shared/rateLimit.ts';
import { getClientIp } from '../_shared/ip.ts';
import { resolveToken } from '../_shared/portalAuth.ts';
import { withObservability } from '../_shared/sentry.ts';

const IP_LIMIT = 200;
const TOKEN_LIMIT = 60;

Deno.serve(withObservability('portal-submit', async (req, { log, correlationId: requestId }) => {
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
  if (!token) return invalidLink(requestId);

  const tokenHash = await sha256Hex(token);
  const tokenLimit = await checkRateLimit(supabaseAdmin, `token:${tokenHash}`, TOKEN_LIMIT, log);
  if (!tokenLimit.allowed) {
    log.warn('rate_limited', { scope: 'token' });
    return rateLimitedResponse(tokenLimit.retryAfterSeconds, requestId);
  }

  const resolved = await resolveToken(supabaseAdmin, tokenHash, log);
  if (!resolved) return invalidLink(requestId);

  const { data: request, error: requestError } = await supabaseAdmin
    .from('requests')
    .select('id, created_by, period_label, client_id')
    .eq('id', resolved.requestId)
    .single();

  if (requestError || !request) {
    log.error('request_missing_for_valid_token', { tokenId: resolved.id });
    return invalidLink(requestId);
  }

  await supabaseAdmin
    .from('requests')
    .update({ client_submitted_at: new Date().toISOString() })
    .eq('id', request.id);

  await supabaseAdmin.rpc('log_activity', {
    p_organization_id: resolved.organizationId,
    p_event_type: 'request_submitted',
    p_actor_type: 'client',
    p_request_id: resolved.requestId,
    p_client_id: request.client_id,
  });

  log.info('submitted', { tokenId: resolved.id });

  // In-app notification only — a client marking themselves "done" isn't an
  // escalation or a failure, so per this app's email policy it goes
  // through the digest rather than an immediate send. Best-effort: the
  // submission above is already recorded regardless of whether this
  // succeeds.
  try {
    await notifyAccountant(supabaseAdmin, { ...request, organization_id: resolved.organizationId });
  } catch (notifyError) {
    log.warn('notify_accountant_failed', {
      message: notifyError instanceof Error ? notifyError.message : 'unknown',
    });
  }

  return jsonResponse({ submitted: true }, 200, { 'X-Request-Id': requestId });
}));

async function notifyAccountant(
  supabaseAdmin: SupabaseClient,
  request: { id: string; organization_id: string; created_by: string; period_label: string; client_id: string },
) {
  const { data: client } = await supabaseAdmin.from('clients').select('name').eq('id', request.client_id).single();
  const clientName = client?.name ?? 'A client';

  await supabaseAdmin.rpc('create_notification', {
    p_organization_id: request.organization_id,
    p_type: 'request_submitted',
    p_title: `${clientName} submitted their documents`,
    p_body: request.period_label,
    p_link_path: `/requests/${request.id}`,
    p_user_id: request.created_by,
  });
}

function invalidLink(requestId: string) {
  return jsonError('This link is invalid or has expired.', 404, requestId);
}
