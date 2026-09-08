# Runbook

Operational procedures for the incidents most likely to actually happen.
Each section assumes you're linked to the right project
(`supabase link --project-ref <ref>` — see `docs/deployment.md`) before
running any SQL or CLI command, and that you've checked `/health` first
(see `docs/uptime-monitoring.md`) to rule out a broader outage before
chasing a narrower cause.

## A stuck classification queue

**Symptom:** documents sit at "needs review" indefinitely, or new uploads
never get classified at all.

**Diagnose:**

```sql
select status, count(*) from classification_jobs group by status;
```

A large `pending` count with `next_attempt_at` in the past means the
2-minute cron sweep (`classify-document`, triggered on both a
`classification_jobs` insert and a scheduled sweep — see
`0025_classification_pipeline.sql`) isn't keeping up or isn't running.
Check it actually is:

```sql
select * from cron.job_run_details
where jobid = (select jobid from cron.job where jobname ilike '%classif%')
order by start_time desc limit 20;
```

Check `/health`'s `anthropic` check — `down` here (wrong/expired key,
Anthropic outage, or rate limiting) is the most common root cause, since
every job fails the same way until it's fixed. Also check individual
`dead_letter` jobs' `last_error` for a pattern:

```sql
select id, document_id, attempts, last_error
from classification_jobs
where status = 'dead_letter'
order by processed_at desc limit 20;
```

**Fix:**

- If it's the Anthropic key: see "Rotating the Anthropic key" below, then
  confirm `/health` reports `anthropic: ok`.
- Once the root cause is fixed, requeue affected jobs — deliberately by
  id after reviewing `last_error`, not a blanket requeue (a `dead_letter`
  job might be dead-lettered because the file itself is bad, which
  re-queuing won't fix):

  ```sql
  update classification_jobs
  set status = 'pending', attempts = 0, next_attempt_at = now()
  where id in ('...', '...');
  ```

- The sweep processes at most 20 jobs per invocation
  (`SWEEP_BATCH_LIMIT` in `classify-document/index.ts`). A large backlog
  clears over several 2-minute ticks on its own once requeued — no need
  to manually loop invocations unless it's urgent, in which case POST to
  `.../functions/v1/classify-document` with the service-role key and an
  empty body to force one sweep immediately.

## Reminder double-sends

**Symptom:** a client (or the firm) reports the same reminder landing
twice, or `messages` shows more than one send to the same recipient for
the same request close together.

**Diagnose:**

```sql
select recipient, template, request_id, count(*)
from messages
where created_at > now() - interval '2 days'
group by recipient, template, request_id, date_trunc('hour', created_at)
having count(*) > 1;
```

Then look at the `reminders` rows behind it:

```sql
select id, type, audience, status, scheduled_for, sent_at, attempts
from reminders
where request_id = '<request_id>'
order by scheduled_for;
```

Two likely causes, and they look different in this query:

1. **A manual send collided with an automated one.** A "Send Reminder"
   click is supposed to call `push_back_pending_reminders`, which shifts
   every remaining pending reminder for that request later so an
   automated one can't land right after it (see `request-notify`'s
   `isReminder` branch). If you see a manual `type = 'manual'` reminder
   and an automated one both `sent` within hours of each other, check
   whether `push_back_pending_reminders` actually ran and had any pending
   rows to push — if the automated reminder's row had *already* been
   claimed (`status = 'processing'`) by `process-reminders` in the same
   window, the push-back arrives too late to stop it. This is a real
   timing race, not user error — worth a product fix if it recurs rather
   than a one-off runbook patch.
2. **Two `reminders` rows exist for the same (request, type).** This
   shouldn't happen — `materialize_reminder_ladder` is meant to be called
   once per request — but if it is, one of them is a duplicate:

   ```sql
   select request_id, type, count(*)
   from reminders
   where request_id = '<request_id>'
   group by request_id, type
   having count(*) > 1;
   ```

   If found, cancel the extra pending one before it also sends:
   `update reminders set status = 'skipped', reason = 'duplicate' where id = '<extra_id>';`

**Immediate mitigation** while investigating: pause the affected
request's reminders from its detail page (`set_reminders_paused`), so
nothing else goes out while you work out what happened. Apologize to the
client if the duplicate reminder already landed and was visibly
confusing — a firm's relationship with their client is the actual thing
at stake here, not just the log entry.

## A client reports a broken upload link

**Diagnose** — find the request from the firm's side, then check its
tokens:

```sql
select id, expires_at, revoked_at, created_at
from request_tokens
where request_id = '<request_id>'
order by created_at desc;
```

The most common cause by far: the request finished (`complete` or
`cancelled`) and `revoke_tokens_for_finished_requests` (the daily sweep,
`0022_client_portal.sql`) revoked its tokens — check the request's
current `status`. The second most common: the token's own 30-day expiry
(measured from the request's deadline) simply passed.

**Fix — the normal case:** from the request detail page, click "Resend
Link" (or "Send Reminder", which does the same token-minting under the
hood). This mints a brand-new token and emails or copies it — no old
token needs to be found or repaired, and this doesn't touch any
previously-issued link (multiple live tokens per request is fine by
design; see `request-notify`'s header comment).

**Fix — the request is already finished but the client still needs
access** (e.g. to review what they submitted): there's no built-in
"reactivate" action, since a finished request's tokens are revoked
deliberately. Treat this as an exception: mint a token by hand only if
there's a real need, and be clear internally that this is outside the
normal flow, not a routine support action.

## Restoring an accidentally deleted document

Documents are soft-deleted first — `deleted_at` set, the Storage object
moved to a `deleted/` prefix — with the actual file bytes hard-deleted 90
days later by the `cleanup-deleted-documents` sweep. Anything soft-deleted
within the last 90 days is fully recoverable; **past 90 days, the file
content is gone** — Postgres point-in-time recovery does not cover
Storage object bytes, only database rows, so a PITR restore recovers the
metadata row (which never had a gap — the row survives deletion by
design) but not a hard-deleted file.

**Find the document:**

```sql
select id, storage_path, deleted_at, original_filename
from documents
where request_id = '<request_id>' and deleted_at is not null
order by deleted_at desc;
```

(If you don't have the request id, `activity_log`'s `document_removed`
entries carry the filename in `payload` and can help locate it.)

**Restore, if `deleted_at` is within 90 days:**

1. Move the Storage object back (via the Studio Storage browser, or a
   one-off script with the service-role key):
   `storage.from('client-documents').move('deleted/<path>', '<original path>')`
   — the original path is the current `storage_path` value with its
   `deleted/` prefix stripped.
2. Un-delete the row and point it back at the restored path:
   ```sql
   update documents
   set deleted_at = null, storage_path = '<original path>'
   where id = '<document_id>';
   ```
   This alone is enough to bring the checklist item's status back in
   sync — `trigger_documents_status_change` (`0028_request_status_engine.sql`)
   fires on updates to `documents.deleted_at`, so `required_documents` and
   the request's completion percentage recompute automatically.
3. There is no canonical `document_restored` activity event in the
   closed vocabulary (`activity_log_event_type_check` — see
   `src/lib/activity.ts` for the full list), so this action won't appear
   in the client-facing activity feed on its own. Tell the affected
   accountant directly rather than relying on the feed to surface it —
   and if restores become routine rather than exceptional, that's worth a
   small migration adding the event type, not a permanent gap.

## Rotating the Anthropic key

1. Create a new key in the [Anthropic Console](https://console.anthropic.com/settings/keys) — **don't revoke the old one yet.**
2. Set it on the project (per environment — this does not need a redeploy; every Edge Function reads `ANTHROPIC_API_KEY` fresh from the environment on each invocation, not at deploy time):
   ```bash
   supabase link --project-ref <staging-or-production-ref>
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   ```
3. Confirm it works: `GET .../functions/v1/health` and check `checks.anthropic.status` is `"ok"`.
4. Watch Sentry / the `classify-document` function logs for a few minutes to confirm real classification jobs are succeeding, not just the lightweight health check.
5. Once confident (a reasonable bar: 24 hours with no auth-related errors), revoke the old key in the Anthropic Console.
6. **If something breaks right after rotation:** set `ANTHROPIC_API_KEY` back to the old value with the same `supabase secrets set` command — instant, no deploy, no rollback procedure needed beyond that, since the old key is still valid until you complete step 5.

Do the same for `RESEND_API_KEY` when that needs rotating — identical
procedure, different secret name, and `EMAIL_FROM`/`RESEND_WEBHOOK_SECRET`
are unaffected by an API key rotation so don't need to change alongside
it.
