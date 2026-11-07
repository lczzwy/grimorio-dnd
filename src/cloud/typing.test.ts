import { describe, expect, it } from 'vitest';
import { typingText } from './typing';

describe('typing text', () => {
  it('reads naturally for one, two or many people', () => {
    expect(typingText([])).toBe('');
    expect(typingText(['Ana'])).toBe('Ana está digitando…');
    expect(typingText(['Ana', 'Bruno'])).toBe('Ana e Bruno estão digitando…');
    expect(typingText(['Ana', 'Bruno', 'Caio'])).toBe('3 pessoas estão digitando…');
  });
});
