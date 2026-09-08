// Public endpoint — Resend calls this directly with no Supabase session,
// so verify_jwt is disabled for this function (see config.toml).
// Authenticity is verified via Resend's own Svix-signed webhook signature
// instead, using RESEND_WEBHOOK_SECRET (the whsec_... value from the
// Resend dashboard's webhook settings), not a Supabase credential.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { Webhook } from 'npm:svix@1.35.0';
import { corsHeaders, jsonError, jsonResponse } from '../_shared/cors.ts';
import { withObservability } from '../_shared/sentry.ts';
import type { Logger } from '../_shared/log.ts';

interface ResendWebhookEvent {
  type: string;
  data: {
    email_id: string;
  };
}

const STATUS_BY_EVENT_TYPE: Record<string, 'delivered' | 'bounced' | 'complained'> = {
  'email.delivered': 'delivered',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
};

Deno.serve(withObservability('resend-webhook', async (req, { log, correlationId }) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonError('Method not allowed.', 405, correlationId);

  const secret = Deno.env.get('RESEND_WEBHOOK_SECRET');
  if (!secret) {
    log.error('webhook_secret_missing');
    return jsonError('Webhook not configured.', 500, correlationId);
  }

  // Signature is computed over the raw body bytes — must be verified
  // before any JSON.parse, and against the exact text received.
  const payload = await req.text();
  const svixHeaders = {
    'svix-id': req.headers.get('svix-id') ?? '',
    'svix-timestamp': req.headers.get('svix-timestamp') ?? '',
    'svix-signature': req.headers.get('svix-signature') ?? '',
  };

  let event: ResendWebhookEvent;
  try {
    event = new Webhook(secret).verify(payload, svixHeaders) as ResendWebhookEvent;
  } catch (error) {
    log.warn('signature_verification_failed', { message: error instanceof Error ? error.message : 'unknown' });
    return jsonError('Invalid signature.', 401, correlationId);
  }

  const status = STATUS_BY_EVENT_TYPE[event.type];
  if (!status) {
    // Not one of the three event types this app tracks (e.g. email.sent,
    // email.opened, email.clicked) — acknowledge so Resend doesn't retry,
    // just don't act on it.
    return jsonResponse({ received: true }, 200, { 'X-Correlation-Id': correlationId });
  }

  const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: message, error: messageError } = await supabaseAdmin
    .from('messages')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('resend_message_id', event.data.email_id)
    .select('organization_id, recipient, request_id')
    .maybeSingle();

  if (messageError) {
    log.error('message_update_failed', { message: messageError.message });
  }

  if (!message) {
    log.warn('no_matching_message', { resendMessageId: event.data.email_id });
    return jsonResponse({ received: true }, 200, { 'X-Correlation-Id': correlationId });
  }

  if (status === 'bounced' || status === 'complained') {
    await supabaseAdmin
      .from('clients')
      .update({ email_bounced_at: new Date().toISOString(), email_bounce_type: status })
      .eq('organization_id', message.organization_id)
      .eq('email', message.recipient);

    // A bounce/complaint is a failure by this app's email policy, so it
    // gets both an in-app notification and an immediate alert email —
    // unlike the other five notification triggers, which go through the
    // digest only. Only possible when the message is tied to a specific
    // request (client_submitted, reminders, request_initial all are;
    // team_invite is not, and there's no single request owner to alert
    // for it).
    if (message.request_id) {
      try {
        await alertOnBounce(supabaseAdmin, message.organization_id, message.request_id, status, correlationId, log);
      } catch (alertError) {
        log.error('bounce_alert_failed', {
          message: alertError instanceof Error ? alertError.message : 'unknown',
        });
      }
    }
  } else if (status === 'delivered') {
    // A later successful delivery to the same address clears a prior
    // bounce/complaint warning — see 0032's comment on this column.
    await supabaseAdmin
      .from('clients')
      .update({ email_bounced_at: null, email_bounce_type: null })
      .eq('organization_id', message.organization_id)
      .eq('email', message.recipient)
      .not('email_bounced_at', 'is', null);
  }

  log.info('webhook_processed', { status });
  return jsonResponse({ received: true }, 200, { 'X-Correlation-Id': correlationId });
}));

async function alertOnBounce(
  supabaseAdmin: ReturnType<typeof createClient>,
  organizationId: string,
  requestId: string,
  status: 'bounced' | 'complained',
  correlationId: string,
  log: Logger,
): Promise<void> {
  const { data: request } = await supabaseAdmin
    .from('requests')
    .select('created_by, period_label, client_id')
    .eq('id', requestId)
    .single();

  if (!request) return;

  const { data: client } = await supabaseAdmin.from('clients').select('name').eq('id', request.client_id).single();
  const clientName = client?.name ?? 'A client';
  const problem = status === 'bounced' ? 'bounced' : 'was marked as spam';

  await supabaseAdmin.rpc('create_notification', {
    p_organization_id: organizationId,
    p_type: 'email_bounced',
    p_title: `Email to ${clientName} ${problem}`,
    p_body: request.period_label,
    p_link_path: `/requests/${requestId}`,
    p_user_id: request.created_by,
  });

  const { data: creator } = await supabaseAdmin.auth.admin.getUserById(request.created_by);
  if (!creator?.user?.email) {
    log.warn('bounce_alert_email_unavailable', { requestId });
    return;
  }

  const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      'Content-Type': 'application/json',
      'X-Correlation-Id': correlationId,
    },
    body: JSON.stringify({
      template: 'custom_message',
      to: creator.user.email,
      organizationId,
      requestId,
      variables: {
        subject: `An email to ${clientName} ${problem}`,
        body: `FinanceFlow sent an email to ${clientName} for ${request.period_label} and it ${problem}. They won't receive any further emails for this request until you follow up with them directly and confirm their address is correct.`,
      },
    }),
  });

  if (!response.ok) {
    log.warn('bounce_alert_send_failed', { status: response.status });
  }
}
