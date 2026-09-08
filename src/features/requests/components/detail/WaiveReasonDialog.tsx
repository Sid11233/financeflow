import { useState } from 'react';
import { Button, Dialog, DialogFooter, DialogHeader, DialogTitle, Textarea } from '@/components/ui';

export function WaiveReasonDialog({
  open,
  onClose,
  itemLabel,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  itemLabel: string;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');

  function handleClose() {
    setReason('');
    onClose();
  }

  return (
    <Dialog open={open} onClose={handleClose}>
      <DialogHeader>
        <DialogTitle>Waive {itemLabel}?</DialogTitle>
      </DialogHeader>
      <p className="mb-2 text-sm text-neutral-500">Optional: note why this item doesn't apply this period.</p>
      <label htmlFor="waive-reason" className="sr-only">
        Reason
      </label>
      <Textarea
        id="waive-reason"
        rows={3}
        placeholder="e.g. Client had no payroll run this period"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        autoFocus
      />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={handleClose}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={() => {
            onConfirm(reason.trim() || 'No reason given');
            setReason('');
          }}
        >
          Waive item
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
