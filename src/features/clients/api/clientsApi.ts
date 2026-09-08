import { supabase } from '@/lib/supabase';
import type { ClientsPage } from '../types';

export const CLIENTS_PAGE_SIZE = 20;

export interface ListClientsParams {
  organizationId: string;
  search: string;
  showArchived: boolean;
  page: number;
  bouncedOnly?: boolean;
}

export async function listClients({
  organizationId,
  search,
  showArchived,
  page,
  bouncedOnly,
}: ListClientsParams): Promise<ClientsPage> {
  const from = page * CLIENTS_PAGE_SIZE;
  const to = from + CLIENTS_PAGE_SIZE - 1;

  let query = supabase
    .from('client_overview')
    .select('*', { count: 'exact' })
    .eq('organization_id', organizationId)
    .order('name', { ascending: true })
    .range(from, to);

  if (!showArchived) {
    query = query.eq('is_archived', false);
  }

  if (bouncedOnly) {
    query = query.not('email_bounced_at', 'is', null);
  }

  const trimmedSearch = search.trim();
  if (trimmedSearch) {
    const term = `%${trimmedSearch}%`;
    query = query.or(`name.ilike.${term},email.ilike.${term}`);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  return { rows: data ?? [], total: count ?? 0, pageSize: CLIENTS_PAGE_SIZE };
}

export async function getClientWithDefaults(id: string) {
  const [clientResult, defaultsResult] = await Promise.all([
    supabase.from('clients').select('*').eq('id', id).single(),
    supabase.from('client_document_defaults').select('document_type_id').eq('client_id', id),
  ]);

  if (clientResult.error) throw clientResult.error;
  if (defaultsResult.error) throw defaultsResult.error;

  return {
    client: clientResult.data,
    defaultDocumentTypeIds: (defaultsResult.data ?? []).map((row) => row.document_type_id),
  };
}

export async function listClientRequestHistory(clientId: string) {
  const { data, error } = await supabase
    .from('request_overview')
    .select('*')
    .eq('client_id', clientId)
    .order('period_start', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listDocumentTypes(organizationId: string) {
  const { data, error } = await supabase
    .from('document_types')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('is_archived', false)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export interface SaveClientInput {
  organizationId: string;
  createdBy: string;
  name: string;
  email: string;
  phone?: string;
  notes?: string;
  defaultDocumentTypeIds: string[];
}

export async function createClient(input: SaveClientInput) {
  const { data: client, error } = await supabase
    .from('clients')
    .insert({
      organization_id: input.organizationId,
      created_by: input.createdBy,
      name: input.name,
      email: input.email.toLowerCase(),
      phone: input.phone || null,
      notes: input.notes || null,
    })
    .select()
    .single();

  if (error) throw error;

  await syncDocumentDefaults(client.id, input.organizationId, input.defaultDocumentTypeIds);
  return client;
}

export interface UpdateClientInput extends SaveClientInput {
  id: string;
}

export async function updateClient(input: UpdateClientInput) {
  const { data: client, error } = await supabase
    .from('clients')
    .update({
      name: input.name,
      email: input.email.toLowerCase(),
      phone: input.phone || null,
      notes: input.notes || null,
    })
    .eq('id', input.id)
    .select()
    .single();

  if (error) throw error;

  await syncDocumentDefaults(input.id, input.organizationId, input.defaultDocumentTypeIds);
  return client;
}

async function syncDocumentDefaults(clientId: string, organizationId: string, documentTypeIds: string[]) {
  const { error: deleteError } = await supabase
    .from('client_document_defaults')
    .delete()
    .eq('client_id', clientId);
  if (deleteError) throw deleteError;

  if (documentTypeIds.length === 0) return;

  const { error: insertError } = await supabase.from('client_document_defaults').insert(
    documentTypeIds.map((documentTypeId) => ({
      organization_id: organizationId,
      client_id: clientId,
      document_type_id: documentTypeId,
    })),
  );
  if (insertError) throw insertError;
}

export async function archiveClient(id: string) {
  const { error } = await supabase.from('clients').update({ is_archived: true }).eq('id', id);
  if (error) throw error;
}

export async function unarchiveClient(id: string) {
  const { error } = await supabase.from('clients').update({ is_archived: false }).eq('id', id);
  if (error) throw error;
}
