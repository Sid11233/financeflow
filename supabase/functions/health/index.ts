// Public, unauthenticated — this is what the uptime monitor polls (see
// docs/uptime-monitoring.md for the monitor configuration and alerting
// setup). Checks the three things that can fail independently of each
// other and would otherwise only surface as a confusing downstream error:
// the database, Storage, and the Anthropic API classification depends on.
//
// Every check has its own timeout so one hanging upstream can't hang the
// whole health check past what a monitor's own timeout would tolerate —
// a slow check is reported as 'down', not left to time out the request.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { withObservability } from '../_shared/sentry.ts';

const CHECK_TIMEOUT_MS = 5000;

type CheckStatus = 'ok' | 'down' | 'not_configured';

interface CheckResult {
  status: CheckStatus;
  latencyMs: number;
  message?: string;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: number;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

async function timedCheck(fn: () => Promise<void>): Promise<CheckResult> {
  const start = performance.now();
  try {
    await withTimeout(fn(), CHECK_TIMEOUT_MS);
    return { status: 'ok', latencyMs: Math.round(performance.now() - start) };
  } catch (error) {
    return {
      status: 'down',
      latencyMs: Math.round(performance.now() - start),
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function checkDatabase(supabaseAdmin: ReturnType<typeof createClient>): Promise<CheckResult> {
  return timedCheck(async () => {
    // organizations is small and always exists — this is purely testing
    // "can we round-trip a query," not reading anything meaningful back.
    const { error } = await supabaseAdmin.from('organizations').select('id').limit(1);
    if (error) throw new Error(error.message);
  });
}

async function checkStorage(supabaseAdmin: ReturnType<typeof createClient>): Promise<CheckResult> {
  return timedCheck(async () => {
    const { error } = await supabaseAdmin.storage.getBucket('client-documents');
    if (error) throw new Error(error.message);
  });
}

async function checkAnthropic(): Promise<CheckResult> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return { status: 'not_configured', latencyMs: 0 };
  }

  return timedCheck(async () => {
    // A models list is metadata-only — no generation cost, no tokens
    // consumed — while still exercising both network reachability and key
    // validity (a bad key comes back 401, not a network failure).
    const response = await fetch('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    });
    if (!response.ok) {
      throw new Error(`Anthropic API responded ${response.status}`);
    }
  });
}

Deno.serve(withObservability('health', async (req, { log, correlationId }) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const [database, storage, anthropic] = await Promise.all([
    checkDatabase(supabaseAdmin),
    checkStorage(supabaseAdmin),
    checkAnthropic(),
  ]);

  const checks = { database, storage, anthropic };
  const anyDown = Object.values(checks).some((check) => check.status === 'down');
  const overallStatus = anyDown ? 'down' : 'ok';

  if (anyDown) {
    log.error('health_check_failed', {
      database: database.status,
      storage: storage.status,
      anthropic: anthropic.status,
    });
  }

  return new Response(
    JSON.stringify({
      status: overallStatus,
      checks,
      release: Deno.env.get('SENTRY_RELEASE') ?? null,
      timestamp: new Date().toISOString(),
    }),
    {
      status: anyDown ? 503 : 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Correlation-Id': correlationId },
    },
  );
}));
