import { useEffect, useState } from 'react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, DropdownMenu, DropdownMenuItem } from '@/components/ui';
import { cn } from '@/lib/utils';
import { getDocumentUrl } from '@/features/documents/api/documentsApi';
import { getPreviewKind } from '@/features/documents/hooks/useDocumentPreview';
import { formatAiVerdict, getConfidenceLabel } from '../../lib/reviewFormatting';
import { RejectDialog } from './RejectDialog';
import type { ChecklistDocument, ChecklistRequiredDocument } from '../../types';
import type { useReviewQueueActions } from '../../hooks/useReviewQueueActions';

const CONFIDENCE_BADGE_VARIANT = { High: 'success', Medium: 'warning', Low: 'danger' } as const;

function InlinePreview({ document }: { document: ChecklistDocument }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setError(false);
    getDocumentUrl(document.id).then(
      (result) => {
        if (!cancelled) setUrl(result.url);
      },
      () => {
        if (!cancelled) setError(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [document.id]);

  const kind = getPreviewKind(document.mime_type);

  if (error) {
    return <p className="flex h-40 items-center justify-center text-sm text-red-500">Could not load preview.</p>;
  }
  if (!url) {
    return <div className="h-40 animate-pulse rounded-md bg-neutral-100" />;
  }
  if (kind === 'pdf') {
    return <iframe src={url} title={document.original_filename} className="h-56 w-full rounded-md border border-neutral-200" />;
  }
  if (kind === 'image') {
    return (
      <img
        src={url}
        alt={document.original_filename}
        className="h-56 w-full rounded-md border border-neutral-200 object-contain"
      />
    );
  }
  return (
    <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-md border border-neutral-200 text-sm text-neutral-500">
      <span>Preview not available for this file type.</span>
      <a href={url} target="_blank" rel="noopener noreferrer" className="text-accent underline">
        Open {document.original_filename}
      </a>
    </div>
  );
}

interface QueueCardProps {
  document: ChecklistDocument;
  requiredDocuments: ChecklistRequiredDocument[];
  requestPeriodLabel: string;
  isFocused: boolean;
  onFocus: () => void;
  onOpenReject: () => void;
  reviewActions: ReturnType<typeof useReviewQueueActions>;
}

function ReviewQueueCard({
  document,
  requiredDocuments,
  requestPeriodLabel,
  isFocused,
  onFocus,
  onOpenReject,
  reviewActions,
}: QueueCardProps) {
  const current = requiredDocuments.find((item) => item.id === document.required_document_id);
  const expectedLabel = current?.label ?? 'this item';
  const confidence = getConfidenceLabel(document.ai_confidence);
  const otherItems = requiredDocuments.filter((item) => item.id !== document.required_document_id);

  return (
    <div
      className={cn(
        'space-y-3 rounded-lg border p-4 transition-shadow',
        isFocused ? 'border-accent ring-2 ring-accent' : 'border-neutral-200',
      )}
      onClick={onFocus}
      tabIndex={-1}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-neutral-900">{document.original_filename}</p>
          <p className="text-xs text-neutral-400">Checklist item: {expectedLabel}</p>
        </div>
        {confidence && <Badge variant={CONFIDENCE_BADGE_VARIANT[confidence]}>{confidence} confidence</Badge>}
      </div>

      <InlinePreview document={document} />

      <p className="text-sm text-neutral-700">{formatAiVerdict(document, expectedLabel, requestPeriodLabel)}</p>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => reviewActions.accept(document.id, document.original_filename)}
        >
          Accept
        </Button>
        <DropdownMenu trigger={<span className="inline-flex h-8 items-center rounded-md border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-900 hover:bg-neutral-50">Reassign to…</span>}>
          {otherItems.length === 0 && (
            <span className="block px-3 py-1.5 text-sm text-neutral-400">No other items</span>
          )}
          {otherItems.map((item) => (
            <DropdownMenuItem
              key={item.id}
              onClick={() => reviewActions.reassign(document.id, document.original_filename, item.label, item.id)}
            >
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenu>
        <Button size="sm" variant="outline" onClick={onOpenReject}>
          Reject &amp; ask for new copy
        </Button>
        {current && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              reviewActions.waive(current.id, current.label, 'Waived by accountant from review queue', document.id)
            }
          >
            Waive this item
          </Button>
        )}
      </div>
    </div>
  );
}

export function ReviewQueuePanel({
  documents,
  requiredDocuments,
  requestPeriodLabel,
  clientEmail,
  organizationId,
  reviewActions,
}: {
  documents: ChecklistDocument[];
  requiredDocuments: ChecklistRequiredDocument[];
  requestPeriodLabel: string;
  clientEmail: string | null;
  organizationId: string;
  reviewActions: ReturnType<typeof useReviewQueueActions>;
}) {
  const queueItems = documents.filter((document) => document.review_status === 'unreviewed' && !reviewActions.isPending(document.id));
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);

  useEffect(() => {
    if (queueItems.length === 0) {
      setFocusedId(null);
      return;
    }
    if (!focusedId || !queueItems.some((item) => item.id === focusedId)) {
      setFocusedId(queueItems[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueItems.map((item) => item.id).join(',')]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;
      if (queueItems.length === 0) return;

      const index = queueItems.findIndex((item) => item.id === focusedId);

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setFocusedId(queueItems[Math.min(index + 1, queueItems.length - 1)].id);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setFocusedId(queueItems[Math.max(index - 1, 0)].id);
      } else if (event.key.toLowerCase() === 'a' && index >= 0) {
        reviewActions.accept(queueItems[index].id, queueItems[index].original_filename);
      } else if (event.key.toLowerCase() === 'r' && index >= 0) {
        // Reject opens the pre-filled-message dialog rather than firing
        // instantly — the only review action that isn't optimistic/instant,
        // since it needs a human-composed message before it can send.
        setRejectTargetId(queueItems[index].id);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [queueItems, focusedId, reviewActions]);

  if (queueItems.length === 0) return null;

  const rejectTarget = queueItems.find((item) => item.id === rejectTargetId);
  const rejectTargetLabel =
    requiredDocuments.find((item) => item.id === rejectTarget?.required_document_id)?.label ?? 'this item';

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Needs your review ({queueItems.length})</CardTitle>
        <p className="text-xs text-neutral-400">↑↓ navigate · A accept · R reject</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {queueItems.map((document) => (
          <ReviewQueueCard
            key={document.id}
            document={document}
            requiredDocuments={requiredDocuments}
            requestPeriodLabel={requestPeriodLabel}
            isFocused={document.id === focusedId}
            onFocus={() => setFocusedId(document.id)}
            onOpenReject={() => setRejectTargetId(document.id)}
            reviewActions={reviewActions}
          />
        ))}
      </CardContent>

      {rejectTarget && (
        <RejectDialog
          open
          onClose={() => setRejectTargetId(null)}
          filename={rejectTarget.original_filename}
          checklistLabel={rejectTargetLabel}
          clientEmail={clientEmail}
          organizationId={organizationId}
          requestId={rejectTarget.request_id}
          onConfirm={(reason) => reviewActions.reject(rejectTarget.id, rejectTarget.original_filename, reason)}
        />
      )}
    </Card>
  );
}
