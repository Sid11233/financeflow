import type { ActivityLogRow } from '../api/activityApi';

export interface ActivityDayGroup {
  label: string;
  rows: ActivityLogRow[];
}

function dayKey(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function labelForDay(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (dayKey(iso) === dayKey(today.toISOString())) return 'Today';
  if (dayKey(iso) === dayKey(yesterday.toISOString())) return 'Yesterday';

  const sameYear = date.getFullYear() === today.getFullYear();
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  });
}

// Assumes rows are already sorted newest-first (as every activity_log
// query in this feature orders them) — groups are emitted in that same
// order, so "Today" always leads when present.
export function groupByDay(rows: ActivityLogRow[]): ActivityDayGroup[] {
  const groups: ActivityDayGroup[] = [];
  let currentKey: string | null = null;

  for (const row of rows) {
    const key = dayKey(row.created_at);
    if (key !== currentKey) {
      groups.push({ label: labelForDay(row.created_at), rows: [] });
      currentKey = key;
    }
    groups[groups.length - 1].rows.push(row);
  }

  return groups;
}
