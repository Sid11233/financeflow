import { Button, Section, Text } from 'npm:@react-email/components@0.0.31';
import { Layout, colors, headingStyle, mutedStyle, textStyle } from '../layout.tsx';
import { renderPlainTextEnvelope } from '../format.ts';

export interface TeamInviteVariables {
  firmName: string;
  logoUrl?: string | null;
  inviterName: string;
  acceptUrl: string;
  expiresInDays: number;
}

export function parseVariables(raw: Record<string, unknown>): TeamInviteVariables {
  if (typeof raw.acceptUrl !== 'string') {
    throw new Error('team_invite requires acceptUrl.');
  }
  return {
    firmName: String(raw.firmName ?? ''),
    logoUrl: typeof raw.logoUrl === 'string' ? raw.logoUrl : null,
    inviterName: String(raw.inviterName ?? 'A teammate'),
    acceptUrl: raw.acceptUrl,
    expiresInDays: Number(raw.expiresInDays ?? 7),
  };
}

export function subject(v: TeamInviteVariables): string {
  return `You've been invited to join ${v.firmName} on FinanceFlow`;
}

export function Email(v: TeamInviteVariables) {
  return (
    <Layout
      firmName={v.firmName}
      logoUrl={v.logoUrl}
      previewText={`${v.inviterName} invited you to join ${v.firmName} on FinanceFlow.`}
      footerNote={`You're receiving this because ${v.inviterName} invited you to join ${v.firmName}.`}
    >
      <Text style={headingStyle}>Join {v.firmName} on FinanceFlow</Text>
      <Text style={textStyle}>
        {v.inviterName} invited you to join <strong>{v.firmName}</strong>'s workspace on FinanceFlow.
      </Text>

      <Section style={{ textAlign: 'center', margin: '0 0 20px' }}>
        <Button
          href={v.acceptUrl}
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
          Accept Invite
        </Button>
      </Section>

      <Text style={mutedStyle}>This invite expires in {v.expiresInDays} days.</Text>
    </Layout>
  );
}

export function toPlainText(v: TeamInviteVariables): string {
  const lines = [
    `Join ${v.firmName} on FinanceFlow`,
    '',
    `${v.inviterName} invited you to join ${v.firmName}'s workspace on FinanceFlow.`,
    '',
    `Accept your invite: ${v.acceptUrl}`,
    `This invite expires in ${v.expiresInDays} days.`,
  ];
  return renderPlainTextEnvelope(v.firmName, lines, `You're receiving this because ${v.inviterName} invited you to join ${v.firmName}.`);
}
