import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { requestChecklistQueryKey } from './useRequestChecklist';

// Subscribes to documents/required_documents changes for this request so a
// client upload (or an AI classification landing) shows up on the page
// without a refresh. Realtime respects RLS the same way PostgREST does, so
// this can't surface another organization's rows regardless of the
// request_id filter below — that filter is purely a relevance/efficiency
// narrowing, not a security boundary.
export function useRequestRealtime(requestId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!requestId) return;

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: requestChecklistQueryKey(requestId) });
      queryClient.invalidateQueries({ queryKey: ['request-detail', requestId] });
    };

    const channel = supabase
      .channel(`request-detail-${requestId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'documents', filter: `request_id=eq.${requestId}` },
        invalidate,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'required_documents', filter: `request_id=eq.${requestId}` },
        invalidate,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [requestId, queryClient]);
}
