// Run hourly by pg_cron (see 0040). For each organization, checks whether
// "now" is that organization's configured send hour (reminder_schedules —
// the same per-org timezone/send_hour knob the reminder ladder uses,
// rather than adding a second one); if so, sends the accountant_digest
// email to every member whose digest_frequency calls for one today,
// scoped to the requests they own (created_by), same targeting as every
// other accountant-facing email in this app.
//
// Idempotency is a plain date comparison against profiles.last_digest_sent_at
// in the organization's local timezone, not a claim/lock — this only ever
// runs from one cron schedule, and re-sending on a genuine overlap is a
// rare, low-stakes duplicate, not a correctness bug worth a claim table for.
//
// Called with the Vault-stored service-role key, same pattern as
// process-reminders (see config.toml for verify_jwt = false).
import { createClient } from 'npm:@supabase/supabase-js@2';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, jsonError, jsonResponse } from '../_shared/cors.ts';
import type { Logger } from '../_shared/log.ts';
import { signUnsubscribeToken } from '../_shared/unsubscribeToken.ts';
import { withObservability } from '../_shared/sentry.ts';

const OPEN_STATUSES = ['overdue', 'sent', 'partial'];

interface OrgSchedule {
  organization_id: string;
  send_hour: number;
  timezone: string;
}

interface Profile {
  id: string;
  digest_frequency: string;
  last_digest_sent_at: string | null;
}

interface OpenRequest {
  id: string;
  client_id: string;
  period_label: string;
  deadline: string | null;
  status: string;
}

function localHour(date: Date, timeZone: string): number {
  const formatted = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hour12: false }).format(date);
  const hour = Number(formatted);
  return hour === 24 ? 0 : hour;
}

// en-CA formats as YYYY-MM-DD, which is exactly what's needed for a
// same-day comparison independent of time-of-day.
function localDateKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    date,
  );
}

function isLocalMonday(date: Date, timeZone: string): boolean {
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date) === 'Mon';
}

Deno.serve(withObservability('send-digests', async (req, { log, correlationId: requestId }) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization') ?? '';
  const providedKey = authHeader.replace(/^Bearer\s+/i, '');
  if (providedKey !== Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
    return jsonError('Unauthorized.', 401, requestId);
  }

  const appOrigin = Deno.env.get('APP_ORIGIN');
  const unsubscribeSecret = Deno.env.get('UNSUBSCRIBE_SECRET');
  if (!appOrigin || !unsubscribeSecret) {
    log.error('config_missing', { appOrigin: Boolean(appOrigin), unsubscribeSecret: Boolean(unsubscribeSecret) });
    return jsonError('APP_ORIGIN and UNSUBSCRIBE_SECRET must be configured.', 500, requestId);
  }

  const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const now = new Date();

  const { data: schedules, error: schedulesError } = await supabaseAdmin
    .from('reminder_schedules')
    .select('organization_id, send_hour, timezone');

  if (schedulesError) {
    log.error('schedules_query_failed', { message: schedulesError.message });
    return jsonError('Could not load organization schedules.', 500, requestId);
  }

  const dueOrgs = (schedules ?? []).filter((s: OrgSchedule) => localHour(now, s.timezone) === s.send_hour);

  let sent = 0;
  let skipped = 0;

  for (const org of dueOrgs as OrgSchedule[]) {
    const todayKey = localDateKey(now, org.timezone);
    const isWeeklyDay = isLocalMonday(now, org.timezone);

    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('id, digest_frequency, last_digest_sent_at')
      .eq('organization_id', org.organization_id)
      .neq('digest_frequency', 'off');

    if (profilesError) {
      log.error('profiles_query_failed', { organizationId: org.organization_id, message: profilesError.message });
      continue;
    }

    for (const profile of (profiles ?? []) as Profile[]) {
      const lastSentKey = profile.last_digest_sent_at ? localDateKey(new Date(profile.last_digest_sent_at), org.timezone) : null;
      if (lastSentKey === todayKey) {
        skipped += 1;
        continue;
      }
      if (profile.digest_frequency === 'weekly' && !isWeeklyDay) {
        skipped += 1;
        continue;
      }

      try {
        const wasSent = await sendDigestToProfile(supabaseAdmin, {
          organizationId: org.organization_id,
          profile,
          cadence: profile.digest_frequency as 'daily' | 'weekly',
          appOrigin,
          unsubscribeSecret,
          log,
        });
        if (wasSent) {
          sent += 1;
        } else {
          skipped += 1;
        }
      } catch (error) {
        log.error('digest_send_failed', {
          organizationId: org.organization_id,
          profileId: profile.id,
          message: error instanceof Error ? error.message : 'unknown',
        });
      }
    }
  }

  log.info('sweep_complete', { orgsChecked: (schedules ?? []).length, orgsDue: dueOrgs.length, sent, skipped });
  return jsonResponse({ sent, skipped }, 200, { 'X-Request-Id': requestId });
}));

async function sendDigestToProfile(
  supabaseAdmin: SupabaseClient,
  params: {
    organizationId: string;
    profile: Profile;
    cadence: 'daily' | 'weekly';
    appOrigin: string;
    unsubscribeSecret: string;
    log: Logger;
  },
): Promise<boolean> {
  const { organizationId, profile, cadence, appOrigin, unsubscribeSecret, log } = params;

  const { data: creator, error: creatorError } = await supabaseAdmin.auth.admin.getUserById(profile.id);
  if (creatorError || !creator?.user?.email) {
    log.warn('profile_email_unavailable', { profileId: profile.id, message: creatorError?.message });
    return false;
  }

  const { data: requests } = await supabaseAdmin
    .from('requests')
    .select('id, client_id, period_label, deadline, status')
    .eq('organization_id', organizationId)
    .eq('created_by', profile.id)
    .in('status', OPEN_STATUSES)
    .order('deadline', { ascending: true, nullsFirst: false });

  const openRequests = (requests ?? []) as OpenRequest[];
  const clientIds = [...new Set(openRequests.map((r) => r.client_id))];

  const { data: clients } = clientIds.length
    ? await supabaseAdmin.from('clients').select('id, name').in('id', clientIds)
    : { data: [] };
  const clientNamesById = new Map((clients ?? []).map((c: { id: string; name: string }) => [c.id, c.name]));

  function toSummary(r: OpenRequest) {
    return {
      clientName: clientNamesById.get(r.client_id) ?? 'A client',
      periodLabel: r.period_label,
      deadline: r.deadline ?? '',
      requestUrl: `${appOrigin}/requests/${r.id}`,
    };
  }

  const overdue = openRequests.filter((r) => r.status === 'overdue').map(toSummary);
  const waiting = openRequests.filter((r) => r.status !== 'overdue').map(toSummary);

  const unsubscribeToken = await signUnsubscribeToken(profile.id, unsubscribeSecret);

  const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      template: 'accountant_digest',
      to: creator.user.email,
      organizationId,
      variables: {
        cadence,
        overdue,
        waiting,
        dashboardUrl: `${appOrigin}/dashboard`,
        // Points at the frontend's /unsubscribe page, not the Edge
        // Function directly — see digest-unsubscribe's own comment for
        // why (the function only returns JSON; the page renders it).
        unsubscribeUrl: `${appOrigin}/unsubscribe?token=${unsubscribeToken}`,
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`send-email ${response.status}: ${text}`);
  }

  await supabaseAdmin.from('profiles').update({ last_digest_sent_at: new Date().toISOString() }).eq('id', profile.id);
  return true;
}
