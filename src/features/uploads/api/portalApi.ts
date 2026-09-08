import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { PortalData } from '../types';

async function toPortalError(error: unknown): Promise<Error> {
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

export async function resolvePortalToken(token: string): Promise<PortalData> {
  const { data, error } = await supabase.functions.invoke<PortalData>('portal-resolve', { body: { token } });
  // Not converted through toPortalError here: the caller needs to tell a
  // network failure (FunctionsFetchError, no response at all) apart from a
  // real "invalid or expired" response (FunctionsHttpError), so the
  // original supabase-js error type is preserved.
  if (error) throw error;
  return data!;
}

export interface UploadUrlResult {
  signedUrl: string;
  storagePath: string;
  uploadToken: string;
}

export async function requestUploadUrl(input: {
  token: string;
  requiredDocumentId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<UploadUrlResult> {
  const { data, error } = await supabase.functions.invoke<UploadUrlResult>('portal-upload-url', { body: input });
  if (error) throw await toPortalError(error);
  return data!;
}

export interface ConfirmUploadResult {
  documentId: string;
  // false when the server's magic-byte check found the file's actual
  // content doesn't match its claimed type — the upload still happened
  // (the row exists, flagged review_status='rejected'), it just isn't
  // being counted as a real submission for this checklist item.
  accepted: boolean;
  reason?: string;
}

export async function confirmUpload(input: {
  token: string;
  requiredDocumentId: string;
  storagePath: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<ConfirmUploadResult> {
  const { data, error } = await supabase.functions.invoke<ConfirmUploadResult>('portal-confirm-upload', {
    body: input,
  });
  if (error) throw await toPortalError(error);
  return data!;
}

export async function removeUpload(token: string, documentId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('portal-remove-upload', { body: { token, documentId } });
  if (error) throw await toPortalError(error);
}

export async function markDocumentUnavailable(
  token: string,
  requiredDocumentId: string,
  reason: string,
): Promise<void> {
  const { error } = await supabase.functions.invoke('portal-mark-unavailable', {
    body: { token, requiredDocumentId, reason },
  });
  if (error) throw await toPortalError(error);
}

export async function submitPortalRequest(token: string): Promise<void> {
  const { error } = await supabase.functions.invoke('portal-submit', {
    body: { token, appOrigin: window.location.origin },
  });
  if (error) throw await toPortalError(error);
}

export async function notifyExpiredLink(token: string): Promise<void> {
  const { error } = await supabase.functions.invoke('portal-notify-expired', {
    body: { token, appOrigin: window.location.origin },
  });
  if (error) throw await toPortalError(error);
}
