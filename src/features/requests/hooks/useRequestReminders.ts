import { useQuery } from '@tanstack/react-query';
import { listReminders } from '../api/requestDetailApi';

export function useRequestReminders(requestId: string | undefined) {
  return useQuery({
    queryKey: ['request-reminders', requestId],
    queryFn: () => listReminders(requestId!),
    enabled: Boolean(requestId),
  });
}
