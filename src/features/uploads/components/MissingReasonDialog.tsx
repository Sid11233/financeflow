import { useState } from 'react';
import { Button, Dialog, DialogFooter, DialogHeader, DialogTitle, Textarea } from '@/components/ui';

export function MissingReasonDialog({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');

  function handleClose() {
    setReason('');
    onClose();
  }

  return (
    <Dialog open={open} onClose={handleClose}>
      <DialogHeader>
        <DialogTitle>Let us know why</DialogTitle>
      </DialogHeader>
      <p className="mb-2 text-sm text-neutral-500">This helps your accountant follow up correctly.</p>
      <label htmlFor="unavailable-reason" className="sr-only">
        Reason
      </label>
      <Textarea
        id="unavailable-reason"
        rows={3}
        placeholder="e.g. I don't have a business credit card"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        autoFocus
      />
      <DialogFooter>
        <Button variant="outline" onClick={handleClose} className="min-h-[44px]">
          Cancel
        </Button>
        <Button
          className="min-h-[44px]"
          onClick={() => {
            onSubmit(reason.trim() || 'No reason given');
            setReason('');
          }}
        >
          Send
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
