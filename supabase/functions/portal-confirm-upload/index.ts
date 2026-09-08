// Public, unauthenticated. Called once the client's browser has finished
// PUTting the file to the signed URL from portal-upload-url — this is what
// actually creates the documents row; the Storage object existing alone
// isn't tracked anywhere until this confirms it.
//
// Also where the magic-byte check happens: the client-reported MIME type
// and extension were already checked against the allowlist in
// portal-upload-url, but neither is trustworthy on its own — a browser (or
// a deliberately crafted request) can claim any MIME type for any bytes.
// This is the one point where the actual file content, now sitting in
// Storage, can be inspected before anything downstream (classification,
// required_documents completion tracking) treats it as real.
import { createClient } from 'npm:@supabase/supabase-js@2';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, jsonError, jsonResponse } from '../_shared/cors.ts';
import { sha256Hex } from '../_shared/token.ts';
import type { Logger } from '../_shared/log.ts';
import { checkRateLimit, rateLimitedResponse } from '../_shared/rateLimit.ts';
import { getClientIp } from '../_shared/ip.ts';
import { resolveToken } from '../_shared/portalAuth.ts';
import { checkMagicBytes, detectClaimedType } from '../_shared/magicBytes.ts';
import { withObservability } from '../_shared/sentry.ts';

const IP_LIMIT = 200;
const TOKEN_LIMIT = 60;
const BUCKET = 'client-documents';
const SAMPLE_BYTE_RANGE = 'bytes=0-511';

Deno.serve(withObservability('portal-confirm-upload', async (req, { log, correlationId: requestId }) => {
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
  const storagePath = typeof body?.storagePath === 'string' ? body.storagePath : '';
  const filename = typeof body?.filename === 'string' ? body.filename : '';
  const mimeType = typeof body?.mimeType === 'string' ? body.mimeType : '';
  const sizeBytes = typeof body?.sizeBytes === 'number' ? body.sizeBytes : NaN;

  if (!token || !requiredDocumentId || !storagePath || !filename || !mimeType || !Number.isFinite(sizeBytes)) {
    return jsonError('Invalid request.', 400, requestId);
  }

  const tokenHash = await sha256Hex(token);
  const tokenLimit = await checkRateLimit(supabaseAdmin, `token:${tokenHash}`, TOKEN_LIMIT, log);
  if (!tokenLimit.allowed) {
    log.warn('rate_limited', { scope: 'token' });
    return rateLimitedResponse(tokenLimit.retryAfterSeconds, requestId);
  }

  const resolved = await resolveToken(supabaseAdmin, tokenHash, log);
  if (!resolved) return invalidLink(requestId);

  const { data: requestRow } = await supabaseAdmin
    .from('requests')
    .select('client_id')
    .eq('id', resolved.requestId)
    .maybeSingle();
  const clientId = requestRow?.client_id ?? null;

  // storagePath is server-generated (by portal-upload-url) and echoed back
  // here by the client — this checks it actually falls under this
  // request's own folder, so a tampered path can't attach a file living
  // somewhere else in the bucket to this request's documents.
  const expectedPrefix = `${resolved.organizationId}/${resolved.requestId}/${requiredDocumentId}/`;
  if (!storagePath.startsWith(expectedPrefix)) {
    log.warn('storage_path_mismatch', { tokenId: resolved.id });
    return jsonError('This upload could not be confirmed.', 400, requestId);
  }

  const { data: requiredDocument, error: requiredDocumentError } = await supabaseAdmin
    .from('required_documents')
    .select('id, status')
    .eq('id', requiredDocumentId)
    .eq('request_id', resolved.requestId)
    .maybeSingle();

  if (requiredDocumentError || !requiredDocument) {
    log.warn('required_document_not_found', { tokenId: resolved.id });
    return jsonError('This document could not be found on your request.', 404, requestId);
  }

  const { data: document, error: documentError } = await supabaseAdmin
    .from('documents')
    .insert({
      organization_id: resolved.organizationId,
      request_id: resolved.requestId,
      required_document_id: requiredDocumentId,
      storage_path: storagePath,
      original_filename: filename,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      uploader_ip: ip,
    })
    .select('id')
    .single();

  if (documentError || !document) {
    log.error('document_insert_failed', { tokenId: resolved.id, message: documentError?.message });
    return jsonError('Could not confirm this upload. Please try again.', 500, requestId);
  }

  const rejectionReason = await checkForTypeMismatch(supabaseAdmin, storagePath, mimeType, filename, log);

  if (rejectionReason) {
    await supabaseAdmin
      .from('documents')
      .update({ review_status: 'rejected', review_reason: rejectionReason })
      .eq('id', document.id);

    await supabaseAdmin.rpc('log_activity', {
      p_organization_id: resolved.organizationId,
      p_event_type: 'document_rejected',
      p_actor_type: 'system',
      p_request_id: resolved.requestId,
      p_client_id: clientId,
      p_payload: { document_id: document.id, original_filename: filename, reason: rejectionReason },
    });

    log.warn('document_rejected', { tokenId: resolved.id, documentId: document.id, reason: rejectionReason });

    // Deliberately not touching required_documents.status here — a
    // rejected file hasn't actually satisfied the checklist item, so it
    // stays wherever it was (still 'pending' in the common case).
    return jsonResponse(
      { documentId: document.id, accepted: false, reason: rejectionReason },
      200,
      { 'X-Request-Id': requestId },
    );
  }

  // Moves the checklist item off 'pending' so the request's tracked
  // completion picks up this upload (required_documents_recompute_status,
  // 0016, fires off this same update). Left alone if staff already marked
  // it 'accepted' — a new upload shouldn't silently undo a sign-off.
  if (requiredDocument.status !== 'accepted') {
    await supabaseAdmin.from('required_documents').update({ status: 'received' }).eq('id', requiredDocumentId);
  }

  await supabaseAdmin.rpc('log_activity', {
    p_organization_id: resolved.organizationId,
    p_event_type: 'document_uploaded',
    p_actor_type: 'client',
    p_request_id: resolved.requestId,
    p_client_id: clientId,
    p_payload: { required_document_id: requiredDocumentId, original_filename: filename },
  });

  // classification_jobs' own AFTER INSERT trigger (0025) fires
  // classify-document immediately; this insert failing silently (as it did
  // under this table's old pre-rename name, classification_queue, until
  // this fix) would mean uploads succeed but nothing ever gets classified.
  const { error: classificationJobError } = await supabaseAdmin.from('classification_jobs').insert({
    organization_id: resolved.organizationId,
    document_id: document.id,
  });

  if (classificationJobError) {
    log.error('classification_job_insert_failed', { documentId: document.id, message: classificationJobError.message });
  }

  log.info('upload_confirmed', { tokenId: resolved.id, documentId: document.id });

  return jsonResponse({ documentId: document.id, accepted: true }, 200, { 'X-Request-Id': requestId });
}));

// Returns a rejection reason string if the file's actual bytes don't match
// its claimed type, or null if it checks out (or couldn't be checked at
// all — see the comment below on why that fails open).
async function checkForTypeMismatch(
  supabaseAdmin: SupabaseClient,
  storagePath: string,
  mimeType: string,
  filename: string,
  log: Logger,
): Promise<string | null> {
  const claimedType = detectClaimedType(mimeType, filename);
  if (!claimedType) return null; // not one of the types we have a signature for

  const sample = await fetchObjectSample(storagePath);
  if (!sample) {
    // Fetching the sample failed for an infra reason (network blip, etc.),
    // not because the content is wrong. Failing open here — same
    // philosophy as the rate limiter's fail-open in _shared/rateLimit.ts —
    // rather than rejecting a possibly-legitimate upload over a transient
    // issue; a human reviewing the file later is still the final backstop.
    log.warn('magic_byte_sample_unavailable');
    return null;
  }

  return checkMagicBytes(sample, claimedType) ? null : 'file_type_mismatch';
}

async function fetchObjectSample(storagePath: string): Promise<Uint8Array | null> {
  try {
    const objectUrl = `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/${BUCKET}/${storagePath}`;
    const response = await fetch(objectUrl, {
      headers: {
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        Range: SAMPLE_BYTE_RANGE,
      },
    });

    // Accept both 206 (range honored) and 200 (whole object returned,
    // range ignored) — either way, only the first 512 bytes are read.
    if (!response.ok && response.status !== 206) return null;

    const buffer = new Uint8Array(await response.arrayBuffer());
    return buffer.slice(0, 512);
  } catch {
    return null;
  }
}

function invalidLink(requestId: string) {
  return jsonError('This link is invalid or has expired.', 404, requestId);
}
