// The only code in this project that calls the Resend API. Every feature
// that needs to email someone (initial requests, reminders, team invites,
// accountant notifications) goes through one of the templates in
// ../_shared/emails/templates — never a raw {to, subject, html} payload —
// so the copy, layout, and dark-mode handling all live in exactly one
// place per template, and every send gets the same messages-table logging
// (see 0032) with no way to bypass it.
//
// firmName/logoUrl are deliberately never taken from the caller: they're
// looked up here from the organizations row for organizationId and merged
// into the template's variables server-side, so a template can't be made
// to claim a firm name the sender doesn't actually belong to, and callers
// don't have to fetch/pass them themselves.
//
// Setup: `supabase secrets set RESEND_API_KEY=... EMAIL_FROM=notifications@mail.financeflow.app`
// EMAIL_FROM is a bare address, not a "Name <address>" string — the
// display name is built per-send as "{Firm Name} via FinanceFlow".
import { createClient } from 'npm:@supabase/supabase-js@2';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, jsonError, jsonResponse } from '../_shared/cors.ts';
import { renderTemplate } from '../_shared/emails/render.ts';
import { isTemplateName } from '../_shared/emails/registry.ts';
import { redactEmails, withObservability } from '../_shared/sentry.ts';
import type { Logger } from '../_shared/log.ts';

interface SendEmailPayload {
  template: string;
  to?: string;
  replyTo?: string;
  variables: Record<string, unknown>;
  organizationId: string;
  requestId?: string;
  reminderId?: string;
  // Renders and returns {subject, html, text} without sending anything or
  // writing a messages row — used by the /dev/emails preview page. Never
  // exposed to end users; the route that calls it is dev-only.
  dryRun?: boolean;
}

Deno.serve(withObservability('send-email', async (req, { log, correlationId: requestIdHeader }) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonError('Method not allowed.', 405, requestIdHeader);

  // Same reasoning as before this rewrite: the default gateway JWT check
  // only confirms *some* valid project JWT, which the public anon key
  // itself satisfies — so this still requires either a real logged-in
  // user or the service role key (trusted server-side callers with no end
  // user to forward, e.g. portal-submit notifying an accountant on an
  // anonymous client's behalf).
  const authHeader = req.headers.get('Authorization') ?? '';
  const providedKey = authHeader.replace(/^Bearer\s+/i, '');
  const isServiceRole = providedKey === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!isServiceRole) {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const {
      data: { user },
    } = await supabaseClient.auth.getUser();
    if (!user) return jsonError('Authentication required.', 401, requestIdHeader);
  }

  const body = (await req.json().catch(() => null)) as Partial<SendEmailPayload> | null;
  if (!body || typeof body !== 'object') return jsonError('Invalid request.', 400, requestIdHeader);

  const { template, to, replyTo, variables, organizationId, requestId, reminderId, dryRun } = body;

  if (typeof template !== 'string' || !isTemplateName(template)) {
    return jsonError('Unknown template.', 400, requestIdHeader);
  }
  if (typeof organizationId !== 'string' || !organizationId) {
    return jsonError('organizationId is required.', 400, requestIdHeader);
  }
  if (!variables || typeof variables !== 'object') {
    return jsonError('variables is required.', 400, requestIdHeader);
  }
  if (!dryRun && (typeof to !== 'string' || !to)) {
    return jsonError('to is required.', 400, requestIdHeader);
  }

  // A dedicated service-role client for this function's own bookkeeping
  // (organization lookup, messages log), independent of how the caller
  // authenticated above — a service-role caller has no user JWT to scope
  // an RLS-bound client with, so this can't rely on the caller's own
  // credentials the way an ordinary user-facing RPC would.
  const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: organization, error: organizationError } = await supabaseAdmin
    .from('organizations')
    .select('name, logo_url')
    .eq('id', organizationId)
    .single();

  if (organizationError || !organization) {
    return jsonError('This organization could not be found.', 404, requestIdHeader);
  }

  const finalVariables: Record<string, unknown> = {
    ...variables,
    firmName: organization.name,
    logoUrl: organization.logo_url,
  };

  let rendered: ReturnType<typeof renderTemplate>;
  try {
    rendered = renderTemplate(template, finalVariables);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Invalid template variables.', 400, requestIdHeader);
  }

  if (dryRun) {
    return jsonResponse(rendered, 200, { 'X-Request-Id': requestIdHeader });
  }

  const messageId = await logMessage(supabaseAdmin, log, {
    organizationId,
    requestId,
    reminderId,
    template,
    recipient: to!,
    subject: rendered.subject,
  });

  const apiKey = Deno.env.get('RESEND_API_KEY');
  const fromAddress = Deno.env.get('EMAIL_FROM');

  if (!apiKey || !fromAddress) {
    log.error('email_not_configured');
    await updateMessage(supabaseAdmin, log, messageId, { status: 'failed', error: 'Email sending is not configured.' });
    return jsonError('Email sending is not configured.', 500, requestIdHeader);
  }

  const from = `${organization.name} via FinanceFlow <${fromAddress}>`;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      reply_to: replyTo || undefined,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    }),
  });

  if (!response.ok) {
    // Resend's own error body is third-party text this app doesn't fully
    // control the shape of — redactEmails() is a defense-in-depth pass in
    // case it ever echoes the recipient back (most validation errors
    // don't, but nothing guarantees that).
    const responseText = redactEmails(await response.text());
    log.error('resend_request_failed', { status: response.status, body: responseText });
    await updateMessage(supabaseAdmin, log, messageId, {
      status: 'failed',
      error: `Resend ${response.status}: ${responseText}`,
    });
    return jsonError('Failed to send email.', 502, requestIdHeader);
  }

  const result = (await response.json()) as { id?: string };
  await updateMessage(supabaseAdmin, log, messageId, { status: 'sent', resend_message_id: result.id ?? null });

  log.info('email_sent', { template, resendMessageId: result.id ?? null });
  return jsonResponse({ sent: true, resendMessageId: result.id ?? null }, 200, { 'X-Request-Id': requestIdHeader });
}));

async function logMessage(
  supabaseAdmin: SupabaseClient,
  log: Logger,
  input: {
    organizationId: string;
    requestId?: string;
    reminderId?: string;
    template: string;
    recipient: string;
    subject: string;
  },
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('messages')
    .insert({
      organization_id: input.organizationId,
      request_id: input.requestId ?? null,
      reminder_id: input.reminderId ?? null,
      template: input.template,
      recipient: input.recipient,
      subject: input.subject,
      status: 'queued',
    })
    .select('id')
    .single();

  if (error) {
    // input.recipient deliberately excluded — never log an email address.
    log.error('message_log_failed', { message: error.message });
    return null;
  }
  return data.id;
}

async function updateMessage(
  supabaseAdmin: SupabaseClient,
  log: Logger,
  messageId: string | null,
  update: { status: string; error?: string; resend_message_id?: string | null },
): Promise<void> {
  if (!messageId) return;
  const { error } = await supabaseAdmin
    .from('messages')
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq('id', messageId);
  if (error) {
    log.error('message_update_failed', { message: error.message });
  }
}
