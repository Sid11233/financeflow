import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { ChecklistItem } from '../types';

export interface SendRequestInput {
  clientId: string;
  periodStart: string;
  periodLabel: string;
  deadline: string;
  status: 'draft' | 'sent';
  checklist: ChecklistItem[];
  messageBody?: string;
}

export interface SendRequestResult {
  requestId: string;
  emailSent: boolean | null;
}

async function extractFunctionErrorMessage(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      if (typeof body?.error === 'string') return body.error;
    } catch {
      // fall through to the generic message below
    }
  }
  return 'Something went wrong. Please try again.';
}

export async function sendRequest(input: SendRequestInput): Promise<SendRequestResult> {
  const { data, error } = await supabase.functions.invoke<SendRequestResult>('send-request', {
    body: {
      clientId: input.clientId,
      periodStart: input.periodStart,
      periodLabel: input.periodLabel,
      deadline: input.deadline,
      status: input.status,
      messageBody: input.messageBody,
      appOrigin: window.location.origin,
      checklist: input.checklist
        .filter((item) => item.isChecked)
        .map((item) => ({
          documentTypeId: item.documentTypeId ?? undefined,
          customName: item.customName ?? undefined,
          isOptional: item.isOptional,
          label: item.label,
        })),
    },
  });

  if (error) throw new Error(await extractFunctionErrorMessage(error));
  return data!;
}
