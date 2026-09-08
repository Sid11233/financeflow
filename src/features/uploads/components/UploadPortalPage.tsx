import { useParams } from 'react-router-dom';
import { FunctionsFetchError } from '@supabase/supabase-js';
import { usePortalResolve } from '../hooks/usePortalResolve';
import { LoadingSkeleton } from './LoadingSkeleton';
import { InvalidLinkState } from './InvalidLinkState';
import { NetworkErrorState } from './NetworkErrorState';
import { ValidPortalView } from './ValidPortalView';

export function UploadPortalPage() {
  const { token = '' } = useParams<{ token: string }>();
  const query = usePortalResolve(token);

  if (query.isPending) return <LoadingSkeleton />;

  if (query.isError) {
    // A network-level failure (offline, DNS, etc.) never reaches the Edge
    // Function at all — FunctionsFetchError specifically. Anything else
    // (including every "invalid or expired" case) is a real HTTP response,
    // handled the same generic way regardless of which of the underlying
    // reasons caused it — see the comment in _shared/portalAuth.ts.
    if (query.error instanceof FunctionsFetchError) {
      return <NetworkErrorState onRetry={() => query.refetch()} />;
    }
    return <InvalidLinkState token={token} />;
  }

  return <ValidPortalView token={token} data={query.data} onRefresh={() => query.refetch()} />;
}
