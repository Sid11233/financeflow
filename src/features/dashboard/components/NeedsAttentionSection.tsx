import { Link } from 'react-router-dom';
import { AlertTriangle, MailWarning, SearchCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui';
import { useAttentionCounts } from '../hooks/useAttentionCounts';

export function NeedsAttentionSection({ organizationId }: { organizationId: string | undefined }) {
  const attentionQuery = useAttentionCounts(organizationId);
  const counts = attentionQuery.data;

  if (!counts) return null;

  const rows = [
    {
      key: 'needs_review',
      count: counts.needsReviewCount,
      label: (n: number) => `${n} document${n === 1 ? '' : 's'} awaiting review`,
      to: '/dashboard?period=all&filter=needs_review',
      icon: SearchCheck,
      color: 'text-purple-600',
    },
    {
      key: 'overdue',
      count: counts.overdueCount,
      label: (n: number) => `${n} request${n === 1 ? '' : 's'} overdue`,
      to: '/dashboard?period=all&filter=overdue',
      icon: AlertTriangle,
      color: 'text-red-600',
    },
    {
      key: 'bounced',
      count: counts.bouncedClientCount,
      label: (n: number) => `${n} failed email${n === 1 ? '' : 's'}`,
      to: '/clients?bounced=1',
      icon: MailWarning,
      color: 'text-amber-600',
    },
  ].filter((row) => row.count > 0);

  if (rows.length === 0) return null;

  return (
    <Card className="border-amber-200 bg-amber-50/40">
      <CardContent className="space-y-1 py-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-800">Needs attention</p>
        {rows.map((row) => (
          <Link
            key={row.key}
            to={row.to}
            className="flex items-center gap-2 rounded-md px-1 py-1.5 text-sm text-neutral-700 hover:bg-white/60"
          >
            <row.icon className={`h-4 w-4 shrink-0 ${row.color}`} aria-hidden="true" />
            <span>{row.label(row.count)}</span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
