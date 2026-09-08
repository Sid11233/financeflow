// Public, unauthenticated — called by the frontend's /unsubscribe page,
// which is what the digest email's unsubscribe link actually points at.
// This function itself only returns JSON, deliberately: Supabase's
// function gateway downgrades a text/html response to text/plain for any
// verify_jwt = false function (confirmed empirically — likely a
// anti-phishing measure against serving arbitrary HTML from a trusted
// supabase.co domain with no auth), so a browser would render the raw
// tags instead of the page. Rendering the confirmation itself belongs to
// the app's own frontend, same split as portal-resolve/UploadPortalPage.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, jsonError, jsonResponse } from '../_shared/cors.ts';
import { verifyUnsubscribeToken } from '../_shared/unsubscribeToken.ts';
import { withObservability } from '../_shared/sentry.ts';

Deno.serve(withObservability('digest-unsubscribe', async (req, { log, correlationId: requestId }) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  const token = req.method === 'GET' ? (url.searchParams.get('token') ?? '') : '';
  const body = req.method === 'POST' ? await req.json().catch(() => null) : null;
  const finalToken = token || (typeof body?.token === 'string' ? body.token : '');

  const secret = Deno.env.get('UNSUBSCRIBE_SECRET');
  if (!secret) {
    log.error('unsubscribe_secret_missing');
    return jsonError('Not configured.', 500, requestId);
  }

  const userId = finalToken ? await verifyUnsubscribeToken(finalToken, secret) : null;
  if (!userId) {
    return jsonError('Invalid or malformed unsubscribe link.', 400, requestId);
  }

  const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { error } = await supabaseAdmin.from('profiles').update({ digest_frequency: 'off' }).eq('id', userId);

  if (error) {
    log.error('profile_update_failed', { message: error.message });
    return jsonError('Something went wrong.', 500, requestId);
  }

  log.info('unsubscribed');
  return jsonResponse({ unsubscribed: true }, 200, { 'X-Request-Id': requestId });
}));
