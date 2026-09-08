import { describe, expect, it } from 'vitest';
import { groupByDay } from './groupByDay';
import type { ActivityLogRow } from '../api/activityApi';

function row(overrides: Partial<ActivityLogRow>): ActivityLogRow {
  return {
    id: crypto.randomUUID(),
    organization_id: 'org-1',
    request_id: null,
    client_id: null,
    actor_type: 'system',
    actor_id: null,
    event_type: 'document_uploaded',
    payload: {},
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('groupByDay', () => {
  it('labels today and yesterday specially, and groups same-day rows together', () => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);

    const rows = [
      row({ id: 'a', created_at: now.toISOString() }),
      row({ id: 'b', created_at: new Date(now.getTime() - 60_000).toISOString() }),
      row({ id: 'c', created_at: yesterday.toISOString() }),
    ];

    const groups = groupByDay(rows);

    expect(groups).toHaveLength(2);
    expect(groups[0].label).toBe('Today');
    expect(groups[0].rows.map((r) => r.id)).toEqual(['a', 'b']);
    expect(groups[1].label).toBe('Yesterday');
    expect(groups[1].rows.map((r) => r.id)).toEqual(['c']);
  });

  it('returns no groups for an empty input', () => {
    expect(groupByDay([])).toEqual([]);
  });
});
