import { describe, expect, it } from 'vitest';
import { rollErrorPt } from './rolls';

describe('roll errors in plain language', () => {
  it('explains what went wrong', () => {
    expect(rollErrorPt('bad_formula')).toBe('Fórmula de dados inválida.');
    expect(rollErrorPt('forbidden')).toBe('Você não faz parte desta mesa.');
    expect(rollErrorPt('Failed to fetch')).toMatch(/internet/);
  });
});
