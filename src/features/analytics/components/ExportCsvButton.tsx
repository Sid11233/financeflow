import { Download } from 'lucide-react';
import { Button } from '@/components/ui';
import { downloadCsv } from '@/lib/csv';

export function ExportCsvButton({ filename, rows }: { filename: string; rows: Record<string, unknown>[] }) {
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={rows.length === 0}
      onClick={() => downloadCsv(filename, rows)}
    >
      <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
      Export CSV
    </Button>
  );
}
