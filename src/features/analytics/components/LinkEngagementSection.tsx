import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { computeLinkEngagement } from '../lib/analyticsCalculations';
import type { AnalyticsRequestRow } from '../lib/analyticsCalculations';
import { ExportCsvButton } from './ExportCsvButton';

function round1(value: number | null): number | null {
  return value == null ? null : Math.round(value * 10) / 10;
}

export function LinkEngagementSection({ rows }: { rows: AnalyticsRequestRow[] }) {
  const stats = useMemo(() => computeLinkEngagement(rows), [rows]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Client link engagement</CardTitle>
        <ExportCsvButton
          filename="link-engagement"
          rows={[
            {
              sent_count: stats.sentCount,
              opened_count: stats.openedCount,
              open_rate_pct: round1(stats.openRatePct),
              median_hours_to_open: round1(stats.medianHoursToOpen),
            },
          ]}
        />
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-neutral-400">Open rate</p>
            <p className="mt-1 text-2xl font-semibold text-neutral-900">
              {stats.openRatePct != null ? `${round1(stats.openRatePct)}%` : '—'}
            </p>
            <p className="text-xs text-neutral-400">
              {stats.openedCount} of {stats.sentCount} sent links opened
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-neutral-400">Median time to first open</p>
            <p className="mt-1 text-2xl font-semibold text-neutral-900">
              {stats.medianHoursToOpen != null ? `${round1(stats.medianHoursToOpen)}h` : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-neutral-400">Links sent</p>
            <p className="mt-1 text-2xl font-semibold text-neutral-900">{stats.sentCount}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
