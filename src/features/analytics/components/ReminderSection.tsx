import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui';
import { computeReminderStats } from '../lib/analyticsCalculations';
import type { AnalyticsRequestRow } from '../lib/analyticsCalculations';
import { ExportCsvButton } from './ExportCsvButton';

const RUNG_LABELS: Record<string, string> = {
  none: 'No reminder before final upload',
  initial: 'Initial (day 0)',
  nudge: 'Nudge (day 2)',
  firm: 'Firm (day 5)',
  overdue: 'Overdue (day 7)',
  escalation: 'Escalation (day 10)',
  manual: 'Manual send',
};

export function ReminderSection({ rows }: { rows: AnalyticsRequestRow[] }) {
  const stats = useMemo(() => computeReminderStats(rows), [rows]);

  const chartData = stats.distribution.map((d) => ({
    rung: RUNG_LABELS[d.rung] ?? d.rung,
    Requests: d.count,
  }));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Reminder effectiveness</CardTitle>
        <ExportCsvButton
          filename="reminder-effectiveness"
          rows={stats.distribution.map((d) => ({
            rung: RUNG_LABELS[d.rung] ?? d.rung,
            count: d.count,
            pct_of_completed: Math.round(d.pct * 10) / 10,
          }))}
        />
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-neutral-600">
          Based on {stats.completedCount} completed request{stats.completedCount === 1 ? '' : 's'}, averaging{' '}
          <strong>{stats.avgRemindersSent != null ? stats.avgRemindersSent.toFixed(1) : '—'}</strong> reminders sent
          per request. The chart shows which rung was the last one sent before the final upload that completed the
          request — the ladder's default day offsets are shown for reference; a customized ladder's actual timing may
          differ.
        </p>

        {chartData.length === 0 ? (
          <p className="text-sm text-neutral-400">No completed requests in this scope yet.</p>
        ) : (
          <>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                  <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="rung" width={180} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="Requests" fill="#4f46e5" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Last rung before final upload</TableHead>
                  <TableHead>Requests</TableHead>
                  <TableHead>% of completed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.distribution.map((d) => (
                  <TableRow key={d.rung}>
                    <TableCell>{RUNG_LABELS[d.rung] ?? d.rung}</TableCell>
                    <TableCell>{d.count}</TableCell>
                    <TableCell>{Math.round(d.pct * 10) / 10}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
