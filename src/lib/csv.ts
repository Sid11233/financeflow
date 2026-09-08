import Papa from 'papaparse';

// Client-side only — every table this feeds is already staff-only data
// loaded into the browser, so there's nothing a server round-trip would
// add except latency.
export function downloadCsv(filename: string, rows: Record<string, unknown>[]): void {
  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  link.click();

  URL.revokeObjectURL(url);
}
