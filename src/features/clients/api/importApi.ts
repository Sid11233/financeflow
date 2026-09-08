import { supabase } from '@/lib/supabase';
import type { ImportResult } from '../types';

export interface ImportRowInput {
  name: string;
  email: string;
  phone: string;
}

export async function bulkImportClients(
  organizationId: string,
  createdBy: string,
  rows: ImportRowInput[],
): Promise<ImportResult> {
  // De-duplicate by email within the batch itself (case-insensitive,
  // keeping the first occurrence) before it ever reaches the database.
  // ON CONFLICT DO NOTHING (below) handles rows that collide with an
  // *existing* client; this handles rows that only collide with each other
  // inside the same CSV.
  const seenEmails = new Set<string>();
  const deduped: ImportRowInput[] = [];
  const inBatchDuplicates: string[] = [];

  for (const row of rows) {
    const email = row.email.toLowerCase();
    if (seenEmails.has(email)) {
      inBatchDuplicates.push(email);
      continue;
    }
    seenEmails.add(email);
    deduped.push(row);
  }

  if (deduped.length === 0) {
    return { insertedCount: 0, duplicateEmails: [...new Set(inBatchDuplicates)] };
  }

  const payload = deduped.map((row) => ({
    organization_id: organizationId,
    created_by: createdBy,
    name: row.name,
    email: row.email.toLowerCase(),
    phone: row.phone || null,
  }));

  // INSERT ... ON CONFLICT (organization_id, email) DO NOTHING, in one
  // round trip: rows that already exist for this org are silently skipped
  // instead of failing the whole batch. RETURNING only reports rows that
  // were actually inserted, so the gap between what was sent and what came
  // back is exactly the set of duplicates.
  const { data, error } = await supabase
    .from('clients')
    .upsert(payload, { onConflict: 'organization_id,email', ignoreDuplicates: true })
    .select('email');

  if (error) throw error;

  const insertedEmails = new Set((data ?? []).map((row) => row.email));
  const dbDuplicates = payload.map((row) => row.email).filter((email) => !insertedEmails.has(email));

  return {
    insertedCount: insertedEmails.size,
    duplicateEmails: [...new Set([...inBatchDuplicates, ...dbDuplicates])],
  };
}
