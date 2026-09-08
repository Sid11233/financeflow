import { Button, Dialog, DialogHeader, DialogTitle } from '@/components/ui';
import { getPreviewKind } from '../hooks/useDocumentPreview';
import type { useDocumentPreview } from '../hooks/useDocumentPreview';

// A thin consumer of useDocumentPreview: renders whatever the hook's state
// currently holds. `preview` is the return value of that hook, owned by
// the parent (a documents list) — this component doesn't call `open`
// itself, only `close`.
export function DocumentPreviewDialog({
  preview,
  filename,
  mimeType,
}: {
  preview: ReturnType<typeof useDocumentPreview>;
  filename: string;
  mimeType: string;
}) {
  const isOpen = preview.documentId !== null;
  const kind = getPreviewKind(mimeType);

  return (
    <Dialog open={isOpen} onClose={preview.close} className="max-w-2xl">
      <DialogHeader>
        <DialogTitle className="truncate">{filename}</DialogTitle>
      </DialogHeader>

      {preview.isLoading && <p className="py-8 text-center text-sm text-neutral-500">Loading preview…</p>}
      {preview.error && <p className="py-8 text-center text-sm text-red-600">{preview.error}</p>}

      {preview.url && kind === 'pdf' && (
        <iframe
          src={preview.url}
          title={filename}
          className="h-[70vh] w-full rounded-md border border-neutral-200"
        />
      )}

      {preview.url && kind === 'image' && (
        <img src={preview.url} alt={filename} className="max-h-[70vh] w-full rounded-md object-contain" />
      )}

      {preview.url && (kind === 'spreadsheet' || kind === 'other') && (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-neutral-500">
            {kind === 'spreadsheet'
              ? 'Spreadsheets open outside the browser.'
              : "This file type can't be previewed here."}
          </p>
          <Button onClick={() => window.open(preview.url!, '_blank', 'noopener,noreferrer')}>
            Download {filename}
          </Button>
        </div>
      )}
    </Dialog>
  );
}
