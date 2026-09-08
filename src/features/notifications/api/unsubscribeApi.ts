import { supabase } from '@/lib/supabase';

export async function unsubscribeFromDigest(token: string): Promise<void> {
  const { error } = await supabase.functions.invoke('digest-unsubscribe', { body: { token } });
  if (error) throw error;
}
