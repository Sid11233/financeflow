import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { listActivityPage } from '../api/activityApi';
import type { ActivityFilters } from '../api/activityApi';

export function useActivityFeed(filters: ActivityFilters) {
  const query = useInfiniteQuery({
    queryKey: ['activity-feed', filters],
    queryFn: ({ pageParam }: { pageParam: string | null }) => listActivityPage(filters, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: Boolean(filters.organizationId),
  });

  const rows = useMemo(() => query.data?.pages.flatMap((page) => page.rows) ?? [], [query.data]);

  const clientNamesById = useMemo(() => {
    const merged: Record<string, string> = {};
    for (const page of query.data?.pages ?? []) Object.assign(merged, page.clientNamesById);
    return merged;
  }, [query.data]);

  const requiredDocumentLabelsById = useMemo(() => {
    const merged: Record<string, string> = {};
    for (const page of query.data?.pages ?? []) Object.assign(merged, page.requiredDocumentLabelsById);
    return merged;
  }, [query.data]);

  return {
    rows,
    clientNamesById,
    requiredDocumentLabelsById,
    isPending: query.isPending,
    isError: query.isError,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
  };
}
