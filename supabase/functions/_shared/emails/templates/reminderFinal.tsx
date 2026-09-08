import { Button, Section, Text } from 'npm:@react-email/components@0.0.31';
import { Layout, colors, headingStyle, mutedStyle, textStyle } from '../layout.tsx';
import { plainTextChecklist, renderPlainTextEnvelope } from '../format.ts';
import { parseVariables as parseReminderVariables } from './reminderNudge.tsx';
import type { ReminderVariables } from './reminderNudge.tsx';

export type { ReminderVariables };
export const parseVariables = parseReminderVariables;

export function subject(v: ReminderVariables): string {
  return `${v.periodLabel} documents are significantly overdue`;
}

export function Email(v: ReminderVariables) {
  return (
    <Layout
      firmName={v.firmName}
      logoUrl={v.logoUrl}
      previewText={`Your ${v.periodLabel} documents are significantly overdue.`}
      footerNote={`You're receiving this because ${v.firmName} uses FinanceFlow to collect your documents.`}
    >
      <Text style={headingStyle}>This request is significantly overdue</Text>
      <Text style={textStyle}>
        Hi {v.clientName}, your {v.periodLabel} documents are significantly overdue. {v.firmName} has been notified.
        The following are still missing:
      </Text>

      <Section style={{ margin: '0 0 24px' }}>
        {v.missingDocuments.map((label, index) => (
          <Text key={index} style={{ ...textStyle, margin: '0 0 8px', fontWeight: 600, color: colors.warning }}>
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
          Upload Now
        </Button>
      </Section>

      <Text style={mutedStyle}>
        If there's a reason these can't be provided, please reach out to {v.firmName} directly.
      </Text>
    </Layout>
  );
}

export function toPlainText(v: ReminderVariables): string {
  const lines = [
    'This request is significantly overdue',
    '',
    `Hi ${v.clientName}, your ${v.periodLabel} documents are significantly overdue. ${v.firmName} has been notified. The following are still missing:`,
    '',
    ...plainTextChecklist(v.missingDocuments),
    '',
    `Upload now: ${v.uploadUrl}`,
  ];
  return renderPlainTextEnvelope(
    v.firmName,
    lines,
    `You're receiving this because ${v.firmName} uses FinanceFlow to collect your documents.`,
  );
}
