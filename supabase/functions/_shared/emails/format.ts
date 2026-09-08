// Plain-text alternatives are hand-built per template (not derived by
// stripping tags from the HTML) since react-email's table-based markup
// produces messy, whitespace-heavy text when mechanically stripped. Every
// template's toPlainText() composes its body lines and passes them
// through renderPlainTextEnvelope() for a consistent header/footer to
// match the HTML layout.
export function renderPlainTextEnvelope(firmName: string, bodyLines: string[], footerNote: string): string {
  return [
    firmName,
    '',
    ...bodyLines,
    '',
    '---',
    `${firmName} · sent via FinanceFlow`,
    footerNote,
  ].join('\n');
}

export function formatDateLabel(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function plainTextChecklist(labels: string[]): string[] {
  return labels.map((label) => `- ${label}`);
}
