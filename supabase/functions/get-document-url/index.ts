// Authenticated. Uses the CALLER's own JWT, not the service role: the
// "org isolation" RLS policy on documents (0014) already restricts a
// SELECT to the caller's own organization, and the storage read policy
// (0017) already restricts createSignedUrl the same way by path prefix —
// so a document belonging to another org simply isn't found or signable,
// with no separate ownership check needed here.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, jsonError, jsonResponse } from '../_shared/cors.ts';
import { withObservability } from '../_shared/sentry.ts';

const BUCKET = 'client-documents';
const SIGNED_URL_TTL_SECONDS = 300; // 5 minutes

Deno.serve(withObservability('get-document-url', async (req, { log, correlationId: requestId }) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonError('Method not allowed.', 405, requestId);

  const authHeader = req.headers.get('Authorization') ?? '';
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const body = await req.json().catch(() => null);
  const documentId = typeof body?.documentId === 'string' ? body.documentId : '';
  if (!documentId) return jsonError('Invalid request.', 400, requestId);

  const { data: document, error: documentError } = await supabase
    .from('documents')
    .select('storage_path, deleted_at')
    .eq('id', documentId)
    .maybeSingle();

  if (documentError || !document || document.deleted_at) {
    return jsonError('This document could not be found.', 404, requestId);
  }

  const { data: signed, error: signedError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(document.storage_path, SIGNED_URL_TTL_SECONDS);

  if (signedError || !signed) {
    log.error('signed_url_failed', { documentId, message: signedError?.message });
    return jsonError('Could not generate a download link. Please try again.', 500, requestId);
  }

  log.info('signed_url_issued', { documentId });
  return jsonResponse({ url: signed.signedUrl, expiresInSeconds: SIGNED_URL_TTL_SECONDS }, 200, {
    'X-Request-Id': requestId,
  });
}));
