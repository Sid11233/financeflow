import type { Session, User } from '@supabase/supabase-js';
import type { Enums, Tables } from '@/lib/database.types';

export type { Session, User };
export type UserRole = Enums<'user_role'>;
export type Profile = Tables<'profiles'>;
export type Organization = Tables<'organizations'>;
