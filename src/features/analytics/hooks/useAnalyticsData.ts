import { useQuery } from '@tanstack/react-query';
import {
  listAnalyticsRequests,
  listClassificationOutcomes,
  listReassignments,
  listReviewActions,
} from '../api/analyticsApi';

// One combined loading/error state for the whole dashboard rather than
// four independent ones — every section on this page needs all four
// datasets loaded before there's anything meaningful to render anyway.
export function useAnalyticsData() {
  const requestsQuery = useQuery({ queryKey: ['analytics-requests'], queryFn: listAnalyticsRequests });
  const classificationQuery = useQuery({
    queryKey: ['analytics-classification-outcomes'],
    queryFn: listClassificationOutcomes,
  });
  const reassignmentsQuery = useQuery({ queryKey: ['analytics-reassignments'], queryFn: listReassignments });
  const reviewActionsQuery = useQuery({ queryKey: ['analytics-review-actions'], queryFn: listReviewActions });

  return {
    isPending:
      requestsQuery.isPending ||
      classificationQuery.isPending ||
      reassignmentsQuery.isPending ||
      reviewActionsQuery.isPending,
    isError:
      requestsQuery.isError || classificationQuery.isError || reassignmentsQuery.isError || reviewActionsQuery.isError,
    requests: requestsQuery.data ?? [],
    classificationOutcomes: classificationQuery.data ?? [],
    reassignments: reassignmentsQuery.data ?? [],
    reviewActions: reviewActionsQuery.data ?? [],
  };
}
