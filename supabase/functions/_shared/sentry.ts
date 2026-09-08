// Central Sentry wiring for every Edge Function — initialized once per
// function (Deno keeps an isolate warm across invocations, so this really
// does only run once per cold start, not once per request), with the
// request-level work (correlation id, structured log, unhandled-exception
// capture) done by withObservability() below.
//
// Sentry is optional in local/dev: SENTRY_DSN is unset there, and init()
// silently no-ops without it — nothing here should ever throw just
// because a project hasn't set the secret yet.
import * as Sentry from 'npm:@sentry/deno@8';
import { createLogger, getCorrelationId } from './log.ts';
import type { Logger } from './log.ts';

// deno-lint-ignore no-explicit-any
type SentryEvent = any;

let initializedFor: string | null = null;

// Keys whose *value* is dropped outright regardless of what it contains —
// this is the same boundary log lines are held to (see log.ts): a client's
// email address and a document's original filename must never leave this
// app toward a third party. Matched case-insensitively against the last
// path segment of any nested key.
const SCRUBBED_KEYS = new Set([
  'email',
  'recipient',
  'to',
  'client_email',
  'contact_email',
  'filename',
  'original_filename',
  'storage_path',
]);

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Exported for the rare case a function logs a raw upstream error body
// (e.g. send-email logging Resend's response text) that could otherwise
// carry a recipient address straight through — plain console.log lines
// don't pass through scrubEvent() below the way a Sentry event does, so
// call sites that pass through third-party text apply this themselves.
export function redactEmails(text: string): string {
  return text.replace(EMAIL_PATTERN, '[redacted-email]');
}

function scrubValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(EMAIL_PATTERN, '[redacted-email]');
  }
  if (Array.isArray(value)) {
    return value.map(scrubValue);
  }
  if (value && typeof value === 'object') {
    return scrubObject(value as Record<string, unknown>);
  }
  return value;
}

function scrubObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SCRUBBED_KEYS.has(key.toLowerCase())) {
      result[key] = '[redacted]';
      continue;
    }
    result[key] = scrubValue(value);
  }
  return result;
}

// Applied to every event before it leaves the process — request body,
// extra context, breadcrumbs, and the exception message/value itself all
// pass through the same scrub, since a document filename or client email
// can just as easily end up in a thrown Error's message as in a
// structured field.
function scrubEvent(event: SentryEvent): SentryEvent {
  if (event.request?.data) {
    event.request.data = scrubValue(event.request.data);
  }
  // Query strings and cookies can carry the same PII as a body.
  if (event.request?.query_string) {
    event.request.query_string = scrubValue(event.request.query_string);
  }
  delete event.request?.cookies;

  if (event.extra) {
    event.extra = scrubObject(event.extra);
  }
  if (event.contexts) {
    event.contexts = scrubObject(event.contexts) as typeof event.contexts;
  }
  if (Array.isArray(event.breadcrumbs)) {
    event.breadcrumbs = event.breadcrumbs.map((crumb: SentryEvent) => ({
      ...crumb,
      message: typeof crumb.message === 'string' ? (scrubValue(crumb.message) as string) : crumb.message,
      data: crumb.data ? scrubObject(crumb.data) : crumb.data,
    }));
  }
  for (const exception of event.exception?.values ?? []) {
    if (typeof exception.value === 'string') {
      exception.value = scrubValue(exception.value);
    }
  }
  if (typeof event.message === 'string') {
    event.message = scrubValue(event.message) as string;
  }

  return event;
}

function initSentry(functionName: string): void {
  if (initializedFor === functionName) return;
  initializedFor = functionName;

  const dsn = Deno.env.get('SENTRY_DSN');
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: Deno.env.get('SENTRY_ENVIRONMENT') ?? 'production',
    // Set by the deploy step to the release git SHA (see
    // .github/workflows/deploy-staging.yml / deploy-production.yml) — ties
    // an error straight back to the commit that shipped it.
    release: Deno.env.get('SENTRY_RELEASE') ?? undefined,
    serverName: functionName,
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
    beforeBreadcrumb: (breadcrumb) => {
      if (breadcrumb.data) breadcrumb.data = scrubObject(breadcrumb.data);
      return breadcrumb;
    },
  });
}

// Wraps a Deno.serve handler with: Sentry init, a correlation id resolved
// from the request (or generated), a structured logger bound to it, an
// X-Correlation-Id response header, and unhandled-exception capture (both
// to Sentry and as a final structured log line) instead of an unhandled
// rejection crashing the isolate with no record of what happened.
//
// Business logic is unchanged by this — it still returns whatever
// Response it wants on the happy path. This only adds a safety net around
// it and the observability plumbing every function needs anyway.
export function withObservability(
  functionName: string,
  handler: (req: Request, ctx: { log: Logger; correlationId: string }) => Promise<Response>,
): (req: Request) => Promise<Response> {
  initSentry(functionName);

  return async (req: Request): Promise<Response> => {
    const correlationId = getCorrelationId(req);
    const log = createLogger(correlationId, functionName);

    try {
      const response = await handler(req, { log, correlationId });
      response.headers.set('X-Correlation-Id', correlationId);
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error('unhandled_exception', { message });
      Sentry.captureException(error, { tags: { correlationId, function: functionName } });
      return new Response(JSON.stringify({ error: 'Internal error.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'X-Correlation-Id': correlationId },
      });
    }
  };
}
