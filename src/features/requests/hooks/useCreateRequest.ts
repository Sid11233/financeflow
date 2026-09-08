import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sendRequest } from '../api/sendRequestApi';
import type { SendRequestInput } from '../api/sendRequestApi';
import { toast } from '@/lib/toast';
import { useTrackEvent } from '@/features/analytics/hooks/useTrackEvent';

// Used by the single-request wizard only. The bulk page calls sendRequest()
// directly instead of this hook — toasting once per client in a 50-client
// batch would be noisy, and the bulk page already has its own dedicated
// progress bar and per-client results table (and tracks its own
// bulk_request_created event rather than one request_created per row).
export function useCreateRequest() {
  const queryClient = useQueryClient();
  const track = useTrackEvent();

  return useMutation({
    mutationFn: (input: SendRequestInput) => sendRequest(input),
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['request-overview'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['clients-with-request'] });
      track('request_created', { status: variables.status });
      if (variables.status === 'draft') {
        toast.success('Request saved as draft');
      } else if (result.emailSent === false) {
        toast.error('Request created, but the email failed to send.');
      } else {
        toast.success('Request sent');
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not create this request.');
    },
  });
}
