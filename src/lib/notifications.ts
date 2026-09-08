import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Link2Off,
  MailWarning,
  SearchCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// The full, closed set of notifications.type values — enforced at the
// database layer too (a CHECK constraint on the table, see
// 0039_notifications.sql). Unlike activity_log's event_type, a
// notification's title/body are already plain-language text written at
// creation time (see create_notification() call sites), so this vocabulary
// only drives which icon/color to show — there's no sentence to render.
export const NOTIFICATION_TYPES = [
  'request_submitted',
  'documents_need_review',
  'request_overdue',
  'email_bounced',
  'classification_failed',
  'link_expired',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export function isNotificationType(value: string): value is NotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

export type NotificationColor = 'neutral' | 'blue' | 'purple' | 'amber' | 'green' | 'red';

export const NOTIFICATION_COLOR_CLASSES: Record<NotificationColor, { icon: string; bg: string }> = {
  neutral: { icon: 'text-neutral-500', bg: 'bg-neutral-100' },
  blue: { icon: 'text-blue-600', bg: 'bg-blue-50' },
  purple: { icon: 'text-purple-600', bg: 'bg-purple-50' },
  amber: { icon: 'text-amber-600', bg: 'bg-amber-50' },
  green: { icon: 'text-emerald-600', bg: 'bg-emerald-50' },
  red: { icon: 'text-red-600', bg: 'bg-red-50' },
};

const NOTIFICATION_STYLE: Record<NotificationType, { icon: LucideIcon; color: NotificationColor }> = {
  request_submitted: { icon: CheckCircle2, color: 'green' },
  documents_need_review: { icon: SearchCheck, color: 'purple' },
  request_overdue: { icon: AlertTriangle, color: 'red' },
  email_bounced: { icon: MailWarning, color: 'red' },
  classification_failed: { icon: AlertTriangle, color: 'amber' },
  link_expired: { icon: Link2Off, color: 'amber' },
};

export function getNotificationStyle(type: string): { icon: LucideIcon; color: NotificationColor } {
  if (isNotificationType(type)) return NOTIFICATION_STYLE[type];
  return { icon: Bell, color: 'neutral' };
}
