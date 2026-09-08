import { describe, expect, it } from 'vitest';
import { getStatusBucket } from './requestStatus';

describe('getStatusBucket', () => {
  it('maps sent and partial to the shared "waiting" bucket', () => {
    expect(getStatusBucket('sent')).toBe('waiting');
    expect(getStatusBucket('partial')).toBe('waiting');
  });

  it('maps every other status to its own bucket', () => {
    expect(getStatusBucket('complete')).toBe('complete');
    expect(getStatusBucket('overdue')).toBe('overdue');
    expect(getStatusBucket('cancelled')).toBe('cancelled');
    expect(getStatusBucket('draft')).toBe('draft');
  });
});
