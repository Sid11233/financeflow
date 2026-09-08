import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getRequestChecklist } from '../api/requestDetailApi';
import { useDocumentTypes } from '@/features/clients/hooks/useDocumentTypes';
import type { ChecklistRequiredDocument } from '../types';

export const requestChecklistQueryKey = (requestId: string | undefined) => ['request-checklist', requestId];

// Merges required_documents with document_types (for the display label)
// and documents (the files uploaded against each item). Both
// required_documents and documents are re-fetched together under one
// query key so a single realtime invalidation (useRequestRealtime) can
// refresh everything the checklist and review queue read from.
export function useRequestChecklist(requestId: string | undefined, organizationId: string | undefined) {
  const checklistQuery = useQuery({
    queryKey: requestChecklistQueryKey(requestId),
    queryFn: () => getRequestChecklist(requestId!),
    enabled: Boolean(requestId),
  });
  const documentTypesQuery = useDocumentTypes(organizationId);

  const requiredDocuments = useMemo<ChecklistRequiredDocument[]>(() => {
    if (!checklistQuery.data) return [];
    const typesById = new Map((documentTypesQuery.data ?? []).map((type) => [type.id, type.name]));
    return checklistQuery.data.requiredDocuments.map((row) => ({
      ...row,
      label: (row.document_type_id && typesById.get(row.document_type_id)) || row.custom_name || 'Document',
    }));
  }, [checklistQuery.data, documentTypesQuery.data]);

  const documents = checklistQuery.data?.documents ?? [];

  return {
    requiredDocuments,
    documents,
    isPending: checklistQuery.isPending || documentTypesQuery.isPending,
    isError: checklistQuery.isError || documentTypesQuery.isError,
  };
}
