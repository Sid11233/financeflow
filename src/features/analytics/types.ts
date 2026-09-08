// Closed vocabulary, enforced in two places — this union and the
// product_events_event_type_check CHECK constraint (0041_pilot_analytics.sql)
// — same pattern as src/lib/activity.ts's ACTIVITY_EVENT_TYPES. This is
// product-usage telemetry, not audit history: it answers "how is the
// product being used", not "what happened to this request."
export const PRODUCT_EVENT_TYPES = [
  'request_created',
  'bulk_request_created',
  'manual_reminder_sent',
  'review_action',
  'deadline_extended',
] as const;

export type ProductEventType = (typeof PRODUCT_EVENT_TYPES)[number];
