// Shared visual shell for every template: firm name/logo header, a single
// white card, generous white space, capped at 600px, and dark-mode-safe
// via an explicit @media (prefers-color-scheme: dark) block — email
// clients that support dark mode render the user's OS/app preference
// directly against light-mode-authored HTML unless a template says
// otherwise, which without this would produce near-invisible dark-grey-
// on-dark-grey text in a lot of mail clients.
//
// No tracking pixel is added here, deliberately — but note this only
// covers what this code controls. Resend's own open/click tracking is an
// account/domain-level setting in the Resend dashboard, not a per-send
// API parameter; it must be turned off there for "no tracking" to hold in
// practice regardless of what HTML this file produces.
import type { ReactNode } from 'npm:react@18.3.1';
import { Body, Container, Head, Hr, Html, Img, Link, Preview, Section, Text } from 'npm:@react-email/components@0.0.31';

const DARK_MODE_CSS = `
@media (prefers-color-scheme: dark) {
  .email-bg { background-color: #18181b !important; }
  .email-card { background-color: #27272a !important; border-color: #3f3f46 !important; }
  .email-heading { color: #fafafa !important; }
  .email-text { color: #e4e4e7 !important; }
  .email-muted { color: #a1a1aa !important; }
  .email-hr { border-color: #3f3f46 !important; }
}
`;

export const colors = {
  bg: '#f4f4f5',
  card: '#ffffff',
  cardBorder: '#e4e4e7',
  heading: '#18181b',
  text: '#3f3f46',
  muted: '#71717a',
  accent: '#4f46e5',
  accentText: '#ffffff',
  warning: '#b45309',
  warningBg: '#fffbeb',
};

export const fontFamily =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export const textStyle = { fontSize: 15, lineHeight: '24px', color: colors.text, margin: '0 0 16px' };
export const headingStyle = { fontSize: 20, fontWeight: 700, color: colors.heading, margin: '0 0 16px' };
export const mutedStyle = { fontSize: 13, color: colors.muted, margin: '0 0 16px' };

export interface LayoutProps {
  firmName: string;
  logoUrl?: string | null;
  previewText: string;
  footerNote: string;
  // Optional second footer line rendered as a link — currently only used
  // for the digest's unsubscribe link, but kept generic rather than named
  // after that one caller.
  footerLink?: { label: string; url: string };
  children: ReactNode;
}

export function Layout({ firmName, logoUrl, previewText, footerNote, footerLink, children }: LayoutProps) {
  return (
    <Html dir="ltr" lang="en">
      <Head>
        <style>{DARK_MODE_CSS}</style>
      </Head>
      <Preview>{previewText}</Preview>
      <Body
        className="email-bg"
        style={{ backgroundColor: colors.bg, margin: 0, padding: '32px 16px', fontFamily }}
      >
        <Container style={{ maxWidth: 600, margin: '0 auto', width: '100%' }}>
          <Section style={{ textAlign: 'center', paddingBottom: 24 }}>
            {logoUrl ? (
              <Img src={logoUrl} alt={firmName} height={32} style={{ margin: '0 auto' }} />
            ) : (
              <Text
                className="email-heading"
                style={{ fontSize: 18, fontWeight: 700, color: colors.heading, margin: 0 }}
              >
                {firmName}
              </Text>
            )}
          </Section>

          <Section
            className="email-card"
            style={{
              backgroundColor: colors.card,
              border: `1px solid ${colors.cardBorder}`,
              borderRadius: 12,
              padding: '32px',
            }}
          >
            {children}
          </Section>

          <Section style={{ padding: '24px 8px 0' }}>
            <Hr className="email-hr" style={{ borderColor: '#e4e4e7', margin: '0 0 16px' }} />
            <Text
              className="email-muted"
              style={{ fontSize: 12, color: colors.muted, textAlign: 'center', margin: '0 0 4px' }}
            >
              {firmName} · sent via FinanceFlow
            </Text>
            <Text
              className="email-muted"
              style={{ fontSize: 12, color: '#a1a1aa', textAlign: 'center', margin: footerLink ? '0 0 4px' : 0 }}
            >
              {footerNote}
            </Text>
            {footerLink && (
              <Text
                className="email-muted"
                style={{ fontSize: 12, color: '#a1a1aa', textAlign: 'center', margin: 0 }}
              >
                <Link href={footerLink.url} style={{ color: '#a1a1aa', textDecoration: 'underline' }}>
                  {footerLink.label}
                </Link>
              </Text>
            )}
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
