import { useState } from 'react';
import { getDocumentUrl } from '../api/documentsApi';

export type PreviewKind = 'pdf' | 'image' | 'spreadsheet' | 'other';

export function getPreviewKind(mimeType: string): PreviewKind {
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('image/')) return 'image';
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'application/vnd.ms-excel' ||
    mimeType === 'text/csv' ||
    mimeType === 'application/csv'
  ) {
    return 'spreadsheet';
  }
  return 'other';
}

interface PreviewState {
  documentId: string | null;
  url: string | null;
  isLoading: boolean;
  error: string | null;
}

const CLOSED_STATE: PreviewState = { documentId: null, url: null, isLoading: false, error: null };

// The signed URL is only ever fetched when `open` is actually called — not
// eagerly for every document in a list — since it's a real network round
// trip (get-document-url) that most rows in a list will never need.
export function useDocumentPreview() {
  const [state, setState] = useState<PreviewState>(CLOSED_STATE);

  async function open(documentId: string) {
    setState({ documentId, url: null, isLoading: true, error: null });
    try {
      const { url } = await getDocumentUrl(documentId);
      setState({ documentId, url, isLoading: false, error: null });
    } catch (error) {
      setState({
        documentId,
        url: null,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Could not load this document.',
      });
    }
  }

  function close() {
    setState(CLOSED_STATE);
  }

  return { ...state, open, close };
}
