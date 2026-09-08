// Backs three request-detail-page actions that all boil down to the same
// operation — mint a fresh upload-link token and optionally email it —
// because request_tokens only ever stores a token's sha256 hash (see
// 0010/send-request): the plaintext link handed to a client at creation
// time is never recoverable afterward, so "Send Reminder", "Resend Link",
// and "Copy Upload Link" all have to generate a brand-new token rather
// than reuse the original one.
//
// Deliberately does not revoke any existing token when minting a new one.
// A client's original invite link should keep working after a reminder or
// a copied link goes out — they may have it bookmarked — and multiple live
// tokens per request is not a security problem (each is independently
// rate-limited and checked). Stale tokens are still cleaned up by
// revoke-finished-request-tokens (0022) once the request is done.
//
// Uses the caller's own JWT, like send-request — this is an ordinary
// action for any org member, already governed by RLS; the only reason
// this is an Edge Function at all is the token generation (base58 has no
// Postgres encoder) and, for 'reminder'/'resend', calling send-email.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, jsonError, jsonResponse } from '../_shared/cors.ts';
import { generatePortalToken, sha256Hex } from '../_shared/token.ts';
import { withObservability } from '../_shared/sentry.ts';

type NotifyAction = 'reminder' | 'resend' | 'copy_link';

interface NotifyPayload {
  requestId: string;
  action: NotifyAction;
  appOrigin: string;
}

interface RequestRow {
  id: string;
  organization_id: string;
  client_id: string;
  period_label: string;
  deadline: string;
  clients: { name: string; email: string | null } | null;
}

interface RequiredDocumentRow {
  status: string;
  is_optional: boolean;
  custom_name: string | null;
  document_types: { name: string } | null;
}

const RESOLVED_STATUSES = new Set(['accepted', 'received', 'waived']);

Deno.serve(withObservability('request-notify', async (req, { log, correlationId: requestId }) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonError('Method not allowed.', 405, requestId);

  const authHeader = req.headers.get('Authorization') ?? '';
  const body = (await req.json().catch(() => null)) as Partial<NotifyPayload> | null;

  if (
    !body ||
    typeof body.requestId !== 'string' ||
    typeof body.appOrigin !== 'string' ||
    (body.action !== 'reminder' && body.action !== 'resend' && body.action !== 'copy_link')
  ) {
    return jsonError('Invalid request.', 400, requestId);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const actorId = user?.id ?? null;

  const { data: request, error: requestError } = await supabase
    .from('requests')
    .select('id, organization_id, client_id, period_label, deadline, clients(name, email)')
    .eq('id', body.requestId)
    .single<RequestRow>();

  if (requestError || !request) {
    return jsonError('This request could not be found.', 404, requestId);
  }

  const plaintextToken = generatePortalToken();
  const tokenHash = await sha256Hex(plaintextToken);

  const { error: tokenError } = await supabase.from('request_tokens').insert({
    organization_id: request.organization_id,
    request_id: request.id,
    token_hash: tokenHash,
    expires_at: new Date(new Date(`${request.deadline}T00:00:00Z`).getTime() + 30 * 86_400_000).toISOString(),
  });

  if (tokenError) {
    log.error('token_create_failed', { message: tokenError.message });
    return jsonError('Could not create an upload link. Please try again.', 500, requestId);
  }

  const uploadUrl = `${body.appOrigin}/upload/${plaintextToken}`;

  if (body.action === 'copy_link') {
    // Not logged: a link copied to the accountant's own clipboard has no
    // client-facing effect, and there's no canonical event for it — only
    // 'link_resent' (an email actually going out) and 'link_expired'.
    return jsonResponse({ url: uploadUrl, emailSent: null }, 200, { 'X-Request-Id': requestId });
  }

  const clientEmail = request.clients?.email ?? null;
  if (!clientEmail) {
    return jsonResponse({ url: uploadUrl, emailSent: false }, 200, { 'X-Request-Id': requestId });
  }

  const clientName = request.clients?.name ?? 'there';

  const { data: requiredDocuments } = await supabase
    .from('required_documents')
    .select('status, is_optional, custom_name, document_types(name)')
    .eq('request_id', request.id)
    .eq('is_optional', false)
    .returns<RequiredDocumentRow[]>();

  const mandatoryItems = requiredDocuments ?? [];
  const labelOf = (item: RequiredDocumentRow) => item.document_types?.name ?? item.custom_name ?? 'Document';
  const missingLabels = mandatoryItems.filter((item) => !RESOLVED_STATUSES.has(item.status)).map(labelOf);
  const resolvedCount = mandatoryItems.length - missingLabels.length;

  const isReminder = body.action === 'reminder';
  let emailSent = false;
  let template: string;
  let variables: Record<string, unknown>;

  if (isReminder) {
    template = pickReminderTemplate(request.deadline);
    variables = {
      clientName,
      periodLabel: request.period_label,
      deadline: request.deadline,
      missingDocuments: missingLabels,
      uploadedCount: resolvedCount,
      totalCount: mandatoryItems.length,
      uploadUrl,
    };
  } else {
    template = 'request_initial';
    variables = {
      clientName,
      periodLabel: request.period_label,
      deadline: request.deadline,
      documents: mandatoryItems.map((item) => ({ label: labelOf(item), isOptional: false })),
      uploadUrl,
    };
  }

  const emailResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      apikey: Deno.env.get('SUPABASE_ANON_KEY')!,
      'Content-Type': 'application/json',
      'X-Correlation-Id': requestId,
    },
    body: JSON.stringify({
      template,
      to: clientEmail,
      organizationId: request.organization_id,
      requestId: request.id,
      variables,
    }),
  });

  emailSent = emailResponse.ok;

  if (isReminder) {
    await supabase.from('reminders').insert({
      organization_id: request.organization_id,
      request_id: request.id,
      channel: 'email',
      type: 'manual',
      audience: 'client',
      status: emailSent ? 'sent' : 'failed',
      scheduled_for: new Date().toISOString(),
      sent_at: emailSent ? new Date().toISOString() : null,
      created_by: actorId,
    });

    if (emailSent) {
      // A manual send shouldn't be followed by an automated one shortly
      // after — push every remaining ladder rung for this request out so
      // the next one lands at least a day later (see 0036).
      await supabase.rpc('push_back_pending_reminders', { p_request_id: request.id });
    }
  }

  if (emailSent) {
    await supabase.rpc('log_activity', {
      p_organization_id: request.organization_id,
      p_event_type: isReminder ? 'reminder_sent' : 'link_resent',
      p_actor_type: 'accountant',
      p_request_id: request.id,
      p_client_id: request.client_id,
      p_actor_id: actorId,
    });
  } else if (isReminder) {
    await supabase.rpc('log_activity', {
      p_organization_id: request.organization_id,
      p_event_type: 'reminder_failed',
      p_actor_type: 'accountant',
      p_request_id: request.id,
      p_client_id: request.client_id,
      p_actor_id: actorId,
    });
  }
  // A failed 'resend' (not a reminder) isn't logged — 'link_resent' would
  // be inaccurate, and there's no canonical failure event for it.

  log.info('notify_complete', { action: body.action, emailSent });
  return jsonResponse({ url: uploadUrl, emailSent }, 200, { 'X-Request-Id': requestId });
}));

// Ad-hoc "Send Reminder" clicks pick the urgency tier from how close the
// deadline actually is at send time, rather than always sending the same
// copy — nudge >3 days out, firm from 3 days out through a week overdue,
// final beyond that.
function pickReminderTemplate(deadline: string): string {
  const daysUntilDeadline = Math.round(
    (new Date(`${deadline}T00:00:00`).getTime() - Date.now()) / 86_400_000,
  );
  if (daysUntilDeadline > 3) return 'reminder_nudge';
  if (daysUntilDeadline >= -7) return 'reminder_firm';
  return 'reminder_final';
}
