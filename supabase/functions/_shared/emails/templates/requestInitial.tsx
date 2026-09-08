import { Button, Section, Text } from 'npm:@react-email/components@0.0.31';
import { Layout, colors, headingStyle, mutedStyle, textStyle } from '../layout.tsx';
import { formatDateLabel, plainTextChecklist, renderPlainTextEnvelope } from '../format.ts';

export interface RequestInitialVariables {
  firmName: string;
  logoUrl?: string | null;
  clientName: string;
  periodLabel: string;
  deadline: string;
  documents: { label: string; isOptional: boolean }[];
  uploadUrl: string;
  // Optional accountant-composed intro line, replacing the generic "is
  // requesting the following documents" sentence — the request-creation
  // wizard's review step lets an accountant customize this before sending.
  messageBody?: string;
}

export function parseVariables(raw: Record<string, unknown>): RequestInitialVariables {
  if (typeof raw.clientName !== 'string' || typeof raw.periodLabel !== 'string' || typeof raw.deadline !== 'string') {
    throw new Error('request_initial requires clientName, periodLabel, and deadline.');
  }
  if (typeof raw.uploadUrl !== 'string') {
    throw new Error('request_initial requires uploadUrl.');
  }
  if (!Array.isArray(raw.documents)) {
    throw new Error('request_initial requires a documents array.');
  }
  return {
    firmName: String(raw.firmName ?? ''),
    logoUrl: typeof raw.logoUrl === 'string' ? raw.logoUrl : null,
    clientName: raw.clientName,
    periodLabel: raw.periodLabel,
    deadline: raw.deadline,
    documents: raw.documents.map((item) => ({
      label: String((item as { label?: unknown })?.label ?? 'Document'),
      isOptional: Boolean((item as { isOptional?: unknown })?.isOptional),
    })),
    uploadUrl: raw.uploadUrl,
    messageBody: typeof raw.messageBody === 'string' && raw.messageBody.trim() ? raw.messageBody.trim() : undefined,
  };
}

export function subject(v: RequestInitialVariables): string {
  return `${v.firmName} is requesting your ${v.periodLabel} documents`;
}

export function Email(v: RequestInitialVariables) {
  return (
    <Layout
      firmName={v.firmName}
      logoUrl={v.logoUrl}
      previewText={`Documents needed for ${v.periodLabel}, due ${formatDateLabel(v.deadline)}`}
      footerNote={`You're receiving this because ${v.firmName} uses FinanceFlow to collect your documents.`}
    >
      <Text style={headingStyle}>Documents needed for {v.periodLabel}</Text>
      <Text style={textStyle}>
        Hi {v.clientName}, {v.messageBody ?? `${v.firmName} is requesting the following documents for ${v.periodLabel}.`}
      </Text>
      <Text style={{ ...textStyle, fontWeight: 600 }}>Due {formatDateLabel(v.deadline)}</Text>

      <Section style={{ margin: '0 0 24px' }}>
        {v.documents.map((doc, index) => (
          <Text key={index} style={{ ...textStyle, margin: '0 0 8px' }}>
            ☐ {doc.label}
            {doc.isOptional ? ' (optional)' : ''}
          </Text>
        ))}
      </Section>

      <Section style={{ textAlign: 'center', margin: '0 0 20px' }}>
        <Button
          href={v.uploadUrl}
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
          Upload Documents
        </Button>
      </Section>

      <Text style={mutedStyle}>
        Or paste this link into your browser:
        <br />
        {v.uploadUrl}
      </Text>
    </Layout>
  );
}

export function toPlainText(v: RequestInitialVariables): string {
  const lines = [
    `Documents needed for ${v.periodLabel}`,
    '',
    `Hi ${v.clientName}, ${v.messageBody ?? `${v.firmName} is requesting the following documents for ${v.periodLabel}.`}`,
    `Due ${formatDateLabel(v.deadline)}`,
    '',
    ...plainTextChecklist(v.documents.map((doc) => `${doc.label}${doc.isOptional ? ' (optional)' : ''}`)),
    '',
    `Upload your documents: ${v.uploadUrl}`,
  ];
  return renderPlainTextEnvelope(
    v.firmName,
    lines,
    `You're receiving this because ${v.firmName} uses FinanceFlow to collect your documents.`,
  );
}
