import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { Skeleton } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { getNotificationStyle, NOTIFICATION_COLOR_CLASSES } from '@/lib/notifications';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationsList,
  useNotificationsRealtime,
  useUnreadNotificationCount,
} from '../hooks/useNotifications';
import type { NotificationRow } from '../api/notificationsApi';

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function NotificationBell() {
  const navigate = useNavigate();
  const { organization } = useAuth();
  const organizationId = organization?.id;

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useNotificationsRealtime(organizationId);
  const unreadQuery = useUnreadNotificationCount(organizationId);
  const listQuery = useNotificationsList(organizationId, open);
  const markReadMutation = useMarkNotificationRead(organizationId);
  const markAllReadMutation = useMarkAllNotificationsRead(organizationId);

  useEffect(() => {
    if (!open) return;

    function handleClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const unreadCount = unreadQuery.data ?? 0;
  const notifications = listQuery.data ?? [];

  function handleNotificationClick(notification: NotificationRow) {
    if (!notification.read_at) {
      markReadMutation.mutate(notification.id);
    }
    setOpen(false);
    if (notification.link_path) {
      navigate(notification.link_path);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-2 w-96 rounded-md border border-neutral-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
            <p className="text-sm font-semibold text-neutral-900">Notifications</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
                className="text-xs font-medium text-accent hover:underline disabled:opacity-50"
              >
                Mark all as read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {listQuery.isPending ? (
              <div className="space-y-3 p-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : notifications.length === 0 ? (
              <p className="p-6 text-center text-sm text-neutral-400">You're all caught up.</p>
            ) : (
              <ul>
                {notifications.map((notification) => {
                  const { icon: Icon, color } = getNotificationStyle(notification.type);
                  const colorClasses = NOTIFICATION_COLOR_CLASSES[color];
                  const isUnread = !notification.read_at;

                  return (
                    <li key={notification.id}>
                      <button
                        type="button"
                        onClick={() => handleNotificationClick(notification)}
                        className={cn(
                          'flex w-full items-start gap-3 border-b border-neutral-50 px-4 py-3 text-left last:border-b-0 hover:bg-neutral-50',
                          isUnread && 'bg-accent/5',
                        )}
                      >
                        <span
                          className={cn(
                            'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                            colorClasses.bg,
                          )}
                        >
                          <Icon className={cn('h-4 w-4', colorClasses.icon)} aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={cn('text-sm text-neutral-800', isUnread && 'font-semibold text-neutral-900')}>
                            {notification.title}
                          </p>
                          {notification.body && (
                            <p className="mt-0.5 truncate text-xs text-neutral-500">{notification.body}</p>
                          )}
                          <p className="mt-1 text-xs text-neutral-400">{formatTimestamp(notification.created_at)}</p>
                        </div>
                        {isUnread && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
