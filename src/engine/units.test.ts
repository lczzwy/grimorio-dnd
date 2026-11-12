import { describe, expect, it } from 'vitest';
import { feetToMeters, lbToKg } from './units';

describe('units', () => {
  it('converts like the Portuguese books', () => {
    expect(feetToMeters(30)).toBe('9');
    expect(feetToMeters(25)).toBe('7,5');
    expect(lbToKg(240)).toBe('120');
    expect(lbToKg(16.1)).toBe('8,1');
  });
});
