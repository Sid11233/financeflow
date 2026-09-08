import { supabase } from '@/lib/supabase';
import type { Json } from '@/lib/database.types';
import type { ProductEventType } from '../types';

// Fire-and-forget by design: a product-analytics write must never surface
// an error to the user or block the action it's describing. If this
// fails, we lose one data point, not a request/reminder/review action —
// those already committed before this is ever called.
export async function trackProductEvent(params: {
  organizationId: string;
  actorId: string | null;
  eventType: ProductEventType;
  payload?: Record<string, unknown>;
}): Promise<void> {
  try {
    // Deliberately no .select() chained — product_events has no SELECT
    // RLS policy for ordinary users (only staff can read it back, via the
    // analytics_* views), so supabase-js's default return=minimal insert
    // is required here. Chaining .select() (or anything requesting the
    // row back) would make Postgres evaluate the SELECT policy on the
    // just-inserted row and fail with "new row violates row-level
    // security policy" even though the insert itself is fully permitted —
    // confirmed empirically while building this.
    await supabase.from('product_events').insert({
      organization_id: params.organizationId,
      actor_id: params.actorId,
      event_type: params.eventType,
      payload: (params.payload ?? {}) as Json,
    });
  } catch {
    // best-effort — see comment above.
  }
}
