# Security

FinanceFlow handles client financial documents on behalf of accounting
firms. This file covers how to report a security issue and summarizes how
the app is built to protect that data. For the full detail on what's
stored, where, for how long, and who can see it, see
[`docs/data-handling.md`](docs/data-handling.md).

## Reporting a vulnerability

If you find a security issue, please report it privately rather than
opening a public GitHub issue — a public report on a live vulnerability
gives attackers a head start before it's fixed.

Email **security@financeflow.app** with what you found, how to reproduce
it, and its potential impact. We aim to acknowledge within 2 business
days and to have a fix or mitigation in place within 30 days for a
confirmed issue, sooner for anything actively exploitable. We'll credit
reporters who want credit once a fix has shipped.

Please don't:

- Access, modify, or exfiltrate another customer's data to prove a
  finding — describe the vulnerability instead of demonstrating it
  against real client documents.
- Run automated scanners against production without checking with us
  first — we'd rather coordinate than have a scan mistaken for an attack.

## How the app is built

**Tenant isolation.** Every table is scoped to an organization via Postgres
Row Level Security — a query can only ever see rows in the caller's own
organization, enforced at the database layer, not in application code.
There is no code path that assembles a cross-tenant query.

**Authentication.** Supabase Auth (email/password), team invites via
signed, single-use tokens rather than shared passwords, session tokens
that rotate on refresh, and a 12-hour idle / 30-day absolute session
limit (see `supabase/config.toml`).

**The client upload portal is unauthenticated by design** — a client
uploading documents never creates an account. Access instead comes from a
long, random, single-purpose token (never the raw value, only its SHA-256
hash, stored in `request_tokens`) sent by the client's own accountant.
Every portal endpoint is rate-limited per IP and per token.

**Encryption.** TLS in transit everywhere (the app, the API, Supabase's
own infrastructure). At rest, both the database and Storage (where
uploaded documents live) are encrypted using Supabase's underlying AES-256
disk encryption.

**Uploaded files are validated by content, not just by name.** A file's
actual bytes are checked against its claimed type (magic-byte
verification) before anything downstream treats it as real — a renamed
executable claiming to be a PDF is rejected, not classified.

**Least privilege.** The database's service-role key (which bypasses RLS
entirely) is used only by trusted server-side Edge Functions with no end
user to scope a request to — a scheduled sweep, a webhook, an admin
operation like creating an account. Every user-facing action runs under
that user's own session and RLS.

**Dependencies and secrets.** Third-party API keys (Anthropic, Resend)
live only in Supabase's server-side secrets store, never in code or in
anything shipped to the browser. See `docs/runbook.md` for the key
rotation procedure. Dependency vulnerabilities are tracked via `npm
audit` and Dependabot-style alerts; see `docs/deployment.md`'s "known
gaps" section for what's currently outstanding and why.

**Monitoring.** Sentry captures application errors from both the frontend
and every Edge Function, with a PII scrubber (see
`supabase/functions/_shared/sentry.ts` and `src/lib/sentry.ts`) that
strips client email addresses and document filenames before an event ever
leaves the process — an error report can tell us something broke without
telling us whose document it was. An external uptime monitor independently
checks database, storage, and Anthropic reachability every 5 minutes (see
`docs/uptime-monitoring.md`).

**Deletion on request.** A client or firm can request their data be
deleted; see `docs/data-handling.md` for what that covers and the
timeline.
