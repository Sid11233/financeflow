import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { acceptDocument, rejectDocument, reassignDocument, waiveRequiredDocument } from '../api/requestDetailApi';
import { requestChecklistQueryKey } from './useRequestChecklist';
import { useTrackEvent } from '@/features/analytics/hooks/useTrackEvent';

const UNDO_WINDOW_MS = 5000;

// Review actions read as instant: the item disappears from the queue right
// away (the caller filters out anything `isPending`) and a toast offers 5
// seconds to undo. The real mutation is delayed until that window elapses
// rather than fired-then-reversed — simpler than teaching every action how
// to undo itself, and it means an undone action never touches the
// database at all. If the page is closed or navigated away from before
// the timer fires, the action still commits in the background: losing a
// queued accept/reject silently would be worse than one running after the
// component that queued it is gone.
export function useReviewQueueActions(requestId: string) {
  const queryClient = useQueryClient();
  const track = useTrackEvent();
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: requestChecklistQueryKey(requestId) });
    queryClient.invalidateQueries({ queryKey: ['request-detail', requestId] });
    queryClient.invalidateQueries({ queryKey: ['request-activity', requestId] });
  }

  function addPending(key: string) {
    setPendingKeys((prev) => new Set(prev).add(key));
  }

  function removePending(key: string) {
    setPendingKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  function schedule(
    key: string,
    successMessage: string,
    action: 'accept' | 'reject' | 'reassign' | 'waive',
    commit: () => Promise<void>,
  ) {
    addPending(key);

    const timer = setTimeout(async () => {
      timers.current.delete(key);
      try {
        await commit();
        // Tracked on actual commit, not on click — an undone action (the
        // 5-second window below) never touches the database and
        // shouldn't count as review-queue work either.
        track('review_action', { requestId, action });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Something went wrong. Please try again.');
      } finally {
        removePending(key);
        invalidate();
      }
    }, UNDO_WINDOW_MS);
    timers.current.set(key, timer);

    toast.success(successMessage, {
      durationMs: UNDO_WINDOW_MS,
      action: {
        label: 'Undo',
        onClick: () => {
          const pendingTimer = timers.current.get(key);
          if (pendingTimer) {
            clearTimeout(pendingTimer);
            timers.current.delete(key);
          }
          removePending(key);
        },
      },
    });
  }

  return {
    isPending: (key: string) => pendingKeys.has(key),
    accept(documentId: string, filename: string) {
      schedule(documentId, `Accepted ${filename}`, 'accept', () => acceptDocument(documentId));
    },
    reject(documentId: string, filename: string, reason?: string) {
      schedule(documentId, `Rejected ${filename}`, 'reject', () => rejectDocument(documentId, reason));
    },
    reassign(documentId: string, filename: string, targetLabel: string, targetRequiredDocumentId: string) {
      schedule(documentId, `Reassigned ${filename} to ${targetLabel}`, 'reassign', () =>
        reassignDocument(documentId, targetRequiredDocumentId),
      );
    },
    waive(requiredDocumentId: string, label: string, reason?: string, documentId?: string) {
      schedule(documentId ?? requiredDocumentId, `Waived ${label}`, 'waive', () =>
        waiveRequiredDocument(requiredDocumentId, reason, documentId),
      );
    },
  };
}
