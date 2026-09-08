import { useState } from 'react';
import { Badge, Button, DropdownMenu, DropdownMenuItem, ProgressBar } from '@/components/ui';
import { getStatusBucket, statusBadgeConfig } from '@/lib/requestStatus';
import { formatRelativeDeadline } from '@/features/dashboard/utils';
import { useCancelRequest, useNotifyRequest } from '../../hooks/useRequestActions';
import { ExtendDeadlineDialog } from './ExtendDeadlineDialog';
import { MarkCompleteDialog } from './MarkCompleteDialog';
import type { RequestDetail } from '../../types';

export function RequestHeader({
  request,
  unresolvedLabels,
}: {
  request: RequestDetail;
  unresolvedLabels: string[];
}) {
  const [isExtendOpen, setIsExtendOpen] = useState(false);
  const [isCompleteOpen, setIsCompleteOpen] = useState(false);
  const notify = useNotifyRequest(request.id);
  const cancelRequest = useCancelRequest(request.id);

  const badge = statusBadgeConfig[getStatusBucket(request.status)];
  const hasBeenSent = request.sent_at !== null;
  const isFinished = request.status === 'complete' || request.status === 'cancelled';

  return (
    <div className="space-y-4 rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-neutral-900">{request.client_name}</h1>
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </div>
          <p className="text-sm text-neutral-500">{request.period_label}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" disabled={!hasBeenSent || notify.isPending} onClick={() => notify.mutate('reminder')}>
            Send Reminder
          </Button>
          <Button variant="outline" size="sm" onClick={() => setIsExtendOpen(true)}>
            Extend Deadline
          </Button>
          <Button variant="outline" size="sm" disabled={isFinished} onClick={() => setIsCompleteOpen(true)}>
            Mark Complete
          </Button>
          <Button variant="outline" size="sm" disabled={!hasBeenSent || notify.isPending} onClick={() => notify.mutate('copy_link')}>
            Copy Upload Link
          </Button>
          <Button variant="outline" size="sm" disabled={!hasBeenSent || notify.isPending} onClick={() => notify.mutate('resend')}>
            Resend Link
          </Button>
          <DropdownMenu trigger={<span className="flex h-9 w-9 items-center justify-center rounded-md border border-neutral-300 bg-white text-neutral-500 hover:bg-neutral-50">⋯</span>}>
            <DropdownMenuItem
              destructive
              onClick={() => {
                if (request.status !== 'cancelled' && window.confirm('Cancel this request? This cannot be undone.')) {
                  cancelRequest.mutate();
                }
              }}
            >
              Cancel Request
            </DropdownMenuItem>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex flex-1 items-center gap-3">
          <ProgressBar value={request.completion_percentage} className="max-w-xs" />
          <span className="shrink-0 text-sm font-medium text-neutral-700">{request.completion_percentage}%</span>
        </div>
        <p className="text-sm text-neutral-500">
          Deadline: {request.deadline ? new Date(`${request.deadline}T00:00:00`).toLocaleDateString() : 'None'}
          {request.deadline && <span className="ml-1 text-neutral-400">({formatRelativeDeadline(request.deadline)})</span>}
        </p>
      </div>

      <ExtendDeadlineDialog
        open={isExtendOpen}
        onClose={() => setIsExtendOpen(false)}
        requestId={request.id}
        currentDeadline={request.deadline}
      />
      <MarkCompleteDialog
        open={isCompleteOpen}
        onClose={() => setIsCompleteOpen(false)}
        requestId={request.id}
        unresolvedLabels={unresolvedLabels}
      />
    </div>
  );
}
