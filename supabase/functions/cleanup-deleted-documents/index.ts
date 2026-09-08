// Triggered on a schedule (pg_cron + pg_net, see 0024) rather than by any
// user action — authenticated by checking the caller presented the
// service role key itself, since there's no end user in this context.
//
// Hard-deletes only the Storage OBJECT for documents soft-deleted more
// than 90 days ago; the documents row is left in place as a lightweight,
// permanent audit record ("client uploaded X on date Y, later removed") —
// it's the actual file bytes that are the storage cost/compliance concern
// this cleans up, not the metadata.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, jsonError, jsonResponse } from '../_shared/cors.ts';
import { withObservability } from '../_shared/sentry.ts';

const BUCKET = 'client-documents';
const RETENTION_DAYS = 90;

Deno.serve(withObservability('cleanup-deleted-documents', async (req, { log, correlationId: requestId }) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization') ?? '';
  const providedKey = authHeader.replace(/^Bearer\s+/i, '');
  if (providedKey !== Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
    return jsonError('Unauthorized.', 401, requestId);
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: expiredDocuments, error } = await supabaseAdmin
    .from('documents')
    .select('id, storage_path')
    .not('deleted_at', 'is', null)
    .lt('deleted_at', cutoff);

  if (error) {
    log.error('cleanup_query_failed', { message: error.message });
    return jsonError('Cleanup failed.', 500, requestId);
  }

  let removedCount = 0;
  let failedCount = 0;

  for (const doc of expiredDocuments ?? []) {
    // storage_path itself is never logged — it embeds the original
    // filename (see portal-upload-url), which is exactly the kind of
    // value log.ts and sentry.ts both scrub for.
    const { error: removeError } = await supabaseAdmin.storage.from(BUCKET).remove([doc.storage_path]);
    if (removeError) {
      failedCount += 1;
      log.error('storage_remove_failed', { documentId: doc.id, message: removeError.message });
      continue;
    }
    removedCount += 1;
  }

  log.info('cleanup_complete', { removedCount, failedCount });

  return jsonResponse({ removedCount, failedCount }, 200, { 'X-Request-Id': requestId });
}));
