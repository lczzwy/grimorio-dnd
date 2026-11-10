import { describe, expect, it } from 'vitest';
import { errorRow, isNoise } from './errorLog';

describe('error log', () => {
  it('ignores browser noise and network blips', () => {
    expect(isNoise('ResizeObserver loop completed with undelivered notifications.')).toBe(true);
    expect(isNoise('TypeError: Failed to fetch')).toBe(true);
    expect(isNoise("Cannot read properties of undefined (reading 'hp')")).toBe(false);
  });
  it('trims what is sent to the limits of the table', () => {
    const r = errorRow('x'.repeat(5000), 'y'.repeat(9000), '#/' + 'z'.repeat(600), 'a'.repeat(400));
    expect(r.message).toHaveLength(2000);
    expect(r.stack).toHaveLength(8000);
    expect(r.url).toHaveLength(500);
    expect(r.agent).toHaveLength(300);
    expect(errorRow('', undefined, '', '').message).toBe('erro sem mensagem');
  });
});
