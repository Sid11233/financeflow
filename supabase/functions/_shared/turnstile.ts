// Cloudflare Turnstile server-side verification. Optional infrastructure,
// same pattern as ANTHROPIC_API_KEY/SENTRY_DSN elsewhere in this app: with
// no TURNSTILE_SECRET_KEY configured, this no-ops (returns valid: true)
// rather than blocking signup before a Turnstile site actually exists —
// there is no free-tier cost or account requirement blocking turning it
// on, this is purely about not breaking the app before that setup happens.
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export interface TurnstileResult {
  valid: boolean;
  reason?: string;
}

export async function verifyTurnstileToken(token: string, remoteIp: string): Promise<TurnstileResult> {
  const secretKey = Deno.env.get('TURNSTILE_SECRET_KEY');
  if (!secretKey) return { valid: true };

  if (!token) return { valid: false, reason: 'missing_token' };

  const response = await fetch(VERIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret: secretKey, response: token, remoteip: remoteIp }),
  });

  if (!response.ok) return { valid: false, reason: `siteverify_http_${response.status}` };

  const result = (await response.json()) as { success: boolean; 'error-codes'?: string[] };
  if (!result.success) {
    return { valid: false, reason: result['error-codes']?.join(',') ?? 'unknown' };
  }
  return { valid: true };
}
