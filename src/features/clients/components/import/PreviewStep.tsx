import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui';
import type { ImportRowResult } from '../../types';

export function PreviewStep({
  results,
  isSubmitting,
  onBack,
  onConfirm,
}: {
  results: ImportRowResult[];
  isSubmitting: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const validCount = results.filter((row) => row.errors.length === 0).length;
  const invalidCount = results.length - validCount;
  const preview = results.slice(0, 10);

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-600">
        {validCount} of {results.length} row{results.length === 1 ? '' : 's'} look valid
        {invalidCount > 0 ? `, ${invalidCount} will be skipped due to errors` : ''}. Showing the first{' '}
        {preview.length}.
      </p>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Issues</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {preview.map((row) => (
              <TableRow key={row.rowIndex} className={row.errors.length > 0 ? 'bg-red-50' : undefined}>
                <TableCell>{row.name || '—'}</TableCell>
                <TableCell>{row.email || '—'}</TableCell>
                <TableCell>{row.phone || '—'}</TableCell>
                <TableCell className="text-red-600">{row.errors.join('; ')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onBack} disabled={isSubmitting}>
          Back
        </Button>
        <Button onClick={onConfirm} disabled={validCount === 0 || isSubmitting}>
          {isSubmitting ? 'Importing…' : `Import ${validCount} client${validCount === 1 ? '' : 's'}`}
        </Button>
      </div>
    </div>
  );
}
