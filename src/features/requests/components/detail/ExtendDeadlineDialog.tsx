import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button, Dialog, DialogFooter, DialogHeader, DialogTitle, Field, Input } from '@/components/ui';
import { useExtendDeadline } from '../../hooks/useRequestActions';

export function ExtendDeadlineDialog({
  open,
  onClose,
  requestId,
  currentDeadline,
}: {
  open: boolean;
  onClose: () => void;
  requestId: string;
  currentDeadline: string | null;
}) {
  const [newDeadline, setNewDeadline] = useState(currentDeadline ?? '');
  const extendDeadline = useExtendDeadline(requestId);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!newDeadline) return;
    extendDeadline.mutate(newDeadline, {
      onSuccess: onClose,
    });
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <DialogHeader>
          <DialogTitle>Extend deadline</DialogTitle>
        </DialogHeader>
        <Field label="New deadline" htmlFor="new-deadline">
          <Input
            id="new-deadline"
            type="date"
            value={newDeadline}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(event) => setNewDeadline(event.target.value)}
            autoFocus
          />
        </Field>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!newDeadline || extendDeadline.isPending}>
            {extendDeadline.isPending ? 'Saving…' : 'Extend deadline'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
