import { useEffect, useState } from 'react';
import { Button, Dialog, DialogFooter, DialogHeader, DialogTitle, Field, Textarea } from '@/components/ui';
import { toast } from '@/lib/toast';
import { sendCustomMessage } from '../../api/requestDetailApi';

function defaultMessage(checklistLabel: string, filename: string): string {
  return `Hi,\n\nThe file you uploaded for ${checklistLabel} (${filename}) didn't quite work for us — could you upload a new copy when you get a chance?\n\nThanks!`;
}

export function RejectDialog({
  open,
  onClose,
  filename,
  checklistLabel,
  clientEmail,
  organizationId,
  requestId,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  filename: string;
  checklistLabel: string;
  clientEmail: string | null;
  organizationId: string;
  requestId: string;
  onConfirm: (reason: string) => void;
}) {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (open) setMessage(defaultMessage(checklistLabel, filename));
  }, [open, checklistLabel, filename]);

  async function handleConfirm() {
    setIsSending(true);
    try {
      if (clientEmail) {
        await sendCustomMessage({
          to: clientEmail,
          organizationId,
          requestId,
          subject: `We need a new copy of your ${checklistLabel}`,
          body: message,
        });
      }
    } catch {
      toast.error('Could not send the message — the file was still rejected.');
    } finally {
      setIsSending(false);
      onConfirm('rejected_needs_new_copy');
      onClose();
    }
  }

  return (
    <Dialog open={open} onClose={onClose} className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Reject and ask for a new copy</DialogTitle>
      </DialogHeader>

      {!clientEmail && (
        <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          This client has no email on file — the file will be rejected, but no message will be sent.
        </p>
      )}

      <Field label="Message to client" htmlFor="reject-message">
        <Textarea
          id="reject-message"
          rows={6}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          disabled={!clientEmail}
        />
      </Field>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" variant="destructive" onClick={handleConfirm} disabled={isSending}>
          {isSending ? 'Sending…' : clientEmail ? 'Reject & send message' : 'Reject'}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
