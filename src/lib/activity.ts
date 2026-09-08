import {
  AlertTriangle,
  ArrowLeftRight,
  Ban,
  Bell,
  BellOff,
  CalendarClock,
  CheckCircle2,
  CircleSlash2,
  FilePlus2,
  Link2Off,
  MousePointerClick,
  RotateCw,
  Send,
  Sparkles,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// The full, closed set of activity_log.event_type values — enforced at
// the database layer too (a CHECK constraint on the table, see
// 0038_activity_log_engine.sql), so this union and the DB can't drift
// apart silently. Every trigger and Edge Function writes through
// log_activity(), which only accepts these.
export const ACTIVITY_EVENT_TYPES = [
  'request_created',
  'request_sent',
  'link_opened',
  'document_uploaded',
  'document_classified',
  'document_reassigned',
  'document_rejected',
  'document_removed',
  'item_waived',
  'reminder_sent',
  'reminder_skipped',
  'reminder_failed',
  'deadline_extended',
  'request_submitted',
  'request_completed',
  'request_cancelled',
  'link_resent',
  'link_expired',
] as const;

export type ActivityEventType = (typeof ACTIVITY_EVENT_TYPES)[number];

export function isActivityEventType(value: string): value is ActivityEventType {
  return (ACTIVITY_EVENT_TYPES as readonly string[]).includes(value);
}

export type ActivityColor = 'neutral' | 'blue' | 'purple' | 'amber' | 'green' | 'red';

export const ACTIVITY_COLOR_CLASSES: Record<ActivityColor, { icon: string; bg: string }> = {
  neutral: { icon: 'text-neutral-500', bg: 'bg-neutral-100' },
  blue: { icon: 'text-blue-600', bg: 'bg-blue-50' },
  purple: { icon: 'text-purple-600', bg: 'bg-purple-50' },
  amber: { icon: 'text-amber-600', bg: 'bg-amber-50' },
  green: { icon: 'text-emerald-600', bg: 'bg-emerald-50' },
  red: { icon: 'text-red-600', bg: 'bg-red-50' },
};

const EVENT_STYLE: Record<ActivityEventType, { icon: LucideIcon; color: ActivityColor }> = {
  request_created: { icon: FilePlus2, color: 'neutral' },
  request_sent: { icon: Send, color: 'blue' },
  link_opened: { icon: MousePointerClick, color: 'neutral' },
  document_uploaded: { icon: Upload, color: 'blue' },
  document_classified: { icon: Sparkles, color: 'purple' },
  document_reassigned: { icon: ArrowLeftRight, color: 'amber' },
  document_rejected: { icon: XCircle, color: 'red' },
  document_removed: { icon: Trash2, color: 'red' },
  item_waived: { icon: CircleSlash2, color: 'neutral' },
  reminder_sent: { icon: Bell, color: 'blue' },
  reminder_skipped: { icon: BellOff, color: 'neutral' },
  reminder_failed: { icon: AlertTriangle, color: 'red' },
  deadline_extended: { icon: CalendarClock, color: 'amber' },
  request_submitted: { icon: CheckCircle2, color: 'green' },
  request_completed: { icon: CheckCircle2, color: 'green' },
  request_cancelled: { icon: Ban, color: 'red' },
  link_resent: { icon: RotateCw, color: 'blue' },
  link_expired: { icon: Link2Off, color: 'amber' },
};

export function getEventStyle(eventType: string): { icon: LucideIcon; color: ActivityColor } {
  if (isActivityEventType(eventType)) return EVENT_STYLE[eventType];
  return { icon: Sparkles, color: 'neutral' };
}

export interface ActivityEntry {
  event_type: string;
  payload: Record<string, unknown>;
  actor_type: 'accountant' | 'client' | 'system';
}

export interface ActivityRenderContext {
  actorName: string;
  clientName: string;
  resolveRequiredDocumentLabel: (id: string | null | undefined) => string;
}

function str(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' ? value : null;
}

function num(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key];
  return typeof value === 'number' ? value : null;
}

function confidencePct(payload: Record<string, unknown>): string | null {
  const confidence = num(payload, 'confidence');
  return confidence === null ? null : `${Math.round(confidence * 100)}%`;
}

function formatDate(isoDate: string | null): string {
  if (!isoDate) return 'an unknown date';
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

// Turns one activity_log row into a single, specific, plain-language
// sentence — e.g. "System moved invoice123.pdf to Purchase Invoices (95%
// confident)" rather than a generic "Document reclassified". Every branch
// below reads directly from the payload each event's writer actually
// produces (see log_activity call sites); a field that isn't there for a
// particular row degrades gracefully rather than rendering "undefined".
export function formatActivitySentence(entry: ActivityEntry, context: ActivityRenderContext): string {
  const { actorName, clientName, resolveRequiredDocumentLabel } = context;
  const actor = entry.actor_type === 'system' ? 'System' : actorName;
  const payload = entry.payload;
  const filename = str(payload, 'original_filename') ?? 'a file';

  switch (entry.event_type as ActivityEventType) {
    case 'request_created':
      return `${actor} created this request for ${str(payload, 'period_label') ?? 'this period'}.`;
    case 'request_sent':
      return `${actor} sent this request to ${clientName}.`;
    case 'link_opened':
      return `${clientName} opened their upload link for the first time.`;
    case 'document_uploaded':
      return `${clientName} uploaded ${filename}.`;
    case 'document_classified': {
      const outcome = str(payload, 'outcome');
      const confidence = confidencePct(payload);
      const detected = str(payload, 'document_type_label') ?? str(payload, 'document_type');
      if (outcome === 'confirmed_by_accountant') {
        return `${actor} confirmed ${filename} as correct.`;
      }
      if (outcome === 'needs_review') {
        const flag = str(payload, 'flag');
        if (flag === 'manual_review_only') return `${filename} needs manual review — automatic classification is turned off.`;
        if (flag === 'unreadable') return `System could not read ${filename} clearly enough to classify it.`;
        if (flag === 'wrong_period') {
          return `System flagged ${filename} for review — detected ${detected ?? 'a document'} for the wrong period.`;
        }
        return `System flagged ${filename} for review${confidence ? ` (${confidence} confident)` : ''}.`;
      }
      if (outcome === 'unparseable') {
        return `System could not classify ${filename} — the AI response wasn't usable.`;
      }
      return `System classified ${filename} as ${detected ?? 'a document'}${confidence ? ` (${confidence} confident)` : ''}.`;
    }
    case 'document_reassigned': {
      const to = resolveRequiredDocumentLabel(str(payload, 'to_required_document_id'));
      const confidence = confidencePct(payload);
      return `${actor} moved ${filename} to ${to}${confidence ? ` (${confidence} confident)` : ''}.`;
    }
    case 'document_rejected':
      return `${actor} rejected ${filename}.`;
    case 'document_removed':
      return `${actor} removed ${filename}.`;
    case 'item_waived': {
      const label = resolveRequiredDocumentLabel(str(payload, 'required_document_id'));
      const reason = str(payload, 'reason');
      return `${actor} waived ${label}${reason ? ` — "${reason}"` : ''}.`;
    }
    case 'reminder_sent':
      return `System sent a reminder to ${clientName}.`;
    case 'reminder_skipped': {
      const reason = str(payload, 'reason');
      const reasonText =
        reason === 'request_complete'
          ? 'the request was already complete'
          : reason === 'request_cancelled'
            ? 'the request was cancelled'
            : reason === 'daily_cap_reached'
              ? `${clientName} already had a reminder today`
              : (reason ?? 'it was no longer needed');
      return `System skipped a scheduled reminder — ${reasonText}.`;
    }
    case 'reminder_failed':
      return `System could not send a reminder to ${clientName} after multiple attempts.`;
    case 'deadline_extended': {
      const newDeadline = str(payload, 'new_deadline');
      return `${actor} extended the deadline to ${formatDate(newDeadline)}.`;
    }
    case 'request_submitted':
      return `${clientName} marked their documents as submitted.`;
    case 'request_completed':
      return `This request is now complete.`;
    case 'request_cancelled':
      return `${actor} cancelled this request.`;
    case 'link_resent':
      return `${actor} resent the upload link to ${clientName}.`;
    case 'link_expired':
      return `${clientName} tried to use an upload link that no longer works.`;
    default:
      return `${actor} ${entry.event_type.replace(/_/g, ' ')}.`;
  }
}
