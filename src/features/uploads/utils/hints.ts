// Plain-language hints for the document types this app seeds by default
// (see supabase/migrations/0015). Org-defined or custom checklist items
// fall back to a sensible generic hint rather than nothing.
const HINTS: Record<string, string> = {
  'bank statement': 'The monthly statement from your bank showing all transactions.',
  'sales invoices': 'Copies of invoices you sent to customers.',
  'purchase invoices': 'Copies of invoices or bills you received from suppliers.',
  'payroll report': 'A summary of salaries and wages paid to employees.',
  'expense receipts': 'Receipts for business expenses you paid for.',
  'credit card statement': 'The monthly statement from your business credit card.',
};

export function getPlainLanguageHint(label: string): string {
  return HINTS[label.trim().toLowerCase()] ?? 'A clear photo or copy of this document.';
}
