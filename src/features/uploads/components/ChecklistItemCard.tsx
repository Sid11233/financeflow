import { useRef, useState } from 'react';
import { Badge } from '@/components/ui';
import { ACCEPT_ATTRIBUTE, validateFile } from '../utils/fileValidation';
import { getPlainLanguageHint } from '../utils/hints';
import { MissingReasonDialog } from './MissingReasonDialog';
import { FileUploadRow } from './FileUploadRow';
import type { ChecklistItem, UploadTask } from '../types';

export function ChecklistItemCard({
  item,
  tasks,
  isMarkedUnavailable,
  onFilesSelected,
  onRetryTask,
  onDismissTask,
  onRemoveFile,
  onMarkUnavailable,
}: {
  item: ChecklistItem;
  tasks: UploadTask[];
  isMarkedUnavailable: boolean;
  onFilesSelected: (files: File[]) => void;
  onRetryTask: (id: string) => void;
  onDismissTask: (id: string) => void;
  onRemoveFile: (documentId: string) => void;
  onMarkUnavailable: (reason: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isReasonOpen, setIsReasonOpen] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const isReceived = item.status === 'received' || item.status === 'needs_review' || item.status === 'accepted';
  const hasActiveUploads = tasks.length > 0;

  function handleFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    const errors: string[] = [];
    const valid: File[] = [];
    for (const file of files) {
      const error = validateFile(file);
      if (error) errors.push(`${file.name}: ${error}`);
      else valid.push(file);
    }
    setFileError(errors[0] ?? null);
    if (valid.length > 0) onFilesSelected(valid);
  }

  let stateLabel = 'Not uploaded';
  let stateVariant: 'neutral' | 'warning' | 'success' = 'neutral';
  if (hasActiveUploads) {
    stateLabel = 'Uploading…';
    stateVariant = 'warning';
  } else if (item.files.length > 0 || isReceived) {
    stateLabel = `Received (${Math.max(item.files.length, 1)})`;
    stateVariant = 'success';
  } else if (isMarkedUnavailable) {
    stateLabel = 'Marked as unavailable';
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-neutral-900">
            {item.label}
            {item.isOptional && <span className="ml-1 text-xs font-normal text-neutral-400">(optional)</span>}
          </h2>
          <p className="mt-0.5 text-xs text-neutral-500">{getPlainLanguageHint(item.label)}</p>
        </div>
        <Badge variant={stateVariant} className="shrink-0">
          {stateLabel}
        </Badge>
      </div>

      <div
        className={`mt-3 rounded-md border-2 border-dashed p-4 text-center transition-colors ${
          isDragging ? 'border-accent bg-accent/5' : 'border-neutral-200'
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          if (event.dataTransfer.files.length > 0) handleFiles(event.dataTransfer.files);
        }}
      >
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex min-h-[44px] w-full items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 sm:w-auto"
        >
          Upload files
        </button>
        <p className="mt-2 text-xs text-neutral-400">or drag and drop</p>
        <label htmlFor={`file-input-${item.id}`} className="sr-only">
          Upload {item.label}
        </label>
        <input
          ref={inputRef}
          id={`file-input-${item.id}`}
          type="file"
          multiple
          accept={ACCEPT_ATTRIBUTE}
          className="hidden"
          onChange={(event) => {
            if (event.target.files) handleFiles(event.target.files);
            event.target.value = '';
          }}
        />
      </div>

      {fileError && <p className="mt-2 text-xs text-red-600">{fileError}</p>}

      {(item.files.length > 0 || tasks.length > 0) && (
        <ul className="mt-3 list-none space-y-2">
          {item.files.map((file) => (
            <li
              key={file.id}
              className="flex items-center justify-between gap-2 rounded-md bg-neutral-50 px-3 py-2 text-sm"
            >
              <span className="truncate text-neutral-700">{file.filename}</span>
              <button
                type="button"
                className="min-h-[44px] shrink-0 rounded px-2 text-xs text-red-500 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                onClick={() => onRemoveFile(file.id)}
              >
                Remove
              </button>
            </li>
          ))}
          {tasks.map((task) => (
            <FileUploadRow
              key={task.id}
              task={task}
              onRetry={() => onRetryTask(task.id)}
              onDismiss={() => onDismissTask(task.id)}
            />
          ))}
        </ul>
      )}

      {!isMarkedUnavailable && (
        <button
          type="button"
          className="mt-3 min-h-[44px] rounded text-xs text-neutral-400 underline hover:text-neutral-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          onClick={() => setIsReasonOpen(true)}
        >
          I don&apos;t have this
        </button>
      )}

      <MissingReasonDialog
        open={isReasonOpen}
        onClose={() => setIsReasonOpen(false)}
        onSubmit={(reason) => {
          onMarkUnavailable(reason);
          setIsReasonOpen(false);
        }}
      />
    </div>
  );
}
