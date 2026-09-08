import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Logger } from './log.ts';

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

const WINDOW_SECONDS = 3600;

// Atomicity matters here: "count existing events, then insert if under the
// limit" has to happen as one statement (see check_and_record_rate_limit in
// 0022), or two concurrent requests could both pass the check before either
// one's insert is visible to the other, letting the limit be exceeded.
export async function checkRateLimit(
  supabaseAdmin: SupabaseClient,
  bucketKey: string,
  limit: number,
  log?: Logger,
): Promise<RateLimitResult> {
  const { data, error } = await supabaseAdmin.rpc('check_and_record_rate_limit', {
    p_bucket_key: bucketKey,
    p_limit: limit,
    p_window_seconds: WINDOW_SECONDS,
  });

  if (error) {
    // Fail open: a broken rate limiter is an abuse-prevention control, not
    // an authorization boundary, and taking down the entire public portal
    // over a transient rate-limit-table issue would be a disproportionate
    // outage. Logged loudly since this should never happen in practice.
    const meta = { message: error.message };
    if (log) log.error('rate_limit_check_failed', meta);
    else console.error(JSON.stringify({ level: 'error', event: 'rate_limit_check_failed', ...meta }));
    return { allowed: true, retryAfterSeconds: 0 };
  }

  return { allowed: Boolean(data), retryAfterSeconds: data ? 0 : WINDOW_SECONDS };
}

export function rateLimitedResponse(retryAfterSeconds: number, requestId: string) {
  return new Response(JSON.stringify({ error: 'Too many requests. Please try again later.' }), {
    status: 429,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
      'Retry-After': String(retryAfterSeconds),
      'X-Request-Id': requestId,
    },
  });
}
