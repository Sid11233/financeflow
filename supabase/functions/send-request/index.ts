// Orchestrates request creation: calls the create_request() RPC (which
// does the atomic multi-table DB write — see 0021) using the CALLER's own
// JWT, then, for a sent request, calls send-email with the request_initial
// template as a best-effort follow-up step. Email failure does not roll
// back the already-committed request: the request/token/reminders are
// real either way, matching how team invites already treat email delivery
// as non-fatal.
//
// Deliberately uses the caller's own Authorization header rather than the
// service role: creating a request is an ordinary action for any org
// member, already governed by RLS. There is no privilege gap to bridge
// here (unlike create-organization or accept-invite, where the actor has
// no account/profile yet) — the only reason this needs to be an Edge
// Function at all is that create_request()'s multiple table writes need to
// happen in one transaction, which a sequence of separate PostgREST calls
// from the browser could not guarantee.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, jsonError, jsonResponse } from '../_shared/cors.ts';
import { generatePortalToken, sha256Hex } from '../_shared/token.ts';
import { withObservability } from '../_shared/sentry.ts';

interface ChecklistItem {
  documentTypeId?: string;
  customName?: string;
  isOptional: boolean;
  // Human-readable name, e.g. "Bank Statement" — the frontend already has
  // document_types names loaded for display, so it's sent along purely for
  // the email rather than making this function look each one up again.
  label: string;
}

interface SendRequestPayload {
  clientId: string;
  periodStart: string;
  periodLabel: string;
  deadline: string;
  status: 'draft' | 'sent';
  checklist: ChecklistItem[];
  messageBody?: string;
  appOrigin: string;
}

interface CreateRequestResult {
  request_id: string;
  organization_id: string;
  client_name: string;
  client_email: string | null;
  organization_name: string;
}

const ERROR_MESSAGES: Record<string, { status: number; message: string }> = {
  NO_ORGANIZATION: { status: 403, message: "You don't have an organization yet." },
  CLIENT_NOT_FOUND: { status: 404, message: 'This client could not be found.' },
  INVALID_DOCUMENT_TYPE: { status: 400, message: 'One of the selected document types is invalid.' },
  DUPLICATE_REQUEST_PERIOD: {
    status: 409,
    message: 'This client already has a request for that period.',
  },
  TOKEN_HASH_REQUIRED: { status: 500, message: 'Could not create this request. Please try again.' },
};

Deno.serve(withObservability('send-request', async (req, { log, correlationId: requestId }) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonError('Method not allowed.', 405, requestId);

  const authHeader = req.headers.get('Authorization') ?? '';
  const body = (await req.json().catch(() => null)) as Partial<SendRequestPayload> | null;

  if (
    !body ||
    typeof body.clientId !== 'string' ||
    typeof body.periodStart !== 'string' ||
    typeof body.periodLabel !== 'string' ||
    typeof body.deadline !== 'string' ||
    (body.status !== 'draft' && body.status !== 'sent') ||
    !Array.isArray(body.checklist)
  ) {
    return jsonError('Invalid request.', 400, requestId);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  // Generated here, not in Postgres: the token design is base58 (via
  // crypto.getRandomValues), and Postgres has no base58 encoder. Only the
  // hash is ever sent to create_request() / stored in request_tokens — the
  // plaintext lives in this function's memory just long enough to build
  // the email link below, then it's gone.
  const plaintextToken = body.status === 'sent' ? generatePortalToken() : null;
  const tokenHash = plaintextToken ? await sha256Hex(plaintextToken) : null;

  const { data, error } = await supabase.rpc('create_request', {
    p_client_id: body.clientId,
    p_period_start: body.periodStart,
    p_period_label: body.periodLabel,
    p_deadline: body.deadline,
    p_status: body.status,
    p_checklist: body.checklist.map((item) => ({
      document_type_id: item.documentTypeId ?? null,
      custom_name: item.customName ?? null,
      is_optional: item.isOptional,
    })),
    p_token_hash: tokenHash,
  });

  if (error) {
    const known = Object.keys(ERROR_MESSAGES).find((code) => error.message.includes(code));
    if (known) {
      const { status, message } = ERROR_MESSAGES[known];
      return jsonError(message, status, requestId);
    }
    log.error('create_request_failed', { message: error.message });
    return jsonError('Could not create this request. Please try again.', 500, requestId);
  }

  const result = data as CreateRequestResult;

  if (body.status === 'draft') {
    return jsonResponse({ requestId: result.request_id, emailSent: null }, 200, { 'X-Request-Id': requestId });
  }

  if (!result.client_email || !plaintextToken) {
    // A sent request with no client email — the request itself is valid,
    // just can't be emailed. (plaintextToken is always set when status is
    // 'sent', by construction above.)
    return jsonResponse({ requestId: result.request_id, emailSent: false }, 200, { 'X-Request-Id': requestId });
  }

  const uploadUrl = `${body.appOrigin}/upload/${plaintextToken}`;

  const emailResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      apikey: Deno.env.get('SUPABASE_ANON_KEY')!,
      'Content-Type': 'application/json',
      'X-Correlation-Id': requestId,
    },
    body: JSON.stringify({
      template: 'request_initial',
      to: result.client_email,
      organizationId: result.organization_id,
      requestId: result.request_id,
      variables: {
        clientName: result.client_name,
        periodLabel: body.periodLabel,
        deadline: body.deadline,
        documents: body.checklist.map((item) => ({ label: item.label, isOptional: item.isOptional })),
        uploadUrl,
        messageBody: body.messageBody,
      },
    }),
  });

  log.info('request_sent', { emailSent: emailResponse.ok });
  return jsonResponse({ requestId: result.request_id, emailSent: emailResponse.ok }, 200, {
    'X-Request-Id': requestId,
  });
}));
