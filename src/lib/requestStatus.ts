import type { Database } from './database.types';

// Shared by the dashboard and the client detail page's request history —
// both display the same request_status values the same way, so the
// status→bucket→badge mapping lives here once instead of twice.
export type StatusBucket = 'complete' | 'waiting' | 'overdue' | 'draft' | 'cancelled';

export function getStatusBucket(
  status: Database['public']['Enums']['request_status'],
): StatusBucket {
  switch (status) {
    case 'complete':
      return 'complete';
    case 'overdue':
      return 'overdue';
    case 'sent':
    case 'partial':
      return 'waiting';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'draft';
  }
}

export const statusBadgeConfig: Record<
  StatusBucket,
  { label: string; variant: 'success' | 'warning' | 'danger' | 'neutral' }
> = {
  complete: { label: 'Complete', variant: 'success' },
  waiting: { label: 'Waiting', variant: 'warning' },
  overdue: { label: 'Overdue', variant: 'danger' },
  draft: { label: 'Draft', variant: 'neutral' },
  cancelled: { label: 'Cancelled', variant: 'neutral' },
};
