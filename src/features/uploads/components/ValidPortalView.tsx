import { useMemo, useState } from 'react';
import { Button } from '@/components/ui';
import { useUploadQueue } from '../hooks/useUploadQueue';
import { submitPortalRequest } from '../api/portalApi';
import { PortalHeader } from './PortalHeader';
import { StickyProgressBar } from './StickyProgressBar';
import { ChecklistItemCard } from './ChecklistItemCard';
import { SubmitConfirmDialog } from './SubmitConfirmDialog';
import type { ChecklistItem, PortalData } from '../types';

export function ValidPortalView({
  token,
  data,
  onRefresh,
}: {
  token: string;
  data: PortalData;
  onRefresh: () => void;
}) {
  const uploadQueue = useUploadQueue(token, onRefresh);
  const [unavailableIds, setUnavailableIds] = useState<Set<string>>(new Set());
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function tasksFor(itemId: string) {
    return uploadQueue.tasks.filter((task) => task.requiredDocumentId === itemId);
  }

  function isItemSatisfied(item: ChecklistItem) {
    if (item.status === 'received' || item.status === 'needs_review' || item.status === 'accepted') return true;
    if (item.files.length > 0) return true;
    if (unavailableIds.has(item.id)) return true;
    return false;
  }

  const missingCount = useMemo(
    () => data.checklist.filter((item) => !item.isOptional && !isItemSatisfied(item)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.checklist, unavailableIds],
  );
  const receivedCount = data.checklist.length - missingCount;

  async function performSubmit() {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await submitPortalRequest(token);
      setHasSubmitted(true);
      setIsConfirmOpen(false);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Could not submit. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSubmitClick() {
    if (missingCount > 0) setIsConfirmOpen(true);
    else performSubmit();
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-neutral-50 pb-28">
      <PortalHeader
        firmName={data.firmName}
        firmLogoUrl={data.firmLogoUrl}
        periodLabel={data.periodLabel}
        clientName={data.clientName}
        deadline={data.deadline}
      />

      <StickyProgressBar receivedCount={receivedCount} totalCount={data.checklist.length} />

      {hasSubmitted && (
        <div className="mx-4 mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Thanks — we&apos;ve let {data.firmName} know. You can still upload more documents below if needed.
        </div>
      )}

      <div className="space-y-4 px-4 py-4">
        {data.checklist.map((item) => (
          <ChecklistItemCard
            key={item.id}
            item={item}
            tasks={tasksFor(item.id)}
            isMarkedUnavailable={unavailableIds.has(item.id)}
            onFilesSelected={(files) => uploadQueue.addFiles(item.id, files)}
            onRetryTask={uploadQueue.retryTask}
            onDismissTask={uploadQueue.dismissTask}
            onRemoveFile={(documentId) => uploadQueue.removeUploadedFile(documentId)}
            onMarkUnavailable={(reason) => {
              uploadQueue.markUnavailable(item.id, reason);
              setUnavailableIds((prev) => new Set(prev).add(item.id));
            }}
          />
        ))}
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-neutral-200 bg-white px-4 py-3">
        <div className="mx-auto max-w-lg">
          {submitError && <p className="mb-2 text-sm text-red-600">{submitError}</p>}
          <Button className="min-h-[44px] w-full" onClick={handleSubmitClick} disabled={isSubmitting}>
            {isSubmitting ? 'Submitting…' : hasSubmitted ? 'Submit again' : 'Submit'}
          </Button>
        </div>
      </div>

      <SubmitConfirmDialog
        open={isConfirmOpen}
        missingCount={missingCount}
        onCancel={() => setIsConfirmOpen(false)}
        onConfirm={performSubmit}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}
