/**
 * Browser Supabase client.
 *
 * SECURITY: This module is bundled into client-side JavaScript and shipped
 * to every visitor's browser. It must only ever hold the Supabase project
 * URL and the anon/public key, both of which are meant to be public and are
 * safe to expose as long as Row Level Security policies are correctly
 * configured on every table.
 *
 * NEVER add any of the following to this file, or to any other file that
 * ends up in the client bundle:
 *   - the Supabase service-role key (bypasses Row Level Security entirely)
 *   - database connection strings / direct Postgres credentials
 *   - third-party API keys or secrets (Stripe secret key, email provider
 *     keys, etc.)
 *
 * Anything with elevated privileges belongs in a server-side context only
 * (a Supabase Edge Function, a backend service, etc.), never here.
 *
 * Typed against src/lib/database.types.ts, hand-authored to mirror
 * supabase/migrations/. Regenerate it from a live project with:
 *   npx supabase gen types typescript --project-id <id> > src/lib/database.types.ts
 */
import { createClient } from '@supabase/supabase-js';
import { env } from './env';
import type { Database } from './database.types';

export const supabase = createClient<Database>(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
