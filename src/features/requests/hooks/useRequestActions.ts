import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import {
  cancelRequest,
  extendRequestDeadline,
  markRequestComplete,
  notifyRequest,
  removeDocument,
  setReminderSkipped,
  setRemindersPaused,
} from '../api/requestDetailApi';
import type { NotifyAction } from '../api/requestDetailApi';
import { requestChecklistQueryKey } from './useRequestChecklist';
import { useTrackEvent } from '@/features/analytics/hooks/useTrackEvent';

function useInvalidateRequest(requestId: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['request-detail', requestId] });
    queryClient.invalidateQueries({ queryKey: requestChecklistQueryKey(requestId) });
    queryClient.invalidateQueries({ queryKey: ['request-activity', requestId] });
    queryClient.invalidateQueries({ queryKey: ['request-reminders', requestId] });
  };
}

function onErrorToast(error: unknown) {
  toast.error(error instanceof Error ? error.message : 'Something went wrong. Please try again.');
}

export function useExtendDeadline(requestId: string) {
  const invalidate = useInvalidateRequest(requestId);
  const track = useTrackEvent();
  return useMutation({
    mutationFn: (newDeadline: string) => extendRequestDeadline(requestId, newDeadline),
    onSuccess: (_data, newDeadline) => {
      invalidate();
      track('deadline_extended', { requestId, newDeadline });
      toast.success('Deadline extended.');
    },
    onError: onErrorToast,
  });
}

export function useMarkComplete(requestId: string) {
  const invalidate = useInvalidateRequest(requestId);
  return useMutation({
    mutationFn: () => markRequestComplete(requestId),
    onSuccess: () => {
      invalidate();
      toast.success('Request marked complete.');
    },
    onError: onErrorToast,
  });
}

export function useCancelRequest(requestId: string) {
  const invalidate = useInvalidateRequest(requestId);
  return useMutation({
    mutationFn: () => cancelRequest(requestId),
    onSuccess: () => {
      invalidate();
      toast.success('Request cancelled.');
    },
    onError: onErrorToast,
  });
}

export function useNotifyRequest(requestId: string) {
  const invalidate = useInvalidateRequest(requestId);
  const track = useTrackEvent();
  return useMutation({
    mutationFn: (action: NotifyAction) => notifyRequest(requestId, action),
    onSuccess: (result, action) => {
      invalidate();
      if (action === 'reminder') {
        track('manual_reminder_sent', { requestId, emailSent: result.emailSent });
      }
      if (action === 'copy_link') {
        navigator.clipboard.writeText(result.url).then(
          () => toast.success('Upload link copied.'),
          () => toast.error(`Could not copy automatically — here it is: ${result.url}`),
        );
        return;
      }
      if (result.emailSent === false) {
        toast.error('The link was created, but this client has no email on file to send it to.');
        return;
      }
      toast.success(action === 'reminder' ? 'Reminder sent.' : 'Link resent.');
    },
    onError: onErrorToast,
  });
}

export function useSetReminderSkipped(requestId: string) {
  const invalidate = useInvalidateRequest(requestId);
  return useMutation({
    mutationFn: ({ reminderId, skipped }: { reminderId: string; skipped: boolean }) =>
      setReminderSkipped(reminderId, skipped),
    onSuccess: (_data, variables) => {
      invalidate();
      toast.success(variables.skipped ? 'Next reminder will be skipped.' : 'Next reminder re-enabled.');
    },
    onError: onErrorToast,
  });
}

export function useRemoveDocument(requestId: string) {
  const invalidate = useInvalidateRequest(requestId);
  return useMutation({
    mutationFn: (documentId: string) => removeDocument(documentId),
    onSuccess: () => {
      invalidate();
      toast.success('File removed.');
    },
    onError: onErrorToast,
  });
}

export function useSetRemindersPaused(requestId: string) {
  const invalidate = useInvalidateRequest(requestId);
  return useMutation({
    mutationFn: (paused: boolean) => setRemindersPaused(requestId, paused),
    onSuccess: (_data, paused) => {
      invalidate();
      toast.success(paused ? 'Automatic reminders paused.' : 'Automatic reminders resumed.');
    },
    onError: onErrorToast,
  });
}
