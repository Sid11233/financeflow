import * as Sentry from '@sentry/react';
import type { ErrorEvent } from '@sentry/react';

// Same PII boundary as the Edge Functions' scrubber (see
// supabase/functions/_shared/sentry.ts) — a client's email address or a
// document's original filename must never leave this app toward Sentry.
// Kept as a near-duplicate rather than a shared package because the two
// runtimes (browser vs. Deno) don't share a build step; if that changes,
// this and the edge-function version should move to one shared module.
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

function scrubValue(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(EMAIL_PATTERN, '[redacted-email]');
  if (Array.isArray(value)) return value.map(scrubValue);
  if (value && typeof value === 'object') return scrubObject(value as Record<string, unknown>);
  return value;
}

function scrubObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = SCRUBBED_KEYS.has(key.toLowerCase()) ? '[redacted]' : scrubValue(value);
  }
  return result;
}

function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request?.data) event.request.data = scrubValue(event.request.data);
  delete event.request?.cookies;
  if (event.extra) event.extra = scrubObject(event.extra);
  if (event.contexts) event.contexts = scrubObject(event.contexts) as typeof event.contexts;
  if (Array.isArray(event.breadcrumbs)) {
    event.breadcrumbs = event.breadcrumbs.map((crumb) => ({
      ...crumb,
      message: typeof crumb.message === 'string' ? (scrubValue(crumb.message) as string) : crumb.message,
      data: crumb.data ? scrubObject(crumb.data) : crumb.data,
    }));
  }
  for (const exception of event.exception?.values ?? []) {
    if (typeof exception.value === 'string') exception.value = scrubValue(exception.value) as string;
  }
  if (typeof event.message === 'string') event.message = scrubValue(event.message) as string;
  return event;
}

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return; // disabled in local dev by default — see .env.example

  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? 'production',
    // Set by CI at build time to the git SHA (see .github/workflows/) —
    // ties a browser error straight back to the deployed commit.
    release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
    beforeSend: (event: ErrorEvent) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => {
      if (breadcrumb.data) breadcrumb.data = scrubObject(breadcrumb.data);
      return breadcrumb;
    },
  });
}

export const SentryErrorBoundary = Sentry.ErrorBoundary;
