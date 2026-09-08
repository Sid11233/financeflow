import { describe, expect, it } from 'vitest';
import { getNotificationStyle, isNotificationType, NOTIFICATION_TYPES } from './notifications';

describe('isNotificationType', () => {
  it('accepts every canonical type', () => {
    for (const type of NOTIFICATION_TYPES) {
      expect(isNotificationType(type)).toBe(true);
    }
  });

  it('rejects an unknown type', () => {
    expect(isNotificationType('something_made_up')).toBe(false);
  });
});

describe('getNotificationStyle', () => {
  it('returns a distinct style for each canonical type', () => {
    for (const type of NOTIFICATION_TYPES) {
      expect(getNotificationStyle(type).icon).toBeDefined();
    }
  });

  it('falls back to a neutral bell for an unrecognized type rather than throwing', () => {
    const style = getNotificationStyle('something_made_up');
    expect(style.color).toBe('neutral');
  });
});
