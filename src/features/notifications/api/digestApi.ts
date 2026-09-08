import { supabase } from '@/lib/supabase';

export type DigestFrequency = 'off' | 'daily' | 'weekly';

export async function updateDigestFrequency(userId: string, frequency: DigestFrequency): Promise<void> {
  const { error } = await supabase.from('profiles').update({ digest_frequency: frequency }).eq('id', userId);
  if (error) throw error;
}
