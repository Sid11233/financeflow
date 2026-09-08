import { useState } from 'react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import type { BadgeProps } from '@/components/ui';
import { useDocumentPreview } from '@/features/documents/hooks/useDocumentPreview';
import { DocumentPreviewDialog } from '@/features/documents/components/DocumentPreviewDialog';
import { formatFileSize, formatUploadedBy } from '../../lib/reviewFormatting';
import { useRemoveDocument } from '../../hooks/useRequestActions';
import { WaiveReasonDialog } from './WaiveReasonDialog';
import type { ChecklistDocument, ChecklistRequiredDocument } from '../../types';
import type { useReviewQueueActions } from '../../hooks/useReviewQueueActions';

const STATUS_CONFIG: Record<ChecklistRequiredDocument['status'], { label: string; variant: BadgeProps['variant'] }> = {
  pending: { label: 'Pending', variant: 'neutral' },
  received: { label: 'Received', variant: 'accent' },
  needs_review: { label: 'Needs review', variant: 'warning' },
  accepted: { label: 'Accepted', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'danger' },
  waived: { label: 'Waived', variant: 'neutral' },
};

function formatUploadedAt(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function ChecklistFileRow({
  document,
  clientName,
  onPreview,
  onRemove,
}: {
  document: ChecklistDocument;
  clientName: string;
  onPreview: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-neutral-50 px-3 py-2 text-sm">
      <div className="min-w-0">
        <p className="truncate text-neutral-800">{document.original_filename}</p>
        <p className="text-xs text-neutral-400">
          {formatFileSize(document.size_bytes)} · {formatUploadedAt(document.uploaded_at)} ·{' '}
          {formatUploadedBy(document, clientName)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button size="sm" variant="ghost" onClick={onPreview}>
          Preview
        </Button>
        <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={onRemove}>
          Remove
        </Button>
      </div>
    </li>
  );
}

export function ChecklistPanel({
  requestId,
  requiredDocuments,
  documents,
  clientName,
  reviewActions,
}: {
  requestId: string;
  requiredDocuments: ChecklistRequiredDocument[];
  documents: ChecklistDocument[];
  clientName: string;
  reviewActions: ReturnType<typeof useReviewQueueActions>;
}) {
  const preview = useDocumentPreview();
  const removeDocument = useRemoveDocument(requestId);
  const [waiveTarget, setWaiveTarget] = useState<ChecklistRequiredDocument | null>(null);
  const previewDocument = documents.find((document) => document.id === preview.documentId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Checklist</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {requiredDocuments.length === 0 && <p className="text-sm text-neutral-400">No checklist items yet.</p>}

        {requiredDocuments.map((item) => {
          const itemDocuments = documents.filter((document) => document.required_document_id === item.id);
          const status = STATUS_CONFIG[item.status];
          const canWaive = item.status !== 'waived' && item.status !== 'accepted';

          return (
            <div key={item.id} className="space-y-2 border-b border-neutral-100 pb-4 last:border-0 last:pb-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-neutral-900">{item.label}</span>
                  {item.is_optional && <span className="text-xs text-neutral-400">(optional)</span>}
                  <Badge variant={status.variant}>{status.label}</Badge>
                </div>
                {canWaive && (
                  <Button size="sm" variant="ghost" onClick={() => setWaiveTarget(item)}>
                    Waive
                  </Button>
                )}
              </div>

              {item.status === 'waived' && (
                <p className="rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
                  {item.waived_reason ?? 'No reason given.'}
                </p>
              )}

              {itemDocuments.length > 0 && (
                <ul className="space-y-1.5">
                  {itemDocuments.map((document) => (
                    <ChecklistFileRow
                      key={document.id}
                      document={document}
                      clientName={clientName}
                      onPreview={() => preview.open(document.id)}
                      onRemove={() => removeDocument.mutate(document.id)}
                    />
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </CardContent>

      {previewDocument && (
        <DocumentPreviewDialog preview={preview} filename={previewDocument.original_filename} mimeType={previewDocument.mime_type} />
      )}

      <WaiveReasonDialog
        open={waiveTarget !== null}
        onClose={() => setWaiveTarget(null)}
        itemLabel={waiveTarget?.label ?? ''}
        onConfirm={(reason) => {
          if (waiveTarget) reviewActions.waive(waiveTarget.id, waiveTarget.label, reason);
          setWaiveTarget(null);
        }}
      />
    </Card>
  );
}
