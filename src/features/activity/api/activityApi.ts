import { supabase } from '@/lib/supabase';

export interface ActivityLogRow {
  id: string;
  organization_id: string;
  request_id: string | null;
  client_id: string | null;
  actor_type: 'accountant' | 'client' | 'system';
  actor_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface ActivityFilters {
  organizationId: string;
  requestId?: string;
  clientId?: string;
  eventTypes?: string[];
  dateFrom?: string;
  dateTo?: string;
}

export interface ActivityPage {
  rows: ActivityLogRow[];
  nextCursor: string | null;
  clientNamesById: Record<string, string>;
  requiredDocumentLabelsById: Record<string, string>;
}

const PAGE_SIZE = 30;

function extractRequiredDocumentIds(rows: ActivityLogRow[]): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    const directId = row.payload.required_document_id;
    if (typeof directId === 'string') ids.add(directId);
    const targetId = row.payload.to_required_document_id;
    if (typeof targetId === 'string') ids.add(targetId);
  }
  return [...ids];
}

// Client names and required-document labels are resolved per page (bounded
// to whatever request/client ids actually appear in these ~30 rows) rather
// than joined in SQL — request-scoped and client-scoped feeds already know
// this from context, but the organization-wide feed spans many requests
// and clients, and a per-page batched lookup is simple and cheap without
// needing a wider, unbounded join.
export async function listActivityPage(filters: ActivityFilters, cursor: string | null): Promise<ActivityPage> {
  let query = supabase
    .from('activity_log')
    .select('*')
    .eq('organization_id', filters.organizationId)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE);

  if (filters.requestId) query = query.eq('request_id', filters.requestId);
  if (filters.clientId) query = query.eq('client_id', filters.clientId);
  if (filters.eventTypes && filters.eventTypes.length > 0) query = query.in('event_type', filters.eventTypes);
  if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom);
  if (filters.dateTo) query = query.lte('created_at', filters.dateTo);
  if (cursor) query = query.lt('created_at', cursor);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as ActivityLogRow[];
  const nextCursor = rows.length === PAGE_SIZE ? rows[rows.length - 1].created_at : null;

  const clientIds = [...new Set(rows.map((row) => row.client_id).filter((id): id is string => Boolean(id)))];
  const requiredDocumentIds = extractRequiredDocumentIds(rows);

  const [clientsResult, requiredDocumentsResult] = await Promise.all([
    clientIds.length > 0
      ? supabase.from('clients').select('id, name').in('id', clientIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    requiredDocumentIds.length > 0
      ? supabase.from('required_documents').select('id, custom_name, document_types(name)').in('id', requiredDocumentIds)
      : Promise.resolve({ data: [] as { id: string; custom_name: string | null; document_types: unknown }[] }),
  ]);

  const clientNamesById: Record<string, string> = {};
  for (const client of clientsResult.data ?? []) clientNamesById[client.id] = client.name;

  const requiredDocumentLabelsById: Record<string, string> = {};
  for (const item of requiredDocumentsResult.data ?? []) {
    const documentType = item.document_types as unknown as { name: string } | null;
    requiredDocumentLabelsById[item.id] = documentType?.name ?? item.custom_name ?? 'Document';
  }

  return { rows, nextCursor, clientNamesById, requiredDocumentLabelsById };
}

export interface ActivityClientOption {
  id: string;
  name: string;
}

export async function listClientOptions(organizationId: string): Promise<ActivityClientOption[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('id, name')
    .eq('organization_id', organizationId)
    .order('name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}
