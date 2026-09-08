# Deployment & environments

FinanceFlow runs in three environments — local, staging, production — each
a separate Supabase project plus a separate Vercel target. Nothing is
shared between them: staging never reads production data, and local never
touches either.

## Local

Requirements: Node 20, Docker Desktop (the Supabase CLI's local stack runs
Postgres/Auth/Storage/Realtime/Studio as containers), the Supabase CLI.

```bash
git clone <repo-url> && cd financeflow
npm install

cp .env.example .env
# .env's VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY get filled in from the
# values `supabase start` prints below — it mints a fresh local anon key
# every time the local stack is (re)created.

npx supabase start      # first run pulls containers; takes a few minutes
npx supabase db reset    # applies every migration in supabase/migrations/, then supabase/seed.sql

npm run dev
```

`supabase start` prints a local API URL and anon key — put those in
`.env`. Studio (a local Supabase Dashboard) is at the URL it also prints,
normally `http://127.0.0.1:54323`.

Edge Functions need their own secrets locally, read from
`supabase/functions/.env` (gitignored — never commit this file):

```bash
cat > supabase/functions/.env <<'EOF'
ANTHROPIC_API_KEY=sk-ant-...
RESEND_API_KEY=re_...
EMAIL_FROM=notifications@mail.financeflow.app
APP_ORIGIN=http://localhost:5173
UNSUBSCRIBE_SECRET=$(openssl rand -hex 32)
RESEND_WEBHOOK_SECRET=whsec_...
EOF

npx supabase functions serve --env-file supabase/functions/.env
```

`SENTRY_DSN` is deliberately left unset locally — see
`supabase/functions/_shared/sentry.ts` and `src/lib/sentry.ts`, both of
which no-op without one. Local errors belong in your terminal, not in a
shared Sentry project.

To run the checks CI runs: `npm run typecheck`, `npm run lint`,
`npm run test`, `npm run build`, and (if you have Deno installed)
`deno test --node-modules-dir=none supabase/functions/_shared/*.test.ts`.

## Staging and production — one-time setup

Staging and production are each a real, separate Supabase project and a
real, separate Vercel target. Set both up the same way; substitute
"staging"/"production" throughout.

**1. Create the Supabase project.** [supabase.com/dashboard](https://supabase.com/dashboard) → New Project → name it `financeflow-staging` / `financeflow-production`, pick a region close to where the firm's clients actually are (see `docs/data-handling.md` for why region matters here). Note the project ref (in its URL / Settings → General).

**2. Link it locally once**, for the one-off manual steps below (CI links fresh on every run using its own secrets — this is just for a human at a terminal):

```bash
npx supabase login   # opens a browser; do this once per machine
npx supabase link --project-ref <project-ref>
```

**3. Auth URL configuration.** Dashboard → Authentication → URL Configuration: set Site URL to that environment's real app URL (`https://staging.financeflow.app`, `https://app.financeflow.app`) and add it to Redirect URLs. `supabase/config.toml`'s `[auth]` block only governs the local stack — this step is the hosted equivalent and is not optional; password-reset and invite links break without it.

**4. Auth SMTP.** Dashboard → Authentication → Settings → SMTP: point it at Resend's SMTP endpoint (`smtp.resend.com:587`, user `resend`, password an API key) — see the commented `[auth.email.smtp]` block in `config.toml` for the exact shape. This is Supabase Auth's own system email (password reset, email-change confirmation), a separate concern from every application email in `supabase/functions/send-email`, which uses Resend's HTTP API directly. The shared default mailer Supabase falls back to without this is fine for local dev only — its rate limit is far too low for real traffic.

**5. Edge Function secrets** (Dashboard → Edge Functions → Secrets, or `supabase secrets set KEY=value` against the linked project):

| Secret | Notes |
|---|---|
| `ANTHROPIC_API_KEY` | See `docs/runbook.md` for rotation |
| `RESEND_API_KEY` | Different key per environment — never reuse production's in staging |
| `EMAIL_FROM` | e.g. `notifications@mail.financeflow.app` |
| `APP_ORIGIN` | That environment's real frontend URL, no trailing slash |
| `UNSUBSCRIBE_SECRET` | `openssl rand -hex 32` — different per environment |
| `RESEND_WEBHOOK_SECRET` | From Resend's webhook config, pointed at `.../functions/v1/resend-webhook` |
| `SENTRY_DSN` | This environment's Sentry project DSN |
| `SENTRY_ENVIRONMENT` | `staging` or `production` |

`SENTRY_RELEASE` is not set here — CI sets it fresh on every deploy (see below). `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` need no setup; every Edge Function gets those injected automatically.

**6. Backups / point-in-time recovery.** Dashboard → Database → Backups. Production: enable PITR (Pro plan or higher), 7-day window. Staging: the default daily logical backups are enough. Full reasoning in `supabase/config.toml`'s backup comment block and in `docs/runbook.md`.

**7. Vercel project.** `npx vercel link` locally once against this repo — creates `.vercel/project.json` with the org/project IDs CI needs. In Vercel's project settings → Environment Variables, set (Preview environment for staging, Production environment for production): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (this environment's own Supabase project), `VITE_SENTRY_DSN`, `VITE_SENTRY_ENVIRONMENT`.

**8. GitHub Environment + secrets.** Repo → Settings → Environments → New environment, named exactly `staging` / `production` (the workflow files reference these names). Add as environment secrets:

| Secret | Where it comes from |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Dashboard → Account → Access Tokens (a CI-dedicated token, not a personal one shared with anything else) |
| `SUPABASE_PROJECT_REF` | This environment's project ref |
| `SUPABASE_DB_PASSWORD` | Set when the project was created; reset it from Dashboard → Database → Settings if lost |
| `VERCEL_TOKEN` | Vercel → Account Settings → Tokens |
| `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` | From `.vercel/project.json` after step 7 |
| `SENTRY_ORG` / `SENTRY_PROJECT` | Sentry project settings |
| `SENTRY_AUTH_TOKEN` | Sentry → Settings → Auth Tokens, scoped to `project:releases` |

**9. Production only — the approval gate.** On the `production` environment, add a required reviewer: Settings → Environments → production → Protection rules → Required reviewers. This is what makes `.github/workflows/deploy-production.yml` pause and wait for a human before touching anything — the workflow itself has no "are you sure" step; the gate lives entirely in this repo setting.

## How the pipeline runs

Three workflows, in `.github/workflows/`:

- **`ci.yml`** — every pull request: typecheck, lint, `npm run test` (Vitest), `deno test` (the Edge Functions' pure-logic unit tests), and a build (against placeholder env vars — it's only proving the bundle compiles). Runs as independent jobs so a failure is legible at a glance rather than one opaque red X.
- **`deploy-staging.yml`** — every push to `main` (i.e. every merged PR): applies migrations, then — only if that succeeded — deploys every Edge Function and builds+deploys the frontend to a Vercel preview, in parallel.
- **`deploy-production.yml`** — every pushed tag matching `v*`: identical shape, pointed at the production project and Vercel's production environment, gated by the required-reviewer approval from step 9 above.

**Migrations fail loudly by design.** `migrate` is its own job with nothing setting `continue-on-error`, and both `deploy-functions` and `deploy-frontend` declare `needs: [migrate]`. A failed (or, in production, not-yet-approved) migration means the app deploy jobs never start — there is no path where a broken schema ships next to app code that expects it.

**Release process:**

```bash
# staging happens automatically on merge — nothing to run by hand

# production:
git tag v1.4.0
git push origin v1.4.0
# → deploy-production.yml starts, pauses for approval, then runs
```

Use whatever tag/version scheme the team prefers; the workflow only cares that it matches `v*`.

## Rollback

This project's migrations are forward-only — there are no down-migrations
anywhere in `supabase/migrations/`. Reverting a bad change in any
environment means writing and shipping a new forward migration that undoes
it, not running one backward. If the bad migration already caused
incorrect data (not just an incorrect schema), point-in-time recovery is
the tool — see `docs/runbook.md`.

A bad Edge Function deploy is cheaper to undo: `supabase functions deploy
<name>` again from a previous commit redeploys that commit's code
immediately, no migration involved.

## Known gaps worth tracking

- `RESEND_API_KEY` needs a real, valid key in every environment before
  any email — application or Auth SMTP — will actually send; this has
  been flagged since the email layer was first built and is worth
  confirming isn't still a placeholder before relying on it.
- `npm audit` currently reports moderate/high advisories against `vite`
  (via `esbuild`'s dev-server) and `react-router`, both requiring a
  breaking major-version upgrade to clear. Neither affects a production
  build's runtime behavior (the esbuild issue is dev-server-only); tracked
  here rather than fixed blind, since upgrading react-router in particular
  is a real behavior-affecting change that deserves its own review.
