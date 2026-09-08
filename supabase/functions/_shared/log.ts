type LogMeta = Record<string, unknown>;

export interface Logger {
  info: (event: string, meta?: LogMeta) => void;
  warn: (event: string, meta?: LogMeta) => void;
  error: (event: string, meta?: LogMeta) => void;
}

// A request's correlation id is supplied by the caller when there is one
// to propagate (the frontend generates one per user action and threads it
// through every Supabase call it makes for that action; one edge function
// calling another — e.g. portal-submit's best-effort notification path —
// forwards its own), and generated fresh otherwise (cron sweeps, Resend's
// webhook, anything with no upstream id to inherit). Either way, every log
// line this request produces carries the same id end to end.
//
// x-correlation-id is the header name new callers should send;
// x-request-id is accepted too since some of this app's own responses
// already echo that name back (see jsonError in cors.ts) — accepting both
// avoids a coordinated rename across every caller at once.
export function getCorrelationId(req: Request): string {
  return req.headers.get('x-correlation-id') || req.headers.get('x-request-id') || crypto.randomUUID();
}

// Structured, one-line-per-event JSON logging. `meta` must never contain a
// plaintext token or a token_hash — pass the resolved request_tokens row id
// instead (see portalAuth.ts), which identifies *which* record something
// happened to without being usable to authenticate as that client. The
// same rule applies to anything Sentry would also reject under its own PII
// scrubbing (see _shared/sentry.ts) — a client's email or a document's
// original filename never belongs in a log line, only the row id.
export function createLogger(correlationId: string, functionName: string): Logger {
  function emit(level: 'info' | 'warn' | 'error', event: string, meta: LogMeta = {}) {
    console.log(
      JSON.stringify({
        level,
        function: functionName,
        correlationId,
        event,
        timestamp: new Date().toISOString(),
        ...meta,
      }),
    );
  }

  return {
    info: (event, meta) => emit('info', event, meta),
    warn: (event, meta) => emit('warn', event, meta),
    error: (event, meta) => emit('error', event, meta),
  };
}
