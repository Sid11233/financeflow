import type { Classification } from './classifier.ts';

export type ReconciliationFlag = 'wrong_period' | 'low_confidence' | 'unreadable' | 'unexpected_type';

export type ReconciliationOutcome =
  | { kind: 'auto_accept' }
  | { kind: 'reassign'; targetRequiredDocumentId: string }
  | { kind: 'needs_review'; flag: ReconciliationFlag };

export interface RequiredDocumentRef {
  id: string;
  document_type_id: string | null;
}

export interface ReconciliationSettings {
  auto_accept_confidence: number;
  reassign_confidence: number;
}

// Pure decision tree — no DB or network calls — so it can be tested in
// isolation. Precedence, most to least specific:
//   1. unreadable / other / below auto-accept threshold -> needs_review
//      (checked first: a low-confidence or unreadable result shouldn't be
//      auto-accepted just because it happens to nominally "match" a slot)
//   2. no mapping exists for the detected type in this org -> needs_review
//   3. matches the slot it was uploaded against:
//        period overlaps (or undetermined) -> auto_accept
//        period contradicts -> needs_review/wrong_period
//   4. matches a *different* slot on the same request, confidently enough
//      to reassign -> reassign
//   5. anything else -> needs_review/unexpected_type
export function reconcileClassification(
  classification: Classification,
  currentRequiredDocumentId: string,
  requiredDocuments: RequiredDocumentRef[],
  requestPeriodStart: string,
  requestPeriodEnd: string,
  settings: ReconciliationSettings,
  aiTypeToDocumentTypeId: Record<string, string>,
): ReconciliationOutcome {
  if (classification.document_type === 'unreadable') {
    return { kind: 'needs_review', flag: 'unreadable' };
  }

  if (classification.document_type === 'other') {
    return { kind: 'needs_review', flag: 'low_confidence' };
  }

  if (classification.confidence < settings.auto_accept_confidence) {
    return { kind: 'needs_review', flag: 'low_confidence' };
  }

  const mappedDocumentTypeId = aiTypeToDocumentTypeId[classification.document_type];
  if (!mappedDocumentTypeId) {
    return { kind: 'needs_review', flag: 'unexpected_type' };
  }

  const current = requiredDocuments.find((rd) => rd.id === currentRequiredDocumentId);

  if (current && current.document_type_id === mappedDocumentTypeId) {
    const overlaps = periodsOverlap(
      classification.period.start,
      classification.period.end,
      requestPeriodStart,
      requestPeriodEnd,
    );
    return overlaps ? { kind: 'auto_accept' } : { kind: 'needs_review', flag: 'wrong_period' };
  }

  const otherSlot = requiredDocuments.find(
    (rd) => rd.id !== currentRequiredDocumentId && rd.document_type_id === mappedDocumentTypeId,
  );

  if (otherSlot && classification.confidence >= settings.reassign_confidence) {
    return { kind: 'reassign', targetRequiredDocumentId: otherSlot.id };
  }

  return { kind: 'needs_review', flag: 'unexpected_type' };
}

// A null detected start/end means the model saw no evidence either way —
// treated as non-contradicting (benefit of the doubt) rather than as a
// mismatch, matching the system prompt's own instruction to use null
// rather than guess.
function periodsOverlap(
  detectedStart: string | null,
  detectedEnd: string | null,
  requestStart: string,
  requestEnd: string,
): boolean {
  if (!detectedStart || !detectedEnd) return true;
  return detectedStart <= requestEnd && detectedEnd >= requestStart;
}

export function getPeriodMonthEnd(periodStart: string): string {
  const date = new Date(`${periodStart}T00:00:00Z`);
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  return end.toISOString().slice(0, 10);
}
