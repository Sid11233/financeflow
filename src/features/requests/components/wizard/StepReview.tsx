import { Button, Textarea } from '@/components/ui';
import { formatDeadlineLong } from '../../utils';
import type { ChecklistItem, ClientOption } from '../../types';

export function StepReview({
  client,
  periodLabel,
  deadline,
  checklist,
  messageBody,
  onMessageBodyChange,
  onBack,
  onSaveDraft,
  onSend,
  isSubmitting,
}: {
  client: ClientOption | null;
  periodLabel: string;
  deadline: string;
  checklist: ChecklistItem[];
  messageBody: string;
  onMessageBodyChange: (value: string) => void;
  onBack: () => void;
  onSaveDraft: () => void;
  onSend: () => void;
  isSubmitting: boolean;
}) {
  const selected = checklist.filter((item) => item.isChecked);

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm text-neutral-500">Preview of the email {client?.name ?? 'the client'} will receive:</p>
        <div className="space-y-2 rounded-md border border-neutral-200 bg-white p-4 text-sm">
          <p>Hi {client?.name ?? '(client)'},</p>
          <p>{messageBody}</p>
          <p className="font-medium">
            Documents needed for {periodLabel} (due {formatDeadlineLong(deadline)}):
          </p>
          <ul className="list-inside list-disc">
            {selected.map((item) => (
              <li key={item.key}>
                {item.label}
                {item.isOptional ? ' (optional)' : ''}
              </li>
            ))}
          </ul>
          <p className="text-accent underline">Upload your documents</p>
          <p>
            Thanks,
            <br />
            Your firm
          </p>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700" htmlFor="message-body">
          Message
        </label>
        <Textarea
          id="message-body"
          rows={3}
          value={messageBody}
          onChange={(event) => onMessageBodyChange(event.target.value)}
        />
      </div>

      <div className="flex justify-between gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onBack} disabled={isSubmitting}>
          Back
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onSaveDraft} disabled={isSubmitting}>
            Save as draft
          </Button>
          <Button type="button" onClick={onSend} disabled={isSubmitting}>
            {isSubmitting ? 'Sending…' : 'Send request'}
          </Button>
        </div>
      </div>
    </div>
  );
}
