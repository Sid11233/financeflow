import { Button, Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui';
import { useMarkComplete } from '../../hooks/useRequestActions';

export function MarkCompleteDialog({
  open,
  onClose,
  requestId,
  unresolvedLabels,
}: {
  open: boolean;
  onClose: () => void;
  requestId: string;
  unresolvedLabels: string[];
}) {
  const markComplete = useMarkComplete(requestId);

  function confirm() {
    markComplete.mutate(undefined, { onSuccess: onClose });
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader>
        <DialogTitle>Mark request complete?</DialogTitle>
        {unresolvedLabels.length > 0 ? (
          <DialogDescription>
            {unresolvedLabels.length} item{unresolvedLabels.length === 1 ? ' is' : 's are'} still unresolved. Marking
            this request complete will waive {unresolvedLabels.length === 1 ? 'it' : 'them'} as "not needed this
            period."
          </DialogDescription>
        ) : (
          <DialogDescription>Every required item is already resolved.</DialogDescription>
        )}
      </DialogHeader>

      {unresolvedLabels.length > 0 && (
        <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {unresolvedLabels.map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" onClick={confirm} disabled={markComplete.isPending}>
          {markComplete.isPending ? 'Marking complete…' : 'Mark complete'}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
