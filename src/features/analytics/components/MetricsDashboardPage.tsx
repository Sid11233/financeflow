import { useMemo, useState } from 'react';
import { Select, Skeleton } from '@/components/ui';
import { useAnalyticsData } from '../hooks/useAnalyticsData';
import { CycleTimeSection } from './CycleTimeSection';
import { ReminderSection } from './ReminderSection';
import { LinkEngagementSection } from './LinkEngagementSection';
import { FunnelSection } from './FunnelSection';
import { ClassificationSection } from './ClassificationSection';
import { ReviewSessionSection } from './ReviewSessionSection';

const ALL_ORGS = 'all';

export function MetricsDashboardPage() {
  const { isPending, isError, requests, classificationOutcomes, reassignments, reviewActions } = useAnalyticsData();
  const [organizationId, setOrganizationId] = useState(ALL_ORGS);

  const organizations = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of requests) map.set(r.organization_id, r.organization_name);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [requests]);

  const scopedRequests = useMemo(
    () => (organizationId === ALL_ORGS ? requests : requests.filter((r) => r.organization_id === organizationId)),
    [requests, organizationId],
  );
  const scopedOutcomes = useMemo(
    () =>
      organizationId === ALL_ORGS
        ? classificationOutcomes
        : classificationOutcomes.filter((r) => r.organization_id === organizationId),
    [classificationOutcomes, organizationId],
  );
  const scopedReassignments = useMemo(
    () =>
      organizationId === ALL_ORGS ? reassignments : reassignments.filter((r) => r.organization_id === organizationId),
    [reassignments, organizationId],
  );
  const scopedReviewActions = useMemo(
    () =>
      organizationId === ALL_ORGS ? reviewActions : reviewActions.filter((r) => r.organization_id === organizationId),
    [reviewActions, organizationId],
  );

  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError) {
    return <p className="text-sm text-red-600">Could not load analytics data.</p>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Pilot metrics</h1>
          <p className="text-sm text-neutral-500">Internal only — not visible to organizations.</p>
        </div>
        <Select value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} className="w-64">
          <option value={ALL_ORGS}>All organizations</option>
          {organizations.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </Select>
      </div>

      <CycleTimeSection rows={scopedRequests} allOrgRows={requests} showByOrganization={organizationId === ALL_ORGS} />
      <ReminderSection rows={scopedRequests} />
      <LinkEngagementSection rows={scopedRequests} />
      <FunnelSection rows={scopedRequests} />
      <ClassificationSection outcomes={scopedOutcomes} reassignments={scopedReassignments} />
      <ReviewSessionSection rows={scopedReviewActions} />
    </div>
  );
}
