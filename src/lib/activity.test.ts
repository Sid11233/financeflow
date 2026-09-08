import { describe, expect, it } from 'vitest';
import { formatActivitySentence, isActivityEventType } from './activity';
import type { ActivityEntry } from './activity';

const context = {
  actorName: 'Jane Accountant',
  clientName: 'Harbor Yoga Studio',
  resolveRequiredDocumentLabel: (id: string | null | undefined) => (id ? `Item ${id}` : 'another item'),
};

function entry(overrides: Partial<ActivityEntry>): ActivityEntry {
  return { event_type: 'document_uploaded', payload: {}, actor_type: 'client', ...overrides };
}

describe('formatActivitySentence', () => {
  it('prefers the specific classification outcome over a generic description', () => {
    const sentence = formatActivitySentence(
      entry({
        event_type: 'document_classified',
        actor_type: 'system',
        payload: { outcome: 'auto_accepted', document_type_label: 'Purchase Invoices', confidence: 0.95, original_filename: 'invoice123.pdf' },
      }),
      context,
    );
    expect(sentence).toContain('invoice123.pdf');
    expect(sentence).toContain('Purchase Invoices');
    expect(sentence).toContain('95%');
  });

  it('names the client for a client-attributed upload', () => {
    const sentence = formatActivitySentence(
      entry({ event_type: 'document_uploaded', payload: { original_filename: 'statement.pdf' } }),
      context,
    );
    expect(sentence).toBe('Harbor Yoga Studio uploaded statement.pdf.');
  });

  it('degrades gracefully for an unrecognized event type instead of throwing', () => {
    const sentence = formatActivitySentence(entry({ event_type: 'something_new', actor_type: 'system' }), context);
    expect(sentence).toContain('something new');
  });
});

describe('isActivityEventType', () => {
  it('rejects a value outside the canonical vocabulary', () => {
    expect(isActivityEventType('not_a_real_event')).toBe(false);
  });

  it('accepts a known event type', () => {
    expect(isActivityEventType('document_uploaded')).toBe(true);
  });
});
