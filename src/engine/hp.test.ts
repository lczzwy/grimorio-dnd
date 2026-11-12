import { describe, expect, it } from 'vitest';
import { applyDamage, applyDeathSave, applyHeal, dropsToZero } from './hp';
import type { Character } from '../data/types';

const mk = (cur: number, temp = 0, extra: Partial<Character> = {}) =>
  ({ hp: { current: cur, temp, maxBonus: 0 }, deathSaves: { success: 0, fail: 0 }, ...extra }) as Character;

describe('hit points', () => {
  it('temporary HP soak damage first', () => {
    const c = mk(10, 4);
    applyDamage(c, 6);
    expect(c.hp).toMatchObject({ current: 8, temp: 0 });
  });
  it('dropping to 0 ends concentration; damage at 0 is a failed death save', () => {
    const c = mk(3, 0, { concentration: 'bless' });
    expect(dropsToZero(c, 5)).toBe(true);
    applyDamage(c, 5);
    expect(c.hp.current).toBe(0);
    expect(c.concentration).toBeUndefined();
    applyDamage(c, 2);
    expect(c.deathSaves.fail).toBe(1);
  });
  it('healing caps at max and clears death saves when getting up', () => {
    const c = mk(0);
    c.deathSaves = { success: 1, fail: 2 };
    applyHeal(c, 50, 12);
    expect(c.hp.current).toBe(12);
    expect(c.deathSaves).toEqual({ success: 0, fail: 0 });
  });
  it('death saves: 20 stands up, 1 is two failures', () => {
    const a = mk(0); applyDeathSave(a, 20); expect(a.hp.current).toBe(1);
    const b = mk(0); applyDeathSave(b, 1); expect(b.deathSaves.fail).toBe(2);
    const d = mk(0); applyDeathSave(d, 10); expect(d.deathSaves.success).toBe(1);
    const e = mk(0); applyDeathSave(e, 9); expect(e.deathSaves.fail).toBe(1);
  });
});
