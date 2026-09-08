// Public, unauthenticated. Lets a client remove a file they uploaded by
// mistake. Soft-deletes (documents.deleted_at) and moves the Storage
// object under a deleted/ prefix rather than destroying it immediately —
// cleanup-deleted-documents (scheduled, see 0024) hard-deletes the object
// itself 90 days later. Moving it also has the side effect of taking it
// out of the path staff normally read from (the storage RLS policy checks
// the path's first segment against the caller's organization_id — once
// under deleted/, that first segment no longer matches), which is a
// reasonable extra layer for something already logically deleted.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, jsonError, jsonResponse } from '../_shared/cors.ts';
import { sha256Hex } from '../_shared/token.ts';
import { checkRateLimit, rateLimitedResponse } from '../_shared/rateLimit.ts';
import { getClientIp } from '../_shared/ip.ts';
import { resolveToken } from '../_shared/portalAuth.ts';
import { withObservability } from '../_shared/sentry.ts';

const IP_LIMIT = 200;
const TOKEN_LIMIT = 60;
const BUCKET = 'client-documents';

Deno.serve(withObservability('portal-remove-upload', async (req, { log, correlationId: requestId }) => {
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
  const documentId = typeof body?.documentId === 'string' ? body.documentId : '';

  if (!token || !documentId) return jsonError('Invalid request.', 400, requestId);

  const tokenHash = await sha256Hex(token);
  const tokenLimit = await checkRateLimit(supabaseAdmin, `token:${tokenHash}`, TOKEN_LIMIT, log);
  if (!tokenLimit.allowed) {
    log.warn('rate_limited', { scope: 'token' });
    return rateLimitedResponse(tokenLimit.retryAfterSeconds, requestId);
  }

  const resolved = await resolveToken(supabaseAdmin, tokenHash, log);
  if (!resolved) return invalidLink(requestId);

  const { data: document, error: documentError } = await supabaseAdmin
    .from('documents')
    .select('id, required_document_id, storage_path, original_filename')
    .eq('id', documentId)
    .eq('request_id', resolved.requestId)
    .is('deleted_at', null)
    .maybeSingle();

  if (documentError || !document) {
    log.warn('document_not_found', { tokenId: resolved.id });
    return jsonError('This file could not be found.', 404, requestId);
  }

  const { data: requestRow } = await supabaseAdmin
    .from('requests')
    .select('client_id')
    .eq('id', resolved.requestId)
    .maybeSingle();
  const clientId = requestRow?.client_id ?? null;

  // A client can't un-accept a document staff already signed off on by
  // deleting it — that decision belongs to the accountant from here.
  if (document.required_document_id) {
    const { data: requiredDocument } = await supabaseAdmin
      .from('required_documents')
      .select('status')
      .eq('id', document.required_document_id)
      .single();

    if (requiredDocument?.status === 'accepted') {
      return jsonError('This document has already been reviewed and can no longer be removed.', 409, requestId);
    }
  }

  const deletedPath = `deleted/${document.storage_path}`;
  const { error: moveError } = await supabaseAdmin.storage.from(BUCKET).move(document.storage_path, deletedPath);

  if (moveError) {
    // Don't silently leave the row live if the object couldn't be moved —
    // better to report failure and let the client retry than to mark
    // something removed that a staff member can still browse to normally.
    log.error('storage_move_failed', { tokenId: resolved.id, message: moveError.message });
    return jsonError('Could not remove this file. Please try again.', 500, requestId);
  }

  await supabaseAdmin
    .from('documents')
    .update({ deleted_at: new Date().toISOString(), storage_path: deletedPath })
    .eq('id', documentId);

  if (document.required_document_id) {
    const { count } = await supabaseAdmin
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('required_document_id', document.required_document_id)
      .is('deleted_at', null);

    if (!count) {
      await supabaseAdmin
        .from('required_documents')
        .update({ status: 'pending' })
        .eq('id', document.required_document_id)
        .neq('status', 'accepted');
    }
  }

  await supabaseAdmin.rpc('log_activity', {
    p_organization_id: resolved.organizationId,
    p_event_type: 'document_removed',
    p_actor_type: 'client',
    p_request_id: resolved.requestId,
    p_client_id: clientId,
    p_payload: { document_id: documentId, original_filename: document.original_filename },
  });

  log.info('document_removed', { tokenId: resolved.id });

  return jsonResponse({ removed: true }, 200, { 'X-Request-Id': requestId });
}));

function invalidLink(requestId: string) {
  return jsonError('This link is invalid or has expired.', 404, requestId);
}
