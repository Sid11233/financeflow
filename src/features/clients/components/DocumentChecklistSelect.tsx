import { Checkbox } from '@/components/ui';
import type { Tables } from '@/lib/database.types';

export function DocumentChecklistSelect({
  documentTypes,
  selectedIds,
  onChange,
}: {
  documentTypes: Tables<'document_types'>[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  function toggle(id: string) {
    onChange(
      selectedIds.includes(id) ? selectedIds.filter((existing) => existing !== id) : [...selectedIds, id],
    );
  }

  if (documentTypes.length === 0) {
    return <p className="text-sm text-neutral-400">No document types configured yet.</p>;
  }

  return (
    <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-neutral-200 p-3">
      {documentTypes.map((documentType) => (
        <label key={documentType.id} className="flex items-center gap-2 text-sm text-neutral-700">
          <Checkbox checked={selectedIds.includes(documentType.id)} onChange={() => toggle(documentType.id)} />
          {documentType.name}
        </label>
      ))}
    </div>
  );
}
