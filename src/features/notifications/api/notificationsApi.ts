import { supabase } from '@/lib/supabase';

const PANEL_PAGE_SIZE = 20;

export interface NotificationRow {
  id: string;
  organization_id: string;
  user_id: string | null;
  type: string;
  title: string;
  body: string | null;
  link_path: string | null;
  read_at: string | null;
  created_at: string;
}

// RLS already scopes this to the caller's organization and (user_id is
// null or user_id = auth.uid()) — the .eq('organization_id', ...) here is
// a relevance filter for multi-tenant callers of this client, not a
// security boundary on its own.
export async function listNotifications(organizationId: string): Promise<NotificationRow[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(PANEL_PAGE_SIZE);

  if (error) throw error;
  return data ?? [];
}

export async function countUnreadNotifications(organizationId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .is('read_at', null);

  if (error) throw error;
  return count ?? 0;
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .is('read_at', null);

  if (error) throw error;
}

export async function markAllNotificationsRead(organizationId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('organization_id', organizationId)
    .is('read_at', null);

  if (error) throw error;
}
