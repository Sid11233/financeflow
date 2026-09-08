import { Button, Section, Text } from 'npm:@react-email/components@0.0.31';
import { Layout, colors, headingStyle, textStyle } from '../layout.tsx';
import { renderPlainTextEnvelope } from '../format.ts';

export interface ClientSubmittedVariables {
  firmName: string;
  logoUrl?: string | null;
  clientName: string;
  periodLabel: string;
  requestUrl: string;
}

export function parseVariables(raw: Record<string, unknown>): ClientSubmittedVariables {
  if (typeof raw.clientName !== 'string' || typeof raw.periodLabel !== 'string' || typeof raw.requestUrl !== 'string') {
    throw new Error('client_submitted requires clientName, periodLabel, and requestUrl.');
  }
  return {
    firmName: String(raw.firmName ?? ''),
    logoUrl: typeof raw.logoUrl === 'string' ? raw.logoUrl : null,
    clientName: raw.clientName,
    periodLabel: raw.periodLabel,
    requestUrl: raw.requestUrl,
  };
}

export function subject(v: ClientSubmittedVariables): string {
  return `${v.clientName} has submitted their ${v.periodLabel} documents`;
}

export function Email(v: ClientSubmittedVariables) {
  return (
    <Layout
      firmName={v.firmName}
      logoUrl={v.logoUrl}
      previewText={`${v.clientName} has submitted their ${v.periodLabel} documents.`}
      footerNote="You're receiving this because you're a member of this organization on FinanceFlow."
    >
      <Text style={headingStyle}>{v.clientName} has submitted their documents</Text>
      <Text style={textStyle}>
        {v.clientName} marked their {v.periodLabel} document request as submitted.
      </Text>

      <Section style={{ textAlign: 'center', margin: '0 0 8px' }}>
        <Button
          href={v.requestUrl}
          style={{
            backgroundColor: colors.accent,
            color: colors.accentText,
            fontSize: 16,
            fontWeight: 600,
            padding: '14px 32px',
            borderRadius: 8,
            textDecoration: 'none',
            display: 'inline-block',
          }}
        >
          Review Submission
        </Button>
      </Section>
    </Layout>
  );
}

export function toPlainText(v: ClientSubmittedVariables): string {
  const lines = [
    `${v.clientName} has submitted their documents`,
    '',
    `${v.clientName} marked their ${v.periodLabel} document request as submitted.`,
    '',
    `Review it: ${v.requestUrl}`,
  ];
  return renderPlainTextEnvelope(
    v.firmName,
    lines,
    "You're receiving this because you're a member of this organization on FinanceFlow.",
  );
}
