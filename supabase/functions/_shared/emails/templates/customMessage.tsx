// Not one of the 9 named templates — a thin wrapper for the one place in
// the app where an accountant composes their own freeform message (the
// request detail page's "reject and ask for a new copy" flow). Keeping it
// as a template rather than a one-off bypass is what keeps send-email the
// only code that ever touches Resend.
import { Text } from 'npm:@react-email/components@0.0.31';
import { Layout, headingStyle, textStyle } from '../layout.tsx';
import { renderPlainTextEnvelope } from '../format.ts';

export interface CustomMessageVariables {
  firmName: string;
  logoUrl?: string | null;
  subject: string;
  body: string;
}

export function parseVariables(raw: Record<string, unknown>): CustomMessageVariables {
  if (typeof raw.subject !== 'string' || typeof raw.body !== 'string') {
    throw new Error('custom_message requires subject and body.');
  }
  return {
    firmName: String(raw.firmName ?? ''),
    logoUrl: typeof raw.logoUrl === 'string' ? raw.logoUrl : null,
    subject: raw.subject,
    body: raw.body,
  };
}

export function subject(v: CustomMessageVariables): string {
  return v.subject;
}

export function Email(v: CustomMessageVariables) {
  return (
    <Layout
      firmName={v.firmName}
      logoUrl={v.logoUrl}
      previewText={v.subject}
      footerNote={`You're receiving this because ${v.firmName} sent you a message via FinanceFlow.`}
    >
      <Text style={headingStyle}>{v.subject}</Text>
      {v.body.split('\n').map((line, index) =>
        line.trim() === '' ? <br key={index} /> : (
          <Text key={index} style={{ ...textStyle, margin: '0 0 4px' }}>
            {line}
          </Text>
        ),
      )}
    </Layout>
  );
}

export function toPlainText(v: CustomMessageVariables): string {
  return renderPlainTextEnvelope(
    v.firmName,
    [v.subject, '', v.body],
    `You're receiving this because ${v.firmName} sent you a message via FinanceFlow.`,
  );
}
