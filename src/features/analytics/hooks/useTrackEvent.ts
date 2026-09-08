import { useCallback } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { trackProductEvent } from '../api/eventTracker';
import type { ProductEventType } from '../types';

// The one call site every instrumented action goes through. Silently
// no-ops before auth resolves (organization not loaded yet) rather than
// queuing — none of the five tracked actions (see types.ts) are reachable
// before that point anyway.
export function useTrackEvent() {
  const { organization, profile } = useAuth();
  const organizationId = organization?.id;
  const actorId = profile?.id ?? null;

  return useCallback(
    (eventType: ProductEventType, payload?: Record<string, unknown>) => {
      if (!organizationId) return;
      void trackProductEvent({ organizationId, actorId, eventType, payload });
    },
    [organizationId, actorId],
  );
}
