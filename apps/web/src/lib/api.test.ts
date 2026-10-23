import { describe, expect, it } from 'vitest';
import { plural, requestId, shortDate } from './api';
describe('Russian presentation and HTTP-compatible request IDs', () => {
  it('chooses the correct Russian plural', () => {
    expect([1, 2, 5, 11, 21, 22, -3].map((n) => plural(n, 'день', 'дня', 'дней'))).toEqual([
      'день',
      'дня',
      'дней',
      'дней',
      'день',
      'дня',
      'дня',
    ]);
  });
  it('keeps a calendar date independent of the account timezone', () => {
    expect(shortDate('2026-01-01', 'Pacific/Honolulu')).toContain('1');
    expect(shortDate('2026-01-01', 'Pacific/Honolulu')).toContain('янв');
  });
  it('generates UUID v4 IDs without secure-context crypto.randomUUID', () => {
    const ids = Array.from({ length: 100 }, () => requestId());
    expect(new Set(ids).size).toBe(100);
    for (const id of ids)
      expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  });
});
