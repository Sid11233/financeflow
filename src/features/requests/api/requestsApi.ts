import { supabase } from '@/lib/supabase';
import type { ClientOption } from '../types';

export async function listActiveClientOptions(organizationId: string): Promise<ClientOption[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('id, name, email')
    .eq('organization_id', organizationId)
    .eq('is_archived', false)
    .order('name', { ascending: true })
    .limit(500);

  if (error) throw error;
  return data ?? [];
}

export async function getClientDefaultDocumentTypeIds(clientId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('client_document_defaults')
    .select('document_type_id')
    .eq('client_id', clientId);

  if (error) throw error;
  return (data ?? []).map((row) => row.document_type_id);
}

export async function listClientIdsWithRequestForPeriod(
  organizationId: string,
  periodStart: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('requests')
    .select('client_id')
    .eq('organization_id', organizationId)
    .eq('period_start', periodStart)
    .neq('status', 'cancelled');

  if (error) throw error;
  return new Set((data ?? []).map((row) => row.client_id));
}

export async function listBulkClientDefaults(organizationId: string): Promise<Record<string, string[]>> {
  const { data, error } = await supabase
    .from('client_document_defaults')
    .select('client_id, document_type_id')
    .eq('organization_id', organizationId);

  if (error) throw error;

  const map: Record<string, string[]> = {};
  for (const row of data ?? []) {
    (map[row.client_id] ??= []).push(row.document_type_id);
  }
  return map;
}
