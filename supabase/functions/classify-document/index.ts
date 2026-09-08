// Triggered two ways (see 0025_classification_pipeline.sql):
//   - a database trigger on classification_jobs insert, calling this with
//     { jobId } — the near-instant path.
//   - a 2-minute pg_cron sweep, calling this with no body — the safety net
//     that catches anything the trigger missed and jobs backing off after
//     a prior failure.
// Both authenticate with the service-role key directly (no end user in
// this context, same pattern as cleanup-deleted-documents), so verify_jwt
// is disabled for this function too (see supabase/config.toml).
import { createClient } from 'npm:@supabase/supabase-js@2';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, jsonError, jsonResponse } from '../_shared/cors.ts';
import type { Logger } from '../_shared/log.ts';
import { prepareClassificationSource } from '../_shared/prepareSource.ts';
import { classifyDocument } from '../_shared/classifier.ts';
import type { Classification } from '../_shared/classifier.ts';
import { getPeriodMonthEnd, reconcileClassification } from '../_shared/reconciliation.ts';
import type { ReconciliationOutcome } from '../_shared/reconciliation.ts';
import { withObservability } from '../_shared/sentry.ts';

const BUCKET = 'client-documents';
const MAX_PDF_BYTES_BEFORE_RASTERIZE = 4 * 1024 * 1024;
const MAX_ATTEMPTS = 3;
const SWEEP_BATCH_LIMIT = 20;

const DEFAULT_SETTINGS = {
  auto_accept_confidence: 0.8,
  reassign_confidence: 0.8,
  pdf_page_limit: 5,
  model_name: 'claude-sonnet-4-6',
};

// claim_classification_job's row type — declared explicitly because .rpc()
// on an untyped SupabaseClient (no Database generic) infers `{}` for the
// result, not `any`, unlike .from().select().
interface ClassificationJob {
  id: string;
  organization_id: string;
  document_id: string;
  attempts: number;
}

Deno.serve(withObservability('classify-document', async (req, { log, correlationId: requestId }) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization') ?? '';
  const providedKey = authHeader.replace(/^Bearer\s+/i, '');
  if (providedKey !== Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
    return jsonError('Unauthorized.', 401, requestId);
  }

  const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicApiKey) {
    log.error('anthropic_api_key_missing');
    return jsonError('Classification is not configured.', 500, requestId);
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const body = await req.json().catch(() => ({}));
  const jobId = typeof body?.jobId === 'string' ? body.jobId : null;

  if (jobId) {
    const outcome = await processJob(supabaseAdmin, jobId, anthropicApiKey, log);
    return jsonResponse({ processed: outcome ? 1 : 0 }, 200, { 'X-Request-Id': requestId });
  }

  const { data: dueJobIds, error: dueError } = await supabaseAdmin.rpc('find_due_classification_jobs', {
    p_limit: SWEEP_BATCH_LIMIT,
  });

  if (dueError) {
    log.error('sweep_query_failed', { message: dueError.message });
    return jsonError('Sweep failed.', 500, requestId);
  }

  let processedCount = 0;
  for (const id of dueJobIds ?? []) {
    const outcome = await processJob(supabaseAdmin, id as string, anthropicApiKey, log);
    if (outcome) processedCount += 1;
  }

  log.info('sweep_complete', { candidates: (dueJobIds ?? []).length, processed: processedCount });
  return jsonResponse({ processed: processedCount }, 200, { 'X-Request-Id': requestId });
}));

// Returns true if the job was actually claimed and run to completion
// (success or a handled failure) — false if another worker had already
// claimed it first (an expected, harmless race between the insert trigger
// and the sweep, not an error).
async function processJob(
  supabaseAdmin: SupabaseClient,
  jobId: string,
  anthropicApiKey: string,
  log: Logger,
): Promise<boolean> {
  const { data: job, error: claimError } = (await supabaseAdmin
    .rpc('claim_classification_job', { p_job_id: jobId })
    .single()) as { data: ClassificationJob | null; error: { message: string } | null };

  if (claimError || !job) {
    log.info('job_not_claimed', { jobId });
    return false;
  }

  try {
    await runClassification(supabaseAdmin, job, anthropicApiKey, log);
    await supabaseAdmin
      .from('classification_jobs')
      .update({ status: 'done', processed_at: new Date().toISOString() })
      .eq('id', job.id);
    log.info('job_done', { jobId: job.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error('job_failed', { jobId: job.id, attempts: job.attempts, message });

    if (job.attempts >= MAX_ATTEMPTS) {
      await supabaseAdmin
        .from('classification_jobs')
        .update({ status: 'dead_letter', last_error: message, processed_at: new Date().toISOString() })
        .eq('id', job.id);
      log.error('job_dead_lettered', { jobId: job.id });

      try {
        await alertClassificationFailed(supabaseAdmin, job, message, log);
      } catch (alertError) {
        log.error('failure_alert_failed', {
          jobId: job.id,
          message: alertError instanceof Error ? alertError.message : 'unknown',
        });
      }
    } else {
      const backoffMinutes = 2 ** job.attempts; // 1 attempt -> 2min, 2 -> 4min
      await supabaseAdmin
        .from('classification_jobs')
        .update({
          status: 'pending',
          next_attempt_at: new Date(Date.now() + backoffMinutes * 60_000).toISOString(),
          last_error: message,
        })
        .eq('id', job.id);
    }
  }

  return true;
}

// Classification failing after MAX_ATTEMPTS is a failure by this app's
// email policy, so — unlike the "needs review" notification below, which
// is digest-only — this gets both an in-app notification and an
// immediate alert email, same treatment as process-reminders' own
// after-retries alert.
async function alertClassificationFailed(
  supabaseAdmin: SupabaseClient,
  job: ClassificationJob,
  errorMessage: string,
  log: Logger,
): Promise<void> {
  const { data: document } = await supabaseAdmin
    .from('documents')
    .select('request_id, original_filename')
    .eq('id', job.document_id)
    .single();
  if (!document) return;

  const { data: request } = await supabaseAdmin
    .from('requests')
    .select('organization_id, created_by, client_id, period_label')
    .eq('id', document.request_id)
    .single();
  if (!request) return;

  const { data: client } = await supabaseAdmin.from('clients').select('name').eq('id', request.client_id).single();
  const clientName = client?.name ?? 'A client';
  const filename = document.original_filename ?? 'A document';

  await supabaseAdmin.rpc('create_notification', {
    p_organization_id: request.organization_id,
    p_type: 'classification_failed',
    p_title: `${filename} could not be classified`,
    p_body: `${clientName} — ${request.period_label}`,
    p_link_path: `/requests/${document.request_id}`,
    p_user_id: request.created_by,
  });

  const { data: creator } = await supabaseAdmin.auth.admin.getUserById(request.created_by);
  if (!creator?.user?.email) return;

  const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      template: 'custom_message',
      to: creator.user.email,
      organizationId: request.organization_id,
      requestId: document.request_id,
      variables: {
        subject: `${filename} needs manual review`,
        body: `FinanceFlow tried ${MAX_ATTEMPTS} times to classify "${filename}" from ${clientName} for ${request.period_label} and could not (${errorMessage}). Please review it manually from the request page.`,
      },
    }),
  });

  if (!response.ok) {
    log.warn('failure_alert_send_failed', { jobId: job.id, status: response.status });
  }
}

async function runClassification(
  supabaseAdmin: SupabaseClient,
  job: ClassificationJob,
  anthropicApiKey: string,
  log: Logger,
): Promise<void> {
  const { data: document, error: documentError } = await supabaseAdmin
    .from('documents')
    .select('id, organization_id, request_id, required_document_id, storage_path, mime_type, original_filename')
    .eq('id', job.document_id)
    .single();

  if (documentError || !document) {
    throw new Error(`Document not found: ${documentError?.message ?? job.document_id}`);
  }

  if (!document.required_document_id) {
    // Nothing to reconcile against — this shouldn't happen via the portal
    // upload flow (which always classifies against a specific checklist
    // item), but bail out cleanly rather than guessing if it ever does.
    throw new Error('Document has no required_document_id to reconcile against.');
  }

  const settings = await getSettings(supabaseAdmin, document.organization_id);

  const { data: fileBlob, error: downloadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .download(document.storage_path);

  if (downloadError || !fileBlob) {
    throw new Error(`Could not download file: ${downloadError?.message}`);
  }

  const fileBytes = new Uint8Array(await fileBlob.arrayBuffer());
  const source = await prepareClassificationSource(
    fileBytes,
    document.mime_type,
    settings.pdf_page_limit,
    MAX_PDF_BYTES_BEFORE_RASTERIZE,
  );

  const result = await classifyDocument(anthropicApiKey, settings.model_name, source);

  if (!result.classification) {
    await supabaseAdmin
      .from('documents')
      .update({
        ai_classification: { raw_response: result.rawResponseText, parse_failed: true },
        review_status: 'unreviewed',
        review_reason: 'unparseable_response',
      })
      .eq('id', document.id);

    await supabaseAdmin
      .from('required_documents')
      .update({ status: 'needs_review' })
      .eq('id', document.required_document_id);

    // The required_documents update above already fires
    // required_documents_recompute_status (0028), which recomputes the
    // request's status/completion_percent itself — no explicit RPC needed.
    await logActivity(supabaseAdmin, document, 'document_classified', { outcome: 'unparseable' });
    await notifyNeedsReview(supabaseAdmin, document);
    return;
  }

  const { data: requiredDocuments } = await supabaseAdmin
    .from('required_documents')
    .select('id, document_type_id')
    .eq('request_id', document.request_id);

  const { data: request } = await supabaseAdmin
    .from('requests')
    .select('period_start')
    .eq('id', document.request_id)
    .single();

  const mappings = await getMappings(supabaseAdmin, document.organization_id);

  const requestPeriodStart = request!.period_start as string;
  const requestPeriodEnd = getPeriodMonthEnd(requestPeriodStart);

  const outcome = reconcileClassification(
    result.classification,
    document.required_document_id,
    (requiredDocuments ?? []) as { id: string; document_type_id: string | null }[],
    requestPeriodStart,
    requestPeriodEnd,
    settings,
    mappings,
  );

  // Every branch of applyOutcome() updates required_documents.status, which
  // is enough on its own to trigger a recompute (see comment above).
  await applyOutcome(supabaseAdmin, document, result.classification, outcome, log);
}

async function applyOutcome(
  supabaseAdmin: SupabaseClient,
  document: { id: string; request_id: string; required_document_id: string; original_filename?: string },
  classification: Classification,
  outcome: ReconciliationOutcome,
  log: Logger,
): Promise<void> {
  const baseDocumentUpdate = {
    ai_classification: classification,
    ai_confidence: classification.confidence,
  };

  if (outcome.kind === 'auto_accept') {
    await supabaseAdmin
      .from('documents')
      .update({ ...baseDocumentUpdate, review_status: 'auto_accepted', review_reason: null })
      .eq('id', document.id);

    await supabaseAdmin
      .from('required_documents')
      .update({ status: 'received' })
      .eq('id', document.required_document_id);

    await logActivity(supabaseAdmin, document, 'document_classified', {
      outcome: 'auto_accepted',
      document_type: classification.document_type,
      document_type_label: classification.document_type_label,
      confidence: classification.confidence,
    });
    return;
  }

  if (outcome.kind === 'reassign') {
    await supabaseAdmin
      .from('documents')
      .update({
        ...baseDocumentUpdate,
        required_document_id: outcome.targetRequiredDocumentId,
        review_status: 'reassigned',
        review_reason: null,
      })
      .eq('id', document.id);

    await supabaseAdmin
      .from('required_documents')
      .update({ status: 'received' })
      .eq('id', outcome.targetRequiredDocumentId);

    // The slot it was originally uploaded against turns out to have
    // nothing valid on it after all.
    await supabaseAdmin
      .from('required_documents')
      .update({ status: 'pending' })
      .eq('id', document.required_document_id)
      .neq('status', 'accepted');

    await logActivity(supabaseAdmin, document, 'document_reassigned', {
      document_type: classification.document_type,
      confidence: classification.confidence,
      from_required_document_id: document.required_document_id,
      to_required_document_id: outcome.targetRequiredDocumentId,
    });

    log.info('document_reassigned', {
      documentId: document.id,
      from: document.required_document_id,
      to: outcome.targetRequiredDocumentId,
    });
    return;
  }

  // needs_review
  await supabaseAdmin
    .from('documents')
    .update({ ...baseDocumentUpdate, review_reason: outcome.flag })
    .eq('id', document.id);

  await supabaseAdmin
    .from('required_documents')
    .update({ status: 'needs_review' })
    .eq('id', document.required_document_id);

  const payload: Record<string, unknown> = {
    outcome: 'needs_review',
    document_type: classification.document_type,
    document_type_label: classification.document_type_label,
    confidence: classification.confidence,
    flag: outcome.flag,
  };

  if (outcome.flag === 'wrong_period') {
    payload.detected_period = classification.period;
  }

  if (outcome.flag === 'unreadable') {
    payload.suggestion = 'Ask the client to upload a clearer copy of this document.';
  }

  await logActivity(supabaseAdmin, document, 'document_classified', payload);
  await notifyNeedsReview(supabaseAdmin, document);
}

async function notifyNeedsReview(
  supabaseAdmin: SupabaseClient,
  document: { request_id: string; original_filename?: string },
): Promise<void> {
  const { data: request } = await supabaseAdmin
    .from('requests')
    .select('organization_id, created_by, client_id, period_label')
    .eq('id', document.request_id)
    .single();
  if (!request) return;

  const { data: client } = await supabaseAdmin.from('clients').select('name').eq('id', request.client_id).single();
  const clientName = client?.name ?? 'A client';
  const filename = document.original_filename ?? 'A document';

  await supabaseAdmin.rpc('create_notification', {
    p_organization_id: request.organization_id,
    p_type: 'documents_need_review',
    p_title: `${filename} needs review`,
    p_body: `${clientName} — ${request.period_label}`,
    p_link_path: `/requests/${document.request_id}`,
    p_user_id: request.created_by,
  });
}

async function getSettings(supabaseAdmin: SupabaseClient, organizationId: string) {
  const { data } = await supabaseAdmin
    .from('classification_settings')
    .select('auto_accept_confidence, reassign_confidence, pdf_page_limit, model_name')
    .eq('organization_id', organizationId)
    .maybeSingle();

  return data ?? DEFAULT_SETTINGS;
}

async function getMappings(
  supabaseAdmin: SupabaseClient,
  organizationId: string,
): Promise<Record<string, string>> {
  const { data } = await supabaseAdmin
    .from('classification_type_mappings')
    .select('ai_document_type, document_type_id')
    .eq('organization_id', organizationId);

  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    map[row.ai_document_type as string] = row.document_type_id as string;
  }
  return map;
}

async function logActivity(
  supabaseAdmin: SupabaseClient,
  document: { id: string; request_id: string; original_filename?: string },
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const { data: request } = await supabaseAdmin
    .from('requests')
    .select('organization_id, client_id')
    .eq('id', document.request_id)
    .single();

  if (!request) return;

  await supabaseAdmin.rpc('log_activity', {
    p_organization_id: request.organization_id,
    p_event_type: eventType,
    p_actor_type: 'system',
    p_request_id: document.request_id,
    p_client_id: request.client_id,
    p_payload: { document_id: document.id, original_filename: document.original_filename, ...payload },
  });
}
