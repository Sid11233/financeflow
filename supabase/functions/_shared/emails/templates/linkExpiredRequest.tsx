import { Button, Section, Text } from 'npm:@react-email/components@0.0.31';
import { Layout, colors, headingStyle, textStyle } from '../layout.tsx';
import { renderPlainTextEnvelope } from '../format.ts';

export interface LinkExpiredRequestVariables {
  firmName: string;
  logoUrl?: string | null;
  clientName: string;
  periodLabel: string;
  requestUrl: string;
}

export function parseVariables(raw: Record<string, unknown>): LinkExpiredRequestVariables {
  if (typeof raw.clientName !== 'string' || typeof raw.periodLabel !== 'string' || typeof raw.requestUrl !== 'string') {
    throw new Error('link_expired_request requires clientName, periodLabel, and requestUrl.');
  }
  return {
    firmName: String(raw.firmName ?? ''),
    logoUrl: typeof raw.logoUrl === 'string' ? raw.logoUrl : null,
    clientName: raw.clientName,
    periodLabel: raw.periodLabel,
    requestUrl: raw.requestUrl,
  };
}

export function subject(v: LinkExpiredRequestVariables): string {
  return `${v.clientName} needs a new upload link for ${v.periodLabel}`;
}

export function Email(v: LinkExpiredRequestVariables) {
  return (
    <Layout
      firmName={v.firmName}
      logoUrl={v.logoUrl}
      previewText={`${v.clientName}'s upload link is no longer working.`}
      footerNote="You're receiving this because you're a member of this organization on FinanceFlow."
    >
      <Text style={headingStyle}>{v.clientName} needs a fresh link</Text>
      <Text style={textStyle}>
        {v.clientName} tried to open their upload link for {v.periodLabel}, but it's expired, been used up, or is no
        longer valid. Send them a fresh one from the request page.
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
          Open Request
        </Button>
      </Section>
    </Layout>
  );
}

export function toPlainText(v: LinkExpiredRequestVariables): string {
  const lines = [
    `${v.clientName} needs a fresh link`,
    '',
    `${v.clientName} tried to open their upload link for ${v.periodLabel}, but it's expired, been used up, or is no longer valid. Send them a fresh one from the request page.`,
    '',
    `Open the request: ${v.requestUrl}`,
  ];
  return renderPlainTextEnvelope(
    v.firmName,
    lines,
    "You're receiving this because you're a member of this organization on FinanceFlow.",
  );
}
