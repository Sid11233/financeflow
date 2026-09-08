import { Button, Section, Text } from 'npm:@react-email/components@0.0.31';
import { Layout, colors, headingStyle, textStyle } from '../layout.tsx';
import { formatDateLabel, plainTextChecklist, renderPlainTextEnvelope } from '../format.ts';

export interface AccountantOverdueVariables {
  firmName: string;
  logoUrl?: string | null;
  clientName: string;
  periodLabel: string;
  deadline: string;
  missingDocuments: string[];
  requestUrl: string;
}

export function parseVariables(raw: Record<string, unknown>): AccountantOverdueVariables {
  if (
    typeof raw.clientName !== 'string' ||
    typeof raw.periodLabel !== 'string' ||
    typeof raw.deadline !== 'string' ||
    typeof raw.requestUrl !== 'string'
  ) {
    throw new Error('accountant_overdue requires clientName, periodLabel, deadline, and requestUrl.');
  }
  if (!Array.isArray(raw.missingDocuments)) {
    throw new Error('accountant_overdue requires a missingDocuments array.');
  }
  return {
    firmName: String(raw.firmName ?? ''),
    logoUrl: typeof raw.logoUrl === 'string' ? raw.logoUrl : null,
    clientName: raw.clientName,
    periodLabel: raw.periodLabel,
    deadline: raw.deadline,
    missingDocuments: raw.missingDocuments.map(String),
    requestUrl: raw.requestUrl,
  };
}

export function subject(v: AccountantOverdueVariables): string {
  return `${v.clientName} is overdue for ${v.periodLabel}`;
}

export function Email(v: AccountantOverdueVariables) {
  return (
    <Layout
      firmName={v.firmName}
      logoUrl={v.logoUrl}
      previewText={`${v.clientName} is overdue for ${v.periodLabel}.`}
      footerNote="You're receiving this because you're a member of this organization on FinanceFlow."
    >
      <Text style={headingStyle}>{v.clientName} is overdue</Text>
      <Text style={textStyle}>
        {v.clientName}'s {v.periodLabel} request was due {formatDateLabel(v.deadline)} and is still missing:
      </Text>

      <Section style={{ margin: '0 0 24px' }}>
        {v.missingDocuments.map((label, index) => (
          <Text key={index} style={{ ...textStyle, margin: '0 0 8px', color: colors.warning }}>
            ☐ {label}
          </Text>
        ))}
      </Section>

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
          View Request
        </Button>
      </Section>
    </Layout>
  );
}

export function toPlainText(v: AccountantOverdueVariables): string {
  const lines = [
    `${v.clientName} is overdue`,
    '',
    `${v.clientName}'s ${v.periodLabel} request was due ${formatDateLabel(v.deadline)} and is still missing:`,
    '',
    ...plainTextChecklist(v.missingDocuments),
    '',
    `View the request: ${v.requestUrl}`,
  ];
  return renderPlainTextEnvelope(
    v.firmName,
    lines,
    "You're receiving this because you're a member of this organization on FinanceFlow.",
  );
}
