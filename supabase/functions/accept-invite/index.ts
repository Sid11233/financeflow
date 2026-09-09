// Looks up and accepts a team invite. Both need the service role: lookup
// has to read the invites table before the caller has any session at all
// (so RLS, which requires auth_org_id(), can't apply), and acceptance needs
// auth.admin.createUser to turn the invite's email into a real account.
//
// One POST endpoint, discriminated by `action`, rather than GET+POST: it
// keeps token handling in a request body instead of a URL/query string on
// both paths, and avoids relying on supabase-js's functions.invoke query
// param support.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, jsonError, jsonResponse } from '../_shared/cors.ts';
import { withObservability } from '../_shared/sentry.ts';
import { checkRateLimit, rateLimitedResponse } from '../_shared/rateLimit.ts';
import { getClientIp } from '../_shared/ip.ts';
import { validatePasswordStrength } from '../_shared/passwordStrength.ts';

const IP_LIMIT = 20;
// Separate, tighter limit keyed on the specific token being tried —
// same two-tier pattern as the client portal's own token endpoints
// (see portal-resolve): slows down brute-forcing one guessed/leaked
// invite token specifically, on top of the general per-IP cap above.
const TOKEN_LIMIT = 10;

interface InviteRow {
  id: string;
  email: string;
  role: string;
  organizationId: string;
  organizationName: string;
}

type LookupResult = { ok: true; row: InviteRow } | { ok: false; message: string; status: number };

Deno.serve(withObservability('accept-invite', async (req, { log, correlationId: requestId }) => {
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
  if (!body || typeof body !== 'object') return jsonError('Invalid request.', 400, requestId);

  const action = (body as { action?: unknown }).action;
  const token = typeof (body as { token?: unknown }).token === 'string' ? (body as { token: string }).token : '';

  if (!token) return jsonError('This invite link is invalid.', 400, requestId);

  const tokenHash = await sha256Hex(token);
  const tokenLimit = await checkRateLimit(supabaseAdmin, `token:${tokenHash}`, TOKEN_LIMIT, log);
  if (!tokenLimit.allowed) {
    log.warn('rate_limited', { scope: 'token' });
    return rateLimitedResponse(tokenLimit.retryAfterSeconds, requestId);
  }

  const invite = await lookupInvite(supabaseAdmin, tokenHash);
  if (!invite.ok) return jsonError(invite.message, invite.status, requestId);

  if (action === 'lookup') {
    return jsonResponse(
      { email: invite.row.email, organizationName: invite.row.organizationName },
      200,
      { 'X-Request-Id': requestId },
    );
  }

  if (action === 'accept') {
    const password = typeof (body as { password?: unknown }).password === 'string'
      ? (body as { password: string }).password
      : '';
    const fullName = typeof (body as { fullName?: unknown }).fullName === 'string'
      ? (body as { fullName: string }).fullName.trim()
      : '';

    const passwordError = validatePasswordStrength(password);
    if (passwordError) return jsonError(passwordError, 400, requestId);
    if (!fullName) return jsonError('Your name is required.', 400, requestId);

    const { data: userData, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email: invite.row.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (createUserError || !userData.user) {
      // createUserError's own message can legitimately be logged (it
      // never echoes the email back — GoTrue's "already registered"
      // message doesn't include it), unlike invite.row.email itself.
      log.warn('create_user_failed', { message: createUserError?.message });
      const message = createUserError?.message.toLowerCase().includes('already been registered')
        ? 'An account with this email already exists. Try logging in instead.'
        : 'Could not create your account. Please try again.';
      return jsonError(message, 409, requestId);
    }

    const { error: profileError } = await supabaseAdmin.from('profiles').insert({
      id: userData.user.id,
      organization_id: invite.row.organizationId,
      full_name: fullName,
      role: invite.row.role,
    });

    if (profileError) {
      log.error('profile_insert_failed', { message: profileError.message });
      await supabaseAdmin.auth.admin.deleteUser(userData.user.id);
      return jsonError('Could not finish joining the organization. Please try again.', 500, requestId);
    }

    await supabaseAdmin
      .from('invites')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', invite.row.id);

    log.info('invite_accepted', { organizationId: invite.row.organizationId });
    return jsonResponse({ email: invite.row.email }, 200, { 'X-Request-Id': requestId });
  }

  return jsonError('Unknown action.', 400, requestId);
}));

async function lookupInvite(supabaseAdmin: SupabaseClient, tokenHash: string): Promise<LookupResult> {
  const { data: row, error } = await supabaseAdmin
    .from('invites')
    .select('id, email, role, organization_id, expires_at, revoked_at, accepted_at, organizations(name)')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (error || !row) return { ok: false, message: 'This invite link is invalid.', status: 404 };
  if (row.revoked_at) return { ok: false, message: 'This invite has been revoked.', status: 410 };
  if (row.accepted_at) return { ok: false, message: 'This invite has already been used.', status: 410 };
  if (new Date(row.expires_at as string).getTime() < Date.now()) {
    return { ok: false, message: 'This invite link has expired.', status: 410 };
  }

  const organization = row.organizations as { name: string } | { name: string }[] | null;
  const organizationName = Array.isArray(organization)
    ? (organization[0]?.name ?? 'your team')
    : (organization?.name ?? 'your team');

  return {
    ok: true,
    row: {
      id: row.id as string,
      email: row.email as string,
      role: row.role as string,
      organizationId: row.organization_id as string,
      organizationName,
    },
  };
}

async function sha256Hex(input: string) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
