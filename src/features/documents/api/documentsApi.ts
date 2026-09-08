import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

async function toDocumentError(error: unknown): Promise<Error> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      if (typeof body?.error === 'string') return new Error(body.error);
    } catch {
      // fall through to the generic message below
    }
  }
  return new Error('Something went wrong. Please try again.');
}

export interface DocumentUrlResult {
  url: string;
  expiresInSeconds: number;
}

export async function getDocumentUrl(documentId: string): Promise<DocumentUrlResult> {
  const { data, error } = await supabase.functions.invoke<DocumentUrlResult>('get-document-url', {
    body: { documentId },
  });
  if (error) throw await toDocumentError(error);
  return data!;
}
