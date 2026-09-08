import { Button } from '@/components/ui';
import { ChecklistEditor } from './ChecklistEditor';
import type { ChecklistItem } from '../../types';

export function StepChecklist({
  items,
  onChange,
  onBack,
  onContinue,
}: {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const hasSelection = items.some((item) => item.isChecked);

  return (
    <div className="space-y-4">
      <ChecklistEditor items={items} onChange={onChange} allowCustom />
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button type="button" onClick={onContinue} disabled={!hasSelection}>
          Continue
        </Button>
      </div>
    </div>
  );
}
