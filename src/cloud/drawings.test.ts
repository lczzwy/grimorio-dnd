import { describe, expect, it } from 'vitest';
import { gridDistance } from './drawings';

describe('ruler distance', () => {
  it('counts squares like the D&D grid (diagonals count as one) and converts to metres', () => {
    expect(gridDistance({ x: 0, y: 0 }, { x: 300, y: 0 }, 50)).toEqual({ squares: 6, label: '6 quadrados (9 m)' });
    expect(gridDistance({ x: 0, y: 0 }, { x: 150, y: 150 }, 50).squares).toBe(3);
    expect(gridDistance({ x: 0, y: 0 }, { x: 50, y: 10 }, 50).label).toBe('1 quadrado (1,5 m)');
  });
});
