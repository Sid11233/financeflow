// Creates a brand-new account + organization atomically, using the service
// role. This must not happen from the client: it needs auth.admin.createUser
// (a service-role-only operation) and the organization insert needs to
// succeed or fail together with it, which only server-side code can
// arbitrate. Inserting into organizations here fires the
// organizations_after_insert trigger (0015), which creates the owner's
// profile row and seeds document_types — this function does not do that
// itself.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, jsonError, jsonResponse } from '../_shared/cors.ts';
import { withObservability } from '../_shared/sentry.ts';

interface CreateOrganizationPayload {
  email: string;
  password: string;
  fullName: string;
  firmName: string;
}

Deno.serve(withObservability('create-organization', async (req, { log, correlationId: requestId }) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonError('Method not allowed.', 405, requestId);

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

  if (!email.includes('@')) return jsonError('A valid email is required.', 400, requestId);
  if (password.length < 8) return jsonError('Password must be at least 8 characters.', 400, requestId);
  if (!fullName) return jsonError('Your name is required.', 400, requestId);
  if (!firmName) return jsonError('Firm name is required.', 400, requestId);

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: userData, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
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
    .select('id')
    .single();

  if (orgError || !org) {
    // Compensating action: without this, retrying signup with the same
    // email would collide with a half-created account that has no
    // organization or profile.
    log.error('organization_insert_failed', { message: orgError?.message });
    await supabaseAdmin.auth.admin.deleteUser(userId);
    return jsonError('Could not create your organization. Please try again.', 500, requestId);
  }

  log.info('organization_created', { organizationId: org.id });
  return jsonResponse({ userId, organizationId: org.id }, 200, { 'X-Request-Id': requestId });
}));
