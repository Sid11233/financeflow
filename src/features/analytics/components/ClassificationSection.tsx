import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
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
import { cn } from '@/lib/utils';
import { computeClassificationBreakdown, computeConfusionMatrix } from '../lib/analyticsCalculations';
import type { ClassificationOutcomeRow, ReassignmentRow } from '../lib/analyticsCalculations';
import { ExportCsvButton } from './ExportCsvButton';

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function ClassificationSection({
  outcomes,
  reassignments,
}: {
  outcomes: ClassificationOutcomeRow[];
  reassignments: ReassignmentRow[];
}) {
  const breakdown = useMemo(() => computeClassificationBreakdown(outcomes), [outcomes]);
  const matrix = useMemo(() => computeConfusionMatrix(reassignments), [reassignments]);

  const chartData = breakdown.buckets.map((b) => ({ label: b.label, Documents: b.count }));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>AI classification accuracy</CardTitle>
          <ExportCsvButton
            filename="classification-accuracy"
            rows={breakdown.buckets.map((b) => ({ outcome: b.label, count: b.count, pct: round1(b.pct) }))}
          />
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-neutral-600">
            {breakdown.total} document{breakdown.total === 1 ? '' : 's'} the AI produced a usable classification for
            (excludes files rejected on upload for a content mismatch, and unparseable AI responses — neither is a
            classification accuracy question).
          </p>

          {chartData.length === 0 ? (
            <p className="text-sm text-neutral-400">No classified documents in this scope yet.</p>
          ) : (
            <>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} layout="vertical" margin={{ left: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                    <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="label" width={220} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="Documents" fill="#4f46e5" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Outcome</TableHead>
                    <TableHead>Documents</TableHead>
                    <TableHead>%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {breakdown.buckets.map((b) => (
                    <TableRow key={b.status}>
                      <TableCell>{b.label}</TableCell>
                      <TableCell>{b.count}</TableCell>
                      <TableCell>{round1(b.pct)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Reassignment confusion matrix</CardTitle>
          <ExportCsvButton
            filename="reassignment-confusion-matrix"
            rows={matrix.fromLabels.flatMap((from) =>
              matrix.toLabels.map((to) => ({
                from_type: from,
                to_type: to,
                count: matrix.counts.get(`${from}|${to}`) ?? 0,
              })),
            )}
          />
        </CardHeader>
        <CardContent>
          {matrix.total === 0 ? (
            <p className="text-sm text-neutral-400">No reassignments in this scope yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="border border-neutral-200 bg-neutral-50 p-2 text-left font-medium text-neutral-500">
                      Detected as ↓ / Reassigned to →
                    </th>
                    {matrix.toLabels.map((to) => (
                      <th key={to} className="border border-neutral-200 bg-neutral-50 p-2 text-left font-medium text-neutral-500">
                        {to}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.fromLabels.map((from) => (
                    <tr key={from}>
                      <th className="border border-neutral-200 bg-neutral-50 p-2 text-left font-medium text-neutral-700">
                        {from}
                      </th>
                      {matrix.toLabels.map((to) => {
                        const count = matrix.counts.get(`${from}|${to}`) ?? 0;
                        return (
                          <td
                            key={to}
                            className={cn(
                              'border border-neutral-200 p-2 text-center',
                              count > 0 ? 'bg-amber-50 font-semibold text-amber-800' : 'text-neutral-300',
                            )}
                          >
                            {count > 0 ? count : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
