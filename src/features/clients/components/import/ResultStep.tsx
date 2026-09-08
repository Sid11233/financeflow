import { Button } from '@/components/ui';
import type { ImportResult } from '../../types';

export function ResultStep({
  result,
  totalRows,
  onDone,
}: {
  result: ImportResult;
  totalRows: number;
  onDone: () => void;
}) {
  const skippedAsInvalid = totalRows - result.insertedCount - result.duplicateEmails.length;

  return (
    <div className="space-y-4">
      <ul className="space-y-1 text-sm text-neutral-700">
        <li>✓ {result.insertedCount} client{result.insertedCount === 1 ? '' : 's'} imported</li>
        {result.duplicateEmails.length > 0 && (
          <li className="text-amber-600">
            {result.duplicateEmails.length} skipped as duplicate email address
            {result.duplicateEmails.length === 1 ? '' : 'es'}
          </li>
        )}
        {skippedAsInvalid > 0 && (
          <li className="text-red-600">{skippedAsInvalid} skipped due to validation errors</li>
        )}
      </ul>
      <Button onClick={onDone}>Done</Button>
    </div>
  );
}
