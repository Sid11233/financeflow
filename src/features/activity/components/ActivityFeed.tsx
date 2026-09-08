import { useEffect, useRef } from 'react';
import { Skeleton } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useTeamMembers } from '@/features/team/hooks/useTeamMembers';
import { ACTIVITY_COLOR_CLASSES, formatActivitySentence, getEventStyle } from '@/lib/activity';
import { useActivityFeed } from '../hooks/useActivityFeed';
import { groupByDay } from '../lib/groupByDay';
import type { ActivityLogRow } from '../api/activityApi';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export interface ActivityFeedProps {
  organizationId: string;
  requestId?: string;
  clientId?: string;
  // Known up front when the feed is scoped to a single client (the
  // request detail and client detail pages both already have this from
  // context) — skips a lookup for every row on the organization-wide feed,
  // which instead falls back to the per-page resolved name.
  clientName?: string;
  eventTypes?: string[];
  dateFrom?: string;
  dateTo?: string;
  emptyMessage?: string;
}

export function ActivityFeed({
  organizationId,
  requestId,
  clientId,
  clientName,
  eventTypes,
  dateFrom,
  dateTo,
  emptyMessage = 'No activity yet.',
}: ActivityFeedProps) {
  const feed = useActivityFeed({ organizationId, requestId, clientId, eventTypes, dateFrom, dateTo });
  const teamQuery = useTeamMembers();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = feed;

  useEffect(() => {
    if (!hasNextPage) return;
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (feed.isPending) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (feed.isError) {
    return <p className="text-sm text-red-600">Could not load activity.</p>;
  }

  if (feed.rows.length === 0) {
    return <p className="text-sm text-neutral-400">{emptyMessage}</p>;
  }

  const namesById = new Map((teamQuery.data ?? []).map((member) => [member.id, member.full_name ?? member.email]));

  function resolveActorName(row: ActivityLogRow, resolvedClientName: string): string {
    if (row.actor_type === 'system') return 'System';
    if (row.actor_type === 'client') return resolvedClientName;
    return namesById.get(row.actor_id ?? '') ?? 'Someone on your team';
  }

  return (
    <div className="space-y-6">
      {groupByDay(feed.rows).map((group) => (
        <div key={group.label}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">{group.label}</p>
          <ul className="space-y-4">
            {group.rows.map((row) => {
              const { icon: Icon, color } = getEventStyle(row.event_type);
              const colorClasses = ACTIVITY_COLOR_CLASSES[color];
              const resolvedClientName = clientName ?? feed.clientNamesById[row.client_id ?? ''] ?? 'the client';
              const sentence = formatActivitySentence(row, {
                actorName: resolveActorName(row, resolvedClientName),
                clientName: resolvedClientName,
                resolveRequiredDocumentLabel: (id) =>
                  id ? (feed.requiredDocumentLabelsById[id] ?? 'a checklist item') : 'another item',
              });

              return (
                <li key={row.id} className="flex items-start gap-3">
                  <span
                    className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full', colorClasses.bg)}
                  >
                    <Icon className={cn('h-4 w-4', colorClasses.icon)} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-neutral-800">{sentence}</p>
                    <p className="text-xs text-neutral-400">{formatTime(row.created_at)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <div ref={sentinelRef} />
      {feed.isFetchingNextPage && <Skeleton className="h-8 w-full" />}
    </div>
  );
}
