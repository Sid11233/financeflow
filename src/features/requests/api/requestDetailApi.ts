import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { ChecklistDocument, ChecklistRequiredDocument, ReminderRow, RequestDetail } from '../types';

async function toFunctionError(error: unknown): Promise<Error> {
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

export async function getRequestDetail(requestId: string): Promise<RequestDetail> {
  const { data: overview, error } = await supabase.from('request_overview').select('*').eq('id', requestId).single();
  if (error) throw error;

  const [{ data: client, error: clientError }, { data: requestRow, error: requestError }] = await Promise.all([
    supabase.from('clients').select('email, phone').eq('id', overview.client_id).single(),
    supabase.from('requests').select('reminders_paused_at').eq('id', requestId).single(),
  ]);
  if (clientError) throw clientError;
  if (requestError) throw requestError;

  return {
    id: overview.id,
    organization_id: overview.organization_id,
    client_id: overview.client_id,
    client_name: overview.client_name,
    client_email: client.email,
    client_phone: client.phone,
    period_start: overview.period_start,
    period_label: overview.period_label,
    status: overview.status,
    deadline: overview.deadline,
    created_at: overview.created_at,
    sent_at: overview.sent_at,
    completed_at: overview.completed_at,
    reminders_paused_at: requestRow.reminders_paused_at,
    completion_percentage: overview.completion_percentage,
    required_count: overview.required_count,
    resolved_count: overview.resolved_count,
    waived_count: overview.waived_count,
    needs_review_count: overview.needs_review_count,
    days_until_deadline: overview.days_until_deadline,
  };
}

export interface RawRequiredDocument {
  id: string;
  document_type_id: string | null;
  custom_name: string | null;
  status: ChecklistRequiredDocument['status'];
  is_optional: boolean;
  sort_order: number;
  waived_reason: string | null;
  waived_at: string | null;
}

export interface RequestChecklist {
  requiredDocuments: RawRequiredDocument[];
  documents: ChecklistDocument[];
}

// required_documents.document_type_id is resolved to a display label by
// the caller (useRequestChecklist, against useDocumentTypes) rather than
// embedded through a PostgREST join here — one less relationship to keep
// in sync in the hand-authored database.types.ts.
export async function getRequestChecklist(requestId: string): Promise<RequestChecklist> {
  const [{ data: requiredDocuments, error: rdError }, { data: documents, error: docError }] = await Promise.all([
    supabase
      .from('required_documents')
      .select('id, document_type_id, custom_name, status, is_optional, sort_order, waived_reason, waived_at')
      .eq('request_id', requestId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('documents')
      .select(
        'id, request_id, required_document_id, storage_path, original_filename, mime_type, size_bytes, uploaded_at, uploader_ip, ai_classification, ai_confidence, review_status, review_reason',
      )
      .eq('request_id', requestId)
      .is('deleted_at', null)
      .order('uploaded_at', { ascending: true }),
  ]);

  if (rdError) throw rdError;
  if (docError) throw docError;

  return {
    requiredDocuments: (requiredDocuments ?? []) as RawRequiredDocument[],
    documents: (documents ?? []) as unknown as ChecklistDocument[],
  };
}

export async function listReminders(requestId: string): Promise<ReminderRow[]> {
  const { data, error } = await supabase
    .from('reminders')
    .select('id, channel, type, scheduled_for, sent_at, skipped_at')
    .eq('request_id', requestId)
    .order('scheduled_for', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ReminderRow[];
}

export async function acceptDocument(documentId: string) {
  const { error } = await supabase.rpc('accept_document', { p_document_id: documentId });
  if (error) throw error;
}

export async function reassignDocument(documentId: string, targetRequiredDocumentId: string) {
  const { error } = await supabase.rpc('reassign_document', {
    p_document_id: documentId,
    p_target_required_document_id: targetRequiredDocumentId,
  });
  if (error) throw error;
}

export async function rejectDocument(documentId: string, reason?: string) {
  const { error } = await supabase.rpc('reject_document', { p_document_id: documentId, p_reason: reason ?? null });
  if (error) throw error;
}

export async function waiveRequiredDocument(requiredDocumentId: string, reason?: string, documentId?: string) {
  const { error } = await supabase.rpc('waive_required_document', {
    p_required_document_id: requiredDocumentId,
    p_reason: reason ?? null,
    p_document_id: documentId ?? null,
  });
  if (error) throw error;
}

export async function extendRequestDeadline(requestId: string, newDeadline: string) {
  const { error } = await supabase.rpc('extend_request_deadline', {
    p_request_id: requestId,
    p_new_deadline: newDeadline,
  });
  if (error) throw error;
}

export async function markRequestComplete(requestId: string) {
  const { error } = await supabase.rpc('mark_request_complete', { p_request_id: requestId });
  if (error) throw error;
}

export async function cancelRequest(requestId: string) {
  const { error } = await supabase.rpc('cancel_request', { p_request_id: requestId });
  if (error) throw error;
}

export async function setReminderSkipped(reminderId: string, skipped: boolean) {
  const { error } = await supabase.rpc('set_reminder_skipped', { p_reminder_id: reminderId, p_skipped: skipped });
  if (error) throw error;
}

export async function setRemindersPaused(requestId: string, paused: boolean) {
  const { error } = await supabase.rpc('set_reminders_paused', { p_request_id: requestId, p_paused: paused });
  if (error) throw error;
}

export type NotifyAction = 'reminder' | 'resend' | 'copy_link';

export interface NotifyResult {
  url: string;
  emailSent: boolean | null;
}

export async function notifyRequest(requestId: string, action: NotifyAction): Promise<NotifyResult> {
  const { data, error } = await supabase.functions.invoke<NotifyResult>('request-notify', {
    body: { requestId, action, appOrigin: window.location.origin },
  });
  if (error) throw await toFunctionError(error);
  return data!;
}

// Used by the "reject and ask for a new copy" flow: send-email is generic
// (see supabase/functions/send-email) and already accepts any logged-in
// user's own JWT, so this calls it directly rather than adding a
// dedicated Edge Function just to wrap one email.
export interface SendCustomMessageInput {
  to: string;
  organizationId: string;
  requestId: string;
  subject: string;
  body: string;
}

export async function sendCustomMessage(input: SendCustomMessageInput): Promise<void> {
  const { error } = await supabase.functions.invoke('send-email', {
    body: {
      template: 'custom_message',
      to: input.to,
      organizationId: input.organizationId,
      requestId: input.requestId,
      variables: { subject: input.subject, body: input.body },
    },
  });
  if (error) throw await toFunctionError(error);
}

export async function removeDocument(documentId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('remove-document', { body: { documentId } });
  if (error) throw await toFunctionError(error);
}
