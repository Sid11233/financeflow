import { Button, Hr, Link, Section, Text } from 'npm:@react-email/components@0.0.31';
import { Layout, colors, headingStyle, textStyle } from '../layout.tsx';
import { formatDateLabel, renderPlainTextEnvelope } from '../format.ts';

export interface DigestRequestSummary {
  clientName: string;
  periodLabel: string;
  deadline: string;
  requestUrl: string;
}

export interface AccountantDigestVariables {
  firmName: string;
  logoUrl?: string | null;
  cadence: 'daily' | 'weekly';
  overdue: DigestRequestSummary[];
  waiting: DigestRequestSummary[];
  dashboardUrl: string;
  unsubscribeUrl: string;
}

function parseSummaries(raw: unknown, field: string): DigestRequestSummary[] {
  if (!Array.isArray(raw)) throw new Error(`accountant_digest requires a ${field} array.`);
  return raw.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      clientName: String(row.clientName ?? 'A client'),
      periodLabel: String(row.periodLabel ?? ''),
      deadline: String(row.deadline ?? ''),
      requestUrl: String(row.requestUrl ?? ''),
    };
  });
}

export function parseVariables(raw: Record<string, unknown>): AccountantDigestVariables {
  if (raw.cadence !== 'daily' && raw.cadence !== 'weekly') {
    throw new Error('accountant_digest requires cadence to be "daily" or "weekly".');
  }
  if (typeof raw.dashboardUrl !== 'string') {
    throw new Error('accountant_digest requires dashboardUrl.');
  }
  if (typeof raw.unsubscribeUrl !== 'string') {
    throw new Error('accountant_digest requires unsubscribeUrl.');
  }
  return {
    firmName: String(raw.firmName ?? ''),
    logoUrl: typeof raw.logoUrl === 'string' ? raw.logoUrl : null,
    cadence: raw.cadence,
    overdue: parseSummaries(raw.overdue, 'overdue'),
    waiting: parseSummaries(raw.waiting, 'waiting'),
    dashboardUrl: raw.dashboardUrl,
    unsubscribeUrl: raw.unsubscribeUrl,
  };
}

export function subject(v: AccountantDigestVariables): string {
  const cadenceLabel = v.cadence === 'daily' ? 'Daily' : 'Weekly';
  return `${cadenceLabel} summary: ${v.overdue.length} overdue, ${v.waiting.length} waiting`;
}

function RequestRow({ item, isOverdue }: { item: DigestRequestSummary; isOverdue: boolean }) {
  return (
    <Text style={{ ...textStyle, margin: '0 0 8px' }}>
      <Link href={item.requestUrl} style={{ color: colors.text, textDecoration: 'underline' }}>
        {item.clientName} — {item.periodLabel}
      </Link>{' '}
      <span style={{ color: isOverdue ? colors.warning : colors.muted }}>
        (due {formatDateLabel(item.deadline)})
      </span>
    </Text>
  );
}

export function Email(v: AccountantDigestVariables) {
  const cadenceLabel = v.cadence === 'daily' ? 'Daily' : 'Weekly';
  return (
    <Layout
      firmName={v.firmName}
      logoUrl={v.logoUrl}
      previewText={`${v.overdue.length} overdue, ${v.waiting.length} waiting on documents.`}
      footerNote={`You're receiving this ${v.cadence} summary because you're a member of this organization on FinanceFlow.`}
      footerLink={{ label: 'Unsubscribe from this digest', url: v.unsubscribeUrl }}
    >
      <Text style={headingStyle}>{cadenceLabel} summary</Text>

      {v.overdue.length > 0 && (
        <>
          <Text style={{ ...textStyle, fontWeight: 700, color: colors.warning }}>Overdue ({v.overdue.length})</Text>
          <Section style={{ margin: '0 0 20px' }}>
            {v.overdue.map((item, index) => (
              <RequestRow key={index} item={item} isOverdue />
            ))}
          </Section>
        </>
      )}

      {v.waiting.length > 0 && (
        <>
          <Text style={{ ...textStyle, fontWeight: 700 }}>Waiting on client ({v.waiting.length})</Text>
          <Section style={{ margin: '0 0 20px' }}>
            {v.waiting.map((item, index) => (
              <RequestRow key={index} item={item} isOverdue={false} />
            ))}
          </Section>
        </>
      )}

      {v.overdue.length === 0 && v.waiting.length === 0 && (
        <Text style={textStyle}>Nothing waiting or overdue right now — you're all caught up.</Text>
      )}

      <Hr style={{ borderColor: colors.cardBorder, margin: '8px 0 20px' }} />

      <Section style={{ textAlign: 'center' }}>
        <Button
          href={v.dashboardUrl}
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
          Open Dashboard
        </Button>
      </Section>
    </Layout>
  );
}

export function toPlainText(v: AccountantDigestVariables): string {
  const cadenceLabel = v.cadence === 'daily' ? 'Daily' : 'Weekly';
  const lines = [`${cadenceLabel} summary`, ''];

  if (v.overdue.length > 0) {
    lines.push(`Overdue (${v.overdue.length})`);
    for (const item of v.overdue) {
      lines.push(`- ${item.clientName} — ${item.periodLabel} (due ${formatDateLabel(item.deadline)}): ${item.requestUrl}`);
    }
    lines.push('');
  }

  if (v.waiting.length > 0) {
    lines.push(`Waiting on client (${v.waiting.length})`);
    for (const item of v.waiting) {
      lines.push(`- ${item.clientName} — ${item.periodLabel} (due ${formatDateLabel(item.deadline)}): ${item.requestUrl}`);
    }
    lines.push('');
  }

  if (v.overdue.length === 0 && v.waiting.length === 0) {
    lines.push("Nothing waiting or overdue right now — you're all caught up.", '');
  }

  lines.push(`Open dashboard: ${v.dashboardUrl}`);

  return renderPlainTextEnvelope(
    v.firmName,
    lines,
    `You're receiving this ${v.cadence} summary because you're a member of this organization on FinanceFlow. Unsubscribe: ${v.unsubscribeUrl}`,
  );
}
