import { useState } from 'react';
import { Button, Checkbox, Input } from '@/components/ui';
import type { ChecklistItem } from '../../types';

export function ChecklistEditor({
  items,
  onChange,
  allowCustom = false,
}: {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
  allowCustom?: boolean;
}) {
  const [customName, setCustomName] = useState('');

  function toggleChecked(key: string) {
    onChange(items.map((item) => (item.key === key ? { ...item, isChecked: !item.isChecked } : item)));
  }

  function toggleOptional(key: string) {
    onChange(items.map((item) => (item.key === key ? { ...item, isOptional: !item.isOptional } : item)));
  }

  function removeItem(key: string) {
    onChange(items.filter((item) => item.key !== key));
  }

  function addCustom() {
    const trimmed = customName.trim();
    if (!trimmed) return;
    onChange([
      ...items,
      {
        key: crypto.randomUUID(),
        documentTypeId: null,
        customName: trimmed,
        label: trimmed,
        isOptional: false,
        isChecked: true,
      },
    ]);
    setCustomName('');
  }

  return (
    <div className="space-y-3">
      <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-neutral-200 p-2">
        {items.length === 0 && (
          <p className="px-2 py-4 text-center text-sm text-neutral-400">No document types yet.</p>
        )}
        {items.map((item) => (
          <div
            key={item.key}
            className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-neutral-50"
          >
            <label className="flex flex-1 items-center gap-2 text-sm text-neutral-700">
              <Checkbox checked={item.isChecked} onChange={() => toggleChecked(item.key)} />
              {item.label}
              {item.customName && <span className="text-xs text-neutral-400">(custom)</span>}
            </label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1 text-xs text-neutral-500">
                <Checkbox checked={item.isOptional} onChange={() => toggleOptional(item.key)} />
                Optional
              </label>
              {item.customName && (
                <button
                  type="button"
                  className="text-xs text-red-500 hover:underline"
                  onClick={() => removeItem(item.key)}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {allowCustom && (
        <div className="flex gap-2">
          <Input
            placeholder="Add a one-off document…"
            value={customName}
            onChange={(event) => setCustomName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addCustom();
              }
            }}
          />
          <Button type="button" variant="outline" onClick={addCustom}>
            Add
          </Button>
        </div>
      )}
    </div>
  );
}
