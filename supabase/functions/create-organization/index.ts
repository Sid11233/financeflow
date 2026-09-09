// Creates a brand-new account + organization atomically, using the service
// role. This must not happen from the client: it needs auth.admin.createUser
// (a service-role-only operation) and the organization insert needs to
// succeed or fail together with it, which only server-side code can
// arbitrate. Inserting into organizations here fires the
// organizations_after_insert trigger (0015), which creates the owner's
// profile row and seeds document_types — this function does not do that
// itself.
//
// The account is created unconfirmed (email_confirm: false) — unlike
// accept-invite, where receiving and clicking a token-bearing invite link
// already proves the invitee controls that inbox, self-serve signup lets
// anyone type in any email address with nothing to verify it's really
// theirs. A confirmation link is generated here and sent through this
// app's own send-email (Resend), not Supabase's native auth email, for
// the same reason every other email in this app goes through one place:
// consistent branding/templates and one messages-table log, no exception
// carved out for this one flow.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, jsonError, jsonResponse } from '../_shared/cors.ts';
import { withObservability } from '../_shared/sentry.ts';
import { checkRateLimit, rateLimitedResponse } from '../_shared/rateLimit.ts';
import { getClientIp } from '../_shared/ip.ts';
import { validatePasswordStrength } from '../_shared/passwordStrength.ts';
import { verifyTurnstileToken } from '../_shared/turnstile.ts';
import type { Logger } from '../_shared/log.ts';

// Deliberately strict — legitimate signup from one IP is rare (a firm
// signs up once), while this endpoint minting a real, immediately-usable
// account per call makes it the highest-value target in the app for
// scripted abuse (spam accounts, disposable-email spray, credential
// testing against the "already exists" response).
const IP_LIMIT = 5;

interface CreateOrganizationPayload {
  email: string;
  password: string;
  fullName: string;
  firmName: string;
  appOrigin: string;
  turnstileToken?: string;
}

Deno.serve(withObservability('create-organization', async (req, { log, correlationId: requestId }) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonError('Method not allowed.', 405, requestId);

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const ip = getClientIp(req);
  const ipLimit = await checkRateLimit(supabaseAdmin, `signup:${ip}`, IP_LIMIT, log);
  if (!ipLimit.allowed) {
    log.warn('rate_limited', { scope: 'ip' });
    return rateLimitedResponse(ipLimit.retryAfterSeconds, requestId);
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return jsonError('Invalid request.', 400, requestId);

  const email = typeof (body as Partial<CreateOrganizationPayload>).email === 'string'
    ? (body as CreateOrganizationPayload).email.trim().toLowerCase()
    : '';
  const password = typeof (body as Partial<CreateOrganizationPayload>).password === 'string'
    ? (body as CreateOrganizationPayload).password
    : '';
  const fullName = typeof (body as Partial<CreateOrganizationPayload>).fullName === 'string'
    ? (body as CreateOrganizationPayload).fullName.trim()
    : '';
  const firmName = typeof (body as Partial<CreateOrganizationPayload>).firmName === 'string'
    ? (body as CreateOrganizationPayload).firmName.trim()
    : '';
  const appOrigin = typeof (body as Partial<CreateOrganizationPayload>).appOrigin === 'string'
    ? (body as CreateOrganizationPayload).appOrigin
    : '';
  const turnstileToken = typeof (body as Partial<CreateOrganizationPayload>).turnstileToken === 'string'
    ? (body as CreateOrganizationPayload).turnstileToken
    : '';

  if (!email.includes('@')) return jsonError('A valid email is required.', 400, requestId);
  const passwordError = validatePasswordStrength(password);
  if (passwordError) return jsonError(passwordError, 400, requestId);
  if (!fullName) return jsonError('Your name is required.', 400, requestId);
  if (!firmName) return jsonError('Firm name is required.', 400, requestId);
  if (!appOrigin) return jsonError('Invalid request.', 400, requestId);

  // No-ops (returns valid: true) when TURNSTILE_SECRET_KEY isn't
  // configured — CAPTCHA is opt-in infrastructure, same pattern as
  // ANTHROPIC_API_KEY/SENTRY_DSN elsewhere in this app; nothing breaks
  // signup before a site is actually set up in Cloudflare.
  const turnstileResult = await verifyTurnstileToken(turnstileToken, ip);
  if (!turnstileResult.valid) {
    log.warn('turnstile_verification_failed', { reason: turnstileResult.reason });
    return jsonError('CAPTCHA verification failed. Please try again.', 400, requestId);
  }

  const { data: userData, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: { full_name: fullName },
  });

  if (createUserError || !userData.user) {
    // createUserError's own message can legitimately be logged — GoTrue's
    // "already registered" message doesn't echo the email back.
    log.warn('create_user_failed', { message: createUserError?.message });
    const message = createUserError?.message.toLowerCase().includes('already been registered')
      ? 'An account with this email already exists.'
      : 'Could not create your account. Please try again.';
    return jsonError(message, 409, requestId);
  }

  const userId = userData.user.id;

  const { data: org, error: orgError } = await supabaseAdmin
    .from('organizations')
    .insert({ name: firmName, owner_id: userId })
    .select('id, name, logo_url')
    .single();

  if (orgError || !org) {
    // Compensating action: without this, retrying signup with the same
    // email would collide with a half-created account that has no
    // organization or profile.
    log.error('organization_insert_failed', { message: orgError?.message });
    await supabaseAdmin.auth.admin.deleteUser(userId);
    return jsonError('Could not create your organization. Please try again.', 500, requestId);
  }

  try {
    await sendConfirmationEmail(supabaseAdmin, { email, password, appOrigin, organizationId: org.id }, log);
  } catch (error) {
    // An account that can never be confirmed is worse than no account at
    // all — the same compensating-delete used above for a failed
    // organization insert applies here too, rather than leaving a
    // permanently-stuck signup the user can't retry (createUser rejects a
    // second attempt with the same email as "already registered").
    log.error('confirmation_email_failed', { message: error instanceof Error ? error.message : 'unknown' });
    await supabaseAdmin.from('organizations').delete().eq('id', org.id);
    await supabaseAdmin.auth.admin.deleteUser(userId);
    return jsonError('Could not send a confirmation email. Please try again.', 500, requestId);
  }

  log.info('organization_created', { organizationId: org.id });
  return jsonResponse({ userId, organizationId: org.id, confirmationRequired: true }, 200, {
    'X-Request-Id': requestId,
  });
}));

async function sendConfirmationEmail(
  supabaseAdmin: ReturnType<typeof createClient>,
  params: { email: string; password: string; appOrigin: string; organizationId: string },
  log: Logger,
): Promise<void> {
  // generateLink (not admin.inviteUserByEmail or Supabase's own signup
  // email) — this returns the action_link without sending anything
  // itself, so the actual send can go through this app's own
  // send-email/Resend path with its own branded template.
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'signup',
    email: params.email,
    password: params.password,
    options: { redirectTo: `${params.appOrigin}/dashboard` },
  });

  if (linkError || !linkData?.properties?.action_link) {
    throw new Error(linkError?.message ?? 'Could not generate a confirmation link.');
  }

  const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      template: 'confirm_signup',
      to: params.email,
      organizationId: params.organizationId,
      variables: { confirmUrl: linkData.properties.action_link },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    log.error('send_email_failed', { status: response.status });
    throw new Error(`send-email ${response.status}: ${text}`);
  }
}
