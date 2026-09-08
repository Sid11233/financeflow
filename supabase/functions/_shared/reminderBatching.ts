// Pure grouping logic for process-reminders, kept dependency-free (no
// Supabase client, no network) so it can be unit-tested directly with
// `deno test` — see reminderBatching.test.ts. Everything DB-dependent
// (the daily-cap check itself, re-checking request status, sending) lives
// in process-reminders/index.ts and client_has_reminder_today (0036),
// which are exercised by the pgTAP suite instead.

export type RecheckAction =
  | { action: 'proceed' }
  | { action: 'skip'; reason: 'request_complete' | 'request_cancelled' }
  | { action: 'defer' };

// The re-check every claimed reminder goes through before it's allowed to
// send: a completed or cancelled request makes the rung permanently moot
// ('skip' — this is what guarantees "no send after completion"); a paused
// request just isn't ready yet ('defer' — reverts to 'pending' so a later
// run picks it up once unpaused, rather than losing the rung).
export function recheckRequestForReminder(request: {
  status: string;
  remindersPausedAt: string | null;
}): RecheckAction {
  if (request.status === 'complete') return { action: 'skip', reason: 'request_complete' };
  if (request.status === 'cancelled') return { action: 'skip', reason: 'request_cancelled' };
  if (request.remindersPausedAt) return { action: 'defer' };
  return { action: 'proceed' };
}

export interface ClaimedReminder {
  id: string;
  requestId: string;
  clientId: string;
  audience: 'client' | 'accountant' | 'both';
  type: string;
}

export interface ClientGroup {
  clientId: string;
  members: ClaimedReminder[];
}

// Reminders whose client-facing half needs sending: audience 'client' or
// 'both'. A 'both' reminder appears here AND in accountantFacing() below —
// the two halves are independent sends tracked against the same row.
export function clientFacing(reminders: ClaimedReminder[]): ClaimedReminder[] {
  return reminders.filter((reminder) => reminder.audience === 'client' || reminder.audience === 'both');
}

export function accountantFacing(reminders: ClaimedReminder[]): ClaimedReminder[] {
  return reminders.filter((reminder) => reminder.audience === 'accountant' || reminder.audience === 'both');
}

// Groups client-facing reminders by client so multiple due requests for
// the same client (in the same run) become one combined email instead of
// one per request — the mechanism that makes the daily cap meaningful
// rather than just a same-request de-dupe.
export function groupByClient(reminders: ClaimedReminder[]): ClientGroup[] {
  const order: string[] = [];
  const groups = new Map<string, ClaimedReminder[]>();

  for (const reminder of reminders) {
    if (!groups.has(reminder.clientId)) {
      groups.set(reminder.clientId, []);
      order.push(reminder.clientId);
    }
    groups.get(reminder.clientId)!.push(reminder);
  }

  return order.map((clientId) => ({ clientId, members: groups.get(clientId)! }));
}

// Client-side ladder type -> which send-email template represents it. All
// three share the same variable shape (see reminderNudge.tsx); 'overdue'
// falls back to the 'firm' framing since it has no client-facing template
// of its own (its default audience is 'accountant').
export function clientTemplateForType(type: string): string {
  switch (type) {
    case 'initial':
      return 'request_initial';
    case 'nudge':
      return 'reminder_nudge';
    case 'escalation':
      return 'reminder_final';
    case 'firm':
    case 'overdue':
    default:
      return 'reminder_firm';
  }
}
