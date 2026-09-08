import type { ChecklistItem } from './types';

export function getPreviousPeriod(): { periodStart: string; periodLabel: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return {
    periodStart: start.toISOString().slice(0, 10),
    periodLabel: start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
  };
}

// Deadline defaults to defaultDeadlineDay of the month *following* the
// period being requested (you're asking for September's documents, due
// sometime in October). Clamped to the following month's actual length so
// e.g. day 30 doesn't overflow a 28/29-day February.
export function computeDefaultDeadline(periodStart: string, defaultDeadlineDay: number): string {
  const period = new Date(`${periodStart}T00:00:00`);
  const followingMonth = new Date(period.getFullYear(), period.getMonth() + 1, 1);
  const daysInFollowingMonth = new Date(followingMonth.getFullYear(), followingMonth.getMonth() + 1, 0).getDate();
  const day = Math.min(defaultDeadlineDay, daysInFollowingMonth);
  const deadline = new Date(followingMonth.getFullYear(), followingMonth.getMonth(), day);
  return deadline.toISOString().slice(0, 10);
}

export function buildInitialChecklist(
  documentTypes: { id: string; name: string }[],
  defaultDocumentTypeIds: string[],
): ChecklistItem[] {
  return documentTypes.map((documentType) => ({
    key: documentType.id,
    documentTypeId: documentType.id,
    customName: null,
    label: documentType.name,
    isOptional: false,
    isChecked: defaultDocumentTypeIds.includes(documentType.id),
  }));
}

export function formatDeadlineLong(deadline: string): string {
  if (!deadline) return '';
  return new Date(`${deadline}T00:00:00`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function defaultMessageBody(periodLabel: string, deadline: string): string {
  return `We need the following documents for ${periodLabel} by ${formatDeadlineLong(deadline)}. Please upload them using the secure link below.`;
}
