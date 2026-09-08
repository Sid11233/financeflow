// Pure-logic unit tests — no DB, no network. Run with:
//   deno test --node-modules-dir=none supabase/functions/_shared/reminderBatching.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  accountantFacing,
  clientFacing,
  clientTemplateForType,
  groupByClient,
  recheckRequestForReminder,
} from './reminderBatching.ts';
import type { ClaimedReminder } from './reminderBatching.ts';

function reminder(overrides: Partial<ClaimedReminder>): ClaimedReminder {
  return {
    id: crypto.randomUUID(),
    requestId: crypto.randomUUID(),
    clientId: 'client-1',
    audience: 'client',
    type: 'nudge',
    ...overrides,
  };
}

Deno.test('groupByClient — single reminder per client stays its own group of one', () => {
  const reminders = [reminder({ clientId: 'a' }), reminder({ clientId: 'b' })];
  const groups = groupByClient(reminders);
  assertEquals(groups.length, 2);
  assertEquals(groups[0].members.length, 1);
  assertEquals(groups[1].members.length, 1);
});

Deno.test('groupByClient — multiple due reminders for the same client are combined into one group (the daily-cap batching case)', () => {
  const reminders = [
    reminder({ clientId: 'a', requestId: 'req-1' }),
    reminder({ clientId: 'a', requestId: 'req-2' }),
    reminder({ clientId: 'b', requestId: 'req-3' }),
  ];
  const groups = groupByClient(reminders);
  assertEquals(groups.length, 2);
  const groupA = groups.find((g) => g.clientId === 'a')!;
  assertEquals(groupA.members.length, 2);
  assertEquals(
    groupA.members.map((m) => m.requestId).sort(),
    ['req-1', 'req-2'],
  );
});

Deno.test('groupByClient — preserves first-seen order of clients (stable batch ordering)', () => {
  const reminders = [reminder({ clientId: 'z' }), reminder({ clientId: 'a' }), reminder({ clientId: 'z' })];
  const groups = groupByClient(reminders);
  assertEquals(
    groups.map((g) => g.clientId),
    ['z', 'a'],
  );
});

Deno.test('clientFacing — includes audience client and both, excludes accountant-only', () => {
  const reminders = [
    reminder({ audience: 'client' }),
    reminder({ audience: 'accountant' }),
    reminder({ audience: 'both' }),
  ];
  const result = clientFacing(reminders);
  assertEquals(result.length, 2);
  assertEquals(
    result.map((r) => r.audience).sort(),
    ['both', 'client'],
  );
});

Deno.test('accountantFacing — includes audience accountant and both, excludes client-only', () => {
  const reminders = [
    reminder({ audience: 'client' }),
    reminder({ audience: 'accountant' }),
    reminder({ audience: 'both' }),
  ];
  const result = accountantFacing(reminders);
  assertEquals(result.length, 2);
  assertEquals(
    result.map((r) => r.audience).sort(),
    ['accountant', 'both'],
  );
});

Deno.test('accountantFacing / clientFacing — a "both" reminder appears in both lists (two independent halves of one row)', () => {
  const both = reminder({ audience: 'both' });
  assertEquals(clientFacing([both]).length, 1);
  assertEquals(accountantFacing([both]).length, 1);
  assertEquals(clientFacing([both])[0].id, accountantFacing([both])[0].id);
});

Deno.test('clientTemplateForType — maps every ladder type to a template, with sensible fallbacks', () => {
  assertEquals(clientTemplateForType('initial'), 'request_initial');
  assertEquals(clientTemplateForType('nudge'), 'reminder_nudge');
  assertEquals(clientTemplateForType('firm'), 'reminder_firm');
  assertEquals(clientTemplateForType('overdue'), 'reminder_firm');
  assertEquals(clientTemplateForType('escalation'), 'reminder_final');
  // Unknown/future type: falls back rather than throwing, since a bad
  // template name should be discovered at send-email's own validation,
  // not by crashing the batching step for every other reminder in the run.
  assertEquals(clientTemplateForType('made_up_type'), 'reminder_firm');
});

// "No send after completion" lives here: process-reminders never sends a
// reminder for a request this function says to 'skip' — see phase 1 of
// process-reminders/index.ts, which calls this directly.
Deno.test('recheckRequestForReminder — a completed request permanently skips the reminder', () => {
  const outcome = recheckRequestForReminder({ status: 'complete', remindersPausedAt: null });
  assertEquals(outcome, { action: 'skip', reason: 'request_complete' });
});

Deno.test('recheckRequestForReminder — a cancelled request permanently skips the reminder', () => {
  const outcome = recheckRequestForReminder({ status: 'cancelled', remindersPausedAt: null });
  assertEquals(outcome, { action: 'skip', reason: 'request_cancelled' });
});

Deno.test('recheckRequestForReminder — a paused request defers rather than skips (resumable once unpaused)', () => {
  const outcome = recheckRequestForReminder({ status: 'partial', remindersPausedAt: '2026-01-01T00:00:00Z' });
  assertEquals(outcome, { action: 'defer' });
});

Deno.test('recheckRequestForReminder — completion takes priority even if also paused', () => {
  const outcome = recheckRequestForReminder({ status: 'complete', remindersPausedAt: '2026-01-01T00:00:00Z' });
  assertEquals(outcome, { action: 'skip', reason: 'request_complete' });
});

Deno.test('recheckRequestForReminder — an active, unpaused request proceeds', () => {
  const outcome = recheckRequestForReminder({ status: 'partial', remindersPausedAt: null });
  assertEquals(outcome, { action: 'proceed' });
});
