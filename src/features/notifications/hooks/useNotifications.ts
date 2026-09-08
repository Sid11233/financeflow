import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  countUnreadNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../api/notificationsApi';

function unreadCountKey(organizationId: string | undefined) {
  return ['notifications-unread-count', organizationId];
}

function listKey(organizationId: string | undefined) {
  return ['notifications-list', organizationId];
}

export function useUnreadNotificationCount(organizationId: string | undefined) {
  return useQuery({
    queryKey: unreadCountKey(organizationId),
    queryFn: () => countUnreadNotifications(organizationId!),
    enabled: Boolean(organizationId),
  });
}

export function useNotificationsList(organizationId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: listKey(organizationId),
    queryFn: () => listNotifications(organizationId!),
    enabled: Boolean(organizationId) && enabled,
  });
}

// One realtime channel, subscribed as soon as the organization is known
// (not gated on the panel being open) so the bell's unread badge updates
// live even while the panel is closed.
export function useNotificationsRealtime(organizationId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!organizationId) return;

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: unreadCountKey(organizationId) });
      queryClient.invalidateQueries({ queryKey: listKey(organizationId) });
    };

    const channel = supabase
      .channel(`notifications-${organizationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `organization_id=eq.${organizationId}` },
        invalidate,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [organizationId, queryClient]);
}

export function useMarkNotificationRead(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: unreadCountKey(organizationId) });
      queryClient.invalidateQueries({ queryKey: listKey(organizationId) });
    },
  });
}

export function useMarkAllNotificationsRead(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => markAllNotificationsRead(organizationId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: unreadCountKey(organizationId) });
      queryClient.invalidateQueries({ queryKey: listKey(organizationId) });
    },
  });
}
