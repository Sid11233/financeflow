import { Button, Dialog, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui';

export function SubmitConfirmDialog({
  open,
  missingCount,
  onCancel,
  onConfirm,
  isSubmitting,
}: {
  open: boolean;
  missingCount: number;
  onCancel: () => void;
  onConfirm: () => void;
  isSubmitting: boolean;
}) {
  return (
    <Dialog open={open} onClose={onCancel}>
      <DialogHeader>
        <DialogTitle>Some documents are missing</DialogTitle>
      </DialogHeader>
      <p className="text-sm text-neutral-600">
        {missingCount} document{missingCount === 1 ? ' is' : 's are'} still missing. Submit anyway?
      </p>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting} className="min-h-[44px]">
          Go back
        </Button>
        <Button onClick={onConfirm} disabled={isSubmitting} className="min-h-[44px]">
          {isSubmitting ? 'Submitting…' : 'Submit anyway'}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
