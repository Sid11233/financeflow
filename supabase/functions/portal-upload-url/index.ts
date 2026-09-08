// Public, unauthenticated. Returns a short-lived Supabase Storage signed
// upload URL rather than accepting the file bytes itself — Edge Functions
// have request size/duration limits unsuited to large file uploads, so the
// client uploads directly to Storage using the signed URL this returns,
// then calls portal-confirm-upload once that succeeds.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, jsonError, jsonResponse } from '../_shared/cors.ts';
import { sha256Hex } from '../_shared/token.ts';
import { checkRateLimit, rateLimitedResponse } from '../_shared/rateLimit.ts';
import { getClientIp } from '../_shared/ip.ts';
import { resolveToken } from '../_shared/portalAuth.ts';
import { sanitizeFilename } from '../_shared/filename.ts';
import { withObservability } from '../_shared/sentry.ts';

const IP_LIMIT = 200;
const TOKEN_LIMIT = 60;
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const MAX_FILES_PER_REQUEST = 100;
const MAX_TOTAL_BYTES_PER_REQUEST = 250 * 1024 * 1024;
const BUCKET = 'client-documents';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/heic',
  'image/heif',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  'application/vnd.ms-excel', // xls
  'text/csv',
  'application/csv',
]);

const ALLOWED_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'heic', 'heif', 'xlsx', 'xls', 'csv']);

Deno.serve(withObservability('portal-upload-url', async (req, { log, correlationId: requestId }) => {
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
  const filename = typeof body?.filename === 'string' ? body.filename : '';
  const mimeType = typeof body?.mimeType === 'string' ? body.mimeType : '';
  const sizeBytes = typeof body?.sizeBytes === 'number' ? body.sizeBytes : NaN;

  if (!token || !requiredDocumentId || !filename || !mimeType || !Number.isFinite(sizeBytes)) {
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

  const extension = filename.split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED_EXTENSIONS.has(extension) || !ALLOWED_MIME_TYPES.has(mimeType)) {
    log.warn('rejected_file_type', { tokenId: resolved.id, extension, mimeType });
    return jsonError('This file type is not supported.', 400, requestId);
  }

  if (sizeBytes <= 0 || sizeBytes > MAX_FILE_SIZE_BYTES) {
    log.warn('rejected_file_size', { tokenId: resolved.id, sizeBytes });
    return jsonError('This file is too large. The maximum size is 25MB.', 400, requestId);
  }

  const { data: requiredDocument, error: requiredDocumentError } = await supabaseAdmin
    .from('required_documents')
    .select('id')
    .eq('id', requiredDocumentId)
    .eq('request_id', resolved.requestId)
    .maybeSingle();

  if (requiredDocumentError || !requiredDocument) {
    log.warn('required_document_not_found', { tokenId: resolved.id });
    return jsonError('This document could not be found on your request.', 404, requestId);
  }

  // Per-request caps, checked against what's already on file (excluding
  // soft-deleted documents) plus the file about to be added.
  const { data: existingDocuments, count: existingCount } = await supabaseAdmin
    .from('documents')
    .select('size_bytes', { count: 'exact' })
    .eq('request_id', resolved.requestId)
    .is('deleted_at', null);

  if ((existingCount ?? 0) >= MAX_FILES_PER_REQUEST) {
    log.warn('rejected_file_count_cap', { tokenId: resolved.id });
    return jsonError(`This request already has the maximum of ${MAX_FILES_PER_REQUEST} files.`, 400, requestId);
  }

  const existingTotalBytes = (existingDocuments ?? []).reduce((sum, doc) => sum + (doc.size_bytes ?? 0), 0);
  if (existingTotalBytes + sizeBytes > MAX_TOTAL_BYTES_PER_REQUEST) {
    log.warn('rejected_total_size_cap', { tokenId: resolved.id });
    return jsonError('This request has reached its total upload limit of 250MB.', 400, requestId);
  }

  const sanitizedFilename = sanitizeFilename(filename);
  const storagePath = `${resolved.organizationId}/${resolved.requestId}/${requiredDocumentId}/${crypto.randomUUID()}-${sanitizedFilename}`;

  const { data: signed, error: signedError } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUploadUrl(storagePath);

  if (signedError || !signed) {
    log.error('signed_url_failed', { tokenId: resolved.id, message: signedError?.message });
    return jsonError('Could not prepare this upload. Please try again.', 500, requestId);
  }

  log.info('signed_url_issued', { tokenId: resolved.id, requiredDocumentId });

  return jsonResponse(
    { signedUrl: signed.signedUrl, storagePath, uploadToken: signed.token },
    200,
    { 'X-Request-Id': requestId },
  );
}));

function invalidLink(requestId: string) {
  return jsonError('This link is invalid or has expired.', 404, requestId);
}
