import type { Views } from '@/lib/database.types';

export type AnalyticsRequestRow = Views<'analytics_requests'>;
export type ClassificationOutcomeRow = Views<'analytics_classification_outcomes'>;
export type ReassignmentRow = Views<'analytics_reassignments'>;
export type ReviewActionRow = Views<'analytics_review_actions'>;

// A session boundary: two review actions by the same accountant more than
// this many minutes apart are treated as separate review sessions rather
// than one continuous stretch of work.
const SESSION_GAP_MINUTES = 30;

function groupBy<T, K extends string>(items: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return map;
}

// Linear-interpolation percentile — the same method Postgres's
// percentile_cont uses, reimplemented here since these metrics are
// computed client-side (see the view's own comment for why: it's simpler
// to get right once in JS than as several bespoke SQL percentile/window
// queries, and entirely fast enough at pilot data volumes).
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const index = p * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function median(values: number[]): number | null {
  return percentile(values, 0.5);
}

// ============================================================
// Cycle time: median/p90 days sent_at → completed_at, and % completed
// before deadline. groupKey lets the same function serve both the
// monthly-trend chart (keyed by sent_month) and the per-organization
// comparison table (keyed by organization_id) — the dashboard decides
// which by pre-filtering/re-keying its input, not this function.
// ============================================================
export interface CycleTimeGroup {
  key: string;
  label: string;
  completedCount: number;
  medianDays: number | null;
  p90Days: number | null;
  onTimePct: number | null;
}

export function computeCycleTime(
  rows: AnalyticsRequestRow[],
  keyFn: (row: AnalyticsRequestRow) => string,
  labelFn: (row: AnalyticsRequestRow) => string,
): CycleTimeGroup[] {
  const completed = rows.filter((r) => r.completed_at != null && r.days_to_complete != null);
  const groups = groupBy(completed, keyFn);

  return [...groups.entries()]
    .map(([key, group]) => {
      const days = group.map((r) => r.days_to_complete as number);
      const onTimeEligible = group.filter((r) => r.completed_before_deadline != null);
      const onTimeCount = onTimeEligible.filter((r) => r.completed_before_deadline).length;
      return {
        key,
        label: labelFn(group[0]),
        completedCount: group.length,
        medianDays: median(days),
        p90Days: percentile(days, 0.9),
        onTimePct: onTimeEligible.length > 0 ? (onTimeCount / onTimeEligible.length) * 100 : null,
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}

// ============================================================
// Reminder effectiveness: average reminders sent per completed request,
// and the distribution of which ladder rung (or none/manual) preceded the
// final upload.
// ============================================================
export interface ReminderStats {
  completedCount: number;
  avgRemindersSent: number | null;
  distribution: { rung: string; count: number; pct: number }[];
}

export function computeReminderStats(rows: AnalyticsRequestRow[]): ReminderStats {
  const completed = rows.filter((r) => r.completed_at != null);
  if (completed.length === 0) {
    return { completedCount: 0, avgRemindersSent: null, distribution: [] };
  }

  const totalReminders = completed.reduce((sum, r) => sum + r.reminders_sent_count, 0);
  const rungCounts = new Map<string, number>();
  for (const r of completed) {
    const rung = r.last_reminder_type_before_final_upload ?? 'none';
    rungCounts.set(rung, (rungCounts.get(rung) ?? 0) + 1);
  }

  return {
    completedCount: completed.length,
    avgRemindersSent: totalReminders / completed.length,
    distribution: [...rungCounts.entries()]
      .map(([rung, count]) => ({ rung, count, pct: (count / completed.length) * 100 }))
      .sort((a, b) => b.count - a.count),
  };
}

// ============================================================
// Link engagement: open rate and time from send to first open.
// ============================================================
export interface LinkEngagement {
  sentCount: number;
  openedCount: number;
  openRatePct: number | null;
  medianHoursToOpen: number | null;
}

export function computeLinkEngagement(rows: AnalyticsRequestRow[]): LinkEngagement {
  const sent = rows.filter((r) => r.sent_at != null);
  const opened = sent.filter((r) => r.first_opened_at != null);
  const hoursToOpen = opened.map(
    (r) => (new Date(r.first_opened_at!).getTime() - new Date(r.sent_at!).getTime()) / 3_600_000,
  );

  return {
    sentCount: sent.length,
    openedCount: opened.length,
    openRatePct: sent.length > 0 ? (opened.length / sent.length) * 100 : null,
    medianHoursToOpen: median(hoursToOpen),
  };
}

// ============================================================
// Upload funnel: opened → first upload → all uploaded → submitted, with
// drop-off between each consecutive stage.
// ============================================================
export interface FunnelStage {
  name: string;
  count: number;
  pctOfSent: number | null;
  dropOffFromPreviousPct: number | null;
}

export function computeFunnel(rows: AnalyticsRequestRow[]): FunnelStage[] {
  const sent = rows.filter((r) => r.sent_at != null);
  const total = sent.length;

  const stageCounts = [
    { name: 'Link sent', count: total },
    { name: 'Link opened', count: sent.filter((r) => r.first_opened_at != null).length },
    { name: 'First file uploaded', count: sent.filter((r) => r.first_upload_at != null).length },
    { name: 'All required uploaded', count: sent.filter((r) => r.completed_at != null).length },
    { name: 'Submitted', count: sent.filter((r) => r.client_submitted_at != null).length },
  ];

  return stageCounts.map((stage, index) => {
    const previous = index > 0 ? stageCounts[index - 1].count : null;
    return {
      name: stage.name,
      count: stage.count,
      pctOfSent: total > 0 ? (stage.count / total) * 100 : null,
      dropOffFromPreviousPct:
        previous != null && previous > 0 ? ((previous - stage.count) / previous) * 100 : null,
    };
  });
}

// ============================================================
// AI classification accuracy: breakdown by current review_status, scoped
// to documents the AI actually produced a parseable classification for
// (the view itself already excludes magic-byte rejects and unparseable
// responses — see analytics_classification_outcomes's comment).
// ============================================================
export interface ClassificationBreakdown {
  total: number;
  buckets: { status: string; label: string; count: number; pct: number }[];
}

const STATUS_LABELS: Record<string, string> = {
  auto_accepted: 'Auto-accepted, never touched',
  confirmed: 'Flagged for review, accountant confirmed AI was right',
  reassigned: 'Reassigned by an accountant',
  rejected: 'Rejected by an accountant',
  unreviewed: 'Still pending in the review queue',
};

export function computeClassificationBreakdown(rows: ClassificationOutcomeRow[]): ClassificationBreakdown {
  const total = rows.length;
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.review_status, (counts.get(row.review_status) ?? 0) + 1);
  }

  return {
    total,
    buckets: [...counts.entries()]
      .map(([status, count]) => ({
        status,
        label: STATUS_LABELS[status] ?? status,
        count,
        pct: total > 0 ? (count / total) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count),
  };
}

// ============================================================
// Confusion matrix: from-type × to-type counts for every reassignment.
// ============================================================
export interface ConfusionMatrix {
  fromLabels: string[];
  toLabels: string[];
  counts: Map<string, number>; // key: `${from}|${to}`
  total: number;
}

export function computeConfusionMatrix(rows: ReassignmentRow[]): ConfusionMatrix {
  const counts = new Map<string, number>();
  const fromLabels = new Set<string>();
  const toLabels = new Set<string>();

  for (const row of rows) {
    fromLabels.add(row.from_label);
    toLabels.add(row.to_label);
    const key = `${row.from_label}|${row.to_label}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return {
    fromLabels: [...fromLabels].sort(),
    toLabels: [...toLabels].sort(),
    counts,
    total: rows.length,
  };
}

// ============================================================
// Review-queue session duration: group each accountant's review_action
// events into sessions (a gap > SESSION_GAP_MINUTES starts a new one),
// then take the median of (last action - first action) per session.
// A single-action session has a genuine duration of 0 — included, not
// excluded, since "how long was this session" is a real answer of "none,
// it was one action."
// ============================================================
export interface ReviewSession {
  actorId: string | null;
  actorName: string | null;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  actionCount: number;
}

export function computeReviewSessions(rows: ReviewActionRow[]): ReviewSession[] {
  const byActor = groupBy(rows, (r) => r.actor_id ?? 'unknown');
  const sessions: ReviewSession[] = [];

  for (const actorRows of byActor.values()) {
    const sorted = [...actorRows].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

    let current: ReviewActionRow[] = [];
    for (const row of sorted) {
      if (current.length === 0) {
        current.push(row);
        continue;
      }
      const gapMinutes =
        (new Date(row.created_at).getTime() - new Date(current[current.length - 1].created_at).getTime()) / 60_000;
      if (gapMinutes > SESSION_GAP_MINUTES) {
        sessions.push(toSession(current));
        current = [row];
      } else {
        current.push(row);
      }
    }
    if (current.length > 0) sessions.push(toSession(current));
  }

  return sessions;
}

function toSession(actionRows: ReviewActionRow[]): ReviewSession {
  const first = actionRows[0];
  const last = actionRows[actionRows.length - 1];
  return {
    actorId: first.actor_id,
    actorName: first.actor_name,
    startAt: first.created_at,
    endAt: last.created_at,
    durationMinutes: (new Date(last.created_at).getTime() - new Date(first.created_at).getTime()) / 60_000,
    actionCount: actionRows.length,
  };
}

export function medianSessionDurationMinutes(sessions: ReviewSession[]): number | null {
  return median(sessions.map((s) => s.durationMinutes));
}
