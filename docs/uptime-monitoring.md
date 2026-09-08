# Uptime monitoring

`supabase/functions/health` (public, no auth — see `supabase/config.toml`)
checks the three things that fail independently of each other and would
otherwise only surface as a confusing downstream symptom: the database,
Storage, and the Anthropic API classification depends on.

```
GET https://<project-ref>.supabase.co/functions/v1/health
```

Response, `200` when everything is healthy, `503` when anything is down:

```json
{
  "status": "ok",
  "checks": {
    "database": { "status": "ok", "latencyMs": 42 },
    "storage": { "status": "ok", "latencyMs": 58 },
    "anthropic": { "status": "ok", "latencyMs": 210 }
  },
  "release": "a1b2c3d",
  "timestamp": "2026-09-06T12:00:00.000Z"
}
```

A check's `status` is `ok`, `down` (with a `message` explaining why), or
`not_configured` (only for `anthropic`, if `ANTHROPIC_API_KEY` isn't set in
that environment — distinguished from `down` since it's a setup gap, not
an outage). The Anthropic check hits `GET /v1/models`, a metadata endpoint
with no generation cost — it exercises both network reachability and key
validity (an invalid key comes back 401, which this reports as `down` with
that in the message) without spending tokens on every poll.

## Setting up the monitor

Point any HTTP monitor at the URL above, on both staging and production.
Two ready-to-use configs:

**UptimeRobot** (Dashboard → Add New Monitor):

- Monitor Type: HTTP(s)
- URL: the `/functions/v1/health` URL above
- Monitoring Interval: 5 minutes
- Advanced → Keyword Monitoring: search for `"status":"ok"`, alert on
  keyword **not** existing — this alerts on a `503` (any check down) even
  though a `503` itself is still a valid HTTP response, which plain
  status-code monitoring would miss.

**Checkly** (as code, if the team prefers monitors living in the repo
rather than a dashboard):

```typescript
import { ApiCheck, AssertionBuilder } from 'checkly/constructs';

new ApiCheck('financeflow-health-production', {
  name: 'FinanceFlow health (production)',
  frequency: 5,
  request: {
    method: 'GET',
    url: 'https://<production-project-ref>.supabase.co/functions/v1/health',
    assertions: [
      AssertionBuilder.statusCode().equals(200),
      AssertionBuilder.jsonBody('$.status').equals('ok'),
    ],
  },
});
```

## Alerting

Route alerts to wherever the team actually looks first — a Slack/Teams
channel for a fast page, email as the fallback. Alert on:

- Two consecutive failed checks (avoids paging on a single transient
  network blip between the monitor and Supabase's edge network).
- `status: "down"` for `database` or `storage` specifically — either is a
  real incident, start with `docs/runbook.md`.
- `status: "down"` for `anthropic` — classification stops working but
  nothing else does; still worth knowing quickly since the queue backs up
  silently otherwise (see the runbook's "stuck classification queue"
  section).

This monitor is deliberately separate from Sentry: Sentry tells you an
error happened inside a request; this tells you the service is reachable
at all, including from outside Supabase's own network — the two catch
different failure modes and neither substitutes for the other.
