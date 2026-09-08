import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui';
import { computeCycleTime } from '../lib/analyticsCalculations';
import type { AnalyticsRequestRow } from '../lib/analyticsCalculations';
import { ExportCsvButton } from './ExportCsvButton';

function formatMonth(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function round1(value: number | null): number | null {
  return value == null ? null : Math.round(value * 10) / 10;
}

export function CycleTimeSection({
  rows,
  allOrgRows,
  showByOrganization,
}: {
  rows: AnalyticsRequestRow[];
  allOrgRows: AnalyticsRequestRow[];
  showByOrganization: boolean;
}) {
  const byMonth = useMemo(
    () => computeCycleTime(rows, (r) => r.sent_month ?? 'unknown', (r) => formatMonth(r.sent_month ?? '')),
    [rows],
  );

  const byOrg = useMemo(
    () => computeCycleTime(allOrgRows, (r) => r.organization_id, (r) => r.organization_name),
    [allOrgRows],
  );

  const chartData = byMonth.map((m) => ({
    month: m.label,
    Median: round1(m.medianDays),
    P90: round1(m.p90Days),
  }));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Cycle time: sent → completed, by month</CardTitle>
        <ExportCsvButton
          filename="cycle-time-by-month"
          rows={byMonth.map((m) => ({
            month: m.label,
            completed_count: m.completedCount,
            median_days: round1(m.medianDays),
            p90_days: round1(m.p90Days),
            pct_completed_before_deadline: round1(m.onTimePct),
          }))}
        />
      </CardHeader>
      <CardContent className="space-y-6">
        {chartData.length === 0 ? (
          <p className="text-sm text-neutral-400">No completed requests in this scope yet.</p>
        ) : (
          <>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} label={{ value: 'Days', angle: -90, position: 'insideLeft', fontSize: 12 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="Median" stroke="#4f46e5" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="P90" stroke="#b45309" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>Median days</TableHead>
                  <TableHead>P90 days</TableHead>
                  <TableHead>% before deadline</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byMonth.map((m) => (
                  <TableRow key={m.key}>
                    <TableCell>{m.label}</TableCell>
                    <TableCell>{m.completedCount}</TableCell>
                    <TableCell>{round1(m.medianDays) ?? '—'}</TableCell>
                    <TableCell>{round1(m.p90Days) ?? '—'}</TableCell>
                    <TableCell>{m.onTimePct != null ? `${round1(m.onTimePct)}%` : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}

        {showByOrganization && byOrg.length > 0 && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">By organization</p>
              <ExportCsvButton
                filename="cycle-time-by-organization"
                rows={byOrg.map((o) => ({
                  organization: o.label,
                  completed_count: o.completedCount,
                  median_days: round1(o.medianDays),
                  p90_days: round1(o.p90Days),
                  pct_completed_before_deadline: round1(o.onTimePct),
                }))}
              />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>Median days</TableHead>
                  <TableHead>P90 days</TableHead>
                  <TableHead>% before deadline</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byOrg.map((o) => (
                  <TableRow key={o.key}>
                    <TableCell>{o.label}</TableCell>
                    <TableCell>{o.completedCount}</TableCell>
                    <TableCell>{round1(o.medianDays) ?? '—'}</TableCell>
                    <TableCell>{round1(o.p90Days) ?? '—'}</TableCell>
                    <TableCell>{o.onTimePct != null ? `${round1(o.onTimePct)}%` : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
