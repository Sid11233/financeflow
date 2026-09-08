import Papa from 'papaparse';
import { csvRowSchema } from './schemas';
import type { ColumnMapping, ImportRowResult, ParsedCsv } from './types';

export function parseCsvFile(file: File): Promise<ParsedCsv> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve({ headers: results.meta.fields ?? [], rows: results.data }),
      error: (error: Error) => reject(error),
    });
  });
}

export function guessColumn(headers: string[], candidates: string[]): string {
  const lowerHeaders = headers.map((header) => header.toLowerCase());
  for (const candidate of candidates) {
    const index = lowerHeaders.indexOf(candidate);
    if (index !== -1) return headers[index];
  }
  return '';
}

export function applyColumnMapping(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
): ImportRowResult[] {
  return rows.map((row, rowIndex) => {
    const name = (mapping.name ? row[mapping.name] : '')?.trim() ?? '';
    const email = (mapping.email ? row[mapping.email] : '')?.trim() ?? '';
    const phone = (mapping.phone ? row[mapping.phone] : '')?.trim() ?? '';

    const result = csvRowSchema.safeParse({ name, email, phone: phone || undefined });
    const errors = result.success ? [] : result.error.issues.map((issue) => issue.message);

    return { rowIndex, name, email, phone, errors };
  });
}
