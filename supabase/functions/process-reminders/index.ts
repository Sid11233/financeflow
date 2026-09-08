// Run every 15 minutes by pg_cron (see 0036). This is the only place that
// decides which due reminders actually get sent, how client-facing ones
// combine when a client has more than one due at once, and how send
// failures retry — send-email itself just renders+sends whatever
// template/variables it's given.
//
// Called with the Vault-stored service-role key, never a forwarded user
// JWT (same pattern as classify-document/cleanup-deleted-documents), so
// verify_jwt is disabled for this function (see config.toml).
import { createClient } from 'npm:@supabase/supabase-js@2';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, jsonError, jsonResponse } from '../_shared/cors.ts';
import type { Logger } from '../_shared/log.ts';
import { generatePortalToken, sha256Hex } from '../_shared/token.ts';
import {
  accountantFacing,
  clientFacing,
  clientTemplateForType,
  groupByClient,
  recheckRequestForReminder,
} from '../_shared/reminderBatching.ts';
import type { ClaimedReminder } from '../_shared/reminderBatching.ts';
import { withObservability } from '../_shared/sentry.ts';

const BATCH_LIMIT = 100;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 30 * 60 * 1000;
const RESOLVED_STATUSES = new Set(['accepted', 'received', 'waived']);

interface ReminderRecord {
  id: string;
  organization_id: string;
  request_id: string;
  type: string;
  audience: 'client' | 'accountant' | 'both';
  attempts: number;
}

interface RequestRecord {
  id: string;
  organization_id: string;
  client_id: string;
  status: string;
  deadline: string;
  period_label: string;
  reminders_paused_at: string | null;
  created_by: string;
}

interface ClientRecord {
  id: string;
  name: string;
  email: string | null;
}

interface MissingDocsResult {
  missingLabels: string[];
  resolvedCount: number;
  totalCount: number;
}

Deno.serve(withObservability('process-reminders', async (req, { log, correlationId: requestId }) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization') ?? '';
  const providedKey = authHeader.replace(/^Bearer\s+/i, '');
  if (providedKey !== Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
    return jsonError('Unauthorized.', 401, requestId);
  }

  const appOrigin = Deno.env.get('APP_ORIGIN');
  if (!appOrigin) {
    log.error('app_origin_missing');
    return jsonError('APP_ORIGIN is not configured.', 500, requestId);
  }

  const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: claimedRaw, error: claimError } = await supabaseAdmin.rpc('claim_due_reminders', {
    p_limit: BATCH_LIMIT,
  });

  if (claimError) {
    log.error('claim_failed', { message: claimError.message });
    return jsonError('Could not claim due reminders.', 500, requestId);
  }

  const claimed = (claimedRaw ?? []) as ReminderRecord[];
  const counts = { sent: 0, skipped: 0, deferred: 0, failed: 0 };

  if (claimed.length === 0) {
    return jsonResponse({ processed: 0, ...counts }, 200, { 'X-Request-Id': requestId });
  }

  const requestIds = [...new Set(claimed.map((r) => r.request_id))];
  const { data: requestsData } = await supabaseAdmin
    .from('requests')
    .select('id, organization_id, client_id, status, deadline, period_label, reminders_paused_at, created_by')
    .in('id', requestIds);
  const requestsById = new Map((requestsData ?? []).map((r) => [r.id, r as RequestRecord]));

  // Phase 1: re-check each claimed reminder against its request's current
  // state. 'complete'/'cancelled' are terminal — the rung is permanently
  // moot. Paused is temporary — revert to 'pending' so a later run (once
  // unpaused) picks it up again, rather than losing it.
  const active: { reminder: ReminderRecord; request: RequestRecord }[] = [];

  for (const reminder of claimed) {
    const request = requestsById.get(reminder.request_id);

    if (!request) {
      await markSkipped(
        supabaseAdmin,
        { id: reminder.id, organizationId: reminder.organization_id, requestId: reminder.request_id, type: reminder.type },
        'request_not_found',
      );
      counts.skipped++;
      continue;
    }

    const outcome = recheckRequestForReminder({
      status: request.status,
      remindersPausedAt: request.reminders_paused_at,
    });

    if (outcome.action === 'skip') {
      await markSkipped(
        supabaseAdmin,
        {
          id: reminder.id,
          organizationId: reminder.organization_id,
          requestId: reminder.request_id,
          type: reminder.type,
          clientId: request.client_id,
        },
        outcome.reason,
      );
      counts.skipped++;
      continue;
    }
    if (outcome.action === 'defer') {
      await revertToPending(supabaseAdmin, reminder.id);
      counts.deferred++;
      continue;
    }
    active.push({ reminder, request });
  }

  if (active.length === 0) {
    return jsonResponse({ processed: claimed.length, ...counts }, 200, { 'X-Request-Id': requestId });
  }

  const clientIds = [...new Set(active.map((a) => a.request.client_id))];
  const { data: clientsData } = await supabaseAdmin.from('clients').select('id, name, email').in('id', clientIds);
  const clientsById = new Map((clientsData ?? []).map((c) => [c.id, c as ClientRecord]));

  const activeReminders: ClaimedReminder[] = active.map((a) => ({
    id: a.reminder.id,
    requestId: a.request.id,
    clientId: a.request.client_id,
    audience: a.reminder.audience,
    type: a.reminder.type,
  }));

  // Tracks, per reminder id, whether each half of it was actually
  // attempted this run — a 'both' reminder needs both before it can be
  // marked fully 'sent'; capped-for-today still counts as "handled" for
  // the client half so the row doesn't loop forever waiting on a cap that
  // resets tomorrow.
  const clientHandled = new Map<string, boolean>();
  const clientFailed = new Set<string>();
  const accountantHandled = new Map<string, boolean>();
  const accountantFailed = new Set<string>();
  const failureMessages = new Map<string, string>();

  // Phase 2: client-facing sends, grouped and capped per client.
  for (const group of groupByClient(clientFacing(activeReminders))) {
    const client = clientsById.get(group.clientId);
    const orgId = active.find((a) => a.request.client_id === group.clientId)!.request.organization_id;

    if (!client?.email) {
      for (const member of group.members) clientHandled.set(member.id, true); // nothing to send to — treat as handled
      continue;
    }

    const { data: alreadySentToday } = await supabaseAdmin.rpc('client_has_reminder_today', {
      p_client_id: group.clientId,
      p_organization_id: orgId,
    });

    if (alreadySentToday) {
      for (const member of group.members) clientHandled.set(member.id, true);
      await Promise.all(
        group.members.map((member) =>
          markSkipped(
            supabaseAdmin,
            { id: member.id, organizationId: orgId, requestId: member.requestId, type: member.type, clientId: member.clientId },
            'daily_cap_reached',
          ),
        ),
      );
      counts.skipped += group.members.length;
      continue;
    }

    try {
      const items = await Promise.all(
        group.members.map(async (member) => {
          const context = active.find((a) => a.reminder.id === member.id)!;
          const missing = await getMissingDocuments(supabaseAdmin, context.request.id);
          const uploadUrl = await mintUploadUrl(supabaseAdmin, context.request, appOrigin);
          return { member, context, missing, uploadUrl };
        }),
      );

      if (items.length === 1) {
        const { member, context, missing, uploadUrl } = items[0];
        await callSendEmail(log, {
          template: clientTemplateForType(member.type),
          to: client.email,
          organizationId: orgId,
          requestId: context.request.id,
          reminderId: member.id,
          variables: {
            clientName: client.name,
            periodLabel: context.request.period_label,
            deadline: context.request.deadline,
            missingDocuments: missing.missingLabels,
            uploadedCount: missing.resolvedCount,
            totalCount: missing.totalCount,
            uploadUrl,
          },
        });
      } else {
        await callSendEmail(log, {
          template: 'reminder_batch',
          to: client.email,
          organizationId: orgId,
          requestId: items[0].context.request.id,
          reminderId: items[0].member.id,
          variables: {
            clientName: client.name,
            items: items.map(({ context, missing, uploadUrl }) => ({
              periodLabel: context.request.period_label,
              missingDocuments: missing.missingLabels,
              uploadUrl,
            })),
          },
        });
      }

      for (const member of group.members) clientHandled.set(member.id, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      log.error('client_batch_send_failed', { clientId: group.clientId, message });
      for (const member of group.members) {
        clientFailed.add(member.id);
        failureMessages.set(member.id, message);
      }
    }
  }

  // Phase 3: accountant-facing sends — not subject to the daily cap (that
  // rule is specifically about not spamming the client).
  for (const reminder of accountantFacing(activeReminders)) {
    const context = active.find((a) => a.reminder.id === reminder.id)!;
    const { data: creator } = await supabaseAdmin.auth.admin.getUserById(context.request.created_by);

    if (!creator?.user?.email) {
      accountantHandled.set(reminder.id, true); // nobody to notify — treat as handled
      continue;
    }

    try {
      const missing = await getMissingDocuments(supabaseAdmin, context.request.id);
      const client = clientsById.get(context.request.client_id);
      await callSendEmail(log, {
        template: 'accountant_overdue',
        to: creator.user.email,
        organizationId: context.request.organization_id,
        requestId: context.request.id,
        reminderId: reminder.id,
        variables: {
          clientName: client?.name ?? 'A client',
          periodLabel: context.request.period_label,
          deadline: context.request.deadline,
          missingDocuments: missing.missingLabels,
          requestUrl: `${appOrigin}/requests/${context.request.id}`,
        },
      });
      accountantHandled.set(reminder.id, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      log.error('accountant_send_failed', { requestId: context.request.id, message });
      accountantFailed.add(reminder.id);
      failureMessages.set(reminder.id, message);
    }
  }

  // Phase 4: finalize each reminder's status from what actually happened
  // to its client/accountant halves this run.
  for (const { reminder, request } of active) {
    const needsClient = reminder.audience === 'client' || reminder.audience === 'both';
    const needsAccountant = reminder.audience === 'accountant' || reminder.audience === 'both';

    const clientOk = !needsClient || clientHandled.get(reminder.id) === true;
    const accountantOk = !needsAccountant || accountantHandled.get(reminder.id) === true;

    if (clientOk && accountantOk) {
      await markSent(supabaseAdmin, reminder.id);
      await writeActivityLog(supabaseAdmin, request, reminder, log);
      counts.sent++;
    } else {
      // The `else` branch (neither ok nor recorded as failed) is reached
      // only via an unexpected code path — treated conservatively as a
      // failure, with a generic message, so it retries rather than
      // silently vanishing.
      await handleFailure(supabaseAdmin, reminder, request, failureMessages.get(reminder.id) ?? 'Unknown failure.', log);
      counts.failed++;
    }
  }

  log.info('run_complete', { claimed: claimed.length, ...counts });
  return jsonResponse({ processed: claimed.length, ...counts }, 200, { 'X-Request-Id': requestId });
}));

async function getMissingDocuments(supabaseAdmin: SupabaseClient, requestId: string): Promise<MissingDocsResult> {
  const { data } = await supabaseAdmin
    .from('required_documents')
    .select('status, custom_name, document_types(name)')
    .eq('request_id', requestId)
    .eq('is_optional', false)
    .returns<{ status: string; custom_name: string | null; document_types: { name: string } | null }[]>();

  const items = data ?? [];
  const missing = items.filter((item) => !RESOLVED_STATUSES.has(item.status));

  return {
    missingLabels: missing.map((item) => item.document_types?.name ?? item.custom_name ?? 'Document'),
    resolvedCount: items.length - missing.length,
    totalCount: items.length,
  };
}

async function mintUploadUrl(supabaseAdmin: SupabaseClient, request: RequestRecord, appOrigin: string): Promise<string> {
  const plaintextToken = generatePortalToken();
  const tokenHash = await sha256Hex(plaintextToken);

  await supabaseAdmin.from('request_tokens').insert({
    organization_id: request.organization_id,
    request_id: request.id,
    token_hash: tokenHash,
    expires_at: new Date(new Date(`${request.deadline}T00:00:00Z`).getTime() + 30 * 86_400_000).toISOString(),
  });

  return `${appOrigin}/upload/${plaintextToken}`;
}

async function callSendEmail(
  log: Logger,
  body: {
    template: string;
    to: string;
    organizationId: string;
    requestId: string;
    reminderId: string;
    variables: Record<string, unknown>;
  },
): Promise<void> {
  const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      // Must match Authorization exactly, not the anon key — the gateway
      // rejects apikey/Authorization carrying two different sb_-format
      // keys as "Conflicting API keys" (confirmed empirically). Per its
      // own error hint, the intended key goes in apikey; Authorization is
      // send-email's own internal service-role check, not the gateway's.
      apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    log.error('send_email_failed', { template: body.template, status: response.status, body: text });
    throw new Error(`send-email ${response.status}: ${text}`);
  }
}

async function markSkipped(
  supabaseAdmin: SupabaseClient,
  params: { id: string; organizationId: string; requestId: string; type: string; clientId?: string | null },
  reason: string,
): Promise<void> {
  await supabaseAdmin.from('reminders').update({ status: 'skipped', reason }).eq('id', params.id);
  await supabaseAdmin.rpc('log_activity', {
    p_organization_id: params.organizationId,
    p_event_type: 'reminder_skipped',
    p_actor_type: 'system',
    p_request_id: params.requestId,
    p_client_id: params.clientId ?? null,
    p_payload: { reminder_id: params.id, type: params.type, reason },
  });
}

async function revertToPending(supabaseAdmin: SupabaseClient, reminderId: string): Promise<void> {
  await supabaseAdmin.from('reminders').update({ status: 'pending' }).eq('id', reminderId);
}

async function markSent(supabaseAdmin: SupabaseClient, reminderId: string): Promise<void> {
  await supabaseAdmin.from('reminders').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', reminderId);
}

async function handleFailure(
  supabaseAdmin: SupabaseClient,
  reminder: ReminderRecord,
  request: RequestRecord,
  errorMessage: string,
  log: Logger,
): Promise<void> {
  const attempts = reminder.attempts + 1;

  if (attempts >= MAX_ATTEMPTS) {
    await supabaseAdmin
      .from('reminders')
      .update({ status: 'failed', attempts, last_error: errorMessage })
      .eq('id', reminder.id);

    await supabaseAdmin.rpc('log_activity', {
      p_organization_id: request.organization_id,
      p_event_type: 'reminder_failed',
      p_actor_type: 'system',
      p_request_id: request.id,
      p_client_id: request.client_id,
      p_payload: { reminder_id: reminder.id, type: reminder.type, attempts, error: errorMessage },
    });

    const { data: creator } = await supabaseAdmin.auth.admin.getUserById(request.created_by);
    if (creator?.user?.email) {
      try {
        await callSendEmail(log, {
          template: 'custom_message',
          to: creator.user.email,
          organizationId: request.organization_id,
          requestId: request.id,
          reminderId: reminder.id,
          variables: {
            subject: `A reminder failed to send for ${request.period_label}`,
            body: `FinanceFlow tried ${MAX_ATTEMPTS} times to send a "${reminder.type}" reminder for this request and could not. You may want to follow up with the client directly, or check the request's email history.`,
          },
        });
      } catch {
        log.error('failure_alert_send_failed', { reminderId: reminder.id });
      }
    }
  } else {
    await supabaseAdmin
      .from('reminders')
      .update({
        status: 'pending',
        attempts,
        scheduled_for: new Date(Date.now() + RETRY_DELAY_MS).toISOString(),
        last_error: errorMessage,
      })
      .eq('id', reminder.id);
  }
}

async function writeActivityLog(
  supabaseAdmin: SupabaseClient,
  request: RequestRecord,
  reminder: ReminderRecord,
  log: Logger,
): Promise<void> {
  const { error } = await supabaseAdmin.rpc('log_activity', {
    p_organization_id: request.organization_id,
    p_event_type: 'reminder_sent',
    p_actor_type: 'system',
    p_request_id: request.id,
    p_client_id: request.client_id,
    p_payload: { reminder_id: reminder.id, type: reminder.type, audience: reminder.audience },
  });
  if (error) log.error('activity_log_failed', { reminderId: reminder.id, message: error.message });
}
