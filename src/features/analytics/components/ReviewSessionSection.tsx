import { useMemo } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { computeReviewSessions, medianSessionDurationMinutes } from '../lib/analyticsCalculations';
import type { ReviewActionRow } from '../lib/analyticsCalculations';
import { ExportCsvButton } from './ExportCsvButton';

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function groupByActor(sessions: ReturnType<typeof computeReviewSessions>) {
  const map = new Map<string, { actorName: string; sessions: typeof sessions }>();
  for (const session of sessions) {
    const key = session.actorId ?? 'unknown';
    const existing = map.get(key);
    if (existing) existing.sessions.push(session);
    else map.set(key, { actorName: session.actorName ?? 'Unknown', sessions: [session] });
  }
  return map;
}

export function ReviewSessionSection({ rows }: { rows: ReviewActionRow[] }) {
  const sessions = useMemo(() => computeReviewSessions(rows), [rows]);
  const overallMedian = useMemo(() => medianSessionDurationMinutes(sessions), [sessions]);
  const byActor = useMemo(() => groupByActor(sessions), [sessions]);

  const perActorRows = [...byActor.entries()].map(([actorId, group]) => ({
    actorId,
    actorName: group.actorName,
    sessionCount: group.sessions.length,
    medianMinutes: medianSessionDurationMinutes(group.sessions),
  }));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Review queue session duration</CardTitle>
        <ExportCsvButton
          filename="review-session-duration"
          rows={perActorRows.map((r) => ({
            accountant: r.actorName,
            session_count: r.sessionCount,
            median_minutes: r.medianMinutes != null ? round1(r.medianMinutes) : null,
          }))}
        />
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-neutral-600">
          A session is a run of review-queue actions (accept/reject/reassign/waive) by one accountant with no gap
          longer than 30 minutes between them. Duration is time between that session's first and last action —
          {' '}{sessions.length} session{sessions.length === 1 ? '' : 's'} in this scope, median{' '}
          <strong>{overallMedian != null ? `${round1(overallMedian)} min` : '—'}</strong>.
        </p>

        {perActorRows.length === 0 ? (
          <p className="text-sm text-neutral-400">No review_action events tracked in this scope yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Accountant</TableHead>
                <TableHead>Sessions</TableHead>
                <TableHead>Median duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {perActorRows.map((r) => (
                <TableRow key={r.actorId}>
                  <TableCell>{r.actorName}</TableCell>
                  <TableCell>{r.sessionCount}</TableCell>
                  <TableCell>{r.medianMinutes != null ? `${round1(r.medianMinutes)} min` : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
