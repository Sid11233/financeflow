// Staff-facing document removal from the request detail page's checklist
// (distinct from portal-remove-upload, which is the client's own,
// unauthenticated, token-based equivalent — this one runs under the
// caller's real session and has no "already accepted" restriction, since
// an accountant removing their own accepted file is a legitimate action a
// client shouldn't be able to take).
//
// Two clients: the caller's own JWT for every DB read/write (ordinary
// RLS-scoped action, same as any other authenticated mutation), and the
// service role purely for the Storage move — authenticated staff only have
// a SELECT policy on storage.objects (see 0017), so moving the object to
// the deleted/ prefix needs elevated privilege regardless of who's asking.
//
// Soft-deleting documents.deleted_at fires trigger_documents_status_change
// (0028), which reverts the checklist item's status back to 'pending' on
// its own if this was the last live upload backing it — nothing here needs
// to duplicate that.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, jsonError, jsonResponse } from '../_shared/cors.ts';
import { withObservability } from '../_shared/sentry.ts';

const BUCKET = 'client-documents';

Deno.serve(withObservability('remove-document', async (req, { log, correlationId: requestId }) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonError('Method not allowed.', 405, requestId);

  const authHeader = req.headers.get('Authorization') ?? '';
  const body = await req.json().catch(() => null);
  const documentId = typeof body?.documentId === 'string' ? body.documentId : '';
  if (!documentId) return jsonError('Invalid request.', 400, requestId);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: document, error: documentError } = await supabase
    .from('documents')
    .select('id, request_id, storage_path, original_filename')
    .eq('id', documentId)
    .is('deleted_at', null)
    .maybeSingle();

  if (documentError || !document) {
    return jsonError('This file could not be found.', 404, requestId);
  }

  const deletedPath = `deleted/${document.storage_path}`;

  const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { error: moveError } = await supabaseAdmin.storage.from(BUCKET).move(document.storage_path, deletedPath);

  if (moveError) {
    // storage_path/original_filename deliberately excluded from the log —
    // see cleanup-deleted-documents for why.
    log.error('storage_move_failed', { documentId, message: moveError.message });
    return jsonError('Could not remove this file. Please try again.', 500, requestId);
  }

  const { error: updateError } = await supabase
    .from('documents')
    .update({ deleted_at: new Date().toISOString(), storage_path: deletedPath })
    .eq('id', documentId);

  if (updateError) {
    log.error('db_update_failed', { documentId, message: updateError.message });
    return jsonError('Could not remove this file. Please try again.', 500, requestId);
  }

  const { data: request } = await supabase
    .from('requests')
    .select('organization_id, client_id')
    .eq('id', document.request_id)
    .single();

  if (request) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    await supabase.rpc('log_activity', {
      p_organization_id: request.organization_id,
      p_event_type: 'document_removed',
      p_actor_type: 'accountant',
      p_request_id: document.request_id,
      p_client_id: request.client_id,
      p_actor_id: user?.id ?? null,
      p_payload: { document_id: documentId, original_filename: document.original_filename },
    });
  }

  log.info('document_removed', { documentId });
  return jsonResponse({ removed: true }, 200, { 'X-Request-Id': requestId });
}));
