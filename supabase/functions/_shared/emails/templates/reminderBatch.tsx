/** @jsxImportSource npm:react@18.3.1 */
// Not one of the 9 originally-named templates — required by the "never
// send more than one client-facing reminder per client per day" rule
// (see process-reminders): when a client has multiple requests with a
// reminder due in the same run, they get combined into one email using
// this template instead of firing reminder_nudge/firm/final once per
// request.
import { Button, Hr, Section, Text } from 'npm:@react-email/components@0.0.31';
import { Layout, colors, headingStyle, textStyle } from '../layout.tsx';
import { plainTextChecklist, renderPlainTextEnvelope } from '../format.ts';

export interface ReminderBatchItem {
  periodLabel: string;
  missingDocuments: string[];
  uploadUrl: string;
}

export interface ReminderBatchVariables {
  firmName: string;
  logoUrl?: string | null;
  clientName: string;
  items: ReminderBatchItem[];
}

function parseItem(raw: unknown): ReminderBatchItem {
  const row = raw as Record<string, unknown>;
  if (typeof row.periodLabel !== 'string' || typeof row.uploadUrl !== 'string' || !Array.isArray(row.missingDocuments)) {
    throw new Error('reminder_batch item requires periodLabel, missingDocuments, and uploadUrl.');
  }
  return {
    periodLabel: row.periodLabel,
    missingDocuments: row.missingDocuments.map(String),
    uploadUrl: row.uploadUrl,
  };
}

export function parseVariables(raw: Record<string, unknown>): ReminderBatchVariables {
  if (typeof raw.clientName !== 'string') {
    throw new Error('reminder_batch requires clientName.');
  }
  if (!Array.isArray(raw.items) || raw.items.length === 0) {
    throw new Error('reminder_batch requires a non-empty items array.');
  }
  return {
    firmName: String(raw.firmName ?? ''),
    logoUrl: typeof raw.logoUrl === 'string' ? raw.logoUrl : null,
    clientName: raw.clientName,
    items: raw.items.map(parseItem),
  };
}

export function subject(v: ReminderBatchVariables): string {
  return v.items.length === 1
    ? `Reminder: ${v.items[0].periodLabel} documents for ${v.firmName}`
    : `Reminder: documents needed for ${v.items.length} periods — ${v.firmName}`;
}

export function Email(v: ReminderBatchVariables) {
  return (
    <Layout
      firmName={v.firmName}
      logoUrl={v.logoUrl}
      previewText={
        v.items.length === 1
          ? `Documents still needed for ${v.items[0].periodLabel}.`
          : `Documents still needed across ${v.items.length} requests.`
      }
      footerNote={`You're receiving this because ${v.firmName} uses FinanceFlow to collect your documents.`}
    >
      <Text style={headingStyle}>
        {v.items.length === 1 ? 'Documents still needed' : `Documents needed across ${v.items.length} requests`}
      </Text>
      <Text style={textStyle}>Hi {v.clientName}, here's what's still outstanding:</Text>

      {v.items.map((item, index) => (
        <Section key={index} style={{ margin: index === 0 ? '0 0 20px' : '20px 0' }}>
          {index > 0 && <Hr style={{ borderColor: colors.cardBorder, margin: '0 0 20px' }} />}
          <Text style={{ ...textStyle, fontWeight: 700, margin: '0 0 8px' }}>{item.periodLabel}</Text>
          {item.missingDocuments.map((label, docIndex) => (
            <Text key={docIndex} style={{ ...textStyle, margin: '0 0 6px' }}>
              ☐ {label}
            </Text>
          ))}
          <Button
            href={item.uploadUrl}
            style={{
              backgroundColor: colors.accent,
              color: colors.accentText,
              fontSize: 14,
              fontWeight: 600,
              padding: '10px 20px',
              borderRadius: 8,
              textDecoration: 'none',
              display: 'inline-block',
            }}
          >
            Upload for {item.periodLabel}
          </Button>
        </Section>
      ))}
    </Layout>
  );
}

export function toPlainText(v: ReminderBatchVariables): string {
  const lines = [
    v.items.length === 1 ? 'Documents still needed' : `Documents needed across ${v.items.length} requests`,
    '',
    `Hi ${v.clientName}, here's what's still outstanding:`,
  ];

  for (const item of v.items) {
    lines.push('', item.periodLabel, ...plainTextChecklist(item.missingDocuments), `Upload: ${item.uploadUrl}`);
  }

  return renderPlainTextEnvelope(
    v.firmName,
    lines,
    `You're receiving this because ${v.firmName} uses FinanceFlow to collect your documents.`,
  );
}
