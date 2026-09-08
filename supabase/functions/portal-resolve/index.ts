// Public, unauthenticated: the entry point for a client landing on their
// upload link. Returns a strictly minimal payload — see the field-by-field
// selection below — and is the only one of the four portal functions that
// tracks access (access_count / last_accessed_at), since it corresponds to
// an actual page load rather than a follow-up action within one.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, jsonError, jsonResponse } from '../_shared/cors.ts';
import { sha256Hex } from '../_shared/token.ts';
import { checkRateLimit, rateLimitedResponse } from '../_shared/rateLimit.ts';
import { getClientIp } from '../_shared/ip.ts';
import { resolveToken } from '../_shared/portalAuth.ts';
import { withObservability } from '../_shared/sentry.ts';

const IP_LIMIT = 200;
const TOKEN_LIMIT = 60;

Deno.serve(withObservability('portal-resolve', async (req, { log, correlationId: requestId }) => {
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
    .select('id, period_label, deadline, client_id, organization_id')
    .eq('id', resolved.requestId)
    .single();

  if (requestError || !request) {
    log.error('request_missing_for_valid_token', { tokenId: resolved.id });
    return invalidLink(requestId);
  }

  const [{ data: client }, { data: organization }, { data: requiredDocuments }] = await Promise.all([
    supabaseAdmin.from('clients').select('name').eq('id', request.client_id).single(),
    supabaseAdmin.from('organizations').select('name, logo_url').eq('id', request.organization_id).single(),
    supabaseAdmin
      .from('required_documents')
      .select('id, custom_name, is_optional, status, sort_order, document_types(name)')
      .eq('request_id', request.id)
      .order('sort_order', { ascending: true }),
  ]);

  const checklist = await Promise.all(
    (requiredDocuments ?? []).map(async (item) => {
      // id + filename only — no storage_path, mime_type, or anything else
      // internal. This is the minimum needed for the portal to list and
      // let the client remove a file they already uploaded. Rejected
      // documents (magic-byte mismatch) are excluded — the client already
      // saw that failure at upload time, and listing it here as if it were
      // a normal received file would be misleading.
      const { data: files } = await supabaseAdmin
        .from('documents')
        .select('id, original_filename')
        .eq('required_document_id', item.id)
        .is('deleted_at', null)
        .neq('review_status', 'rejected')
        .order('uploaded_at', { ascending: true });

      const documentType = item.document_types as { name: string } | { name: string }[] | null;
      const documentTypeName = Array.isArray(documentType) ? documentType[0]?.name : documentType?.name;

      return {
        id: item.id,
        label: documentTypeName ?? item.custom_name ?? 'Document',
        isOptional: item.is_optional,
        status: item.status,
        filesReceived: files?.length ?? 0,
        files: (files ?? []).map((file) => ({ id: file.id, filename: file.original_filename })),
      };
    }),
  );

  const { data: isFirstAccess } = await supabaseAdmin.rpc('record_token_access', { p_token_id: resolved.id });

  // Logged only on the token's first-ever access — a client refreshing or
  // revisiting the same link shouldn't spam the feed with repeat
  // "opened their link" entries.
  if (isFirstAccess) {
    await supabaseAdmin.rpc('log_activity', {
      p_organization_id: resolved.organizationId,
      p_event_type: 'link_opened',
      p_actor_type: 'client',
      p_request_id: resolved.requestId,
      p_client_id: request.client_id,
    });
  }

  log.info('resolved', { tokenId: resolved.id, firstAccess: Boolean(isFirstAccess) });

  return jsonResponse(
    {
      firmName: organization?.name ?? '',
      firmLogoUrl: organization?.logo_url ?? null,
      clientName: client?.name ?? '',
      periodLabel: request.period_label,
      deadline: request.deadline,
      checklist,
    },
    200,
    { 'X-Request-Id': requestId },
  );
}));

function invalidLink(requestId: string) {
  return jsonError('This link is invalid or has expired.', 404, requestId);
}
