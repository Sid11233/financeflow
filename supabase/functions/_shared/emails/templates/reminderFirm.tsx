import { Button, Section, Text } from 'npm:@react-email/components@0.0.31';
import { Layout, colors, headingStyle, mutedStyle, textStyle } from '../layout.tsx';
import { formatDateLabel, plainTextChecklist, renderPlainTextEnvelope } from '../format.ts';
import { parseVariables as parseReminderVariables } from './reminderNudge.tsx';
import type { ReminderVariables } from './reminderNudge.tsx';

export type { ReminderVariables };
export const parseVariables = parseReminderVariables;

export function subject(v: ReminderVariables): string {
  return `Action needed: ${v.periodLabel} documents for ${v.firmName}`;
}

function isPastDeadline(deadline: string): boolean {
  if (!deadline) return false;
  return new Date(`${deadline}T00:00:00`).getTime() < Date.now();
}

export function Email(v: ReminderVariables) {
  const overdue = isPastDeadline(v.deadline);
  return (
    <Layout
      firmName={v.firmName}
      logoUrl={v.logoUrl}
      previewText={overdue ? `The deadline for ${v.periodLabel} has passed.` : `The deadline for ${v.periodLabel} is almost here.`}
      footerNote={`You're receiving this because ${v.firmName} uses FinanceFlow to collect your documents.`}
    >
      <Text style={headingStyle}>{overdue ? 'This is now overdue' : 'Deadline coming up'}</Text>
      <Text style={textStyle}>
        Hi {v.clientName}, {overdue ? (
          <>the deadline for your {v.periodLabel} documents ({formatDateLabel(v.deadline)}) has passed.</>
        ) : (
          <>the deadline for your {v.periodLabel} documents is {formatDateLabel(v.deadline)} — coming up soon.</>
        )}{' '}
        The following are still outstanding:
      </Text>

      <Section style={{ margin: '0 0 24px' }}>
        {v.missingDocuments.map((label, index) => (
          <Text key={index} style={{ ...textStyle, margin: '0 0 8px', fontWeight: 600 }}>
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
        Please upload these as soon as you can so {v.firmName} can keep things moving.
      </Text>
    </Layout>
  );
}

export function toPlainText(v: ReminderVariables): string {
  const overdue = isPastDeadline(v.deadline);
  const lines = [
    overdue ? 'This is now overdue' : 'Deadline coming up',
    '',
    overdue
      ? `Hi ${v.clientName}, the deadline for your ${v.periodLabel} documents (${formatDateLabel(v.deadline)}) has passed. The following are still outstanding:`
      : `Hi ${v.clientName}, the deadline for your ${v.periodLabel} documents is ${formatDateLabel(v.deadline)} — coming up soon. The following are still outstanding:`,
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
