import type { ChecklistDocument, ChecklistRequiredDocument } from '../types';

export function computeUnresolvedLabels(requiredDocuments: ChecklistRequiredDocument[]): string[] {
  return requiredDocuments
    .filter((item) => !item.is_optional && !['accepted', 'received', 'waived'].includes(item.status))
    .map((item) => item.label);
}

export type ConfidenceLabel = 'High' | 'Medium' | 'Low';

export function getConfidenceLabel(confidence: number | null): ConfidenceLabel | null {
  if (confidence === null) return null;
  if (confidence >= 0.8) return 'High';
  if (confidence >= 0.5) return 'Medium';
  return 'Low';
}

// Plain-language rendering of a flagged document's AI verdict, tailored to
// the specific reconciliation flag (see reconciliation.ts in the
// classify-document Edge Function) rather than a generic dump of the raw
// classification JSON.
export function formatAiVerdict(document: ChecklistDocument, expectedLabel: string, requestPeriodLabel: string): string {
  const classification = document.ai_classification;

  if (!classification) {
    return 'Not yet analyzed by AI — please review manually.';
  }

  const detectedPeriod = classification.period.label ?? 'an unknown period';

  switch (document.review_reason) {
    case 'wrong_period':
      return `Detected: ${classification.document_type_label}, ${detectedPeriod} — expected ${requestPeriodLabel}.`;
    case 'unexpected_type':
      return `Detected: ${classification.document_type_label} — expected ${expectedLabel}.`;
    case 'unreadable':
      return 'Could not read this file clearly enough to classify it.';
    case 'unparseable_response':
      return 'AI classification did not return a usable result.';
    case 'low_confidence':
      return `Detected: ${classification.document_type_label}, ${detectedPeriod} (low confidence) — expected ${expectedLabel}.`;
    default:
      return `Detected: ${classification.document_type_label}, ${detectedPeriod}.`;
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatUploadedBy(document: ChecklistDocument, clientName: string): string {
  // Every upload in this product comes through the anonymous client
  // portal today — there is no accountant-side manual upload feature — so
  // uploader_ip presence is really just confirming "this came through the
  // portal" rather than distinguishing between uploaders.
  return document.uploader_ip ? clientName : 'Unknown';
}
