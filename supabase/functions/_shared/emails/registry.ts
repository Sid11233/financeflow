import type { ReactNode } from 'npm:react@18.3.1';
import * as requestInitial from './templates/requestInitial.tsx';
import * as reminderNudge from './templates/reminderNudge.tsx';
import * as reminderFirm from './templates/reminderFirm.tsx';
import * as reminderFinal from './templates/reminderFinal.tsx';
import * as clientSubmitted from './templates/clientSubmitted.tsx';
import * as accountantOverdue from './templates/accountantOverdue.tsx';
import * as accountantDigest from './templates/accountantDigest.tsx';
import * as teamInvite from './templates/teamInvite.tsx';
import * as linkExpiredRequest from './templates/linkExpiredRequest.tsx';
import * as customMessage from './templates/customMessage.tsx';
import * as reminderBatch from './templates/reminderBatch.tsx';
import * as confirmSignup from './templates/confirmSignup.tsx';

export const TEMPLATE_NAMES = [
  'request_initial',
  'reminder_nudge',
  'reminder_firm',
  'reminder_final',
  'client_submitted',
  'accountant_overdue',
  'accountant_digest',
  'team_invite',
  'link_expired_request',
  'custom_message',
  'reminder_batch',
  'confirm_signup',
] as const;

export type TemplateName = (typeof TEMPLATE_NAMES)[number];

// deno-lint-ignore no-explicit-any
interface TemplateModule<V = any> {
  parseVariables(raw: Record<string, unknown>): V;
  subject(v: V): string;
  Email(v: V): ReactNode;
  toPlainText(v: V): string;
}

const registry: Record<TemplateName, TemplateModule> = {
  request_initial: requestInitial,
  reminder_nudge: reminderNudge,
  reminder_firm: reminderFirm,
  reminder_final: reminderFinal,
  client_submitted: clientSubmitted,
  accountant_overdue: accountantOverdue,
  accountant_digest: accountantDigest,
  team_invite: teamInvite,
  link_expired_request: linkExpiredRequest,
  custom_message: customMessage,
  reminder_batch: reminderBatch,
  confirm_signup: confirmSignup,
};

export function isTemplateName(value: string): value is TemplateName {
  return (TEMPLATE_NAMES as readonly string[]).includes(value);
}

export function getTemplate(name: TemplateName): TemplateModule {
  return registry[name];
}
