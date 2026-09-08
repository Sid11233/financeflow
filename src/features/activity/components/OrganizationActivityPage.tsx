import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '@/components/ui';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { ActivityFeed } from './ActivityFeed';
import { ActivityFilters } from './ActivityFilters';
import { EMPTY_ACTIVITY_FILTERS } from '../types';
import type { ActivityFilterState } from '../types';

// A plain "to" date is a calendar day, but activity_log.created_at is a
// timestamptz — comparing a bare date against it with <= would cut off at
// that day's midnight and exclude everything that happened on it. This
// pushes the boundary to the very end of the selected day instead.
function endOfDay(dateOnly: string): string {
  return `${dateOnly}T23:59:59.999`;
}

export function OrganizationActivityPage() {
  const { organization } = useAuth();
  const [filters, setFilters] = useState<ActivityFilterState>(EMPTY_ACTIVITY_FILTERS);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-neutral-900">Activity</h1>

      {!organization ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          <Card>
            <CardContent>
              <ActivityFilters organizationId={organization.id} value={filters} onChange={setFilters} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>All activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityFeed
                organizationId={organization.id}
                clientId={filters.clientId || undefined}
                eventTypes={filters.eventType ? [filters.eventType] : undefined}
                dateFrom={filters.dateFrom || undefined}
                dateTo={filters.dateTo ? endOfDay(filters.dateTo) : undefined}
                emptyMessage="No activity matches these filters."
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
