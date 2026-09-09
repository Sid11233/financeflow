import { Button, Section, Text } from 'npm:@react-email/components@0.0.31';
import { Layout, colors, headingStyle, mutedStyle, textStyle } from '../layout.tsx';
import { renderPlainTextEnvelope } from '../format.ts';

export interface ConfirmSignupVariables {
  firmName: string;
  logoUrl?: string | null;
  confirmUrl: string;
}

export function parseVariables(raw: Record<string, unknown>): ConfirmSignupVariables {
  if (typeof raw.confirmUrl !== 'string') {
    throw new Error('confirm_signup requires confirmUrl.');
  }
  return {
    firmName: String(raw.firmName ?? ''),
    logoUrl: typeof raw.logoUrl === 'string' ? raw.logoUrl : null,
    confirmUrl: raw.confirmUrl,
  };
}

export function subject(): string {
  return 'Confirm your email for FinanceFlow';
}

export function Email(v: ConfirmSignupVariables) {
  return (
    <Layout
      firmName={v.firmName}
      logoUrl={v.logoUrl}
      previewText="Confirm your email to finish setting up your FinanceFlow workspace."
      footerNote="You're receiving this because this email address was just used to create a FinanceFlow account."
    >
      <Text style={headingStyle}>Confirm your email</Text>
      <Text style={textStyle}>
        Welcome to FinanceFlow. Confirm this email address to finish setting up <strong>{v.firmName}</strong>'s
        workspace.
      </Text>

      <Section style={{ textAlign: 'center', margin: '0 0 20px' }}>
        <Button
          href={v.confirmUrl}
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
          Confirm email
        </Button>
      </Section>

      <Text style={mutedStyle}>
        If you didn't create a FinanceFlow account, you can safely ignore this email.
      </Text>
    </Layout>
  );
}

export function toPlainText(v: ConfirmSignupVariables): string {
  const lines = [
    'Confirm your email',
    '',
    `Welcome to FinanceFlow. Confirm this email address to finish setting up ${v.firmName}'s workspace.`,
    '',
    `Confirm your email: ${v.confirmUrl}`,
    '',
    "If you didn't create a FinanceFlow account, you can safely ignore this email.",
  ];
  return renderPlainTextEnvelope(
    v.firmName,
    lines,
    "You're receiving this because this email address was just used to create a FinanceFlow account.",
  );
}
