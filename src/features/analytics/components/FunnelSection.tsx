import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui';
import { computeFunnel } from '../lib/analyticsCalculations';
import type { AnalyticsRequestRow } from '../lib/analyticsCalculations';
import { ExportCsvButton } from './ExportCsvButton';

function round1(value: number | null): number | null {
  return value == null ? null : Math.round(value * 10) / 10;
}

export function FunnelSection({ rows }: { rows: AnalyticsRequestRow[] }) {
  const stages = useMemo(() => computeFunnel(rows), [rows]);
  const chartData = stages.map((s) => ({ name: s.name, Requests: s.count }));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Upload funnel</CardTitle>
        <ExportCsvButton
          filename="upload-funnel"
          rows={stages.map((s) => ({
            stage: s.name,
            count: s.count,
            pct_of_sent: round1(s.pctOfSent),
            drop_off_from_previous_pct: round1(s.dropOffFromPreviousPct),
          }))}
        />
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="Requests" fill="#4f46e5" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Stage</TableHead>
              <TableHead>Requests</TableHead>
              <TableHead>% of sent</TableHead>
              <TableHead>Drop-off from previous stage</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stages.map((s) => (
              <TableRow key={s.name}>
                <TableCell>{s.name}</TableCell>
                <TableCell>{s.count}</TableCell>
                <TableCell>{s.pctOfSent != null ? `${round1(s.pctOfSent)}%` : '—'}</TableCell>
                <TableCell>{s.dropOffFromPreviousPct != null ? `${round1(s.dropOffFromPreviousPct)}%` : '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
