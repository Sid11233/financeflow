import { ProgressBar } from '@/components/ui';
import type { UploadTask } from '../types';

export function FileUploadRow({
  task,
  onRetry,
  onDismiss,
}: {
  task: UploadTask;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  if (task.status === 'error') {
    return (
      <li className="flex items-center justify-between gap-2 rounded-md bg-red-50 px-3 py-2 text-sm">
        <div className="min-w-0">
          <p className="truncate text-red-700">{task.displayName}</p>
          <p className="text-xs text-red-500">{task.errorMessage ?? 'Upload failed.'}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            className="min-h-[44px] rounded px-2 text-xs font-medium text-accent underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            onClick={onRetry}
          >
            Retry
          </button>
          <button
            type="button"
            className="min-h-[44px] rounded px-2 text-xs text-neutral-400 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            onClick={onDismiss}
          >
            Dismiss
          </button>
        </div>
      </li>
    );
  }

  const label =
    task.status === 'processing'
      ? 'Preparing…'
      : task.status === 'confirming'
        ? 'Finishing up…'
        : `Uploading… ${task.progress}%`;

  return (
    <li className="rounded-md bg-neutral-50 px-3 py-2 text-sm">
      <p className="mb-1 truncate text-neutral-700">{task.displayName}</p>
      <ProgressBar value={task.status === 'processing' ? 8 : task.progress} className="h-1.5" />
      <p className="mt-1 text-xs text-neutral-400">{label}</p>
    </li>
  );
}
