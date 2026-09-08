import { Button, Section, Text } from 'npm:@react-email/components@0.0.31';
import { Layout, colors, headingStyle, mutedStyle, textStyle } from '../layout.tsx';
import { plainTextChecklist, renderPlainTextEnvelope } from '../format.ts';

export interface ReminderVariables {
  firmName: string;
  logoUrl?: string | null;
  clientName: string;
  periodLabel: string;
  deadline: string;
  missingDocuments: string[];
  uploadedCount: number;
  totalCount: number;
  uploadUrl: string;
}

export function parseVariables(raw: Record<string, unknown>): ReminderVariables {
  if (typeof raw.clientName !== 'string' || typeof raw.periodLabel !== 'string' || typeof raw.uploadUrl !== 'string') {
    throw new Error('reminder templates require clientName, periodLabel, and uploadUrl.');
  }
  if (!Array.isArray(raw.missingDocuments)) {
    throw new Error('reminder templates require a missingDocuments array.');
  }
  return {
    firmName: String(raw.firmName ?? ''),
    logoUrl: typeof raw.logoUrl === 'string' ? raw.logoUrl : null,
    clientName: raw.clientName,
    periodLabel: raw.periodLabel,
    deadline: typeof raw.deadline === 'string' ? raw.deadline : '',
    missingDocuments: raw.missingDocuments.map(String),
    uploadedCount: Number(raw.uploadedCount ?? 0),
    totalCount: Number(raw.totalCount ?? raw.missingDocuments.length),
    uploadUrl: raw.uploadUrl,
  };
}

export function subject(v: ReminderVariables): string {
  return `Quick reminder: ${v.periodLabel} documents for ${v.firmName}`;
}

export function Email(v: ReminderVariables) {
  return (
    <Layout
      firmName={v.firmName}
      logoUrl={v.logoUrl}
      previewText={`You've uploaded ${v.uploadedCount} of ${v.totalCount} documents for ${v.periodLabel}.`}
      footerNote={`You're receiving this because ${v.firmName} uses FinanceFlow to collect your documents.`}
    >
      <Text style={headingStyle}>Just a friendly reminder</Text>
      <Text style={textStyle}>
        Hi {v.clientName}, you're off to a good start — you've uploaded {v.uploadedCount} of {v.totalCount}{' '}
        documents for {v.periodLabel}. A few are still missing:
      </Text>

      <Section style={{ margin: '0 0 24px' }}>
        {v.missingDocuments.map((label, index) => (
          <Text key={index} style={{ ...textStyle, margin: '0 0 8px' }}>
            ☐ {label}
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
          Finish Uploading
        </Button>
      </Section>

      <Text style={mutedStyle}>No rush — just don't want it to slip your mind.</Text>
    </Layout>
  );
}

export function toPlainText(v: ReminderVariables): string {
  const lines = [
    'Just a friendly reminder',
    '',
    `Hi ${v.clientName}, you've uploaded ${v.uploadedCount} of ${v.totalCount} documents for ${v.periodLabel}. A few are still missing:`,
    '',
    ...plainTextChecklist(v.missingDocuments),
    '',
    `Finish uploading: ${v.uploadUrl}`,
  ];
  return renderPlainTextEnvelope(
    v.firmName,
    lines,
    `You're receiving this because ${v.firmName} uses FinanceFlow to collect your documents.`,
  );
}
