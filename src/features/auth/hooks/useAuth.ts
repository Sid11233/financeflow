import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useSession } from './useSession';
import { signOut as signOutRequest } from '../api/authApi';

async function fetchProfile(userId: string) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

async function fetchOrganization(organizationId: string) {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', organizationId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export function useAuth() {
  const { session, isLoading: isSessionLoading } = useSession();
  const queryClient = useQueryClient();
  const userId = session?.user.id;

  const profileQuery = useQuery({
    queryKey: ['profile', userId],
    queryFn: () => fetchProfile(userId!),
    enabled: Boolean(userId),
    // Right after sign-up, the profile row lands via a DB trigger that can
    // trail the client's own signInWithPassword call by a beat. Poll while
    // it's missing rather than treating "no row yet" as a hard failure —
    // AuthGuard is what decides how long to keep showing a spinner for
    // this versus a "something's wrong" message; this just keeps trying.
    refetchInterval: (query) => (query.state.data ? false : 1000),
  });

  const organizationId = profileQuery.data?.organization_id;

  const organizationQuery = useQuery({
    queryKey: ['organization', organizationId],
    queryFn: () => fetchOrganization(organizationId!),
    enabled: Boolean(organizationId),
  });

  async function signOut() {
    await signOutRequest();
    queryClient.clear();
  }

  return {
    user: session?.user ?? null,
    profile: profileQuery.data ?? null,
    organization: organizationQuery.data ?? null,
    isLoading: isSessionLoading || (Boolean(userId) && profileQuery.isPending),
    signOut,
  };
}
