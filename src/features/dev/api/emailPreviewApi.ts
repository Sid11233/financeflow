import { supabase } from '@/lib/supabase';

export interface EmailPreviewResult {
  subject: string;
  html: string;
  text: string;
}

// Renders a template through the real send-email function (dryRun: true)
// rather than a separate frontend-side renderer — this is the only code
// that touches Resend, so previewing it any other way risks the preview
// drifting from what actually gets sent. Never sends anything or writes a
// messages row when dryRun is set (see send-email/index.ts).
export async function previewEmailTemplate(
  template: string,
  organizationId: string,
  variables: Record<string, unknown>,
): Promise<EmailPreviewResult> {
  const { data, error } = await supabase.functions.invoke<EmailPreviewResult>('send-email', {
    body: { template, organizationId, variables, dryRun: true },
  });
  if (error) throw new Error('Could not render this template.');
  return data!;
}
