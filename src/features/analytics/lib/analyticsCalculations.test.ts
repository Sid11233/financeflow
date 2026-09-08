import { describe, expect, it } from 'vitest';
import {
  computeConfusionMatrix,
  computeFunnel,
  computeReviewSessions,
  median,
  medianSessionDurationMinutes,
  percentile,
} from './analyticsCalculations';
import type {
  AnalyticsRequestRow,
  ReassignmentRow,
  ReviewActionRow,
} from './analyticsCalculations';

describe('percentile / median', () => {
  it('matches Postgres percentile_cont for an even-length array', () => {
    // percentile_cont(0.5) of {1,2,3,4} = 2.5
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('interpolates for p90 the same way percentile_cont does', () => {
    // index = 0.9 * 9 = 8.1 -> interpolate between sorted[8]=9 and sorted[9]=10
    const values = Array.from({ length: 10 }, (_, i) => i + 1);
    expect(percentile(values, 0.9)).toBeCloseTo(9.1, 5);
  });

  it('returns null for an empty array rather than NaN', () => {
    expect(median([])).toBeNull();
  });
});

function requestRow(overrides: Partial<AnalyticsRequestRow>): AnalyticsRequestRow {
  return {
    organization_id: 'org-1',
    organization_name: 'Org 1',
    request_id: crypto.randomUUID(),
    client_id: 'client-1',
    client_name: 'Client 1',
    status: 'complete',
    sent_at: '2026-08-01T00:00:00Z',
    completed_at: null,
    deadline: '2026-08-20',
    client_submitted_at: null,
    sent_month: '2026-08-01',
    days_to_complete: null,
    completed_before_deadline: null,
    reminders_sent_count: 0,
    last_reminder_type_before_final_upload: null,
    first_opened_at: null,
    first_upload_at: null,
    ...overrides,
  };
}

describe('computeFunnel', () => {
  it('computes drop-off as a percentage of the previous stage, not of the total', () => {
    const rows: AnalyticsRequestRow[] = [
      requestRow({ first_opened_at: '2026-08-01T01:00:00Z', first_upload_at: '2026-08-01T02:00:00Z' }),
      requestRow({ first_opened_at: '2026-08-01T01:00:00Z' }), // opened but never uploaded
      requestRow({}), // never opened
      requestRow({}), // never opened
    ];

    const funnel = computeFunnel(rows);
    const opened = funnel.find((s) => s.name === 'Link opened')!;
    const firstUpload = funnel.find((s) => s.name === 'First file uploaded')!;

    expect(opened.count).toBe(2);
    expect(opened.pctOfSent).toBe(50);
    // 1 of 2 opened rows uploaded a file -> 50% drop-off from that stage,
    // not 25% (which would be against the total of 4).
    expect(firstUpload.count).toBe(1);
    expect(firstUpload.dropOffFromPreviousPct).toBe(50);
  });

  it('reports null drop-off (not divide-by-zero) when the previous stage is empty', () => {
    const funnel = computeFunnel([]);
    for (const stage of funnel) {
      expect(stage.dropOffFromPreviousPct === null || Number.isFinite(stage.dropOffFromPreviousPct)).toBe(true);
    }
  });
});

describe('computeConfusionMatrix', () => {
  it('tallies from/to pairs and collects the distinct labels on each axis', () => {
    function reassignment(overrides: Partial<ReassignmentRow>): ReassignmentRow {
      return {
        organization_id: 'org-1',
        organization_name: 'Org 1',
        created_at: '2026-08-01T00:00:00Z',
        from_label: 'Bank Statement',
        to_label: 'Invoice',
        confidence: 0.7,
        ...overrides,
      };
    }

    const matrix = computeConfusionMatrix([
      reassignment({}),
      reassignment({}),
      reassignment({ from_label: 'Receipt', to_label: 'Invoice' }),
    ]);

    expect(matrix.total).toBe(3);
    expect(matrix.counts.get('Bank Statement|Invoice')).toBe(2);
    expect(matrix.counts.get('Receipt|Invoice')).toBe(1);
    expect(matrix.fromLabels).toEqual(['Bank Statement', 'Receipt']);
    expect(matrix.toLabels).toEqual(['Invoice']);
  });
});

describe('computeReviewSessions', () => {
  function actionAt(iso: string, actorId = 'accountant-1'): ReviewActionRow {
    return { organization_id: 'org-1', organization_name: 'Org 1', actor_id: actorId, actor_name: 'Jane', created_at: iso };
  }

  it('splits into a new session after a gap over the threshold', () => {
    const sessions = computeReviewSessions([
      actionAt('2026-08-01T09:00:00Z'),
      actionAt('2026-08-01T09:10:00Z'), // 10 min later, same session
      actionAt('2026-08-01T11:00:00Z'), // 110 min later, new session
    ]);

    expect(sessions).toHaveLength(2);
    expect(sessions[0].actionCount).toBe(2);
    expect(sessions[0].durationMinutes).toBe(10);
    expect(sessions[1].actionCount).toBe(1);
    expect(sessions[1].durationMinutes).toBe(0);
  });

  it('tracks sessions per actor independently', () => {
    const sessions = computeReviewSessions([
      actionAt('2026-08-01T09:00:00Z', 'a'),
      actionAt('2026-08-01T09:05:00Z', 'b'),
      actionAt('2026-08-01T09:10:00Z', 'a'),
    ]);

    // 'a' has two actions 10 minutes apart -> one session; 'b' has one
    // action -> one session. Total 2 sessions, not 3.
    expect(sessions).toHaveLength(2);
    const bySize = sessions.map((s) => s.actionCount).sort();
    expect(bySize).toEqual([1, 2]);
  });

  it('median session duration is 0 when every session is a single action', () => {
    const sessions = computeReviewSessions([actionAt('2026-08-01T09:00:00Z', 'a'), actionAt('2026-08-01T09:00:00Z', 'b')]);
    expect(medianSessionDurationMinutes(sessions)).toBe(0);
  });
});
