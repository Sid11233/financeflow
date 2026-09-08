import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '@/components/ui';
import { useRequestDetail } from '../hooks/useRequestDetail';
import { useRequestChecklist } from '../hooks/useRequestChecklist';
import { useRequestRealtime } from '../hooks/useRequestRealtime';
import { useReviewQueueActions } from '../hooks/useReviewQueueActions';
import { RequestHeader } from './detail/RequestHeader';
import { computeUnresolvedLabels } from '../lib/reviewFormatting';
import { ReviewQueuePanel } from './detail/ReviewQueuePanel';
import { ChecklistPanel } from './detail/ChecklistPanel';
import { ContactCard } from './detail/ContactCard';
import { ReminderTimeline } from './detail/ReminderTimeline';
import { ActivityFeed } from '@/features/activity/components/ActivityFeed';

export function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const requestQuery = useRequestDetail(id);
  const { requiredDocuments, documents, isPending: isChecklistPending } = useRequestChecklist(
    id,
    requestQuery.data?.organization_id,
  );
  const reviewActions = useReviewQueueActions(id ?? '');

  useRequestRealtime(id);

  if (requestQuery.isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Skeleton className="h-96 lg:col-span-2" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (requestQuery.isError || !requestQuery.data) {
    return <p className="text-sm text-red-600">Could not load this request.</p>;
  }

  const request = requestQuery.data;
  const unresolvedLabels = computeUnresolvedLabels(requiredDocuments);

  return (
    <div className="space-y-6">
      <RequestHeader request={request} unresolvedLabels={unresolvedLabels} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {!isChecklistPending && (
            <ReviewQueuePanel
              documents={documents}
              requiredDocuments={requiredDocuments}
              requestPeriodLabel={request.period_label}
              clientEmail={request.client_email}
              organizationId={request.organization_id}
              reviewActions={reviewActions}
            />
          )}

          {isChecklistPending ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <ChecklistPanel
              requestId={request.id}
              requiredDocuments={requiredDocuments}
              documents={documents}
              clientName={request.client_name}
              reviewActions={reviewActions}
            />
          )}
        </div>

        <div className="space-y-6">
          <ContactCard email={request.client_email} phone={request.client_phone} />
          <ReminderTimeline requestId={request.id} remindersPausedAt={request.reminders_paused_at} />
          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityFeed
                organizationId={request.organization_id}
                requestId={request.id}
                clientName={request.client_name}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
