import type { Database } from '@/lib/database.types';

export type TeamMember = Database['public']['Functions']['list_org_members']['Returns'][number];
export type Invite = Database['public']['Tables']['invites']['Row'];
